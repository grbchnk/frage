-- First: Authentication -> Users -> Add user -> Create new user.
-- Set your email, your own password, and enable Auto Confirm User.
-- Replace ONLY the email below. Never put a Supabase API secret here.
do $$
declare host_email text := 'YOUR_EMAIL@example.com';
begin
  if not exists(select 1 from auth.users where lower(email)=lower(host_email)) then
    raise exception 'Create the account in Authentication > Users first, then replace YOUR_EMAIL@example.com in this SQL.';
  end if;
  insert into public.quiz_hosts(user_id)
    select id from auth.users where lower(email)=lower(host_email)
    on conflict(user_id) do nothing;
end $$;
select 'Host access granted. Sign in on the phone using your email and password.' as result;
