-- course_changes (cohort-restructure U3): audit trail for course-authoring mutations.
--
-- Every `admin-courses` Edge Function mutation (create/update/reorder/delete week,
-- assign/unassign/reorder week modules) writes one row here, best-effort, as
-- service_role. Mirrors cohort_changes (P5.5a) / content_changes (P5.4-1): RLS on
-- with NO permissive policy — only service_role (the Edge Function) writes, and
-- clients can neither read nor write. No FKs to the structure tables on purpose:
-- audit rows must survive deletion of the week/course they describe (same posture
-- as cohort_changes.cohort_id).
--
-- Idempotent: guarded so `supabase db reset` (and any re-run) applies cleanly (D-25).

create table if not exists public.course_changes (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,           -- e.g. create_week, assign_module, reorder_weeks
  course_id   uuid,                    -- nullable: week/module actions carry the week instead
  week_id     uuid,                    -- nullable: not every action targets a week
  cell_id     text,                    -- nullable: the module acted on, when applicable
  detail      jsonb,                   -- free-form context (e.g. the new title, the ordered ids)
  created_at  timestamptz not null default now()
);

alter table public.course_changes enable row level security;
-- No permissive policy on purpose: the table is locked down (service_role bypasses).
