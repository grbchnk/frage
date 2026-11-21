-- Run once in Supabase SQL Editor. Preserves the installed trigger logic.
-- pg-safeupdate requires an explicit WHERE even when clearing the lobby.
do $$
begin
  execute regexp_replace(
    pg_get_functiondef('quiz_private.sync_buzzer()'::regprocedure),
    'delete\s+from\s+public\.quiz_participants\s*;',
    'delete from public.quiz_participants where id is not null;',
    'gi'
  );
end $$;
