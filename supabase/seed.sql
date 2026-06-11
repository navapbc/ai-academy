-- ===========================================================================
-- LOCAL DEV ONLY — do not run against any hosted/production database.
--
-- Seeds a single demo auth user so there is something to look at in Studio.
-- Inserting into auth.users fires the handle_new_user() trigger, which creates
-- the matching public.profiles row automatically (role 'learner', domain
-- derived from the email). We then add a little sample progress + quiz data.
--
-- This runs on `supabase db reset` against a freshly created local database.
-- The demo email is @navapbc.com so it passes the enforce_allowed_email_domain
-- trigger (see restrict_auth_email_domain migration). Tests key on the user id,
-- not the email, so they're unaffected by this address.
-- Demo credentials: demo@navapbc.com / demo-password
-- ===========================================================================

-- Demo auth user. crypt/gen_salt come from pgcrypto in the extensions schema.
-- The token columns must be '' (not NULL): GoTrue scans them into Go strings
-- and a NULL fails sign-in with "Database error querying schema".
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'demo@navapbc.com',
  extensions.crypt('demo-password', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  '', '', '', ''
);

-- Email/password identity so the demo user can actually sign in locally.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"demo@navapbc.com","email_verified":true}',
  'email',
  now(), now(), now()
);

-- The profiles row already exists (created by the trigger); fill in full_name.
update public.profiles
   set full_name = 'Demo Learner'
 where id = '00000000-0000-0000-0000-000000000001';

-- Sample progress + quiz rows for the demo user. Use REAL curriculum cell ids
-- (DATA-08) so the demo data maps to actual modules instead of legacy p1-m*
-- placeholders the app ignored.
insert into public.module_progress (user_id, module_id, status, completed_at)
values
  ('00000000-0000-0000-0000-000000000001', '1.3', 'completed', now()),
  ('00000000-0000-0000-0000-000000000001', '1.4', 'in_progress', null);

insert into public.quiz_attempts (user_id, module_id, score, max_score, passed, answers)
values (
  '00000000-0000-0000-0000-000000000001',
  '1.4',
  4, 5, true,
  '{"q1":"a","q2":"c","q3":"b"}'
);

-- Demo cohort + enroll the demo learner, so Studio and the (future) staff
-- dashboard have something to show. Lives here (not a migration) because it
-- references the seed-only demo auth user. Fixed UUIDs + ON CONFLICT make it
-- idempotent across `supabase db reset`.
insert into public.cohorts (id, name, created_by)
values (
  '00000000-0000-0000-0000-0000000000c0',
  'Demo Cohort',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.enrollments (cohort_id, user_id, enrolled_by)
values (
  '00000000-0000-0000-0000-0000000000c0',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (user_id) do nothing;
