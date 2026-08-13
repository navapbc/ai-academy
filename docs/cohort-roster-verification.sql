-- Post-deploy verification for 20260813000000_cohort_roster_deferred_enrollment.sql
-- Run against staging (Studio SQL editor or psql) AFTER the migration lands.
-- Read-only except for step 4, which is an idempotent re-run of the backfill.

-- 1. Did the roster and the three cohorts land?
select c.name,
       count(r.email)                                            as roster_size,
       count(p.id)                                               as have_signed_in,
       count(e.id)                                               as enrolled_now
from public.cohorts c
left join public.cohort_roster r on r.cohort_name = c.name
left join public.profiles      p on lower(p.email) = r.email
left join public.enrollments   e on e.user_id = p.id and e.cohort_id = c.id
group by c.name
order by c.name;
-- Expect roster_size 26 / 25 / 27 for cohorts A / B / C (78 total).
-- have_signed_in grows as people log in; enrolled_now should always equal it.

-- 2. THE ALARM: anyone with an account who is on the roster but NOT enrolled.
-- Should return zero rows. Non-zero means the trigger did not fire for them —
-- fix with step 4.
select p.email, r.cohort_name, r.pod
from public.cohort_roster r
join public.profiles p on lower(p.email) = r.email
where not exists (
  select 1 from public.enrollments e
  join public.cohorts c on c.id = e.cohort_id
  where e.user_id = p.id and c.name = r.cohort_name
)
order by p.email;

-- 3. Roster emails with no account yet — these enroll automatically at first
-- sign-in. Expected to be non-empty before the cohort starts. If someone here
-- reports they cannot see Week 1 AFTER signing in, their Google email differs
-- from the roster email: correct the roster row (or enroll them via the admin
-- cohort UI, which is the live-safe path).
select r.email, r.cohort_name, r.pod
from public.cohort_roster r
where not exists (select 1 from public.profiles p where lower(p.email) = r.email)
order by r.cohort_name, r.pod, r.email;

-- 4. Re-run the backfill (idempotent — ON CONFLICT DO NOTHING). Safe any time,
-- including mid-cohort; it only ever ADDS missing roster-driven enrollments.
select coalesce(sum(public.enroll_from_roster(id)), 0) as enrollment_rows_created
from public.profiles;
