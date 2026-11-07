-- Run via SQL Editor. Re-running preserves the current game and host accounts.
begin;
create table if not exists public.quiz_hosts (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.quiz_answers (
  question_id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
create table if not exists public.quiz_game (
  id text primary key check (id = 'main'),
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.quiz_hosts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_game enable row level security;
revoke all on public.quiz_hosts, public.quiz_answers, public.quiz_game from anon, authenticated;
grant select on public.quiz_hosts, public.quiz_answers to authenticated;
grant select on public.quiz_game to anon, authenticated;
grant update (state, revision, updated_at) on public.quiz_game to authenticated;
drop policy if exists "host reads own membership" on public.quiz_hosts;
create policy "host reads own membership" on public.quiz_hosts for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "host reads answers" on public.quiz_answers;
create policy "host reads answers" on public.quiz_answers for select to authenticated
  using (exists (select 1 from public.quiz_hosts where user_id = (select auth.uid())));
drop policy if exists "everyone reads game" on public.quiz_game;
create policy "everyone reads game" on public.quiz_game for select to anon, authenticated using (id = 'main');
drop policy if exists "host updates game" on public.quiz_game;
create policy "host updates game" on public.quiz_game for update to authenticated
  using (id = 'main' and exists (select 1 from public.quiz_hosts where user_id = (select auth.uid())))
  with check (id = 'main' and exists (select 1 from public.quiz_hosts where user_id = (select auth.uid())));
-- No INSERT/DELETE grants for browser clients. No privileged public functions.
insert into public.quiz_game(id,state) values ('main',
  '{"phase":"lobby","players":[],"turnIndex":0,"roundIndex":0,"completed":[],"activeQuestionId":null,"revealed":null,"winnerId":null,"questionEndsAt":null,"breakEndsAt":null,"event":0,"questionsPerCategory":5}'::jsonb
) on conflict (id) do nothing;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='quiz_game') then
    alter publication supabase_realtime add table public.quiz_game;
  end if;
end $$;
commit;
