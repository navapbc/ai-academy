-- progress_reset_epoch (cohort-restructure U10, R17): durable publish-time
-- progress reset that offline caches/outboxes cannot resurrect.
--
-- The epoch protocol (plan-mandated, review-hardened):
--   * `modules.progress_reset_at` — the module's reset epoch. Publish-with-reset
--     (admin-content) sets it FIRST (the commit point), THEN deletes the
--     module's module_progress rows. From the instant the epoch commits, any
--     completion write carrying an older (or missing) epoch is rejected below,
--     so nothing the delete removes can be re-asserted by a stale client.
--   * `module_progress.reset_epoch` — the epoch the CLIENT captured at
--     completion time (the module's progress_reset_at as the client saw it when
--     the work happened; null = the module had never been reset / legacy row).
--     Replays echo this STORED value — never a freshly-fetched one.
--   * The trigger guards ONLY writes that set status='completed'. Cursor
--     `in_progress` upserts always pass — position is a soft signal, never
--     evidence of work.
--
-- Idempotent + re-runnable (D-25): `add column if not exists`,
-- `create or replace function`, `drop trigger if exists` + `create trigger`.

alter table public.modules
  add column if not exists progress_reset_at timestamptz;

alter table public.module_progress
  add column if not exists reset_epoch timestamptz;

-- ---------------------------------------------------------------------------
-- Trigger function: reject stale-epoch completion writes.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, empty search_path, postgres-owned (the handle_new_user /
-- is_staff hardening pattern): the `public.modules` read below must NOT depend
-- on the caller's RLS visibility — an unenrolled learner replaying a stale
-- completion against a now-invisible program module must still see the module's
-- epoch and be correctly rejected (fail-closed). Under an invoker read, RLS
-- would hide the row, the epoch would read as null, and the stale write would
-- be silently ACCEPTED — fail-open, the exact bug this trigger exists to close.
--
-- Error contract: the message PREFIX `STALE_RESET_EPOCH` (errcode P0001) is
-- what the client classifies on (src/lib/progress.ts isStaleResetEpochError).
-- Keep the prefix stable; the rest of the message is diagnostic only.
create or replace function public.enforce_progress_reset_epoch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_reset_at timestamptz;
begin
  -- Guard ONLY completion writes: in_progress cursor writes pass untouched.
  if new.status is distinct from 'completed' then
    return new;
  end if;

  -- Lock the module row so this check serializes against a concurrent
  -- publish-with-reset transaction. FOR SHARE (not FOR KEY SHARE): a plain
  -- UPDATE of progress_reset_at takes FOR NO KEY UPDATE, which FOR KEY SHARE
  -- does NOT conflict with — only FOR SHARE (or stronger) actually blocks
  -- until the reset's epoch UPDATE commits and then re-reads the new value.
  -- This is the plan's "FOR KEY SHARE or equivalent"; KEY SHARE alone would
  -- leave the racing-write window open.
  --
  -- module_progress.module_id has no FK to modules; an unknown id finds no row,
  -- leaves module_reset_at null, and passes — a module that does not exist
  -- cannot have been reset.
  select m.progress_reset_at
    into module_reset_at
    from public.modules m
   where m.cell_id = new.module_id
     for share of m;

  if module_reset_at is not null
     and (new.reset_epoch is null or new.reset_epoch < module_reset_at) then
    raise exception
      'STALE_RESET_EPOCH: progress for module % was reset at %; the supplied completion epoch (%) predates it',
      new.module_id,
      module_reset_at,
      coalesce(new.reset_epoch::text, 'null')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Postgres-owned so the definer read bypasses RLS regardless of who runs this
-- migration; trigger functions cannot be invoked directly, the revoke is hygiene.
alter function public.enforce_progress_reset_epoch() owner to postgres;
revoke all on function public.enforce_progress_reset_epoch() from public;

drop trigger if exists module_progress_reset_epoch_guard on public.module_progress;
create trigger module_progress_reset_epoch_guard
  before insert or update on public.module_progress
  for each row execute function public.enforce_progress_reset_epoch();
