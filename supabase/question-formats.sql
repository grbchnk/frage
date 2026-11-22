-- Repeatable upgrade for private submissions and question hints.
begin;
create table if not exists quiz_private.submissions (
  round_id text not null,
  player_id text not null,
  input jsonb not null,
  primary key(round_id,player_id)
);
revoke all on quiz_private.submissions from public,anon,authenticated;

create or replace function quiz_private.clear_submissions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state->>'phase'='lobby' then
    delete from quiz_private.submissions where round_id is not null;
  end if;
  return new;
end $$;
drop trigger if exists quiz_clear_submissions on public.quiz_game;
create trigger quiz_clear_submissions after update on public.quiz_game
  for each row when (new.state->>'phase'='lobby') execute function quiz_private.clear_submissions();

-- Stamp the deadline with the database clock and guard early closure.
create or replace function quiz_private.sync_estimate_timer()
returns trigger language plpgsql security definer set search_path='' as $$
declare current_round jsonb:=new.state->'inputRound'; previous_round jsonb:=old.state->'inputRound';
        now_ms bigint:=floor(extract(epoch from clock_timestamp())*1000);
begin
  if new.state->>'phase'<>'question' or current_round->>'stage' is distinct from 'estimate' then return new; end if;
  if old.state->>'phase'='board' and new.state->>'estimateTimer'='true' then
    new.state:=jsonb_set(new.state,'{inputRound,deadline}',to_jsonb(now_ms+25000));
  elsif old.state->>'phase'='question' and current_round->>'id'=previous_round->>'id'
    and previous_round->>'deadline' is not null
    and current_round->>'closed'='true' and coalesce(previous_round->>'closed','false')='false'
    and now_ms<(previous_round->>'deadline')::bigint
    and jsonb_array_length(previous_round->'submitted')<jsonb_array_length(old.state->'players')
  then
    raise exception 'Таймер ещё идёт.';
  end if;
  return new;
end $$;
drop trigger if exists quiz_estimate_timer on public.quiz_game;
create trigger quiz_estimate_timer before update on public.quiz_game
  for each row execute function quiz_private.sync_estimate_timer();
revoke all on function quiz_private.sync_estimate_timer() from public;

create or replace function quiz_private.submit_input(expected_round text,player_id text,choice jsonb)
returns public.quiz_game language plpgsql security definer set search_path='' as $$
declare game public.quiz_game; round jsonb; stage text; option_ids jsonb; valid boolean:=false;
begin
  select * into game from public.quiz_game where id='main' for update;
  round:=game.state->'inputRound';
  stage:=round->>'stage';
  if game.state->>'phase' not in ('question','final') or round->>'id' is distinct from expected_round or expected_round is null or round->>'closed'='true'
    or not exists(select 1 from jsonb_array_elements(game.state->'players') p where p->>'id'=player_id)
    or (stage='turns' and round->'queue'->>((round->>'turn')::integer) is distinct from player_id)
  then raise exception 'Приём этого ответа уже закрыт.'; end if;
  if round->'submitted' ? player_id then return game; end if;
  if stage='estimate' and round->>'deadline' is not null
    and floor(extract(epoch from clock_timestamp())*1000)>=(round->>'deadline')::bigint
  then raise exception 'Время вышло.'; end if;
  select coalesce(jsonb_agg(opt->'id'),'[]'::jsonb) into option_ids
    from jsonb_array_elements(round->'options') opt
    where not (coalesce(round->'eliminated','[]'::jsonb) @> jsonb_build_array(opt->'id'));
  if stage='estimate' and jsonb_typeof(choice)='number' then
    valid:=abs((choice #>> '{}')::numeric)<=1000000000000;
  elsif stage='wager' and jsonb_typeof(choice)='number' then
    valid:=(choice #>> '{}')::numeric=trunc((choice #>> '{}')::numeric) and (choice #>> '{}')::numeric between 0 and (round->'limits'->>player_id)::numeric;
  elsif stage='written' and jsonb_typeof(choice)='string' then
    valid:=length(trim(choice #>> '{}'))>0 and length(choice #>> '{}')<=300;
  elsif stage in ('turns','choice') and jsonb_typeof(choice)='number' then
    valid:=option_ids @> jsonb_build_array(choice);
  elsif stage='order' and jsonb_typeof(choice)='array' then
    valid:=jsonb_array_length(choice)=jsonb_array_length(option_ids) and choice @> option_ids;
  end if;
  if not coalesce(valid,false) then raise exception 'Проверьте введённый ответ.'; end if;
  insert into quiz_private.submissions(round_id,player_id,input) values(expected_round,player_id,choice)
    on conflict on constraint submissions_pkey do nothing;
  update public.quiz_game set
    state=jsonb_set(state,'{inputRound,submitted}',round->'submitted'||jsonb_build_array(player_id)),
    revision=revision+1,updated_at=now()
    where id='main' returning * into game;
  return game;
end $$;

create or replace function quiz_private.host_inputs(expected_round text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(s.player_id,s.input),'{}'::jsonb)
  from quiz_private.submissions s join public.quiz_game g on g.id='main'
  where s.round_id=expected_round
    and (
      (s.round_id=g.state->'inputRound'->>'id' and (g.state->'inputRound'->>'stage'='turns' or g.state->'inputRound'->>'closed'='true'))
      or (s.round_id=g.state->>'finalWagerId' and g.state->'inputRound'->>'stage'='written' and g.state->'inputRound'->>'closed'='true')
    )
$$;

create or replace function quiz_private.use_hint(player_id text,expected_window uuid)
returns public.quiz_game language plpgsql security definer set search_path='' as $$
declare game public.quiz_game; hint text;
begin
  select * into game from public.quiz_game where id='main' for update;
  if game.state->>'phase'<>'question' or game.state->>'winnerId' is not null or game.state->>'inputRound' is not null
    or not exists(select 1 from public.quiz_buzzer where id='main' and claimant=player_id and window_id=expected_window
      and question_id=game.state->>'activeQuestionId')
  then raise exception 'Подсказка сейчас недоступна.'; end if;
  if game.state->>'hint' is not null then return game; end if;
  select data->>'hint' into hint from public.quiz_answers where question_id=game.state->>'activeQuestionId';
  if nullif(hint,'') is null then raise exception 'У этого вопроса нет подсказки.'; end if;
  update public.quiz_game set state=state||jsonb_build_object('hint',hint),revision=revision+1,updated_at=now()
    where id='main' returning * into game;
  return game;
end $$;

create or replace function quiz_private.choose_final(player_id text,category_id text,round_id uuid)
returns public.quiz_game language plpgsql security definer set search_path='' as $$
declare game public.quiz_game; limits jsonb;
begin
  select * into game from public.quiz_game where id='main' for update;
  if game.state->>'phase'<>'final' or game.state->'final'->>'stage' is distinct from 'category'
    or game.state->'final'->>'chooser' is distinct from player_id or not coalesce(game.state->'final'->'categories' ? category_id,false)
  then raise exception 'Сейчас нельзя выбрать эту тему.'; end if;
  select jsonb_object_agg(p->>'id',greatest(0,(p->>'score')::bigint)) into limits from jsonb_array_elements(game.state->'players') p;
  update public.quiz_game set state=state||jsonb_build_object(
      'final',(state->'final')||jsonb_build_object('stage','wager','categoryId',category_id),
      'inputRound',jsonb_build_object('id',round_id,'stage','wager','submitted','[]'::jsonb,'limits',limits),
      'event',(state->>'event')::integer+1),revision=revision+1,updated_at=now()
    where id='main' returning * into game;
  return game;
end $$;

create or replace function public.quiz_choose_final(player_id text,category_id text,round_id uuid)
returns public.quiz_game language sql security invoker set search_path='' as $$select quiz_private.choose_final(player_id,category_id,round_id)$$;
revoke all on function quiz_private.choose_final(text,text,uuid),public.quiz_choose_final(text,text,uuid) from public;
grant execute on function quiz_private.choose_final(text,text,uuid),public.quiz_choose_final(text,text,uuid) to anon,authenticated;

create or replace function public.quiz_submit_input(expected_round text,player_id text,choice jsonb)
returns public.quiz_game language sql security invoker set search_path='' as $$select quiz_private.submit_input(expected_round,player_id,choice)$$;
create or replace function public.quiz_host_inputs(expected_round text)
returns jsonb language sql security invoker set search_path='' as $$select quiz_private.host_inputs(expected_round)$$;
create or replace function public.quiz_use_hint(player_id text,expected_window uuid)
returns public.quiz_game language sql security invoker set search_path='' as $$select quiz_private.use_hint(player_id,expected_window)$$;
revoke all on function quiz_private.clear_submissions(),quiz_private.submit_input(text,text,jsonb),quiz_private.host_inputs(text),quiz_private.use_hint(text,uuid),
  public.quiz_submit_input(text,text,jsonb),public.quiz_host_inputs(text),public.quiz_use_hint(text,uuid) from public;
grant execute on function quiz_private.submit_input(text,text,jsonb),quiz_private.host_inputs(text),quiz_private.use_hint(text,uuid),
  public.quiz_submit_input(text,text,jsonb),public.quiz_host_inputs(text),public.quiz_use_hint(text,uuid) to anon,authenticated;
commit;
