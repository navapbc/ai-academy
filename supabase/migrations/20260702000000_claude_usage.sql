-- claude_usage (P6.2 Unit 1): a durable, client-write-locked record of Claude
-- API token usage per call.
--
-- One row per model call from the two Edge Functions (`chat` | `grade`),
-- recorded best-effort with the service_role key AFTER the response completes.
-- Purpose is monitor + alert only — nothing here ever blocks or degrades a call
-- (P6.2 origin: monitor-only, no caps). Admins read it for the usage-monitoring
-- view; nobody else can read it, and NO client can write it.
--
-- Locked-down write model, mirroring content_changes (20260618000000): RLS on
-- with NO client insert/update/delete policy, so the only writer is the
-- service_role client inside the Edge Functions (service_role bypasses RLS).
-- The single permissive policy is an admin SELECT via the existing
-- public.is_admin() SECURITY DEFINER helper (20260612000000) — do NOT redefine
-- it here.
--
-- Idempotent + additive: guarded so `supabase db reset` (and any re-run) applies
-- cleanly — create table/index if not exists, and the policy is created only
-- when it does not already exist.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.claude_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  source        text not null check (source in ('chat', 'grade')),
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  created_at    timestamptz not null default now()
);

-- Per-user windowed reads (the monitoring view aggregates per user over a
-- created_at window); plus a plain created_at index for cohort-wide windowing.
create index if not exists claude_usage_user_created_idx
  on public.claude_usage (user_id, created_at);
create index if not exists claude_usage_created_idx
  on public.claude_usage (created_at);

-- ---------------------------------------------------------------------------
-- RLS: locked down for writes (no client policy), admin-only read.
-- ---------------------------------------------------------------------------
alter table public.claude_usage enable row level security;

-- Admin SELECT via the shared is_admin() helper. No insert/update/delete policy
-- on purpose: writes route only through the service_role Edge-Function client.
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'claude_usage_admin_read'
  ) then
    create policy claude_usage_admin_read
      on public.claude_usage for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;
