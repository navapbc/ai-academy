-- course_structure (cohort-restructure U1): Course → Week curriculum substrate.
--
-- Introduces the course/week/membership structure tables with their FINAL RLS
-- policies, the `is_staff()` / `has_program_access()` SECURITY DEFINER helpers,
-- the `modules.visibility` axis ('public' | 'program'), the stage-less
-- 'course' origin, and the `module_progress.completed_via` era marker (U9
-- groundwork). Course 1 + its seven week groups are seeded with EMPTY
-- membership, so nothing here changes learner-visible behavior yet — the
-- modules SELECT policy itself is untouched (that flip is U4).
--
-- Structure writes are server-authoritative: NO client write policy exists on
-- any of the three tables (the admin-courses service_role Edge Function is U3's
-- writer), the same posture as workshops/cohorts.
--
-- Idempotent + re-runnable (D-25): `create table if not exists`, guarded
-- constraints/policies, `create or replace` functions, and `on conflict do
-- nothing` seeds keyed on slug / stable uuids.

-- ---------------------------------------------------------------------------
-- modules: visibility axis + 'course' origin (stage-less, like 'custom')
-- ---------------------------------------------------------------------------
-- visibility: 'public' (matrix / supplemental / custom / Week 0 — every
-- signed-in Nava user) | 'program' (Course 1 activities — enrolled + staff
-- only, enforced by RLS in U4). Assigning a module to a week NEVER changes its
-- visibility. Default 'public' backfills every existing row correctly.
alter table public.modules add column if not exists visibility text not null default 'public';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modules_visibility_check') then
    alter table public.modules
      add constraint modules_visibility_check check (visibility in ('public', 'program'));
  end if;
end $$;

-- origin allow-list gains 'course' (Course-1 lessons minted by seed/CMS).
-- Drop + recreate keeps it idempotent (the P5.4-1 pattern).
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'modules_origin_check') then
    alter table public.modules drop constraint modules_origin_check;
  end if;
  alter table public.modules
    add constraint modules_origin_check check (origin in ('matrix', 'custom', 'course'));
end $$;

-- Extend the EXISTING origin/stage discriminator: course lessons are stage-less
-- exactly like custom ones (they live under course weeks, not the matrix).
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'modules_origin_stage_check') then
    alter table public.modules drop constraint modules_origin_stage_check;
  end if;
  alter table public.modules
    add constraint modules_origin_stage_check
    check (
      (origin = 'matrix' and stage is not null)
      or (origin in ('custom', 'course') and stage is null)
    );
end $$;

-- ---------------------------------------------------------------------------
-- module_progress.completed_via: the era marker (U9 groundwork).
-- ---------------------------------------------------------------------------
-- How a completion happened: 'quiz' (all questions answered, any score) |
-- 'lab' (submission recorded) | 'sorter' (submitted) | 'explored' (footer
-- button). NULL = legacy row completed before the marker existed. The column
-- lands BEFORE the semantics flip (Key Decisions) so every U9 write can stamp
-- it; nothing reads it yet.
alter table public.module_progress add column if not exists completed_via text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'module_progress_completed_via_check') then
    alter table public.module_progress
      add constraint module_progress_completed_via_check
      check (completed_via is null or completed_via in ('quiz', 'lab', 'sorter', 'explored'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper functions: is_staff() / has_program_access().
-- ---------------------------------------------------------------------------
-- Both follow the exact is_admin()/is_champion_of() hardening (P5.1c):
-- SECURITY DEFINER (owned by postgres, which owns the tables and bypasses RLS —
-- no FORCE ROW LEVEL SECURITY anywhere — so reading profiles/enrollments inside
-- a policy can never recurse), STABLE, empty search_path, fully
-- schema-qualified references. auth.uid() still resolves from the request JWT
-- (the CALLER's uid), so the scoping is correct. Both are row-independent, so
-- the planner hoists them to an InitPlan (evaluated once per query).

-- is_staff(): champions and admins see all program structure/content (R5).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('champion', 'admin')
  );
$$;

-- has_program_access(): ANY enrollments row grants full program access (R5 —
-- the any-enrollment rule; course-scoped access is deferred until Course 2).
create or replace function public.has_program_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments
    where user_id = (select auth.uid())
  );
$$;

-- Same grant posture as is_admin()/is_champion_of(): only `authenticated` may
-- execute (the policies below are all `to authenticated`); anon cannot invoke.
revoke execute on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;
revoke execute on function public.has_program_access() from public;
grant execute on function public.has_program_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Tables: courses ⊃ course_weeks ⊃ course_week_modules.
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,        -- stable handle ('course-1'), seed idempotency key
  title       text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.course_weeks (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,               -- e.g. 'Week 1'
  subtitle   text,                        -- e.g. 'Break Claude on Purpose'
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists course_weeks_course_id_idx on public.course_weeks (course_id);

-- Membership is a join table PRECISELY so unique(cell_id) can enforce "a module
-- belongs to at most one week" (a step_cell_ids array can't) — no
-- double-counted denominators, no twin checkmarks. Module ids never change, so
-- progress/attempts/submissions are never orphaned by (re)assignment.
create table if not exists public.course_week_modules (
  week_id    uuid not null references public.course_weeks (id) on delete cascade,
  cell_id    text not null references public.modules (cell_id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (week_id, cell_id),
  unique (cell_id)                        -- a module belongs to at most ONE week
);

-- ---------------------------------------------------------------------------
-- Row Level Security — FINAL policies (no temporary blanket policy; U3 authors
-- real structure in the same phase, and U4 relies on these as-is).
-- ---------------------------------------------------------------------------
-- Visibility rule (Key Decisions): staff and enrolled learners read everything;
-- additionally, a membership row referencing a PUBLIC module is visible to any
-- signed-in user, and a week/course containing ≥1 such member is visible too —
-- this is what makes Week 0 render inside Course 1 for exactly the unenrolled
-- population R8 targets. The subqueries read modules/course_week_modules under
-- the caller's own RLS, which is safe: public-module membership rows are
-- visible to every authenticated user, so the exists checks see everything they
-- need, and no policy references its own table (no recursion).
--
-- No insert/update/delete policy on any table: writes are service_role only
-- (U3's admin-courses function), like workshops/cohorts.
alter table public.courses             enable row level security;
alter table public.course_weeks        enable row level security;
alter table public.course_week_modules enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'course_week_modules'
      and policyname = 'Week membership viewable by staff/enrolled/public module'
  ) then
    create policy "Week membership viewable by staff/enrolled/public module"
      on public.course_week_modules for select
      to authenticated
      using (
        public.is_staff()
        or public.has_program_access()
        or exists (
          select 1
          from public.modules m
          where m.cell_id = course_week_modules.cell_id
            and m.visibility = 'public'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'course_weeks'
      and policyname = 'Weeks viewable by staff/enrolled/public member'
  ) then
    create policy "Weeks viewable by staff/enrolled/public member"
      on public.course_weeks for select
      to authenticated
      using (
        public.is_staff()
        or public.has_program_access()
        or exists (
          select 1
          from public.course_week_modules cwm
          join public.modules m on m.cell_id = cwm.cell_id
          where cwm.week_id = course_weeks.id
            and m.visibility = 'public'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'courses'
      and policyname = 'Courses viewable by staff/enrolled/public member'
  ) then
    create policy "Courses viewable by staff/enrolled/public member"
      on public.courses for select
      to authenticated
      using (
        public.is_staff()
        or public.has_program_access()
        or exists (
          select 1
          from public.course_weeks w
          join public.course_week_modules cwm on cwm.week_id = w.id
          join public.modules m on m.cell_id = cwm.cell_id
          where w.course_id = courses.id
            and m.visibility = 'public'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed: Course 1 + its seven week groups (EMPTY membership — content is U8).
-- ---------------------------------------------------------------------------
-- Week groups follow the origin doc / plan exactly: Week 0, Week 1, Week 2,
-- Weeks 3–4, Week 5, Weeks 6–7, Week 8 (Weeks 5+, subtitled later via the CMS,
-- exist as empty groups — hidden from learners until they contain a published
-- member; staff/CMS always see them). Fixed uuids keep re-runs idempotent; the
-- week inserts resolve the course id BY SLUG so they stay correct even if the
-- course row pre-exists under a different id.
insert into public.courses (id, slug, title, description, sort_order)
values (
  'c0000000-0000-4000-8000-000000000001',
  'course-1',
  'Understanding & Deciding When to Use AI',
  'The AI Champion-led Cohort Program''s first course: an 8-week, champion-led '
    || 'practice sequence — break Claude on purpose, ground & scope, pod activities, '
    || 'and workflow decision practice.',
  0
)
on conflict (slug) do nothing;

insert into public.course_weeks (id, course_id, title, subtitle, sort_order)
select v.id::uuid, c.id, v.title, v.subtitle, v.sort_order
from (
  values
    ('c0000000-0000-4000-8000-000000000100', 'Week 0',     'Claude Set-up',                 0),
    ('c0000000-0000-4000-8000-000000000101', 'Week 1',     'Break Claude on Purpose',       1),
    ('c0000000-0000-4000-8000-000000000102', 'Week 2',     'Ground & Scope for Improvement', 2),
    ('c0000000-0000-4000-8000-000000000103', 'Weeks 3–4',  'Pod Activities',                3),
    ('c0000000-0000-4000-8000-000000000104', 'Week 5',     null,                            4),
    ('c0000000-0000-4000-8000-000000000105', 'Weeks 6–7',  null,                            5),
    ('c0000000-0000-4000-8000-000000000106', 'Week 8',     null,                            6)
) as v (id, title, subtitle, sort_order)
join public.courses c on c.slug = 'course-1'
on conflict (id) do nothing;
