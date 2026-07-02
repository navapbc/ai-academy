---
date: 2026-07-01
topic: cornerstone-learning-data-integration
---

# Cornerstone Learning Data Integration

## Problem Frame

The AI Academy holds rich learning data (per-module completion, quiz scores, lab
grades, GLAT credential, cohort membership) in Supabase, but it lives only inside
this app. Nava's L&D team works in **Cornerstone OnDemand (CSOD)**, their system of
record. Today they have no way to record AI Academy completion against a learner's
official transcript, and their access to progress data is limited.

We want to close that gap **as lightweight as possible** — pushing the data we
already compute into Cornerstone so that (a) completions land on each learner's
official transcript, and (b) L&D can report on progress using Cornerstone's own
reporting, without us building a second reporting surface.

This is one-directional (AI Academy → Cornerstone). We are not pulling data from
Cornerstone or letting it drive our app.

## Requirements

**What syncs (stage-level records)**
- R1. For each learner, sync up to **four milestone completion records**: **Stage 1a**, **Stage 1b**, **Stage 2**, and **GLAT** (the exit credential). GLAT is a separate milestone drawn from module `2.14`; module `2.14` is therefore **excluded from the Stage 2 milestone** so the two do not overlap.
- R2. Milestone completion is defined explicitly (server-side, not reused from the React gating layer, which only knows stages 1a/2). Completion is evaluated against modules with `status='published'` **at evaluation time** (matching the existing `learner_progress_summary` join); a small published set at launch can legitimately latch a stage early — acceptable given never-downgrade (R3).
  - **Stage 1a** = all published Stage-1a modules complete.
  - **Stage 1b** = all published Stage-1b modules complete. (Stage 1b is ungated/supplementary, so this record will fire only for learners who finish the optional track — that is acceptable; it is additive, never blocking.)
  - **Stage 2** = all published Stage-2 modules complete, **excluding `2.14`**.
  - **GLAT** = a passing `quiz_attempts` row on module `2.14`. *(Assumed pending P4.10 — the GLAT exam is not built yet; decision D7 notes the completion marker could instead land as a `module_progress` row, in which case this rule and R4's GLAT score source change. See Dependencies.)*
- R3. **Send-only-when-complete, latched, never downgraded.** A milestone record is emitted only once the learner satisfies it. At first satisfaction the app records the milestone completion in a durable **latch** (an app-side table), freezing the completion date. The feed reads the latch, not a live re-derivation, so:
  - Records are never sent in an incomplete/`Registered` state.
  - Completion date is frozen at first-satisfaction and never recomputed.
  - Publishing a new module later never retroactively un-completes an already-sent record (the latch does not downgrade).
  - **Accepted tradeoff (stale-complete):** a milestone is defined against the module set published at latch time (snapshot). This means a latched "complete" can become *stale* under a later curriculum (a newly published module the learner hasn't done). Material curriculum revisions that require re-attainment mint a **new milestone title/version** rather than silently leaving a stale "complete." *(Confirm with L&D that stale-complete is acceptable for compliance evidencing — see Outstanding Questions.)*
  - Because the latch is authoritative and never downgrades, a **bad latch write** (e.g. a bug in the R2 completion query) is effectively permanent — a manual correction path is required (see Deferred to Planning).
- R4. Each record carries: learner identity, a **constant milestone title** (e.g. `AI Academy — Stage 1a`, not the editable module title), status always `Completed`, the latched completion date, and a score **only where meaningful**:
  - **GLAT** carries its pass % (score/max from the passing `2.14` attempt).
  - **Stage 1a/1b/2** are **completion-only, no numeric score** — most of their modules are lab- or reflection-gated, so a quiz average would misrepresent the work on an official transcript.
- R5. **Idempotent by construction.** Title is a constant string, status is always `Completed`, and the latched completion date is serialized **once** to a canonical form (date-only in a fixed timezone, e.g. UTC, stored on the latch row) so every re-send emits a byte-identical `Start Date`. This keeps Cornerstone's External Training composite key (`User + Start Date + Status + Title`) stable across re-sends, with no dependency on reading a Cornerstone-assigned LO ID back (which the one-directional scope forbids).
  - **CONFIRMED in pilot (2026-07): the sent-ledger is required, not optional.** Re-loading an already-loaded record does **not** duplicate it (good) but does **not** no-op — it **errors** with *"External training exists and cannot be updated with selected configuration."* Because our records are latched/immutable, the feed keeps an app-side **sent-ledger** and sends each latched record **exactly once**, never re-sending the full set (which would flood the R9 run-log with these errors).

**Identity**
- R6. Learners are matched to Cornerstone users by **Cornerstone Username** (CONFIRMED in pilot: an email value fails with "User is not present"; the username `btabaska` loads). Our app stores email (`profiles.email`), not the Cornerstone username, and the username is **not a reliable transform of the email** (`btabaska` ≠ `brandontabaska`), so the feed needs an **email→username mapping**. Options (decide in planning): (a) obtain a Cornerstone user export/report and join on email; (b) check whether the External Training config can be set to match on **User ID** with User ID = email; (c) maintain a mapping table. Rows with no resolvable username are skipped and logged (by internal UUID) rather than sent.

**Delivery (automated feed we run)**
- R7. In steady state the sync runs automatically on a schedule with **no per-run manual step** for L&D or for us. (Degraded fallback, only if the L&D feed-ownership gate fails — see Outstanding Questions: an admin-triggered on-demand export that an admin uploads manually — a different, lesser operating model, not part of the steady state.)
- R8. Mechanism: our app generates a stage-level flat file and drops it to Cornerstone's SFTP endpoint; Cornerstone's **Edge Import External Training feed** (configured once by L&D) ingests it on a recurring schedule (daily or weekly is sufficient).
- R9. The feed is observable enough to trust: each run records **to an app-side run-log table** what it sent (counts + skipped rows by UUID) and surfaces failures (bad rows, transport errors) to an admin surface. Logs never contain raw email/score (see R13).

**Reporting**
- R10. No separate reporting pipeline is built. Once stage records (with the GLAT score) are in Cornerstone as external training, L&D uses **Cornerstone's native reporting** for the visibility/analytics half of the ask.

**Security & data handling** (this is the app's first outbound path that reads across all users)
- R11. The export job reads every learner's data, which deliberately bypasses the owner-only RLS model used everywhere else. Because Postgres cannot bypass RLS per-view for an ordinary role, expose the cross-user read through a **`SECURITY DEFINER` view/function** (owned by a role that can read the base tables, returning only the export columns) — the deliberate inverse of the app's existing `security_invoker` aggregation views. It is callable **only by the scheduler's credential** (not a blanket `service_role` key), with no HTTP-triggerable endpoint reachable by end users.
- R12. SFTP credentials (and Cornerstone's host-key fingerprint) are stored as **Edge Function secrets**, the same mechanism as `ANTHROPIC_API_KEY` — never in migrations, seed files, the client bundle, or logs. A rotation owner and cadence are agreed with L&D (who provisions them).
- R13. The SFTP client **verifies Cornerstone's host key** against a known-good fingerprint obtained out-of-band and **fails closed** on mismatch. Transport is SFTP-over-SSH only. The exported file is a **fixed field allow-list** (email, milestone title, status, completion date, GLAT score) enforced at generation so no extra fields/free text can leak.

## Success Criteria
- An L&D admin, working only inside Cornerstone, can see which Nava employees have completed each AI Academy milestone and the GLAT (with its score), with completion dates, on the official transcript.
- New milestone completions appear in Cornerstone within one feed cycle (≤ ~1 week) with no engineer or L&D per-run intervention.
- Re-running the feed does not create duplicate transcript records (contingent on the R5 composite-key/dedupe verification; otherwise enforced by the R5 sent-ledger contingency).
- Publishing/editing curriculum after a record is sent never retroactively changes or duplicates an already-sent transcript record (guaranteed by the latch in R3).
- No new app-side reporting UI was built to satisfy the "reporting" need.

## Scope Boundaries
- **One-directional only.** No reads from Cornerstone; Cornerstone does not gate or drive AI Academy behavior. (Note: this is what forces the R5 idempotency-by-construction design instead of update-by-LO-ID.)
- **No per-module sync.** Only the 4 milestones cross over.
- **No launch-from-Cornerstone integration** (no SCORM/xAPI/Online-Content object learners launch from inside Cornerstone).
- **No new learner-facing UI.** This is a back-office data feed.
- **Lab transcripts and rubric detail do not sync.**

## Key Decisions
- **Send-only-when-complete + latch, never downgrade.** Chosen to resolve both the idempotency risk and the content-as-data "retroactive un-complete" risk: transcripts are a system of record and must be stable, so completion is frozen at first-satisfaction.
- **Constant milestone titles + constant `Completed` status.** Makes Cornerstone's composite unique key deterministic, so the one-directional feed is idempotent without reading LO IDs back.
- **Exclude `2.14` from Stage 2; GLAT is its own milestone.** Keeps the two records orthogonal (2.14 has `stage='2'`, so it would otherwise be double-counted).
- **Scores only where meaningful (GLAT only).** A "stage average quiz %" over lab/reflection-gated modules would be misleading on a transcript; stage milestones are completion-only.
- **Stage-level external training over per-module and over the Transcript API.** External training needs no pre-existing Cornerstone learning objects, carries score + completion date, and is a standard L&D-configurable feed. The Transcript API would add OAuth2 ops, rate-limit handling (50/min shared), and a "learning object must exist first" dependency for no benefit at this cadence.
- **Email as the join key.** Both systems key on `@navapbc.com` identity; avoids maintaining a separate ID map.
- **Feed over dashboard-access-only.** The existing staff `CohortDashboard` already computes the reporting half, but transcript-of-record genuinely requires writing into Cornerstone, so the feed is built; feeding external training with scores delivers reporting for free via Cornerstone's native reports.

## Alternatives Considered
- **Grant L&D read access to the existing staff dashboard (reporting only).** Would satisfy the visibility half cheaply but not transcript-of-record. Kept as a possible parallel quick win, not a replacement for the feed.
- **Manual admin-upload export as v1.** Lighter to build; rejected as the default because the goal includes hands-off steady state, but retained as the R7 degraded fallback if L&D cannot own the feed config.

## Dependencies / Assumptions
- Cornerstone Edge Import supports recurring scheduled External Training feeds via SFTP (hourly/daily/weekly/monthly) — verified against Cornerstone help docs, 2026-07.
- Cornerstone's External Training composite unique key is `User + Start Date + Status + Title` for new records; the R5 design depends on this holding for the L&D tenant, **and on Edge Import treating an identical-key re-send as an update/no-op rather than a rejected duplicate** — **verify both against the actual tenant's import behavior (including whether it matches on date vs. datetime granularity) before build.**
- **GLAT completion-signal shape is not yet settled:** the GLAT exam (P4.10) is unbuilt and decision D7 leaves open whether completion lands as a passing `quiz_attempts` row (R2/R4 assume this) or a `module_progress` completion row. Revisit R2/R4 when P4.10 lands.
- `module_progress.completed_at` is nullable; the latch's first-satisfaction/backfill logic needs a defined fallback (e.g. `updated_at`) when it is null.
- We compute learner/cohort rollups but **not per-stage rollups, and there is no milestone latch table today** — the stage-completion rules (R2), the latch (R3), and the run-log (R9) are net-new and are the main app-side data work.
- No existing export/webhook/outbound-integration code exists (verified) — this is a net-new outbound path.
- **Assumption (verify with L&D):** the Cornerstone user identifier is the `@navapbc.com` email; else an ID-mapping step is needed (affects R6). Now testable — pilot access granted.
- **Pilot access granted (2026-07):** btabaska + Kaylyn have admin access to the Cornerstone **pilot** environment (production access expected later the same week), including Admin → Tools → **Edge** (Integrations, API, Imports). This means the composite-key behavior, External Training Load field schema, user match field, and SFTP-feed setup can be verified directly in the pilot rather than treated as external unknowns. Support: Cornerstone Community + Online Help.
- **Revised ownership model:** L&D granted *us* Edge admin access rather than committing to own the feed config — so configuring the Edge Import External Training feed (and likely provisioning the SFTP credentials via Edge's FTP settings) appears to be **self-serve on our side**, not dependent on L&D. Confirm in pilot.

## Outstanding Questions

### Pilot verification — RESULTS (access granted 2026-07)
- [Affects R5] **RESOLVED:** re-sending an already-loaded record **errors** ("External training exists and cannot be updated with selected configuration") — it neither duplicates nor no-ops. → the **sent-ledger (send-each-record-once) is required** (see R5).
- [Affects R6] **RESOLVED:** Cornerstone matches on **Username** (`btabaska` works; email fails "User is not present"). Username is not derivable from email → an **email→username mapping is needed** (see R6).
- [Affects R7/R8] **RESOLVED:** SFTP account already provisioned and self-serve. Host `ftp.navapbc-pilot.csod.com`, **SFTP / port 22** (FTPS 21/990 closed), inbound folder `/clients/navapbc/EdgeImport/`, username `navapbc` (password via self-serve Reset Password). Ownership gate resolved — we can run the feed ourselves.
- [Affects R1/R4][Needs verification] Still to capture: the exact External Training Load **column template** (esp. the Score column name/format, and which blank field triggered the "Default value is applied" warning). Download the template guide from the Edge Import Homepage.
- [Affects R7/R8][Needs verification] Still to confirm: a **recurring feed** (not just one-time load) is schedulable by us pointing at `/clients/navapbc/EdgeImport/`.

### Resolve with L&D (product decisions — pilot access does not answer these)
- [Affects R1/R4][User decision] Confirm **stage-level granularity + completion-only stage records + GLAT-as-external-training** meets their reporting/compliance needs (e.g. EU AI Act Art. 4 / OMB M-25-21 evidencing). If they need competency detail or a true credential object (expiry/renewal/cert reporting), R1/R4 change.
- [Affects R3][User decision] Confirm a **stale-complete** record (latched "complete" that a later-published module would invalidate) is acceptable on the official transcript for compliance evidencing, given the R3 snapshot/never-downgrade semantics.

### Deferred to Planning
- [Affects R8][Needs research] **Prerequisite spike:** where the schedule runs (Supabase has no native cron for Edge Functions — needs pg_cron + pg_net, or an external worker) **and** whether a Deno-compatible SFTP client runs in the Supabase Edge runtime. If no viable Deno SFTP client exists, the "Edge Function drops file to SFTP" architecture must move to an external worker — resolve before committing the design.
- [Affects R1/R4][Technical] Exact external-training flat-file schema and required columns for the L&D tenant.
- [Affects R2/R3][Technical] Latch table shape and how first-satisfaction is detected (on write via trigger vs. batch recompute); GLAT date from `quiz_attempts.attempted_at`, stage dates from `module_progress.completed_at`.
- [Affects R3][Technical] **One-time latch backfill** for learners already complete before the latch table exists (no first-satisfaction event to catch): freeze Stage dates as `max(module_progress.completed_at)` over the stage's currently-published modules and GLAT as the passing `2.14` `attempted_at`, with the null-`completed_at` fallback above.
- [Affects R3][Technical] **Manual latch-correction path** — since never-downgrade makes a bad latch permanent, define how an operator corrects an erroneous latch/sent record.
- [Affects R11][Technical] Exact scoped DB role/policy for the cross-user read and where the file is staged (if anywhere) before SFTP, with its access scope + cleanup.
- [Affects R9][Technical] Run-log table shape and which admin surface shows feed status — **reuse the existing StaffArea / `admin-content`/`admin-cohorts` pattern (a small read-only status panel), not a new page**, to keep scope lightweight. Note: since nothing is read back from Cornerstone (one-directional), the run-log is the *only* failure signal, so this surface must actually be monitored.
- [Affects R6/R4][Technical] Empty/nil handling (learner with no completed milestones → send nothing; GLAT score formatting; skipped-email rows).

## Cornerstone Edge — confirmed facts & pilot checklist

Confirmed from Cornerstone public help docs (2026-07); the exact column template is tenant-downloadable in the pilot:
- **Path:** Admin → Tools → Edge → Imports and Feeds → Feed Settings → Create Feed. Load type: **External Training Load** (a learning-transcript feed).
- **File format:** text/CSV or Excel. **Schedule:** hourly/daily/weekly/monthly, with encryption key + notifications.
- **SFTP:** files dropped to Cornerstone SFTP/FTPS; the target folder must pre-exist; the "File Name Starts With" pattern must be unique; files are auto-removed after a successful run.
- **Unique key (NEW records):** `User ID + Start Date/Time + Transcript Status + Training Title`. **Updates** key on `Learning Object ID` (which we won't have — this is exactly why R5 relies on a stable NEW-record key).
- **Transcript Status:** `Completed` / `Registered` / `Withdrawn` (we always send `Completed`).
- **Date format:** `DATE HH:MM:SS ± UTC offset`; time defaults to `23:59:00`, offset defaults to UTC. **This confirms the R5 canonical-serialization requirement** — freeze each milestone's `Start Date` to a fixed date + default time in UTC so the composite key is byte-identical on every re-send.
- **Limit:** 2M external-training records per portal (irrelevant at our volume).
- **Permissions:** Access Edge Import, Set up Feed, Enable/Disable Feeds, Manual Run Feed, Access LMS - External Training Load; FTP: Access FTP Account - View, Connect FTP Folders - Manage.
- **SFTP credentials:** admins can Connect + Reset Password on an *existing* FTP account, but initial account provisioning may require Cornerstone Global Customer Support — so "self-serve" is partial. **Verify in pilot.**

Pilot verification checklist (maps to the "Verify in the pilot" questions):
1. Download the **External Training Load template guide** from the Edge Import Homepage → confirm the exact columns for **user identifier, Training Title, Status, Start Date, Completion Date, and Score** (the score column name/format for GLAT).
2. Confirm the **user identifier** column accepts `@navapbc.com` email (vs. requiring Cornerstone User ID) against a pilot user record.
3. **Idempotency test:** load one External Training record, then load an identical-composite-key row again → observe whether Cornerstone **updates/no-ops** (R5 holds) or **rejects as duplicate** (trigger the R5 sent-ledger contingency).
4. Check **FTP Account Access** → is an SFTP account already provisioned (Reset Password to get creds) or must one be requested? Capture host + folder path.
5. Confirm a **recurring External Training feed** can be scheduled by us (not just a one-time load) with our Edge admin permissions.

## Next Steps
1. Run the **pilot verifications** above (Edge → External Training Load / feed + SFTP, composite-key behavior, user match field) and the **scheduler + Deno-SFTP spike**.
2. Get the two **L&D product decisions** (granularity/compliance, stale-complete acceptance).
3. `-> /ce:plan` for structured implementation planning once the pilot verifications and spike de-risk the R5 idempotency and transport design.

## Status & Decision Log (2026-07)

**Spike + pilot verification — DONE.** In the Cornerstone pilot (btabaska + Kaylyn have Edge admin access):
- SFTP is **self-serve**: `ftp.navapbc-pilot.csod.com`, **SFTP/port 22**, inbound folder `/clients/navapbc/EdgeImport/`.
- **Idempotency:** re-loading an already-loaded record **errors** ("External training exists and cannot be updated") — no duplicate, no no-op → an app-side **sent-ledger (send-each-record-once)** is required (R5).
- **Match key:** Cornerstone matches on **Username**, not email (`btabaska` loads; email fails) → an **email→username mapping** is needed (R6).

**Implementation plan — DONE + reviewed.** See `docs/plans/2026-07-01-001-feat-cornerstone-learning-data-feed-plan.md` (Deep plan, 9 units, multi-persona reviewed + deepened). Key architecture decision from the spike: **SFTP is not viable from a Supabase Edge Function** (Deno/ssh2 incompatibility, CPU limits, no static IP) → an **external AWS Lambda worker** (Node + `ssh2-sftp-client` on EventBridge cron) does CSV+SFTP; Postgres holds the latch/ledger/`SECURITY DEFINER` read.

**L&D response (Sarah Grayvin, 2026-07):**
- **A2 (stale-complete) — CONFIRMED YES.** Once a milestone is marked complete on the transcript, it stays complete even if new content is later added to that stage.
- **A1 (granularity) — REOPENED.** L&D is questioning whether *per-person, per-milestone* tracking is needed at all. Preferred direction is **lighter**: let the **skills/GLAT assessment** carry literacy status (and the credential), and track only **general participation** (sessions/courses completed), rather than per-milestone individual completions. Options on the table: **A** per-milestone (current plan) · **B** participation + GLAT credential · **C** participation only. Leaning B/C. Pending a short L&D sync to lock the signal set.

**Forward-looking constraint — LIVE SESSIONS.** Live/instructor-led sessions are a **planned future Academy feature** (not yet announced). The Cornerstone side should therefore be designed around a **generic "completion/participation event"** model (a person completed *a thing* — a module set, a session, the GLAT), so future **session-attendance** completions flow through the same pipe without re-engineering. This reinforces the B/C direction.

**Current status: PLAN PAUSED — build is gated on three items:**
1. **L&D signal-set decision (A1 / Options A-B-C)** — reshapes R1/R3/R4 and how much of the latch/ledger machinery is needed (B/C ⇒ a *lighter* build than the current plan).
2. **Production access + org gates** — prod Cornerstone access ("later this week" per L&D), an AWS account/deploy path, possible source-IP allow-listing, and a **security sign-off** for the first outbound PII export.
3. Remaining pilot captures (template column names; whether Cornerstone returns a results file → enables automated reconciliation).

Tracked in the master plan as **Phase 8**.
