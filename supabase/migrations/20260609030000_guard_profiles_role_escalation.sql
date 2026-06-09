-- guard_profiles_role_escalation (W2-2 / audit D-06 / LB-3)
--
-- The "Profiles are updatable by owner" policy (init_core) has no column
-- restriction, so a learner could `update profiles set role='admin'` on their
-- own row — a latent privilege escalation that MUST close before any P5.1
-- role-aware work. A BEFORE UPDATE trigger forbids changing the `role` column
-- from the learner-facing path while leaving every other owner update (e.g.
-- full_name) working.
--
-- Posture (decision D9): internal-only app behind domain-restricted Google
-- OAuth, so a single DB-layer guard is sufficient. The function is SECURITY
-- INVOKER (the default — NOT definer), so `current_user` is the role the caller
-- actually connected as: `authenticated`/`anon` for a PostgREST request (blocked),
-- vs. `service_role` (the future admin/CMS server path) / `postgres` /
-- `supabase_admin` (migrations) — which stay allowed, so this is
-- forward-compatible with the P5 admin role-management work.
--
-- New-user provisioning is unaffected: handle_new_user() INSERTs the profile, and
-- this is a BEFORE UPDATE trigger.
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('service_role', 'supabase_admin', 'postgres') then
    raise exception 'changing your own role is not permitted'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_self_role_change on public.profiles;
create trigger profiles_prevent_self_role_change
  before update on public.profiles
  for each row
  execute function public.prevent_self_role_change();
