-- restrict_auth_email_domain: server-side backstop for the @navapbc.com rule.
--
-- Google's `hd` param and the client guard in src/lib/auth.tsx are conveniences,
-- not boundaries — a determined client can bypass both. This trigger fires
-- BEFORE INSERT on auth.users and RAISES if the email domain isn't allowed, so a
-- non-Nava account can never be created in the first place. Because it runs
-- BEFORE the existing AFTER-insert handle_new_user() trigger, rejected users
-- never reach profile provisioning.
--
-- The allowed domain is hardcoded here (mirroring ALLOWED_EMAIL_DOMAIN in
-- src/lib/auth.tsx). Keep the two in sync if it ever changes.
--
-- SECURITY DEFINER with an empty search_path follows the Supabase pattern; the
-- function only references the NEW row and pg_catalog builtins (split_part,
-- lower), which resolve regardless of search_path.

create function public.enforce_allowed_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or lower(split_part(new.email, '@', 2)) <> 'navapbc.com' then
    raise exception 'Email domain not allowed: only @navapbc.com accounts may sign in.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enforce_allowed_email_domain
  before insert on auth.users
  for each row execute function public.enforce_allowed_email_domain();
