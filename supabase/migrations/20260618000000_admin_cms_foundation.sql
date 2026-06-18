-- admin_cms_foundation (P5.4-1): the data-layer spine for the admin CMS.
--
-- Gives the content-as-data `modules` table a draft → publish working copy, the
-- new per-lesson content fields, a free-form-lesson discriminator, and a
-- soft-delete column — WITHOUT adding any client write policy. All CMS writes
-- route through the service_role `admin-content` Edge Function (W2-2: the
-- prevent_self_role_change-class lockdown means authenticated clients never
-- UPDATE these tables directly), exactly like admin-cohorts. `content_versions`
-- is untouched here (its writer + the version-history slice are deferred; SEC-07
-- lockdown stays green).
--
-- Idempotent + additive: guarded so `supabase db reset` (and any re-run) applies
-- cleanly (DATA-05). Existing seeded rows are matrix cells with a stage already
-- set and pick up origin='matrix' from the column default, so every integrity
-- check below holds for them with no data backfill.

-- ---------------------------------------------------------------------------
-- New columns on modules
-- ---------------------------------------------------------------------------
-- draft: the admin working copy of the editable fields, keyed by live column
--        name ({title, type, body_md, video_url, tutor_reference_md, quiz_json,
--        lab_config_json, sorter_config_json}). Learners NEVER read this — the
--        learner fetch reads the LIVE columns only. Publish copies draft → live
--        and nulls it (the absolute version bump happens in the function).
alter table public.modules add column if not exists draft jsonb;
-- video_url: an optional lesson video link (URL only — no media uploads).
alter table public.modules add column if not exists video_url text;
-- tutor_reference_md: extra grounding for the in-app tutor on a cell's lesson.
alter table public.modules add column if not exists tutor_reference_md text;
-- origin: 'matrix' (one of the 28 fixed cells) | 'custom' (free-form lesson).
alter table public.modules add column if not exists origin text not null default 'matrix';
-- archived_at: soft-delete. Non-null rows are excluded from learner + default
--              CMS queries; restore sets it back to null. Nothing is hard-deleted.
alter table public.modules add column if not exists archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- Integrity constraints (idempotent)
-- ---------------------------------------------------------------------------
-- origin allow-list.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modules_origin_check') then
    alter table public.modules
      add constraint modules_origin_check check (origin in ('matrix', 'custom'));
  end if;
end $$;

-- Custom lessons live outside the matrix and its gating, so `stage` is nullable
-- for them. Drop the NOT NULL and widen the stage CHECK to allow null (matrix
-- rows keep a stage; custom rows are null). Drop+recreate keeps it idempotent.
alter table public.modules alter column stage drop not null;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'modules_stage_check') then
    alter table public.modules drop constraint modules_stage_check;
  end if;
  alter table public.modules
    add constraint modules_stage_check
    check (stage is null or stage in ('1a', '1b', '2'));
end $$;

-- Belt-and-suspenders: a matrix row must have a stage; a custom row must not.
-- (Keeps the origin/stage discriminator honest at the data layer.)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modules_origin_stage_check') then
    alter table public.modules
      add constraint modules_origin_stage_check
      check (
        (origin = 'matrix' and stage is not null)
        or (origin = 'custom' and stage is null)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- content_changes: locked-down audit trail for CMS mutations.
-- ---------------------------------------------------------------------------
-- Mirrors cohort_changes (P5.5a) / role_changes (P5.1a): RLS on with NO
-- permissive policy, so only service_role (the admin-content function) writes
-- and clients can neither read nor write. (An admin-read surface can come later
-- alongside the other audit tables; not needed for the MVP.)
create table if not exists public.content_changes (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,           -- save-draft | publish | archive | restore
  cell_id     text,                    -- the module acted on
  detail      jsonb,                   -- free-form context (e.g. the published version)
  created_at  timestamptz not null default now()
);

alter table public.content_changes enable row level security;
-- No permissive policy on purpose: locked down (service_role bypasses).
