-- P5.5a — cohort management substrate additions.
--
-- The admin cohort-management UI manages cohorts/enrollments/cohort_champions via
-- the service_role `admin-cohorts` Edge Function (writes), and READS the current
-- state through the client. Admin reads already exist for cohorts (authenticated
-- read), enrollments (is_admin, P5.2a), and profiles (is_admin, P5.1c) — but
-- cohort_champions is owner-read only, so an admin cannot enumerate "who are the
-- champions of cohort X". This adds that admin read, plus a locked-down audit
-- table mirroring role_changes (P5.1a) for every cohort-management mutation.
--
-- Idempotent: guarded so `supabase db reset` (and any re-run) applies cleanly.

-- 1) Admin may read all champion assignments (for the management UI). Writes stay
--    service_role-only (no write policy). Champion owner-read (P5.1b) is untouched.
drop policy if exists "Champion assignments are readable by admin" on public.cohort_champions;
create policy "Champion assignments are readable by admin"
  on public.cohort_champions for select
  to authenticated
  using (public.is_admin());

-- 2) Audit trail for cohort-management mutations. Locked down like role_changes:
--    RLS on, NO permissive policy — only service_role (the Edge Function) writes,
--    and clients can neither read nor write. (An admin-read surface can come later
--    alongside the role_changes admin-read; not needed for P5.5a.)
create table if not exists public.cohort_changes (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,           -- e.g. create_cohort, enroll_learner, assign_champion
  cohort_id   uuid,                    -- nullable: not every action targets a cohort row
  target_user uuid,                    -- nullable: the learner/champion acted on, when applicable
  detail      jsonb,                   -- free-form context (e.g. the new cohort name)
  created_at  timestamptz not null default now()
);

alter table public.cohort_changes enable row level security;
-- No permissive policy on purpose: the table is locked down (service_role bypasses).
