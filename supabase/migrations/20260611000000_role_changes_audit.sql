-- role_changes_audit (P5.1a): audit trail for server-side role assignments.
--
-- The admin-set-role Edge Function (service_role) writes one row here per role
-- change. RLS is enabled with NO permissive policy — fully locked down like
-- content_versions — so authenticated/anon clients can neither read nor write
-- it; service_role (the function) bypasses RLS. An admin-read policy arrives
-- with P5.1c / the P5.2 dashboard.
create table public.role_changes (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users (id) on delete set null,
  actor_email  text,
  target_id    uuid not null references auth.users (id) on delete cascade,
  target_email text,
  old_role     text,
  new_role     text not null,
  created_at   timestamptz not null default now()
);

alter table public.role_changes enable row level security;
-- No permissive policy on purpose: the table is locked down.
