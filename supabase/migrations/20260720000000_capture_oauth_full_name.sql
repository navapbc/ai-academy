-- capture_oauth_full_name: handle_new_user() never populated full_name, so
-- every Google-authenticated learner's profile carries full_name = NULL
-- forever (every read site already falls back to email, so nothing broke —
-- names were just never captured). Google OAuth hands Supabase the user's
-- name in auth.users.raw_user_meta_data under 'full_name' or 'name'
-- depending on provider/version; read both, preferring 'full_name'.
--
-- create or replace: same idempotent-migration pattern as the other
-- SECURITY DEFINER helpers in this codebase (e.g. is_staff()).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, domain, role, full_name)
  values (
    new.id,
    new.email,
    nullif(split_part(new.email, '@', 2), ''),
    'learner',
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

-- Backfill existing profiles whose full_name was never captured. Only
-- touches rows that are still NULL, so any manually-set name is untouched.
update public.profiles p
set full_name = coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
from auth.users u
where u.id = p.id
  and p.full_name is null;
