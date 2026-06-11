-- cohort_substrate (P5.1b): cohorts + enrollments + cohort_champions.
--
-- The substrate P5.1c's champion/admin RLS will scope against (pulled forward
-- from P5.5 per D11). DDL + baseline RLS only — no UI (P5.5a) and no admin-all /
-- champion-scoped cross-user read policies (those land in P5.1c with the
-- is_admin / is_champion_of helpers). Writes happen via migrations/seed and the
-- future admin service_role path (the P5.1a pattern); these tables expose no
-- client write policy.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.cohorts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  enrolled_by uuid references auth.users (id) on delete set null,
  enrolled_at timestamptz not null default now(),
  unique (user_id)                       -- one cohort per learner (DB-enforced)
);
create index enrollments_cohort_id_idx on public.enrollments (cohort_id);

create table public.cohort_champions (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (cohort_id, user_id)            -- one assignment per (cohort, champion); many cohorts allowed
);
create index cohort_champions_user_id_idx on public.cohort_champions (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — baseline. Admin-all + champion-scoped cross-user reads
-- arrive in P5.1c (with the is_admin / is_champion_of helpers). No write
-- policies: writes go via migrations/seed and the admin service_role path.
-- ---------------------------------------------------------------------------
alter table public.cohorts          enable row level security;
alter table public.enrollments      enable row level security;
alter table public.cohort_champions enable row level security;

-- cohorts: any signed-in user may read (names are low-sensitivity and the
-- learner/staff views need them) — same posture as public.modules.
create policy "Cohorts are viewable by authenticated users"
  on public.cohorts for select
  to authenticated
  using (true);

-- enrollments: a learner may read their own enrollment (which cohort am I in?).
create policy "Enrollments are viewable by owner"
  on public.enrollments for select
  using (auth.uid() = user_id);

-- cohort_champions: a champion may read their own assignments.
create policy "Champion assignments are viewable by owner"
  on public.cohort_champions for select
  using (auth.uid() = user_id);
