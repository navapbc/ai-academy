---
title: "feat: Cornerstone learning-data feed (AI Academy → CSOD external training)"
type: feat
status: active
date: 2026-07-01
deepened: 2026-07-01
origin: docs/brainstorms/cornerstone-learning-data-integration-requirements.md
---

# feat: Cornerstone learning-data feed (AI Academy → CSOD external training)

## Overview

A one-directional feed that pushes per-learner **milestone completion records** (Stage 1a, Stage 1b, Stage 2, GLAT) from the AI Academy (Supabase) into Cornerstone OnDemand (CSOD) as **External Training** transcript records, so L&D gets both transcript-of-record and native Cornerstone reporting without us building a second reporting surface.

The heavy lifting (milestone computation, the durable latch, the delivery ledger, the cross-user read) lives in Postgres. The **CSV generation + SFTP transport runs in a small external AWS worker** — because SFTP is not viable from a Supabase Edge Function (see Key Technical Decisions D1). The worker drops a CSV into Cornerstone's `EdgeImport` SFTP folder; Cornerstone's Edge Import External Training feed ingests it on its own schedule.

## Problem Frame

L&D works in Cornerstone (their system of record) and today has no way to record AI Academy completion on a learner's official transcript, nor easy reporting access. See origin: `docs/brainstorms/cornerstone-learning-data-integration-requirements.md`. Pilot access (2026-07) let us verify the Cornerstone side directly; those findings are baked into this plan.

## Requirements Trace

Requirement IDs map to the origin document.

- R1. Sync up to 4 milestone records per learner: Stage 1a, Stage 1b, Stage 2, GLAT (GLAT drawn from module `2.14`; `2.14` excluded from the Stage 2 milestone).
- R2. Milestone completion defined server-side against `modules.status='published'`, mirroring `learner_progress_summary` semantics. GLAT = a passing `quiz_attempts` row on `2.14` (**resolved**: confirmed by the P4.10 spec, see origin Dependencies).
- R3. Send-only-when-complete + durable latch: freeze completion date at first satisfaction, snapshot the counted module set, never downgrade.
- R4. Each record: learner identity (Cornerstone Username), constant milestone title, status `Completed`, latched canonical date, score only for GLAT.
- R5. Idempotent delivery: each `(user, milestone)` sent **exactly once** via an app-side sent-ledger (pilot-confirmed a re-load errors, so re-sending is forbidden, not merely deduped).
- R6. Match learners by **Cornerstone Username** via an email→username mapping (pilot-confirmed email is not the match key).
- R7. Automated, scheduled, no per-run manual step in steady state.
- R8. SFTP delivery to `/clients/navapbc/EdgeImport/` on `ftp.navapbc-pilot.csod.com` (SFTP/22), ingested by Cornerstone's Edge Import External Training feed.
- R9. Observability: a run-log + a read-only admin status panel; logs never contain raw email/score.
- R10. No separate reporting pipeline — rely on Cornerstone native reporting.
- R11. Cross-user read bypasses owner-only RLS via a `SECURITY DEFINER` path scoped to the worker's credential.
- R12/R13. Secrets stored server-side only; SFTP host-key verification fail-closed; fixed field allow-list; no PII in logs.

## Scope Boundaries

- One-directional only (no reads from Cornerstone driving app behavior).
- No per-module sync; only the 4 milestones.
- No launch-from-Cornerstone (SCORM/xAPI) integration.
- No new learner-facing UI.
- Lab transcripts / rubric detail do not sync.
- **No reporting pipeline (R10):** satisfied by *not* building reporting code — the admin panel (Unit 7) shows run/ledger status only, not learner analytics; L&D analytics come from Cornerstone's native reporting.

### Deferred to Separate Tasks

- **Automated ingestion reconciliation** (parse a Cornerstone results/error file to auto-confirm/reject ledger rows): deferred to a fast-follow, contingent on pilot-verifying that Cornerstone returns a results file (D2).
- **Automated email→username mapping sync** from a scheduled Cornerstone user export: v1 uses an admin-managed mapping table populated from a manual export (Unit 8); automation is a later iteration.
- **The two L&D product confirmations** (stage-level granularity/compliance acceptance; stale-complete acceptance) are carried as assumptions below; a "no" reopens R1/R3 and is out of this plan's scope to resolve.

## Context & Research

### Relevant Code and Patterns

- **Edge Function trio convention** (`index.ts` + `<name>-core.ts` + `<name>-core.test.ts`): `supabase/functions/chat/`, `supabase/functions/admin-content/`. Secrets via `Deno.env.get`; `.env.example` committed, `.env` gitignored.
- **`SECURITY DEFINER` recipe**: `supabase/migrations/20260612000000_champion_admin_read_policies.sql` — `public.is_admin()` / `public.is_champion_of()` declared `stable security definer set search_path = ''`, fully schema-qualified, owned by `postgres`, `EXECUTE` revoked from `public`. Reuse verbatim for the cross-user read.
- **Locked-down audit table**: `content_changes` in `supabase/migrations/20260618000000_admin_cms_foundation.sql` — RLS enabled, no permissive policy (service-role-only write, no client access). Template for the latch, ledger, and run-log tables; add an admin `select` policy `using (public.is_admin())` where the status panel must read.
- **Append-only ledger idiom**: `supabase/migrations/20260611000000_role_changes_audit.sql`.
- **Completion semantics to mirror**: `supabase/migrations/20260613000000_p5_2a_aggregation_layer.sql` — `learner_progress_summary` counts `mp.status='completed' and m.status='published'`; `glat_passed = exists(quiz_attempts where module_id='2.14' and passed)`. `security_invoker` views (our feed needs the *opposite* — a definer path).
- **Cross-user service-role precedent**: `supabase/functions/review-grade/index.ts` (service-role client bypassing RLS) — learn from, but scope tighter per R11.
- **Admin read-only surface**: `src/lib/dashboard.ts` (pure builders + thin fetchers + `numeric`→string coercion), `src/lib/useRole.ts` (fail-closed role), `src/components/RoleGuard.tsx`, `src/components/staff/CohortDashboard.tsx`. Mirror for the feed-status panel.
- **Source schema**: `supabase/migrations/20260528221204_init_core.sql` — `module_progress(user_id, module_id, status, completed_at)` (`completed_at` **nullable**), `quiz_attempts(user_id, module_id, score, max_score, passed, attempted_at)` (append-only, multiple attempts), owner-only RLS, `on delete cascade` from `auth.users`.
- **Types**: `src/types.ts` (`Role`, `ModuleStatus`), `src/lib/modules.ts` (published/`archived_at` filtering).
- **Durable-outbox idiom** (for at-least-once thinking): `src/lib/pendingWrites.ts`.

### Institutional Learnings

- **P4.10 spec** (`docs/superpowers/specs/2026-06-15-p4.10-glat-objective-gate-design.md`): GLAT pass = passing `quiz_attempts` row on `2.14` (`max_score=35`, `passed=true`), best-attempt-wins, retakes allowed. **Resolves the GLAT-signal ambiguity** (the codebase's decision D7) flagged in the origin doc — GLAT score source = the passing 2.14 attempt's `score/max_score`; date = `attempted_at`. Verify P4.10 is merged (it predates the current HEAD; the seed migration `20260615000000_seed_glat_bank_2_14.sql` exists).
- **P5.2a spec** (`docs/superpowers/specs/2026-06-13-p5.2a-aggregation-layer-design.md`): the team deliberately rejected `SECURITY DEFINER` for dashboards in favor of `security_invoker`. Our feed is the justified opposite case (non-interactive scheduler, no caller JWT) — apply the P5.1c definer discipline carefully.
- **P5.1c spec** (`docs/superpowers/specs/2026-06-12-p5.1c-champion-admin-rls-design.md`): the definer-function gotchas (`search_path=''`, schema-qualify, `postgres`-owned, no `FORCE RLS`).
- No `docs/solutions/` exists in this repo; institutional knowledge lives in `docs/superpowers/specs/` + `docs/plans/`.

### External References

- **SFTP not viable from Supabase Edge/Deno** (decisive): `ssh2`/`ssh2-sftp-client` fail under Deno node-compat ([deno#24118](https://github.com/denoland/deno/issues/24118), [#27400](https://github.com/denoland/deno/issues/27400)); Edge 2s CPU limit ([Supabase CPU limits](https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits)); no `child_process`; no static egress IP. → external Node worker.
- **Secure SFTP practice**: host-key pinning fail-closed ([SFTPCloud](https://sftpcloud.io/learn/sftp/sftp-host-key-verification-failed)); atomic temp-name-then-rename upload ([WinSCP](https://winscp.net/eng/docs/script_locking_files_while_uploading)); key-based auth preferred.
- **Deterministic CSV** (RFC 4180): fixed column order, consistent quoting, canonical UTC date string, deliberate BOM/line-ending choice ([hilton.org.uk/RFC4180](https://hilton.org.uk/blog/csv-rfc-4180)). Byte-determinism is a correctness requirement because the Cornerstone match key includes the date string.
- **Pilot-confirmed Cornerstone facts** (origin doc "Cornerstone Edge — confirmed facts"): composite key `User + Start Date + Status + Title`; re-send errors; Username match; SFTP host/folder/port; date format `DATE HH:MM:SS ± UTC offset` (defaults 23:59:00 UTC).

## Key Technical Decisions

- **D1 — External AWS worker, not an Edge Function.** SFTP is not viable from Supabase Edge (see External References). Postgres holds the logic; an **AWS Lambda triggered by EventBridge Scheduler** (Node + `ssh2-sftp-client`) does CSV+SFTP. Rationale: Nava already runs on AWS; a scheduled Lambda is set-and-forget, gets secrets from Secrets Manager, logs to CloudWatch, and can get a static egress IP via VPC+NAT if Cornerstone requires allow-listing. *(Lighter fallback if AWS proves heavy: GitHub Actions cron running the same Node job — but static IP is harder there.)* This supersedes origin R7/R8/R11/R12's "Edge Function drops the file" assumption.
- **D2 — Reconciliation: ledger status-lifecycle + manual reconcile for v1.** "Uploaded" ≠ "ingested"; Cornerstone reports row rejections asynchronously in its own log with no read-back. Ledger rows carry a status lifecycle (`uploaded` → `confirmed`/`rejected`/`failed`); a row is **re-sendable until confirmed**; an operator periodically diffs Cornerstone's External Training report against the ledger. Automated results-file reconciliation is deferred (contingent on pilot-verifying Cornerstone returns a results file). Rationale: protects official-transcript integrity against silent loss without over-building v1.
- **D3 — Exactly-once by ledger reservation (claim-then-upload).** Ledger has `UNIQUE(user_id, milestone_kind)` — never `attempt_id` (GLAT retakes). **Order: reserve → upload → confirm.** (1) The worker atomically INSERTs ledger rows in a `pending` state for the rows it intends to send (`ON CONFLICT (user_id, milestone_kind) DO NOTHING` — this reservation, not an external lock, is the exactly-once authority and survives crashes and overlapping runs); (2) it uploads only the rows it actually reserved this run; (3) it transitions them to `uploaded` on success or `failed` on error. `cornerstone_pending_export` excludes `pending`/`uploaded`/`confirmed` (only `failed`/`rejected` are re-sendable). A crash after reserve but before upload leaves a `pending` row that is **retriable but never re-emitted as a new record without evidence** — a rare missed send (caught by D2 reconcile) is strictly safer than the alternative (a row re-emitted every week that Cornerstone hard-errors on). Single-runner is a **durable lease-row lock** (a singleton `cornerstone_feed_lock` row claimed via `UPDATE ... WHERE status='idle' RETURNING` with a holder `run_id` + expiry, reclaimable after timeout), **not** a session `pg_try_advisory_lock` — an advisory lock cannot span the worker's separate pooled PostgREST RPC calls and would be released the instant the claim RPC's connection returns to the pool. AWS Lambda reserved-concurrency=1 backs this as defense-in-depth. Note: with no synchronous read-back from Cornerstone, this guarantees **uploaded-exactly-once**, not ingested-exactly-once — ingestion is closed by D2 reconciliation.
- **D4 — Latch: freeze + snapshot + never-downgrade.** A batch `refresh_cornerstone_latches()` function upserts a latch the first time a learner satisfies a milestone (`ON CONFLICT (user_id, milestone_kind) DO NOTHING`), freezing the canonical date string and snapshotting the counted `module_id` set for audit. Never downgrades (stale-complete accepted per origin R3). This also gives backfill for free (first run latches all currently-satisfied learners).
- **D5 — Cross-user read via `SECURITY DEFINER`, executed by a dedicated least-privilege role.** A `postgres`-owned, `search_path=''`, schema-qualified definer function/view (`cornerstone_pending_export`) returns latched-but-unsent rows joined to the username map. **The worker connects with a dedicated Postgres login role granted `EXECUTE` only on the cornerstone RPCs and no other table/schema privileges** (via the pooler/direct Postgres) — **not** the platform `service_role` REST key. Rationale: `service_role` is a whole-database RLS-bypass credential, so its leak from AWS Secrets Manager would be a full-DB compromise, not a feed-scoped one; a dedicated role makes the credential's blast radius match the stated intent. This is deliberately tighter than the `review-grade` blanket-service-role pattern.
- **D6 — Username resolution at send time, self-healing.** Latches are created regardless of deliverability. The worker resolves username at send time; unresolved learners are **skipped, left un-ledgered, counted, and retried every run** (self-heals when the mapping updates) — never marked sent.
- **D7 — Canonical date serialization frozen in the latch.** (This is *this plan's* D7 — distinct from the codebase's decision D7 about the GLAT credential.) One tested function serializes `completed_at` (or `attempted_at` for GLAT) to a canonical string; the **serialized string is stored in the latch** so it can never re-serialize differently across runs. A `completed` row with null `completed_at` is excluded rather than dated from a moving `updated_at`. Exact format confirmed against the pilot template guide **before the latch backfill runs** (the frozen string cannot be re-serialized later — see Risks).
- **D8 — Locked-down tables.** Latch, ledger, run-log, and username-map tables follow the `content_changes` pattern (RLS on, service-role write, no client write), plus an admin `select` policy via `public.is_admin()` for the status panel.

## Open Questions

### Resolved During Planning

- Transport architecture → external AWS Lambda worker (D1).
- Reconciliation posture → ledger lifecycle + manual reconcile v1 (D2).
- GLAT completion signal → `quiz_attempts` on `2.14`, confirmed by P4.10 spec (R2).
- Idempotency/exactly-once mechanism → ledger `UNIQUE(user,milestone)` reservation (claim-then-upload) + durable lease-row lock (D3).
- Latch creation → batch `refresh_cornerstone_latches()`, doubles as backfill (D4).
- Cross-user read → `SECURITY DEFINER` executed by a dedicated least-privilege worker role, not `service_role` (D5).

### Deferred to Implementation

- Exact External Training **column names + Score field format**, and which blank field triggered the pilot "Default value applied" warning → download the pilot template guide (origin "pilot checklist").
- Whether Cornerstone requires **source-IP allow-listing** → if yes, run the Lambda in a VPC with a NAT gateway / Elastic IP (decides worker networking).
- Whether Cornerstone **returns a results/error file** on SFTP → enables the deferred automated reconciliation (D2).
- Exact **CSV encoding** (BOM y/n), **line endings** (CRLF vs LF), and **date format string** Cornerstone expects → confirm against template guide / a pilot load; default no-BOM + `MM/DD/YYYY` (pilot-loaded successfully) held constant.
- SFTP **auth mode** (SSH key vs password) — pilot used a password; prefer key auth if Cornerstone supports it.
- **`cornerstone_user_map` population** at scale (manual CSV upsert vs a small admin import path) — v1 minimal (Unit 8).
- **Archive-driven completion** (I8): unpublishing a pending module can make a learner "all published complete." v1 snapshots counted module IDs for audit and accepts it (consistent with stale-complete); revisit if L&D objects.
- **Cornerstone per-file row limit / ingestion timeout** (distinct from the 2M/portal limit) — verify in pilot; drives the chunk threshold in Unit 4's `toCsv`.
- **Data-subject deletion for already-exported PII** — a record already on a Cornerstone transcript cannot be un-sent by deleting the local row; a deletion request must be relayed to L&D/Cornerstone out-of-band. Define the procedure + a PII retention limit for the surviving ledger/run-log rows.
- **`refresh_cornerstone_latches()` query plan** — a full cross-user scan each run; fine at internal-training scale (weekly, low thousands of users), but add supporting indexes and revisit the plan if the population grows (same caveat the p5_2a view migration notes).

### Blocking (Product — carried as assumptions, owned by L&D)

- **Assumption A1:** stage-level granularity + completion-only stage records + GLAT-as-external-training meets L&D reporting/compliance needs. A "no" reopens R1/R4.
- **Assumption A2:** "stale-complete" is acceptable on the official transcript. A "no" reopens R3.
- **Gate + ownership:** A1/A2 are a **hard precondition for Unit 1** — they shape the latch/ledger schema and CSV columns that Units 1–5 depend on. Owner: the L&D Cornerstone contact (TBD — the person who provisioned pilot access). Confirm before build starts; if not confirmed, implementation pauses. Blast radius of a "no": Units 1, 2, 3, 4, 5, 9 churn (latch/ledger schema, completion predicates, CSV columns).

## Output Structure

    supabase/migrations/
      2026........_cornerstone_feed_tables.sql        # latch, ledger, run-log, user-map (Units 1-2)
      2026........_cornerstone_feed_functions.sql     # refresh_latches + SECURITY DEFINER read + RPCs (Units 1,3)
    aws/cornerstone-feed/            # external Node worker (Unit 4-6) — deployed to AWS, lives in-repo
      src/
        handler.ts                   # Lambda entry: lock → refresh → read → CSV → SFTP → ledger → run-log
        feed-core.ts                 # PURE: row selection, CSV build, canonical date serialization
        sftp.ts                      # SFTP upload: host-key pin, atomic temp-then-rename
        supabase.ts                  # service-role client + RPC calls
      test/
        feed-core.test.ts            # pure-logic unit tests (vitest node)
      infra/                         # IaC: EventBridge schedule, Lambda, Secrets Manager, VPC/NAT (Unit 6)
      package.json
      README.md                      # runbook + reconciliation procedure (Unit 9)
    src/
      lib/cornerstoneFeed.ts         # read-only data-access for the admin status panel (Unit 7)
      lib/useCornerstoneFeed.ts      # hook
      components/staff/CornerstoneFeedStatus.tsx   # read-only panel (Unit 7)

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                          Supabase (Postgres)                         AWS
  ┌───────────────────────────────────────────────┐        ┌──────────────────────────┐
  │ module_progress ─┐                             │        │ EventBridge (weekly cron)│
  │ quiz_attempts  ──┼─► refresh_cornerstone_      │        └───────────┬──────────────┘
  │ modules(pub'd) ──┘   latches()  [DEFINER]      │                    ▼
  │                       │  ON CONFLICT DO NOTHING │        ┌──────────────────────────┐
  │                       ▼                         │        │ Lambda worker (Node)     │
  │              cornerstone_milestone_latch        │  (1)   │  advisory lock           │
  │              (frozen date, module snapshot)     │◄───────┤  call refresh_latches()  │
  │                       │                         │        │                          │
  │  cornerstone_pending_export  [DEFINER, ─────────┼──(2)──►│  read pending rows       │
  │   service_role only] = latch ⋈ user_map         │        │  resolve username        │
  │   MINUS confirmed/uploaded ledger               │        │  build CSV (canonical)   │
  │                                                 │        │  SFTP put→rename (atomic)│──(3)─► CSOD
  │  cornerstone_sent_ledger (UNIQUE user,milestone)│◄──(4)──┤  upsert ledger=uploaded  │       EdgeImport/
  │  cornerstone_feed_run (run-log)                 │◄───────┤  write run-log           │
  └───────────────────────────────────────────────┘        └──────────────────────────┘
        ▲ admin SELECT via is_admin()                          later: Cornerstone import
        │                                                      log ── manual reconcile ──► ledger
   React admin status panel (read-only)                        (uploaded → confirmed/rejected)
```

Milestone kinds (`stage_1a | stage_1b | stage_2 | glat`) and their completion predicates:

| Milestone | Complete when | Score | Date source |
|---|---|---|---|
| stage_1a | all published `stage='1a'` modules `completed` for user | none | max `completed_at` over the stage's modules |
| stage_1b | all published `stage='1b'` modules `completed` | none | max `completed_at` |
| stage_2 | all published `stage='2'` modules **except `2.14`** `completed` | none | max `completed_at` |
| glat | passing `quiz_attempts` row on `2.14` | pass % (`score/max_score`) | `attempted_at` of passing attempt |

## Implementation Units

- [ ] **Unit 1: Milestone latch table + completion/refresh function**

**Goal:** Durably record, once, when each learner first satisfies each milestone, with a frozen date and a module-set snapshot.

**Requirements:** R1, R2, R3, D4, D7

**Dependencies:** None (reads existing `module_progress`, `quiz_attempts`, `modules`).

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_cornerstone_feed_tables.sql` (latch table portion)
- Create: `supabase/migrations/2026XXXXXXXXXX_cornerstone_feed_functions.sql` (`refresh_cornerstone_latches()`, date-serialization SQL helper)
- Test: `src/lib/cornerstoneLatch.integration.test.ts` (DB-gated, `RUN_DB_TESTS=1`)

**Approach:**
- `cornerstone_milestone_latch(id, user_id, milestone_kind, completed_at, completed_date_serialized text, module_ids_snapshot text[], score_pct numeric null, created_at)`, `UNIQUE(user_id, milestone_kind)`.
- `milestone_kind` enum/text check: `stage_1a|stage_1b|stage_2|glat`.
- `refresh_cornerstone_latches()` — `SECURITY DEFINER`, `search_path=''`, schema-qualified, `postgres`-owned. Computes currently-satisfied milestones using the p5_2a predicate (`mp.status='completed' and m.status='published'`), excludes `2.14` from `stage_2`, reads GLAT from `quiz_attempts`. Inserts `ON CONFLICT DO NOTHING` (never downgrade). Freezes `completed_date_serialized` at insert; snapshots counted `module_id`s.
- Date serialization helper mirrors D7. `completed_at` is always set when status becomes `completed` (per `src/lib/progress.ts`), so it is the date source. A `completed` row with a null `completed_at` (legacy/import only) is **excluded** from the milestone rather than dated from a moving `updated_at` (which would freeze a non-completion timestamp into the transcript match key).

**Patterns to follow:** p5_2a completion SQL (`20260613000000_p5_2a_aggregation_layer.sql`); P5.1c definer recipe (`20260612000000_champion_admin_read_policies.sql`); idempotent migration guards from `20260618000000_admin_cms_foundation.sql`.

**Test scenarios:**
- Happy path: learner completes all published stage-1a modules → one `stage_1a` latch with frozen date = max `completed_at`.
- Happy path: passing `2.14` attempt → `glat` latch with `score_pct` from that attempt; `2.14` does not by itself satisfy `stage_2`.
- Edge: re-running `refresh` does not change an existing latch's date or create duplicates (`ON CONFLICT DO NOTHING`).
- Edge: publishing a new stage-1a module after a latch exists does **not** downgrade/alter the latch.
- Edge: a `completed` row with null `completed_at` (legacy) is excluded from the milestone, not dated from `updated_at`.
- Edge: multiple passing GLAT attempts → best-attempt score selected deterministically; `max_score` null/0 guarded.
- Integration: latch computed under definer privileges returns rows across users (bypasses owner-only RLS).

**Verification:** With a seeded multi-learner DB, `refresh` produces exactly the expected latch rows; a second `refresh` is a no-op.

- [ ] **Unit 2: Ledger, run-log, and username-map tables (locked-down)**

**Goal:** Delivery-state ledger (exactly-once key), run-log, and email→username mapping, all service-role-write / admin-read.

**Requirements:** R5, R6, R9, R11, D3, D8

**Dependencies:** Unit 1 (shares migration file/patterns).

**Files:**
- Modify: `supabase/migrations/2026XXXXXXXXXX_cornerstone_feed_tables.sql`
- Test: `src/lib/cornerstoneFeedRls.integration.test.ts` (DB-gated)

**Approach:**
- `cornerstone_sent_ledger(id, user_id, milestone_kind, status text check in ('pending','uploaded','confirmed','rejected','failed'), filename, run_id, uploaded_at, confirmed_at, error_detail)`, `UNIQUE(user_id, milestone_kind)` (the reservation/exactly-once key, D3).
- `cornerstone_feed_run(id, run_id, started_at, finished_at, status, rows_uploaded int, rows_unresolved int, rows_failed int, filename, error_detail)`.
- `cornerstone_user_map(user_id, cornerstone_username, updated_at)`, `UNIQUE(user_id)` and `UNIQUE(cornerstone_username)`.
- `cornerstone_feed_lock(id singleton, status, holder_run_id, claimed_at, expires_at)` — the D3 lease-row lock.
- All: RLS enabled, **no permissive write policy** (writable only by the dedicated worker role / definer RPCs), plus `select` policy `using (public.is_admin())` for the status panel.
- **Cascade decision (made at plan level):** `cornerstone_sent_ledger` and `cornerstone_feed_run` **survive** `auth.users` deletion (audit) retaining `user_id`; `cornerstone_milestone_latch` and `cornerstone_user_map` **cascade** on delete. `error_detail` is sanitized at write time — never raw email/score/PII-bearing exception text.

**Patterns to follow:** `content_changes` locked-down table + `role_changes` append-only ledger; admin `select` via `is_admin()` (`champion_admin_read_policies.sql`).

**Test scenarios:**
- Happy path: service-role insert into ledger/run-log succeeds; `UNIQUE(user,milestone)` rejects a duplicate ledger row.
- Edge: a non-admin authenticated user cannot `select` from ledger/run-log/map (RLS denies).
- Edge: an admin user can `select` (via `is_admin()`), cannot `insert`/`update`.
- Edge: ledger status transitions `uploaded`→`confirmed`/`rejected` persist; a row in `uploaded`/`rejected` remains re-selectable by the pending-export read (Unit 3).

**Verification:** RLS integration test passes for owner/admin/service-role matrix; unique constraints enforced.

- [ ] **Unit 3: `SECURITY DEFINER` pending-export read + worker RPCs**

**Goal:** A single privileged surface the worker calls to get rows-to-send and to record results, scoped to the service-role credential.

**Requirements:** R5, R6, R11, D3, D5, D6

**Dependencies:** Units 1, 2.

**Files:**
- Modify: `supabase/migrations/2026XXXXXXXXXX_cornerstone_feed_functions.sql`
- Test: `src/lib/cornerstonePendingExport.integration.test.ts` (DB-gated)

**Approach:**
- `cornerstone_pending_export()` — `SECURITY DEFINER`, `search_path=''`, `postgres`-owned, `EXECUTE` granted to the **dedicated worker role only** (D5). Returns a **minimal column set** — `user_id`, `milestone_kind`, `cornerstone_username`, `completed_date_serialized`, `score_pct`, `resolved_username` flag — and explicitly **not** `profiles.email` or other columns, so PII minimization is enforced at the read layer, not just at CSV build. Excludes ledger rows in `pending`/`uploaded`/`confirmed`; only `failed`/`rejected` are re-sendable.
- RPCs (all definer, worker-role-only): `cornerstone_claim_run_lock(run_id)` / `cornerstone_release_run_lock(run_id)` (durable **lease-row** claim + expiry per D3, not a session advisory lock); `cornerstone_reserve_rows(rows, run_id)` (INSERT ledger `pending` `ON CONFLICT DO NOTHING`, returns the rows actually reserved this run); `cornerstone_mark_uploaded(rows, filename, run_id)`; `cornerstone_mark_failed(rows, run_id, error)`; `cornerstone_record_run(...)`.
- Unresolved-username rows are returned flagged; the worker skips them (D6) and does **not** reserve or ledger them.

**Patterns to follow:** P5.1c definer helpers; tighten grant to `service_role` (not `authenticated`).

**Test scenarios:**
- Happy path: a latched, mapped, un-ledgered milestone appears in `pending_export`; once ledgered `uploaded`, it disappears.
- Edge: a `rejected` ledger row reappears in `pending_export` (re-sendable); a `confirmed` one does not.
- Edge: a latched row with no username-map entry appears flagged `unresolved`.
- Error/security: `pending_export` / RPCs are not executable by `authenticated`, `anon`, or a broad `service_role` — only the dedicated worker role (grant scoped per D5).
- Integration: two concurrent `claim_run_lock` calls — only one wins the lease row; the loser exits. A lease past its expiry is reclaimable.
- Integration: `reserve_rows` under two overlapping runs reserves each `(user, milestone)` exactly once (`ON CONFLICT`); the loser receives zero rows for that key (proves the claim-then-upload exactly-once authority).

**Verification:** The read returns exactly the send-set for a seeded scenario; lock prevents concurrent claims.

- [ ] **Unit 4: Worker pure core — row selection, CSV, date serialization**

**Goal:** Deno-agnostic (Node) pure logic that turns pending-export rows into a deterministic CSV, unit-tested without network.

**Requirements:** R4, R5, R9, D7, D3

**Dependencies:** Unit 1 (date-serialization contract — output must match the string frozen in the latch), Unit 3 (row shape contract).

**Files:**
- Create: `aws/cornerstone-feed/src/feed-core.ts`
- Test: `aws/cornerstone-feed/test/feed-core.test.ts`

**Approach:**
- Pure functions: `selectSendableRows(pendingRows)` (drop unresolved), `toCsv(rows)` via an RFC-4180 CSV library with fixed column order, consistent quoting, UTF-8, deliberate BOM/line-ending choice, stable row order (by composite key).
- `serializeMilestoneDate(...)` — canonical form; asserts against known inputs incl. a midnight-UTC boundary. Must match the string frozen in the latch (D7).
- Constant milestone titles + `Completed` status live here as the single source of truth.
- Fixed field allow-list enforced here (R13): only username, title, status, date, GLAT score can be emitted (no email — the read layer already excludes it, D5).
- **Chunking:** `toCsv` supports a configurable max-rows-per-file so a large first backfill emits N files, each reserved/ledgered independently (see Risks / Unit 9).

**Execution note:** Implement test-first — this is the byte-determinism correctness core, and its output feeds a match key.

**Patterns to follow:** `*-core.ts` pure-logic + vitest convention (`supabase/functions/chat/chat-core.ts`).

**Test scenarios:**
- Happy path: 3 milestones → CSV with correct fixed columns, header, CRLF/LF per decision, quoting.
- Edge: title/score containing a comma/quote is correctly quoted/escaped.
- Edge: GLAT row carries score; stage rows carry empty score column.
- Edge: same logical date across two runs serializes byte-identically (idempotency guard).
- Edge: unresolved rows are excluded from the CSV.
- Edge: empty send-set → returns "no file" sentinel, not a header-only file.
- Edge: a send-set larger than the chunk threshold → multiple files, each independently reservable/ledgerable.
- Error: a row missing a required allow-list field is rejected, not silently emitted.

**Verification:** CSV output is byte-stable across repeated runs for identical input; allow-list enforced.

- [ ] **Unit 5: Worker handler — Supabase read, SFTP upload, ledger + run-log write**

**Goal:** The Lambda entry that orchestrates a run end-to-end with exactly-once and fail-closed transport.

**Requirements:** R5, R6, R7, R8, R11, R12, R13, D1, D3, D6

**Dependencies:** Units 3, 4.

**Files:**
- Create: `aws/cornerstone-feed/src/handler.ts`
- Create: `aws/cornerstone-feed/src/sftp.ts`
- Create: `aws/cornerstone-feed/src/supabase.ts`
- Create: `aws/cornerstone-feed/package.json`
- Test: `aws/cornerstone-feed/test/handler.test.ts` (mock SFTP + Supabase RPC seams)

**Approach:**
- Sequence (claim-then-upload, per D3): `claim_run_lock(run_id)` (exit if lease held) → `refresh_cornerstone_latches()` → `cornerstone_pending_export()` → `selectSendableRows` + `toCsv` (chunked) → for each chunk: `reserve_rows(chunk, run_id)` (INSERT ledger `pending`, returns rows actually claimed) → SFTP upload only claimed rows → `mark_uploaded(claimed, filename, run_id)` on success or `mark_failed(...)` on error → `record_run(...)` (rows_uploaded, rows_unresolved, rows_failed) → `release_run_lock(run_id)`. Unresolved rows counted, never reserved/ledgered.
- `sftp.ts`: host-key pinned against a fingerprint from secrets, **fail closed** on mismatch; key auth preferred, password fallback; verify byte size before rename. Filename = **fixed configured feed prefix + variable suffix** (`<feed_prefix><period>_<run_id>[_<chunk>].csv`) so it both matches Cornerstone's "File Name Starts With" feed pattern *and* stays unique (a prefix mismatch would make the recurring feed silently ignore the file — a silent full-run loss). Upload to a temp name, then atomic `rename`.
- `supabase.ts`: connects with the **dedicated worker role** (D5), calls only the cornerstone RPCs.
- Secrets from AWS Secrets Manager (SFTP host, user, key/password, **host-key fingerprint obtained out-of-band from Cornerstone/L&D — not trust-on-first-use — and re-verified before prod cutover**, worker-role DB credential + connection string, feed prefix). Logs sanitize `error_detail` — no raw email/score/exception strings echoing PII (R13).

**Execution note:** Write a failing integration test for the ordering invariant (upload success precedes ledger write; unresolved never ledgered) before implementing.

**Patterns to follow:** Edge Function hardening/secret-reading discipline (`supabase/functions/chat/index.ts`), adapted to Node/Lambda; secrets-server-side-only principle from `src/lib/llm.ts`.

**Test scenarios:**
- Happy path: pending rows → CSV uploaded → ledger rows `uploaded` → run-log records counts.
- Edge: empty send-set → no SFTP, no ledger writes, run-log records a no-op run.
- Edge: unresolved-username rows → skipped, counted in `rows_unresolved`, never ledgered (retried next run).
- Error: SFTP upload fails after reserve → reserved rows moved to `failed` (re-sendable), run-log records the error.
- Error: host-key mismatch → connection aborts, run fails closed, nothing reserved or sent.
- Error: `claim_run_lock` lease held by a live run → handler exits without sending; a stale (expired) lease is reclaimed.
- Edge: emitted filename begins with the configured feed prefix (else the recurring feed silently ignores it) — assert against the prefix constant.
- Integration: crash simulated **after reserve, before upload** → the `pending` row is NOT re-emitted as a new upload next run (reservation is the guard); it is surfaced for D2 reconcile. Crash **after upload, before mark_uploaded** → row stays `pending`, is not re-uploaded blindly, and reconcile confirms/repairs it (proves no weekly recurring hard-error).

**Verification:** End-to-end against a local stack + a mock SFTP server: one milestone is delivered exactly once across repeated invocations.

- [ ] **Unit 6: Worker deployment — schedule, secrets, networking**

**Goal:** Deploy the worker to AWS as a set-and-forget weekly job with correct secret storage and egress.

**Requirements:** R7, R12, D1

**Dependencies:** Unit 5.

**Files:**
- Create: `aws/cornerstone-feed/infra/` (IaC — Lambda, EventBridge Scheduler rule, Secrets Manager entries, IAM role, optional VPC/NAT)
- Modify: `supabase/functions/.env.example` (document the worker-side secret names for local parity, even though the worker runs on AWS)

**Approach:**
- EventBridge Scheduler weekly cron (day/time chosen relative to Cornerstone's ingestion window; UTC). **Lambda reserved-concurrency=1** as defense-in-depth behind the D3 lease-row lock.
- Secrets Manager holds SFTP secrets + host-key fingerprint + the **dedicated worker DB credential** (not the `service_role` key, D5); IAM grants the Lambda read on exactly those.
- If Cornerstone requires source-IP allow-listing (deferred verification), place the Lambda in a VPC with a NAT gateway / Elastic IP and give Cornerstone that IP.
- CloudWatch alarms on run failure, `rows_unresolved > 0`, `rows_failed > 0`, repeated identical-key rejections, and DB/SFTP auth failure (stale credential).

**Execution note:** none (infra/config).

**Test scenarios:** `Test expectation: none — infrastructure/config; correctness is exercised by Unit 5 tests and a manual scheduled-run smoke test in the pilot.`

**Verification:** A scheduled invocation runs against the pilot SFTP, delivers a test milestone, and the run-log + CloudWatch show success.

- [ ] **Unit 7: Read-only admin feed-status panel**

**Goal:** Let an admin see recent runs, delivery counts, unresolved learners, and ledger status without touching Cornerstone.

**Requirements:** R9

**Dependencies:** Units 2, 3 (admin `select` policies).

**Files:**
- Create: `src/lib/cornerstoneFeed.ts` (data-access), `src/lib/useCornerstoneFeed.ts` (hook)
- Create: `src/components/staff/CornerstoneFeedStatus.tsx`
- Modify: `src/App.tsx` (route/section behind `RoleGuard allow={['admin']}`)
- Test: `src/lib/cornerstoneFeed.test.ts`; `src/components/staff/CornerstoneFeedStatus.test.tsx` (jsdom)

**Approach:**
- Read `cornerstone_feed_run` + ledger status counts + unresolved-learner list via admin-readable policies, mirroring `dashboard.ts` (pure builders + thin fetchers, `numeric`→string coercion).
- Presentational component with loading/error/empty states; no write path.

**Patterns to follow:** `src/lib/dashboard.ts`, `src/components/staff/CohortDashboard.tsx`, `src/lib/useRole.ts`, `src/components/RoleGuard.tsx`.

**Test scenarios:**
- Happy path: given run + ledger rows, the panel renders latest run status, uploaded/confirmed/rejected counts, unresolved list.
- Edge: no runs yet → empty state.
- Edge: numeric fields returned as strings are coerced correctly.
- Error: fetch failure → error state.
- Integration (jsdom): non-admin does not see the panel (RoleGuard).

**Verification:** Panel shows accurate run history for a seeded ledger; hidden from non-admins.

- [ ] **Unit 8: email→username mapping population (minimal v1)**

**Goal:** Populate `cornerstone_user_map` from a Cornerstone user export so R6 resolution works.

**Requirements:** R6, D6

**Dependencies:** Unit 2.

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_cornerstone_user_map_seed.sql` (or a small admin import path if scope allows)
- Modify: `aws/cornerstone-feed/README.md` (documented population procedure)

**Approach:**
- v1: an admin exports users (email, username) from Cornerstone and upserts into `cornerstone_user_map` (service-role or a small admin import). Keep it minimal; automated sync is deferred (Scope Boundaries).
- Document that unresolved learners self-heal once the map is updated (D6).

**Test scenarios:**
- Happy path: a mapped user resolves to their username in `pending_export`.
- Edge: an unmapped learner is flagged unresolved and excluded from the CSV until mapped, then included on the next run.
- Edge: username uniqueness enforced (no two users mapped to the same Cornerstone username).

**Verification:** After upserting the map, a previously-unresolved learner is delivered on the next run.

- [ ] **Unit 9: Reconciliation runbook + backfill validation**

**Goal:** Document the manual reconciliation procedure (D2) and validate the one-time backfill (D4).

**Requirements:** R5, R9, D2, D4

**Dependencies:** Units 5, 7.

**Files:**
- Create: `aws/cornerstone-feed/README.md` (runbook: reconciliation, backfill, incident/rollback)
- Test: covered by Unit 1/5 integration tests (backfill path); no new code test unless a reconciliation query helper is added.

**Approach:**
- Runbook: how an operator diffs Cornerstone's External Training report against the ledger, and how to move a row `pending`/`uploaded`→`confirmed`/`rejected` and re-send a `rejected`/`failed` one. State the **reconcile cadence** (≥ once per feed cycle) so an orphaned `pending` row is resolved before the next run.
- Backfill: confirm the first `refresh_cornerstone_latches()` + first worker run delivers each already-complete learner's milestones exactly once (no duplicate errors on a second run), **and that a backfill exceeding the chunk threshold emits multiple files with chunk-level exactly-once**. Run backfill only after the D7 date format is confirmed against the pilot template (frozen strings can't be re-serialized).
- Note the deferred automated reconciliation and its dependency on Cornerstone returning a results file.

**Test scenarios:** `Test expectation: none — documentation + validation of behavior already covered by Unit 1/5 tests (backfill exactly-once).`

**Verification:** A dry-run backfill against the pilot delivers each seeded complete learner once; a second run sends nothing.

## System-Wide Impact

- **Interaction graph:** New scheduled/outbound axis (first in the repo). Reads `module_progress`/`quiz_attempts`/`modules`; writes only new feed tables. No change to learner-facing flows, gating, or progress sync.
- **Error propagation:** Transport/DB errors surface to the run-log + CloudWatch, never to learners. Fail-closed on host-key mismatch and lock contention.
- **State lifecycle risks:** Exactly-once hinges on the ledger `UNIQUE(user,milestone)` + advisory lock + upload-then-ledger ordering (D3). Crash-between-upload-and-ledger is the known gap, caught by manual reconcile (D2).
- **API surface parity:** No public API change. New definer RPCs are service-role-only.
- **Integration coverage:** Cross-layer scenarios (definer read bypassing RLS; SFTP atomicity; exactly-once across crashes) require the DB-gated integration tests + a mock-SFTP handler test — unit mocks alone won't prove them.
- **Unchanged invariants:** Owner-only RLS on all existing user tables is untouched; the feed's cross-user access is isolated to `postgres`-owned definer functions executable only by a dedicated least-privilege worker role (D5). No blanket `service_role` REST key is placed in the worker, and no `BYPASSRLS` role is introduced.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Async row rejection → silent transcript loss (uploaded ≠ ingested) | Ledger status-lifecycle + manual reconcile v1 (D2); rows re-sendable until confirmed; CloudWatch alarm on repeated identical-key rejections |
| Re-send of an already-loaded record hard-errors in Cornerstone | Claim-then-upload: ledger reservation (`ON CONFLICT`) is the exactly-once authority; lease-row lock + Lambda concurrency=1; no re-emit of a `pending`/`uploaded` row (D3) |
| Worker credential leak = full-DB compromise | Dedicated least-privilege Postgres role (EXECUTE only on cornerstone RPCs), not the `service_role` key (D5); Secrets Manager access-restricted + rotated |
| Filename doesn't match feed "File Name Starts With" → feed silently ignores file | Fixed-prefix + variable-suffix filename matching the configured pattern; assert prefix in tests; observe an end-to-end ingest (Unit 5/6) |
| Large first backfill exceeds a per-file limit / partial ingest | Chunked `toCsv` (Unit 4), each chunk independently reserved/ledgered; verify per-file limit in pilot |
| SFTP infeasible from Supabase Edge | External AWS Lambda worker (D1) — settled by spike |
| Cornerstone requires source-IP allow-listing | Run Lambda in VPC + NAT/Elastic IP (Unit 6); verify requirement first |
| Mutable published set manufactures a completion (unpublish a pending module) | Snapshot counted module IDs in latch; accepted per stale-complete (D4); revisit if L&D objects |
| Username unmapped → milestone undeliverable | Send-time resolution, self-healing, counted + alarmed, never marked sent (D6) |
| Date serialization drift breaks Cornerstone match key | Freeze serialized string in latch; single tested serializer; confirm format before backfill (D7) |
| Already-exported PII can't be un-sent on a deletion request | Out-of-band deletion procedure relayed to L&D/Cornerstone; documented retention limit (Deferred / Ops) |
| Product assumptions A1/A2 rejected by L&D | Hard gate before Unit 1 (owner + confirm before build); a "no" churns Units 1–5/9 |
| GLAT signal shape (codebase decision D7 / P4.10) | Resolved to `quiz_attempts` by P4.10 spec (spec + seed migration `20260615000000` both present in repo); verify merged before relying on it |

## Documentation / Operational Notes

- Runbook in `aws/cornerstone-feed/README.md`: schedule, secrets rotation, reconciliation (with a **defined cadence** — at least once per feed cycle so an orphaned `pending`/`failed` row is caught before the next run), backfill, incident/rollback, unresolved-learner handling.
- Rotation: SFTP + the dedicated worker DB credential + host-key fingerprint in AWS Secrets Manager. **Owner: TBD (assign before go-live); cadence: at least annually + on offboarding of anyone who held the creds.** Add a runbook step to push a rotated credential into Secrets Manager, and a CloudWatch alarm on auth failure so a stale credential is detected within one cycle rather than silently.
- Retention: define how long ledger/run-log rows retain `user_id`/PII after a user is deleted; align with Nava's data-retention policy.
- Monitoring: CloudWatch alarms on run failure, on `rows_unresolved > 0`, on `rows_failed > 0`, and on repeated identical-key rejections; admin panel (Unit 7) for at-a-glance status.
- Pilot before prod: run Units 5–6 against the pilot SFTP (creds already provisioned) before pointing at production Cornerstone (access "later this week" per L&D). Re-verify the host-key fingerprint for the prod endpoint (may differ from pilot).

## Sources & References

- **Origin document:** [docs/brainstorms/cornerstone-learning-data-integration-requirements.md](docs/brainstorms/cornerstone-learning-data-integration-requirements.md)
- Related specs: `docs/superpowers/specs/2026-06-15-p4.10-glat-objective-gate-design.md`, `docs/superpowers/specs/2026-06-13-p5.2a-aggregation-layer-design.md`, `docs/superpowers/specs/2026-06-12-p5.1c-champion-admin-rls-design.md`
- Related migrations: `supabase/migrations/20260528221204_init_core.sql`, `20260612000000_champion_admin_read_policies.sql`, `20260613000000_p5_2a_aggregation_layer.sql`, `20260618000000_admin_cms_foundation.sql`
- External: [deno#24118 (ssh2/Deno)](https://github.com/denoland/deno/issues/24118), [Supabase Edge CPU limits](https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits), [RFC 4180 CSV](https://hilton.org.uk/blog/csv-rfc-4180), [SFTP host-key verification](https://sftpcloud.io/learn/sftp/sftp-host-key-verification-failed)
