-- cohort_roster: email-keyed roster + deferred enrollment for the Course 1 pilot.
--
-- WHY THIS ISN'T JUST `insert into enrollments`:
-- enrollments.user_id references auth.users(id), and an auth.users row only
-- exists AFTER the person completes Google SSO for the first time. The pilot
-- roster is 78 people who have mostly never signed in, so a seed migration that
-- resolved emails to ids would insert a row for whoever happened to have logged
-- in already and SILENTLY SKIP everyone else — a no-op that looks like success
-- until day one, when Week 1 (visibility='program') renders empty for them.
--
-- So enrollment intent is stored by EMAIL, decoupled from account existence:
--
--   1. public.cohort_roster — (email, cohort_name, pod), no FK to auth.users.
--      Seeded here from the reconciled pilot roster; syncs through git like any
--      other migration.
--   2. enroll_from_roster(uuid) — resolves one profile's roster rows into
--      enrollments rows, creating the membership.
--   3. A trigger on public.profiles fires it at first sign-in, so a learner is
--      enrolled by the time the app first queries modules.
--   4. A backfill at the bottom covers anyone who ALREADY signed in (Week 0 is
--      public, so early birds exist).
--
-- Net effect: enrollment lands whether the person signs in before or after
-- deploy, with no live admin action during the training.
--
-- DELIBERATELY NOT HERE:
--   • Pods are metadata only. cohorts is flat (name) and cohort_champions scopes
--     dashboards per cohort, and the pilot's champions are assigned per cohort
--     (3), not per pod (18) — so pod is recorded for reporting/CSV round-trip,
--     not modeled as a cohort. Making the 18 pods into cohort rows instead would
--     change champion scoping and dashboard denominators; that's a product
--     decision, not a migration detail.
--   • No champion assignments — the pilot's champion slate is still marked "not
--     finalized", and assign_champion also mutates profiles.role. Left to the
--     admin UI / admin-cohorts function.
--   • No learner attributes beyond (email, cohort, pod). The source sheet also
--     carries per-person compliance flags, readiness stages and facilitation
--     risk tiers; those are assessments about people and do not belong in a
--     git-tracked migration readable by every repo contributor.
--
-- Idempotent + re-runnable (D-25): create-if-not-exists, guarded policy creates,
-- create-or-replace functions, and an ON CONFLICT DO UPDATE roster seed.

-- ---------------------------------------------------------------------------
-- 1. cohort_roster — enrollment intent, keyed by email.
-- ---------------------------------------------------------------------------
create table if not exists public.cohort_roster (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and email like '%@%'),
  cohort_name text not null,
  pod         text,
  created_at  timestamptz not null default now(),
  unique (email, cohort_name)
);

create index if not exists cohort_roster_email_idx on public.cohort_roster (email);

-- Same posture as the rest of the cohort substrate: RLS on, NO client write
-- policy (writes ride migrations/service_role). Read is admin-only — the roster
-- is a list of who was assigned where, which champions get through the existing
-- enrollments/dashboard surfaces instead.
alter table public.cohort_roster enable row level security;

drop policy if exists "Cohort roster is readable by admin" on public.cohort_roster;
create policy "Cohort roster is readable by admin"
  on public.cohort_roster for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. The three pilot cohorts.
-- ---------------------------------------------------------------------------
-- cohorts has no unique constraint on name, and the roster resolves cohorts BY
-- name — so duplicate names would make "which cohort does this learner join?"
-- ambiguous. Fail loudly with an actionable message rather than enroll 78
-- people into an arbitrary one of two same-named rows.
do $$
declare dupes text;
begin
  select string_agg(name, ', ') into dupes
  from (select name from public.cohorts group by name having count(*) > 1) d;
  if dupes is not null then
    raise exception
      'public.cohorts has duplicate names (%): resolve or rename them before applying the roster migration.', dupes;
  end if;
end $$;

-- created_by stays null: these are provisioned by migration, not by an admin.
insert into public.cohorts (name)
select v.name
from (values
  ('Cohort A — Engineering'),
  ('Cohort B — Design, Research & Product'),
  ('Cohort C — Business, People & Operations')
) as v(name)
where not exists (select 1 from public.cohorts c where c.name = v.name);

-- ---------------------------------------------------------------------------
-- 3. enroll_from_roster(uuid) — resolve one profile's roster rows.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because enrollments exposes no write policy at all (not even
-- to the owner); definer-owned by postgres bypasses RLS, matching how the rest
-- of this substrate writes. Empty search_path + fully schema-qualified, like
-- is_staff() / has_program_access().
--
-- enrolled_by is left null — there is no human actor behind a roster-driven
-- enrollment. The ON CONFLICT DO NOTHING makes re-running a no-op, and means a
-- membership an admin later REMOVED via the admin UI is not resurrected on a
-- re-run... except at first sign-in, which can only happen once per account.
-- Archived cohorts are skipped: the admin-cohorts function rejects enrolling
-- into an archived cohort, and a roster-driven path should not quietly do what
-- the sanctioned write path forbids.
create or replace function public.enroll_from_roster(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare inserted int;
begin
  with target as (
    select lower(p.email) as email
    from public.profiles p
    where p.id = p_user_id and p.email is not null
  )
  insert into public.enrollments (user_id, cohort_id, enrolled_by)
  select p_user_id, c.id, null
  from public.cohort_roster r
  join target t on t.email = r.email
  join public.cohorts c on c.name = r.cohort_name
  where c.archived_at is null
  on conflict (user_id, cohort_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.enroll_from_roster(uuid) from public;
-- Not granted to `authenticated`: this is an internal seam driven by the
-- profiles trigger and migrations, never called from a browser.
grant execute on function public.enroll_from_roster(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Apply the roster at first sign-in.
-- ---------------------------------------------------------------------------
-- Fires AFTER INSERT on profiles, i.e. inside the same transaction as
-- handle_new_user()'s insert, which itself runs off a trigger on auth.users.
-- That means an uncaught exception here would roll the whole chain back and
-- LOCK THE PERSON OUT OF SIGNING IN. A missing cohort row or a malformed roster
-- entry must never do that, so the body swallows and warns: the account is the
-- primary effect, enrollment is recoverable (re-run the backfill in step 6).
create or replace function public.handle_profile_roster_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.enroll_from_roster(new.id);
  exception when others then
    raise warning 'roster enrollment failed for profile % (%): %', new.id, new.email, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists profiles_roster_enrollment on public.profiles;
create trigger profiles_roster_enrollment
  after insert on public.profiles
  for each row execute function public.handle_profile_roster_enrollment();

-- ---------------------------------------------------------------------------
-- 5. Seed the pilot roster (78 learners).
-- ---------------------------------------------------------------------------
-- Source: the "Enrollment Status" tab of the [INTERNAL] AI Pilot Enrollment
-- sheet, filtered to Enrollment Status = 'Enrolled' and reconciled row-for-row
-- against the Cohort Assignments tab (78 = 78, no diffs). Emails are the
-- sheet's own values lowercased -- NOT derived from names: the convention is
-- firstlast@ with real exceptions (oscar@, jc@, maya@, kelli@, gregpf@,
-- benjaminrousch@ for "Ben", charlesthrelkeld@ for "Chas").
--
-- Excluded on purpose: the 13 rows marked 'Opt-out', and the 4 backups whose
-- Enrollment Status is blank (Cory Trimm, Kelli Ho, Melissa Fernandes, Selena
-- Juneau-Vogel) -- they carry a cohort but no pod and were never confirmed.
--
-- DO UPDATE (not DO NOTHING) so a later re-seed can correct a pod without a
-- hand-written UPDATE; the (email, cohort_name) key means a cohort MOVE is an
-- insert plus a manual delete of the old row, which is the conservative
-- behaviour for a roster change.
insert into public.cohort_roster (email, cohort_name, pod) values
  ('alderrhodes@navapbc.com', 'Cohort A — Engineering', 'A1'),
  ('amyhsieh@navapbc.com', 'Cohort A — Engineering', 'A1'),
  ('andrewjorczak@navapbc.com', 'Cohort A — Engineering', 'A1'),
  ('benjaminrousch@navapbc.com', 'Cohort A — Engineering', 'A1'),
  ('seanlee@navapbc.com', 'Cohort A — Engineering', 'A1'),
  ('christinesparkman@navapbc.com', 'Cohort A — Engineering', 'A2'),
  ('jeremyclark@navapbc.com', 'Cohort A — Engineering', 'A2'),
  ('leemobley@navapbc.com', 'Cohort A — Engineering', 'A2'),
  ('rajmanchanda@navapbc.com', 'Cohort A — Engineering', 'A2'),
  ('amnatasneem@navapbc.com', 'Cohort A — Engineering', 'A3'),
  ('arnejduranovic@navapbc.com', 'Cohort A — Engineering', 'A3'),
  ('jeffwarrington@navapbc.com', 'Cohort A — Engineering', 'A3'),
  ('johnthrun@navapbc.com', 'Cohort A — Engineering', 'A3'),
  ('klaashoekema@navapbc.com', 'Cohort A — Engineering', 'A4'),
  ('lisachung@navapbc.com', 'Cohort A — Engineering', 'A4'),
  ('mikaylalittle@navapbc.com', 'Cohort A — Engineering', 'A4'),
  ('oscar@navapbc.com', 'Cohort A — Engineering', 'A4'),
  ('alenaberdnikova@navapbc.com', 'Cohort A — Engineering', 'A5'),
  ('charleshughes@navapbc.com', 'Cohort A — Engineering', 'A5'),
  ('chelseaknauf@navapbc.com', 'Cohort A — Engineering', 'A5'),
  ('jc@navapbc.com', 'Cohort A — Engineering', 'A5'),
  ('hasnankhan@navapbc.com', 'Cohort A — Engineering', 'A6'),
  ('jackryan@navapbc.com', 'Cohort A — Engineering', 'A6'),
  ('juliareynolds@navapbc.com', 'Cohort A — Engineering', 'A6'),
  ('kensalter@navapbc.com', 'Cohort A — Engineering', 'A6'),
  ('manojwadhwa@navapbc.com', 'Cohort A — Engineering', 'A6'),
  ('caryanneolsenlandis@navapbc.com', 'Cohort B — Design, Research & Product', 'B1 (D&R)'),
  ('claramarshall@navapbc.com', 'Cohort B — Design, Research & Product', 'B1 (D&R)'),
  ('evaheintzelman@navapbc.com', 'Cohort B — Design, Research & Product', 'B1 (D&R)'),
  ('marcusma@navapbc.com', 'Cohort B — Design, Research & Product', 'B1 (D&R)'),
  ('jenniferkalashian@navapbc.com', 'Cohort B — Design, Research & Product', 'B2 (D&R)'),
  ('jessicasutantio@navapbc.com', 'Cohort B — Design, Research & Product', 'B2 (D&R)'),
  ('kelseykrach@navapbc.com', 'Cohort B — Design, Research & Product', 'B2 (D&R)'),
  ('ligmiepreval@navapbc.com', 'Cohort B — Design, Research & Product', 'B2 (D&R)'),
  ('brendaruelasvelasquez@navapbc.com', 'Cohort B — Design, Research & Product', 'B3 (D&R)'),
  ('emiliatotzeva@navapbc.com', 'Cohort B — Design, Research & Product', 'B3 (D&R)'),
  ('happinesskisoso@navapbc.com', 'Cohort B — Design, Research & Product', 'B3 (D&R)'),
  ('harlanweber@navapbc.com', 'Cohort B — Design, Research & Product', 'B3 (D&R)'),
  ('christinewilkes@navapbc.com', 'Cohort B — Design, Research & Product', 'B4 (Product)'),
  ('christopherweekley@navapbc.com', 'Cohort B — Design, Research & Product', 'B4 (Product)'),
  ('hanwang@navapbc.com', 'Cohort B — Design, Research & Product', 'B4 (Product)'),
  ('lariaconley@navapbc.com', 'Cohort B — Design, Research & Product', 'B4 (Product)'),
  ('rachellegree@navapbc.com', 'Cohort B — Design, Research & Product', 'B4 (Product)'),
  ('allyseparekh@navapbc.com', 'Cohort B — Design, Research & Product', 'B5 (Product)'),
  ('melaniecipher@navapbc.com', 'Cohort B — Design, Research & Product', 'B5 (Product)'),
  ('mikhailamoynihan@navapbc.com', 'Cohort B — Design, Research & Product', 'B5 (Product)'),
  ('paulsackley@navapbc.com', 'Cohort B — Design, Research & Product', 'B5 (Product)'),
  ('alysonzamarron@navapbc.com', 'Cohort B — Design, Research & Product', 'B6 (Program Delivery & Nava Labs)'),
  ('gregjordandetamore@navapbc.com', 'Cohort B — Design, Research & Product', 'B6 (Program Delivery & Nava Labs)'),
  ('juliettepagliaro@navapbc.com', 'Cohort B — Design, Research & Product', 'B6 (Program Delivery & Nava Labs)'),
  ('michellegarfinkel@navapbc.com', 'Cohort B — Design, Research & Product', 'B6 (Program Delivery & Nava Labs)'),
  ('andrewdo@navapbc.com', 'Cohort C — Business, People & Operations', 'C1 (D&R)'),
  ('kimladin@navapbc.com', 'Cohort C — Business, People & Operations', 'C1 (D&R)'),
  ('lisasedelnik@navapbc.com', 'Cohort C — Business, People & Operations', 'C1 (D&R)'),
  ('malloryyoung@navapbc.com', 'Cohort C — Business, People & Operations', 'C1 (D&R)'),
  ('megcrosdale@navapbc.com', 'Cohort C — Business, People & Operations', 'C1 (D&R)'),
  ('princessojiaku@navapbc.com', 'Cohort C — Business, People & Operations', 'C2 (D&R)'),
  ('sudeeptibhatnagar@navapbc.com', 'Cohort C — Business, People & Operations', 'C2 (D&R)'),
  ('wendyfong@navapbc.com', 'Cohort C — Business, People & Operations', 'C2 (D&R)'),
  ('abbysacks@navapbc.com', 'Cohort C — Business, People & Operations', 'C3 (BD & Growth Ops)'),
  ('julianburton@navapbc.com', 'Cohort C — Business, People & Operations', 'C3 (BD & Growth Ops)'),
  ('makaylahipke@navapbc.com', 'Cohort C — Business, People & Operations', 'C3 (BD & Growth Ops)'),
  ('marjoriereed@navapbc.com', 'Cohort C — Business, People & Operations', 'C3 (BD & Growth Ops)'),
  ('randyhart@navapbc.com', 'Cohort C — Business, People & Operations', 'C3 (BD & Growth Ops)'),
  ('vickeycasey@navapbc.com', 'Cohort C — Business, People & Operations', 'C3 (BD & Growth Ops)'),
  ('hannahpadilla@navapbc.com', 'Cohort C — Business, People & Operations', 'C4 (People Ops/Comms / IT / Delivery Ops)'),
  ('kyleroy@navapbc.com', 'Cohort C — Business, People & Operations', 'C4 (People Ops/Comms / IT / Delivery Ops)'),
  ('lourdesgomez@navapbc.com', 'Cohort C — Business, People & Operations', 'C4 (People Ops/Comms / IT / Delivery Ops)'),
  ('maya@navapbc.com', 'Cohort C — Business, People & Operations', 'C4 (People Ops/Comms / IT / Delivery Ops)'),
  ('dinalevans@navapbc.com', 'Cohort C — Business, People & Operations', 'C5 (People Ops/Comms / IT / Delivery Ops)'),
  ('elissareitz@navapbc.com', 'Cohort C — Business, People & Operations', 'C5 (People Ops/Comms / IT / Delivery Ops)'),
  ('lauranash@navapbc.com', 'Cohort C — Business, People & Operations', 'C5 (People Ops/Comms / IT / Delivery Ops)'),
  ('rashardadams@navapbc.com', 'Cohort C — Business, People & Operations', 'C5 (People Ops/Comms / IT / Delivery Ops)'),
  ('vanessaberruetta@navapbc.com', 'Cohort C — Business, People & Operations', 'C5 (People Ops/Comms / IT / Delivery Ops)'),
  ('mikegiver@navapbc.com', 'Cohort C — Business, People & Operations', 'C6 (Engineering)'),
  ('seangerlich@navapbc.com', 'Cohort C — Business, People & Operations', 'C6 (Engineering)'),
  ('thomaswilson@navapbc.com', 'Cohort C — Business, People & Operations', 'C6 (Engineering)'),
  ('tommasinamiller@navapbc.com', 'Cohort C — Business, People & Operations', 'C6 (Engineering)')
on conflict (email, cohort_name) do update set pod = excluded.pod;

-- ---------------------------------------------------------------------------
-- 6. Backfill everyone who already has an account.
-- ---------------------------------------------------------------------------
-- Week 0 is public, so learners could sign in before this deploy; their
-- profiles rows predate the step-4 trigger. Re-runnable (step 3 is
-- ON CONFLICT DO NOTHING) and safe to run by hand later:
--   select sum(public.enroll_from_roster(id)) from public.profiles;
do $$
declare
  enrolled_now int;
  matched      int;
begin
  select coalesce(sum(public.enroll_from_roster(p.id)), 0) into enrolled_now
  from public.profiles p;

  select count(*) into matched
  from public.cohort_roster r
  join public.profiles p on lower(p.email) = r.email;

  raise notice 'cohort_roster: % of 78 roster emails have accounts; % enrollment row(s) created now. The rest enroll at first sign-in.',
    matched, enrolled_now;
end $$;
