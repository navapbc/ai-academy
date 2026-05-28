-- init_core: core schema for Nava AI Academy
--
-- Tables: profiles, module_progress, quiz_attempts, lab_submissions.
-- RLS is enabled on every table with owner-only policies (a user may only
-- read/write their own rows). Full champion/admin policies arrive in P5.1.
-- A trigger on auth.users provisions a profile row for each new user.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'learner'
             check (role in ('learner', 'champion', 'admin')),
  domain     text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- module_progress
-- ---------------------------------------------------------------------------
create table public.module_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  module_id    text not null,
  status       text not null default 'in_progress',
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (user_id, module_id)
);

-- ---------------------------------------------------------------------------
-- quiz_attempts
-- ---------------------------------------------------------------------------
create table public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  module_id    text not null,
  score        int,
  max_score    int,
  passed       boolean,
  answers      jsonb,
  attempted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lab_submissions
-- ---------------------------------------------------------------------------
create table public.lab_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  lab_id        text not null,
  transcript    jsonb,
  rubric_scores jsonb,
  grader        text,
  status        text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only access on all tables.
-- No delete policies are defined, so deletes are denied for non-service roles.
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.module_progress enable row level security;
alter table public.quiz_attempts   enable row level security;
alter table public.lab_submissions enable row level security;

-- profiles: keyed on id (which equals the auth user id).
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- module_progress: keyed on user_id.
create policy "Module progress is viewable by owner"
  on public.module_progress for select
  using (auth.uid() = user_id);

create policy "Module progress is insertable by owner"
  on public.module_progress for insert
  with check (auth.uid() = user_id);

create policy "Module progress is updatable by owner"
  on public.module_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- quiz_attempts: keyed on user_id.
create policy "Quiz attempts are viewable by owner"
  on public.quiz_attempts for select
  using (auth.uid() = user_id);

create policy "Quiz attempts are insertable by owner"
  on public.quiz_attempts for insert
  with check (auth.uid() = user_id);

create policy "Quiz attempts are updatable by owner"
  on public.quiz_attempts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- lab_submissions: keyed on user_id.
create policy "Lab submissions are viewable by owner"
  on public.lab_submissions for select
  using (auth.uid() = user_id);

create policy "Lab submissions are insertable by owner"
  on public.lab_submissions for insert
  with check (auth.uid() = user_id);

create policy "Lab submissions are updatable by owner"
  on public.lab_submissions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- New-user provisioning: create a profile row whenever an auth user is added.
-- domain is derived from the part of the email after the '@'.
-- SECURITY DEFINER with an empty search_path is the Supabase-recommended
-- pattern; all object references are schema-qualified.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, domain, role)
  values (
    new.id,
    new.email,
    nullif(split_part(new.email, '@', 2), ''),
    'learner'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
