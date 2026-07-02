-- workshops (X.3 Unit 1): admin-authored ordered paths through existing
-- published modules.
--
-- A workshop is orchestration only — an ordered list of module cell_ids
-- (step_cell_ids) over the content-as-data curriculum; it stores no completion
-- state (learner progress is derived from module_progress). Writes are
-- server-authoritative: the only writer is the service_role client inside the
-- admin-workshops Edge Function (service_role bypasses RLS). Learners
-- read workshops via a simple authenticated SELECT — workshops are
-- non-sensitive (titles/intros/step ordering), same posture as public.cohorts /
-- public.modules. NO client insert/update/delete policy exists on purpose.
--
-- Idempotent + additive: `create table if not exists` and a guarded policy
-- (created only when absent) so `supabase db reset` (and any re-run) applies
-- cleanly.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.workshops (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  intro         text,
  step_cell_ids text[] not null default '{}',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security. Authenticated read (workshops are visible to all learners
-- in v1); NO write policy — writes go via the admin-workshops service_role path.
-- ---------------------------------------------------------------------------
alter table public.workshops enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Workshops are viewable by authenticated users'
  ) then
    create policy "Workshops are viewable by authenticated users"
      on public.workshops for select
      to authenticated
      using (true);
  end if;
end $$;
