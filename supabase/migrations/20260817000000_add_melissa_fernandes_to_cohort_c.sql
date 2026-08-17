-- Add one learner to the Cohort C roster: melissafernandes@navapbc.com.
--
-- WHY A MIGRATION AND NOT THE ADMIN COHORT UI:
-- admin-cohorts' `enroll_learner` action takes a userId and writes `enrollments`
-- directly, so it can only enroll somebody who ALREADY has an auth.users row --
-- i.e. who has completed Google SSO at least once. Melissa was one of the four
-- unconfirmed backups deliberately excluded from the 78-person pilot seed
-- (20260813000000, step 5), so she may never have signed in. Routing through
-- cohort_roster makes the enrollment land either way: step 3 below covers her if
-- she already has an account, and the profiles_roster_enrollment trigger covers
-- her if she signs in later. Same reasoning as the original roster migration --
-- see its header for the full rationale.
--
-- THE EMAIL IS VERIFIED, NOT DERIVED: confirmed as melissafernandes@navapbc.com
-- against her Nava Slack profile. The roster convention is firstlast@ but with
-- real exceptions (oscar@, jc@, maya@, kelli@, gregpf@, benjaminrousch@,
-- charlesthrelkeld@), and a wrong address here fails SILENTLY -- the roster row
-- never matches a profile, and Week 1 (visibility='program') just renders empty
-- for her with no error anywhere.
--
-- POD STAYS NULL: she came in as a backup, and the source sheet gives backups a
-- cohort but no pod. Pods are reporting/CSV metadata only -- they are not cohort
-- rows and feed neither module visibility nor champion scoping -- so a null pod
-- costs her nothing in the app. Assign one via a later roster re-seed if the
-- pilot wants her in a specific pod.
--
-- Idempotent + re-runnable (D-25).

-- ---------------------------------------------------------------------------
-- 1. The target cohort must resolve to exactly one row.
-- ---------------------------------------------------------------------------
-- enroll_from_roster() joins cohorts BY NAME, so a missing name means the roster
-- row is inert (no enrollment, no error) and a duplicated name means "which
-- cohort?" is ambiguous. Both are worth failing loudly on rather than inserting
-- a roster row that quietly never resolves -- the same posture as the original
-- migration's duplicate-name guard.
do $$
declare n int;
begin
  select count(*) into n
  from public.cohorts
  where name = 'Cohort C — Business, People & Operations';

  if n <> 1 then
    raise exception
      'expected exactly 1 cohort named "Cohort C — Business, People & Operations", found %: resolve before adding roster rows.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The roster row.
-- ---------------------------------------------------------------------------
-- DO NOTHING rather than the seed's DO UPDATE SET pod: this row's pod is null,
-- so a DO UPDATE would blank out any pod a later re-seed or admin action had
-- assigned her every time this migration re-ran. There is no pod here to
-- correct, so the conservative conflict action is the right one.
insert into public.cohort_roster (email, cohort_name, pod)
values ('melissafernandes@navapbc.com', 'Cohort C — Business, People & Operations', null)
on conflict (email, cohort_name) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Enroll her now if she already has an account.
-- ---------------------------------------------------------------------------
-- Week 0 is public, so she may well have signed in already; her profiles row
-- would predate this roster row and the trigger only fires on INSERT. Scoped to
-- her profile (not all of them) because this migration adds exactly one roster
-- row -- the full-table backfill stays available by hand:
--   select sum(public.enroll_from_roster(id)) from public.profiles;
do $$
declare
  target_id     uuid;
  enrolled_now  int;
begin
  select p.id into target_id
  from public.profiles p
  where lower(p.email) = 'melissafernandes@navapbc.com';

  if target_id is null then
    raise notice 'cohort_roster: melissafernandes@navapbc.com has no account yet; she enrolls in Cohort C at first sign-in.';
  else
    enrolled_now := public.enroll_from_roster(target_id);
    raise notice 'cohort_roster: melissafernandes@navapbc.com already has an account (%); % enrollment row(s) created now (0 = already enrolled).',
      target_id, enrolled_now;
  end if;
end $$;
