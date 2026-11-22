-- Repeatable extension for one shared game with a public, account-free host panel.
begin;
create schema if not exists quiz_private;
revoke all on schema quiz_private from public;
grant usage on schema quiz_private to anon, authenticated;
create table if not exists public.quiz_participants (
  id text primary key,
  name text not null check (length(trim(name)) between 1 and 24),
  joined_at timestamptz not null default clock_timestamp()
);
alter table public.quiz_participants add column if not exists joined_at timestamptz not null default clock_timestamp();
create unique index if not exists quiz_participant_name on public.quiz_participants(lower(name));
create table if not exists public.quiz_buzzer (
  id text primary key check (id='main'),
  question_id text,
  window_id uuid not null default gen_random_uuid(),
  claimant text,
  accepting boolean not null default false,
  excluded text[] not null default '{}'
);
insert into public.quiz_buzzer(id) values('main') on conflict do nothing;
alter table public.quiz_participants enable row level security;
alter table public.quiz_buzzer enable row level security;
revoke all on public.quiz_participants, public.quiz_buzzer from anon, authenticated;
grant select on public.quiz_participants, public.quiz_buzzer to anon, authenticated;
drop policy if exists "read participants" on public.quiz_participants;
create policy "read participants" on public.quiz_participants for select to anon,authenticated using(true);
drop policy if exists "read buzzer" on public.quiz_buzzer;
create policy "read buzzer" on public.quiz_buzzer for select to anon,authenticated using(true);

-- Privileged implementations live outside the exposed API schema. Guest access is
-- intentional: no account is required, and all guest mutations are constrained here.
create or replace function quiz_private.join_game(player_name text)
returns public.quiz_participants language plpgsql security definer set search_path='' as $$
declare p public.quiz_participants; g jsonb; n text:=trim(player_name);
begin
  -- The game row serializes joining with host start/reset and enforces the 10-player cap.
  select state into g from public.quiz_game where id='main' for update;
  if n is null or length(n)<1 or length(n)>24 then raise exception 'Имя: от 1 до 24 символов.'; end if;
  if g->>'phase'<>'lobby' then
    select item->>'id',item->>'name' into p.id,p.name
      from jsonb_array_elements(g->'players') item where lower(item->>'name')=lower(n);
    if p.id is null then raise exception 'Игра уже началась. Попросите ведущего начать новую партию.'; end if;
    return p;
  end if;
  select * into p from public.quiz_participants where lower(name)=lower(n);
  if p.id is not null then return p; end if;
  if (select count(*) from public.quiz_participants)>=10 then raise exception 'Уже подключились 10 игроков.'; end if;
  insert into public.quiz_participants(id,name) values(gen_random_uuid()::text,n) returning * into p;
  return p;
end $$;
create or replace function public.quiz_join(player_name text)
returns public.quiz_participants language sql security invoker set search_path='' as $$select quiz_private.join_game(player_name)$$;

create or replace function quiz_private.buzz(player_id text, expected_window uuid)
returns public.quiz_buzzer language plpgsql security definer set search_path='' as $$
declare b public.quiz_buzzer; g jsonb;
begin
  -- Always lock game before buzzer, also used by the host trigger and rearm.
  select state into g from public.quiz_game where id='main' for share;
  if g->>'phase'<>'question' or g->>'winnerId' is not null or g->>'inputRound' is not null or not exists(select 1 from jsonb_array_elements(g->'players') p where p->>'id'=player_id) then
    raise exception 'Сейчас нажать нельзя.';
  end if;
  update public.quiz_buzzer set claimant=player_id,accepting=false
    where id='main' and window_id=expected_window and accepting and claimant is null
      and question_id=g->>'activeQuestionId' returning * into b;
  if b.id is null then select * into b from public.quiz_buzzer where id='main'; end if;
  return b;
end $$;
create or replace function public.quiz_buzz(player_id text, expected_window uuid)
returns public.quiz_buzzer language sql security invoker set search_path='' as $$select quiz_private.buzz(player_id,expected_window)$$;

-- Remove the previous signature when upgrading the pre-penalty schema.
drop function if exists public.quiz_rearm(uuid);
drop function if exists quiz_private.rearm(uuid);
create or replace function quiz_private.rearm(expected_window uuid,expected_revision integer,penalize boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.quiz_buzzer; g jsonb; rev integer; points integer; penalty integer; players jsonb; saved jsonb;
begin
  select state,revision into g,rev from public.quiz_game where id='main' for update;
  if g->>'phase'<>'question' or g->>'winnerId' is not null or g->>'inputRound' is not null or rev is distinct from expected_revision then raise exception 'Игра уже изменилась. Обновите пульт.'; end if;
  select * into b from public.quiz_buzzer where id='main' and window_id=expected_window and claimant is not null for update;
  if b.id is null then raise exception 'Нажатие уже обработано. Обновите пульт.'; end if;
  if penalize then
    points:=(g->>'activeQuestionValue')::integer;
    if points is null or points not in (100,200,300,400,500) then raise exception 'Стоимость вопроса не задана. Откройте вопрос заново.'; end if;
    penalty:=case when g->>'hint' is null then points/2 else points end;
    select jsonb_agg(case when p->>'id'=b.claimant then jsonb_set(p,'{score}',to_jsonb((p->>'score')::bigint-penalty)) else p end order by ord)
      into players from jsonb_array_elements(g->'players') with ordinality as t(p,ord);
    g:=g||jsonb_build_object(
        'players',players,
        'scoreChanges',coalesce(g->'scoreChanges','{}'::jsonb)||jsonb_build_object(b.claimant,coalesce((g->'scoreChanges'->>b.claimant)::bigint,0)-penalty),
        'event',(g->>'event')::integer+1,
        'feedback',jsonb_build_object('kind','wrong','playerId',b.claimant,'event',(g->>'event')::integer+1,'at',floor(extract(epoch from clock_timestamp())*1000))
      );
  end if;
  update public.quiz_game set state=g,revision=revision+1,updated_at=now()
    where id='main' returning jsonb_build_object('id',id,'state',state,'revision',revision) into saved;
  update public.quiz_buzzer set excluded='{}',claimant=null,accepting=true,window_id=gen_random_uuid()
    where id='main' returning * into b;
  return jsonb_build_object('buzzer',to_jsonb(b),'snapshot',saved);
end $$;
create or replace function quiz_private.rearm(expected_window uuid,expected_revision integer)
returns jsonb language sql security invoker set search_path='' as $$
  select quiz_private.rearm(expected_window,expected_revision,true)
$$;
create or replace function public.quiz_rearm(expected_window uuid,expected_revision integer)
returns jsonb language sql security invoker set search_path='' as $$select quiz_private.rearm(expected_window,expected_revision)$$;

create or replace function public.quiz_release(expected_window uuid,expected_revision integer)
returns jsonb language sql security invoker set search_path='' as $$
  select quiz_private.rearm(expected_window,expected_revision,false)
$$;

-- The public host panel writes via this revision-checked RPC. For a judgement,
-- lock the same game row as buzz/rearm and verify the claim before awarding.
create or replace function quiz_private.save_game(expected_revision integer,desired_state jsonb,judged_window uuid)
returns public.quiz_game language plpgsql security definer set search_path='' as $$
declare previous public.quiz_game; saved public.quiz_game;
begin
  select * into previous from public.quiz_game where id='main' for update;
  if previous.revision is distinct from expected_revision then
    raise exception 'Игра уже изменилась. Обновите пульт.';
  end if;
  if judged_window is not null and (
    previous.state->>'phase' is distinct from 'question' or previous.state->>'winnerId' is not null
    or not exists(select 1 from public.quiz_buzzer where id='main' and window_id=judged_window
      and question_id=previous.state->>'activeQuestionId' and claimant=desired_state->>'winnerId')
  ) then raise exception 'Нажатие уже обработано. Обновите пульт.'; end if;
  update public.quiz_game set state=desired_state,revision=revision+1,updated_at=now()
    where id='main' returning * into saved;
  return saved;
end $$;
create or replace function public.quiz_save(expected_revision integer,desired_state jsonb,judged_window uuid)
returns public.quiz_game language sql security invoker set search_path='' as $$
  select quiz_private.save_game(expected_revision,desired_state,judged_window)
$$;

create or replace function quiz_private.host_answers()
returns setof public.quiz_answers language sql stable security definer set search_path='' as $$
  select * from public.quiz_answers
$$;
create or replace function public.quiz_host_answers()
returns setof public.quiz_answers language sql stable security invoker set search_path='' as $$
  select * from quiz_private.host_answers()
$$;

-- Fetch one indexed answer for the host as a question opens.
create or replace function quiz_private.selected_answer(requested_id text)
returns setof public.quiz_answers language sql stable security definer set search_path='' as $$
  select * from public.quiz_answers where question_id=requested_id
$$;
create or replace function public.quiz_selected_answer(requested_id text)
returns setof public.quiz_answers language sql stable security invoker set search_path='' as $$
  select * from quiz_private.selected_answer(requested_id)
$$;
revoke all on function quiz_private.selected_answer(text),public.quiz_selected_answer(text) from public;
grant execute on function quiz_private.selected_answer(text),public.quiz_selected_answer(text) to anon,authenticated;

-- Undo restores the prior game and buzzer together, with a fresh window token.
create or replace function quiz_private.restore_game(expected_revision integer,desired_state jsonb,desired_buzzer jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rev integer; saved jsonb;
begin
  select revision into rev from public.quiz_game where id='main' for update;
  if rev is distinct from expected_revision then raise exception 'Игра уже изменилась. Отмена недоступна.'; end if;
  update public.quiz_game set state=desired_state,revision=revision+1,updated_at=now() where id='main'
    returning jsonb_build_object('id',id,'state',state,'revision',revision) into saved;
  if desired_state->>'phase'='question' and desired_buzzer->>'question_id'=desired_state->>'activeQuestionId' then
    update public.quiz_buzzer set question_id=desired_state->>'activeQuestionId',window_id=gen_random_uuid(),
      claimant=desired_buzzer->>'claimant',accepting=(desired_buzzer->>'accepting')::boolean,
      excluded='{}' where id='main';
  end if;
  return saved;
end $$;
create or replace function public.quiz_restore(expected_revision integer,desired_state jsonb,desired_buzzer jsonb)
returns jsonb language sql security invoker set search_path='' as $$select quiz_private.restore_game(expected_revision,desired_state,desired_buzzer)$$;

create or replace function quiz_private.sync_buzzer()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state->>'phase'='lobby' then
    delete from public.quiz_participants where id is not null;
  end if;
  if new.state->>'phase'='question' and
     (old.state->>'phase' is distinct from 'question' or new.state->>'activeQuestionId' is distinct from old.state->>'activeQuestionId' or new.state->>'questionOpenedAt' is distinct from old.state->>'questionOpenedAt') then
    update public.quiz_buzzer set question_id=new.state->>'activeQuestionId',window_id=gen_random_uuid(),claimant=null,accepting=(new.state->>'inputRound' is null),excluded='{}' where id='main';
  elsif new.state->>'phase'='question' and new.state->>'winnerId' is not null then
    update public.quiz_buzzer set accepting=false where id='main';
  elsif old.state->>'phase'='question' and new.state->>'phase'<>'question' then
    update public.quiz_buzzer set accepting=false,claimant=null,question_id=null,window_id=gen_random_uuid(),excluded='{}' where id='main';
  end if;
  return new;
end $$;
drop trigger if exists quiz_sync_buzzer on public.quiz_game;
create trigger quiz_sync_buzzer after update on public.quiz_game for each row execute function quiz_private.sync_buzzer();
revoke all on all functions in schema quiz_private from public;
revoke all on function public.quiz_join(text), public.quiz_buzz(text,uuid), public.quiz_rearm(uuid,integer), public.quiz_release(uuid,integer), public.quiz_restore(integer,jsonb,jsonb), public.quiz_save(integer,jsonb,uuid), public.quiz_host_answers() from public;
grant execute on function quiz_private.join_game(text),quiz_private.buzz(text,uuid),public.quiz_join(text),public.quiz_buzz(text,uuid) to anon,authenticated;
grant execute on function quiz_private.rearm(uuid,integer),quiz_private.rearm(uuid,integer,boolean),public.quiz_rearm(uuid,integer),public.quiz_release(uuid,integer),quiz_private.restore_game(integer,jsonb,jsonb),public.quiz_restore(integer,jsonb,jsonb) to anon,authenticated;
grant execute on function quiz_private.save_game(integer,jsonb,uuid),public.quiz_save(integer,jsonb,uuid),quiz_private.host_answers(),public.quiz_host_answers() to anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['quiz_participants','quiz_buzzer'] loop
    if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
commit;
