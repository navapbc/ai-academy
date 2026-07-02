---
title: "feat: Content versioning — snapshot-on-publish + CMS history view (X.2)"
type: feat
status: active
date: 2026-07-02
origin: docs/brainstorms/x2-content-versioning-requirements.md
---

# feat: Content versioning — snapshot-on-publish + CMS history view (X.2)

## Overview

Make the dormant `content_versions` table real: on each publish via the admin CMS, write a full content snapshot (with an optional "what changed" note), and show a read-only version history in the CMS lesson detail. Rollback is deferred (see origin: `docs/brainstorms/x2-content-versioning-requirements.md`).

## Problem Frame

`content_versions` exists as substrate (append-only snapshot history) but has **0 rows and no writer**. As the matrix evolves (v2→) through the CMS, there's no content history/changelog. `modules.version` already bumps on publish and the `admin-content` Edge Function already writes a `content_changes` *action* audit — but nothing captures the content *snapshot*. X.2 adds the snapshot writer + a history view.

## Requirements Trace
- R1. On publish, `admin-content` writes a `content_versions` row: `cell_id`, new `version`, `snapshot_json` (the published live content), `author_id`, optional `note`, `created_at`.
- R2. The publish action accepts an optional `note`; persisted to `content_versions.note`.
- R3. `content_versions` gets an admin `select` RLS policy (`is_admin()`) so the CMS can read history.
- R4. The CMS lesson detail shows a read-only version history (version #, note, author, timestamp; newest first).

## Scope Boundaries
- No rollback/restore (deferred — needs re-validation of restored JSON).
- No diff/compare view (history list only).
- Snapshot on publish only (not save-draft).
- No change to the learner read path or version-bump logic.

## Context & Research

### Relevant Code and Patterns
- **`content_versions` table** (`supabase/migrations/20260602130334_modules_content_as_data.sql`): `id, cell_id→modules, version, snapshot_json jsonb, author_id, note, created_at`; RLS enabled, **no policy** (locked down). Add an `is_admin()` select policy.
- **Publish path**: `supabase/functions/admin-content/index.ts` (`case 'publish'`) + `admin-content-core.ts` (`buildPublishUpdate(draft, version)`). Publish promotes draft→live, bumps version, nulls draft in one UPDATE; then writes a `content_changes` audit (`admin/index.ts` ~line 190). The snapshot write hooks in here (best-effort, like the audit).
- **Admin read pattern**: `is_admin()` SECURITY DEFINER helper (`supabase/migrations/20260612000000_champion_admin_read_policies.sql`); admin-read policies on `content_changes`/`claude_usage`. Mirror for `content_versions`.
- **CMS client**: `src/lib/adminContent.ts` (`invokeAdminContent` raw-fetch wrapper to the Edge Function) + `src/lib/cmsContent.ts` (CMS list/detail shaping) + `src/components/cms/CmsLessonDetail.tsx` / `LessonEditor.tsx` (publish control). The history view reads `content_versions` directly under the new admin policy (like `cmsContent`/`dashboard` direct reads).
- **Snapshot content:** the promoted live fields (`body_md, video_url, tutor_reference_md, quiz_json, lab_config_json, sorter_config_json, title, type, stage, dimension`, …) — capture the same content `buildPublishUpdate` promotes.

### Institutional Learnings
- Locked-down-table + `is_admin()` read is the established pattern (P5.1c / P6.2). `content_changes` (action audit) and `content_versions` (content snapshot) are complementary — X.2 fills the snapshot half the CMS plan deferred.

## Key Technical Decisions
- **Writer in the existing publish path** (service_role), best-effort like the `content_changes` audit — a snapshot-write failure logs but doesn't fail the publish (the version bump already succeeded).
- **Admin read via `is_admin()` select policy** → CMS reads `content_versions` directly (consistent with other admin reads); no new read Edge Function.
- **Snapshot = promoted live content** (full field set) so a future rollback has what it needs.
- Optional `note` threaded from the CMS publish UI → Edge Function → `content_versions.note`.

## Open Questions

### Resolved During Planning
- Scope (snapshot + history, no rollback), optional note — from brainstorm.
- Read path — admin `select` policy + direct read.

### Deferred to Implementation
- Exact `snapshot_json` field list (mirror `buildPublishUpdate`'s promoted fields) and whether the insert is in the same transaction as the publish UPDATE vs a follow-on best-effort insert (prefer follow-on best-effort, mirroring `content_changes`; accept a tiny window where a bumped version has no snapshot row).
- Author-name resolution for the history display (join `profiles` for `author_id`, as `content_changes` views do, vs. show id).

## Implementation Units

- [ ] **Unit 1: Admin read policy on `content_versions`**

**Goal:** Admins can read version history; nobody else can.

**Requirements:** R3

**Dependencies:** None (`is_admin()` + table exist).

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_content_versions_admin_read.sql`
- Test: `src/lib/contentVersionsRls.integration.test.ts` (DB-gated) — or extend an existing gated RLS suite

**Approach:**
- Idempotent migration adding `create policy ... on public.content_versions for select using (public.is_admin())` (guarded). No other policy (writes stay service_role-only).

**Patterns to follow:** `champion_admin_read_policies.sql`; `claude_usage` admin-read policy (P6.2).

**Test scenarios:**
- Happy path: admin `select` returns rows (after a service-role insert).
- Edge: non-admin authenticated user `select` → 0 rows.
- Error/security: client insert/update/delete rejected (no write policy).

**Verification:** RLS matrix passes under `RUN_DB_TESTS=1`; `supabase db reset` clean twice.

- [ ] **Unit 2: Snapshot writer on publish (+ optional note)**

**Goal:** Every publish records a `content_versions` snapshot.

**Requirements:** R1, R2

**Dependencies:** Unit 1.

**Files:**
- Modify: `supabase/functions/admin-content/index.ts`, `supabase/functions/admin-content/admin-content-core.ts`
- Test: `supabase/functions/admin-content/admin-content-core.test.ts` (+ the gated integration test if present)

**Approach:**
- Pure helper in `admin-content-core.ts`: `buildContentVersionRow({cellId, version, snapshot, authorId, note})` returning the insert payload (and validate/normalize the optional `note` — trim, length cap, optional). Extract the promoted live fields as the snapshot (reuse/mirror `buildPublishUpdate`'s field set so snapshot ≡ what was published).
- In `index.ts` `case 'publish'`: after the publish UPDATE succeeds (version bumped), best-effort service-role insert into `content_versions` using the new version + promoted content + `callerId` + the request's optional `note`; try/catch → `console.warn`, never fail the publish. Accept `note` in the publish action body (validated in core).

**Execution note:** Test-first on `buildContentVersionRow` (note normalization + snapshot shape).

**Patterns to follow:** the existing `content_changes` best-effort audit insert in `admin-content/index.ts`; `buildPublishUpdate`.

**Test scenarios:**
- Happy path (core): `buildContentVersionRow` returns correct payload; note trimmed; missing note → null.
- Edge (core): over-long note capped/rejected per rule; snapshot includes all promoted content fields.
- Integration (gated): publishing a module inserts exactly one `content_versions` row with the new version + snapshot + note; a second publish adds another row with the next version.
- Error path: a forced snapshot-insert failure does not fail the publish (version bump + draft-null still applied).

**Verification:** After a publish, a matching `content_versions` row exists (version, snapshot, note, author); publish still succeeds if the snapshot insert fails.

- [ ] **Unit 3: CMS — change-note field + version-history view**

**Goal:** Admins add a note on publish and see the version history in the CMS.

**Requirements:** R2, R4

**Dependencies:** Units 1–2.

**Files:**
- Modify: `src/lib/adminContent.ts` (thread optional `note` into the publish invocation), `src/lib/cmsContent.ts` (or a new `src/lib/contentVersions.ts`) for a `fetchContentVersions(cellId)` read + pure shaping
- Create: `src/lib/useContentVersions.ts` (hook) if needed
- Modify: `src/components/cms/CmsLessonDetail.tsx` (history section) and the publish control (`LessonEditor.tsx`/wherever publish is triggered) to add an optional note field
- Test: `src/lib/contentVersions.test.ts` (pure shaping), `src/components/cms/*` component test for the history render

**Approach:**
- Add an optional "What changed? (optional)" input near the Publish control; pass its value through `invokeAdminContent`'s publish call.
- `fetchContentVersions(cellId)` reads `content_versions` (admin RLS) newest-first; pure builder shapes rows (version, note, author name via `profiles` lookup or id, timestamp). Render a read-only history list in the CMS detail. Read-only (no restore button — deferred).

**Patterns to follow:** `src/lib/dashboard.ts` (pure builder + thin fetcher + name lookup), `src/lib/cmsContent.ts`, `CmsLessonDetail.tsx`.

**Test scenarios:**
- Happy path: history list renders versions newest-first with note/author/timestamp.
- Edge: a lesson with no versions yet → empty state; a version with null note → renders without a note.
- Integration: publishing with a note makes that note appear in the history (covered end-to-end by Unit 2 integration + this render).
- Error path: fetch failure → error state.

**Verification:** Publishing with a note shows it in the CMS history; non-admins never see the view (RLS + admin gating); suite + lint green.

## System-Wide Impact
- **Interaction graph:** additive write in the publish path (after version bump); new admin-only read + UI. No change to learner reads or publish semantics.
- **State lifecycle risks:** best-effort snapshot means a rare bumped-version-without-snapshot-row window (accepted; mirrors the `content_changes` audit). Not transactional with the publish UPDATE by design (avoids failing a publish on a history write).
- **Unchanged invariants:** learner content read path, version-bump logic, draft→publish spine, `content_changes` audit — all untouched.

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| Snapshot write fails / partial | Best-effort try/catch (never fails publish); logged; acceptable gap like the existing audit |
| `content_versions` readable too broadly | Admin-only `is_admin()` select; no client write policy |
| Snapshot drifts from what was published | Build snapshot from the same promoted field set as `buildPublishUpdate` |
| Note abuse (huge/HTML) | Validate/trim/length-cap in the core; it's admin-only input |

## Documentation / Operational Notes
- Update PROJECT-PLAN X.2 on merge (absorbs the CMS plan's deferred `content_versions` writer; rollback remains deferred).

## Sources & References
- **Origin document:** [docs/brainstorms/x2-content-versioning-requirements.md](docs/brainstorms/x2-content-versioning-requirements.md)
- Patterns: `supabase/migrations/20260602130334_modules_content_as_data.sql` (content_versions), `supabase/functions/admin-content/{index.ts,admin-content-core.ts}`, `supabase/migrations/20260612000000_champion_admin_read_policies.sql`, `src/lib/adminContent.ts`, `src/lib/cmsContent.ts`, `src/components/cms/CmsLessonDetail.tsx`
