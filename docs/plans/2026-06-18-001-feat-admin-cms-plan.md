---
title: "feat: Phase 5.4 Admin CMS (content-as-data editing without redeploy)"
type: feat
status: active
date: 2026-06-18
---

# feat: Phase 5.4 Admin CMS

## Overview

Give program/L&D **admins** end-to-end ownership of lesson content: full CRUD over the existing
28 matrix cells **and** brand-new free-form lessons, across every content type (markdown body,
video link, quiz, lab, and a new per-lesson "tutor reference"), with a safe **draft → publish**
flow, **soft-delete/archive**, and a **markdown editor + live preview** — all admin-only, enforced
by the data layer, with published changes reaching learners **without a redeploy**.

This plan supersedes the old `P5.4a/b/c/d/e` rows in `PROJECT-PLAN.md` (Phase 5 table). It is
delivered as **6 chunks, one PR each**, in dependency order. **Version history + rollback (the
`content_versions` writer, old P5.4a/e), media uploads, WYSIWYG, bulk ops, and new *matrix*-cell
creation are explicitly deferred** to later slices.

**Two foundational decisions confirmed during planning:**
1. **Write path = service_role Edge Function** (`admin-content`), mirroring `admin-cohorts` /
   `review-grade` / `admin-set-role`. `modules` stays client-write-closed (no client
   INSERT/UPDATE/DELETE RLS) per W2-2. The CMS *reads* drafts directly (modules is already
   authenticated-readable) but *writes* only through the function.
2. **Publish is a direct admin one-click action for the MVP** — no enforced SME sign-off gate.
   The `in_review` status + D10 "draft — under review" badge remain available but are not a
   publish gate. An enforced SME-approval workflow is a later slice.

## Problem Frame

Today the curriculum is content-as-data in the Supabase `modules` table, but **there is no writer**:
content is changed only by authoring a migration and running it — an engineer + a (local) DB reset,
not a redeploy-free edit by an admin. `modules` is RLS read-only with **no write policy** (writes
were always intended to "happen later via the admin CMS under service-role/admin paths"), and the
`content_versions` table exists with **no writer**. The headline payoff of content-as-data —
*edit a row, the lesson changes, no rebuild* — is unrealized for the people who own the content.

The audit also left a debt explicitly assigned here: **W2-7 / D-16** deferred write-time schema
validation of `quiz_json` / `lab_config_json` / `sorter_config_json` "to the P5.4 CMS" (a runtime
`SectionBoundary` is only a containment stopgap today).

## Requirements Trace

- **R1** — Admins (only) can edit any of the 28 matrix cells across all content types: text
  (markdown), video link, quiz, lab, and the new tutor-reference field.
- **R2** — Admins can create, edit, and archive **free-form lessons** (standalone, outside the
  matrix and its gating), shown in a separate "Additional lessons" group.
- **R3** — A **draft never reaches learners** until Publish; while an admin edits a draft, learners
  keep seeing the **last published** content.
- **R4** — Published edits reach learners with **no redeploy** (runtime fetch already supports this).
- **R5** — A **non-admin cannot read or perform any CMS write** — enforced by the data layer
  (RLS / service_role authz), not just hidden UI, and **proven by test**.
- **R6** — **Soft-delete/archive** only; nothing is hard-deleted; archived content is excluded from
  learner and default CMS queries and can be restored.
- **R7** — The in-app tutor's grounding (X.1 cells) includes the **published** `tutor_reference_md`
  (never a draft).
- **R8** — Write-time **schema validation** of `quiz_json` / `lab_config_json` / `sorter_config_json`
  (closes W2-7 / D-16), server-authoritative.
- **R9** — Markdown **editor + live preview**; preview renders the draft exactly as a learner would
  see the published lesson (reuse the learner renderer).

## Scope Boundaries

- **Not** building a WYSIWYG editor (markdown + live preview only).
- **Not** building image/media uploads (video is a **link/URL** only).
- **Not** building bulk/list mutation operations.
- **Not** creating new **matrix** cells (the 28 are fixed; only free-form lessons are creatable).
- **Not** changing the learner gating rules for the 28 matrix cells (Stage 2 locked until Stage 1a
  complete stays exactly as-is).
- **Not** hard-deleting any row (archive only); never hard-delete a seeded matrix cell (a db reset
  would resurrect it anyway).

### Deferred to Separate Tasks

- **Version history + rollback** (the `content_versions` writer + restore UI — old P5.4a/e, audit
  X.2): a later slice. This plan adds **no** `content_versions` writes.
- **Enforced SME accuracy sign-off gate on Publish** (ties to W3-1/P4.11): a later slice.
- **Media/image uploads, WYSIWYG, bulk ops, matrix-cell creation**: later slices.

## Context & Research

### Relevant Code and Patterns

- **`modules` table** — `supabase/migrations/20260602130334_modules_content_as_data.sql`. PK is
  `cell_id text`. Columns include `stage text NOT NULL CHECK (stage in ('1a','1b','2'))`, `title`,
  `type`, `body_md`, `quiz_json jsonb`, `lab_config_json jsonb`, `sorter_config_json jsonb`
  (added in `20260602160616_add_sorter_config.sql`), `status text NOT NULL default 'published'
  CHECK (status in ('draft','in_review','published'))`, `version int default 1`, `sort_order int`,
  `updated_by uuid` (exists, never written today), `updated_at timestamptz`. **No `video_url`,
  no `tutor_reference_md`, no soft-delete column exist.** RLS = authenticated SELECT only; **no
  INSERT/UPDATE/DELETE policy**. `content_versions` exists, RLS-on with **no policy** (locked down).
- **Read/mapping layer** — `src/lib/modules.ts`: `MODULE_COLUMNS` (explicit select list — new
  columns must be added here or they won't be fetched), `ModuleRow` interface, `assertModuleRow`
  (TYPE-03 runtime guard — throws on unknown `stage`/`status`), `mapRowToModule`
  (`cell_id → id+cellId`, `body_md → content`, etc.), `groupIntoPhases` (groups by `stage` using
  fixed `STAGE_META`/`STAGE_ORDER = ['1a','1b','2']` — **always returns exactly 3 phases**),
  `fetchCurriculum` (orders by `sort_order`). `src/lib/useCurriculum.ts` is the hook.
- **Types** — `src/types.ts`: `Module` (has a TS-only `videoUrl?` placeholder, **not persisted**),
  `Phase`, `QuizQuestion` (`{question, options[], correctIndex, explanation}`), `SorterConfig`,
  and the `LabConfig` discriminated union (~20 `kind`s) dispatched in
  `src/components/ModuleRenderer.tsx`.
- **Admin write convention (the template for this plan)** — `supabase/functions/admin-cohorts/`
  (`index.ts` + `admin-cohorts-core.ts` + `.test.ts`) and `supabase/functions/review-grade/`:
  CORS allow-list (`buildCorsHeaders`), env check, real `getUser()` authn (anon rejected),
  `emailDomainAllowed(..., 'navapbc.com')`, per-user `fixedWindowAllow` rate limit, body parse
  (`{ok|error}`), **service_role client** for the mutation, admin authz
  (`BOOTSTRAP_ADMIN_EMAILS` allowlist OR `profiles.role='admin'`), best-effort audit insert.
  Pure logic lives in the Deno-agnostic `*-core.ts` (unit-tested under vitest). Client seam:
  `src/lib/adminCohorts.ts` — raw `fetch` to `/functions/v1/admin-cohorts` with the session token.
- **Admin role infra (prerequisite — all DONE)** — `profiles.role CHECK in ('learner','champion',
  'admin')` (`init_core.sql`); `public.is_admin()` / `is_champion_of(uuid)` SECURITY DEFINER
  helpers (`20260612000000_champion_admin_read_policies.sql`); `src/lib/useRole.ts` (fail-closed,
  no-cache, `isAdmin`/`isChampion`/`isStaff`); `src/components/RoleGuard.tsx`; the `staff` `View`
  in `App.tsx` and **in-page admin sub-views inside `src/components/StaffArea.tsx`** (e.g.
  `CohortManagement` shown only when `isAdmin`) — the established home for admin UI.
- **Tutor grounding (X.1)** — `src/components/LocalTutorFAB.tsx`: `buildGroundingContext(phases)`
  concatenates each module's `content` (= `body_md`) into the system prompt, streamed via
  `src/lib/llm.ts` → `supabase/functions/chat`. Currently grounds on **all** statuses (no
  `published` filter) and only on `body_md`.
- **Learner markdown render** — the learner lesson renderer in `src/components/ModuleRenderer.tsx`
  (react-markdown) is what the live-preview must reuse so preview ≡ live lesson.

### Institutional Learnings (from `docs/DEBT-REPORT.md` + `PROJECT-PLAN.md`; no `docs/solutions/`)

- **W2-2 / D-06 / LB-3** — `prevent_self_role_change` trigger blocks role/protected writes from the
  authenticated path; service_role only. **Consequence: all admin writes route through a service_role
  function, never a client UPDATE.** (Confirmed as this plan's write path.)
- **W2-7 / D-16** — write-time JSON schema validation deferred "to the P5.4 CMS"; `SectionBoundary`
  (#63) is only a containment stopgap. → Chunks 4 & 5 implement it (server-authoritative).
- **W3-2 / D-08 / D10** — `modules.status` is real; `in_review` shows a "draft — under review" badge
  (shown, not hidden). The CMS must **not regress** this: learners read **live** columns regardless
  of status; only the `draft jsonb` working copy is hidden.
- **SEC-07** — `content_versions` lockdown is implicit (RLS-on, no policy); a gated test asserts zero
  authenticated reads. This plan does not touch `content_versions`; keep that test green.
- **DATA-05 / DATA-04** — migrations must be idempotent: `on conflict do nothing`, `is null`-guarded
  updates, **absolute** version numbers (never `version = version + 1`). The version bump on Publish
  lives in the service_role function, not a migration.
- **No `zod` in the repo.** Validation is hand-rolled as a discriminated `{ok:true,value} |
  {ok:false,error}` result (`chat-core.ts`, `admin-cohorts-core.ts`). Follow this house style; do
  **not** add zod just for the CMS.

### External References

- None required — this is convention-following work on an established stack with strong local
  patterns (≥3 direct examples of every needed pattern: service_role write functions, RLS gated
  tests, content-as-data mapping). No external research performed.

## Key Technical Decisions

- **Draft → publish spine via a `draft jsonb` column on `modules`.** The working copy of editable
  fields `{title, type, body_md, video_url, tutor_reference_md, quiz_json, lab_config_json,
  sorter_config_json}` lives in `draft`. **Learners read the LIVE columns** (unchanged read path);
  the CMS reads/writes `draft`. **Publish** copies `draft → live` columns, sets `status='published'`,
  bumps `version` (absolute, in the function), and clears `draft` (→ `null`). This satisfies R3
  (learner keeps seeing published while a draft is pending) **without a second row** and **without
  touching `content_versions`** (deferred). *Rationale:* a pure status-flip on the single live row
  would hide in-progress edits from learners (breaking "keep showing published"); the jsonb working
  copy is the minimal way to keep last-published live while a draft exists.
- **Write path = `admin-content` service_role Edge Function** (confirmed). `modules` gets **no**
  client write RLS. R5's "non-admin write rejected" is proven as the **RLS lockdown** (no write
  policy ⇒ denied) plus the function's 403 for non-admins; "admin write ok" is proven at the
  function/integration level. Mirrors `admin-cohorts` exactly.
- **Schema validation is server-authoritative, shared via a pure `*-core.ts`.** Validators for
  `quiz_json` / `lab_config_json` (per `kind`) / `sorter_config_json` live in
  `admin-content-core.ts` (Deno-agnostic, vitest-tested) and are **also imported by the client
  editors** for inline feedback. The function rejects invalid payloads with 400 (closes W2-7/D-16).
- **Free-form lessons: `origin` discriminator + nullable `stage`.** Add `origin text NOT NULL
  default 'matrix' CHECK (origin in ('matrix','custom'))`; make `stage` **nullable** (custom
  lessons have `stage = null`). cell_id for custom = `custom-<slug>`. The mapping/grouping layer
  renders `origin='custom'` rows in a separate **"Additional lessons"** ungated group; gating
  (`gating.ts`) ignores them entirely (they are never `stage '1a'`/`'2'`, so `stage1aProgress` and
  `isModuleLocked` are unaffected). *Rationale:* `origin` is an explicit, test-friendly discriminator;
  nullable `stage` avoids inventing a 4th stage enum that would ripple through `STAGE_META`/gating.
- **Soft-delete = `archived_at timestamptz`.** Learner + default CMS queries filter
  `archived_at is null`; CMS "archived" filter shows them; restore sets `archived_at = null`.
- **Tutor grounding reads published `tutor_reference_md` only.** `buildGroundingContext` appends the
  live `tutorReference` and (R7) is filtered to `status='published'` content. *Note:* this also
  closes the current latent issue where the tutor grounds on `in_review`/draft `body_md`.
- **CMS UI lives inside `StaffArea` as an admin-only sub-view** (a new tile → in-page CMS), gated on
  `isAdmin` exactly like `CohortManagement` — not a new top-level `View`. Matches P5.5 convention.

## Open Questions

### Resolved During Planning

- **Write path** (service_role function vs client RLS) → **service_role `admin-content` function**
  (user-confirmed; repo convention).
- **Publish gate** (SME sign-off vs direct) → **direct admin publish for MVP** (user-confirmed);
  enforced SME approval deferred.
- **Prerequisite P5.1 admin role/RLS** → **already merged** (P5.1a–d, P5.5a–c). Not a blocker.
- **`video_url` persistence** → confirmed **not** persisted today (TS-only placeholder); added by
  this plan.
- **Draft model** → `draft jsonb` working copy (see Key Technical Decisions), reconciled with the
  existing `status`/`version` columns and the D10 badge (learners read live regardless of status).

### Deferred to Implementation

- **Exact lab `kind`s that get a structured form vs. the JSON fallback in Chunk 5** — decide while
  building from the live `LabConfig` union; the plan fixes the *policy* (simple kinds get forms;
  complex/markdown-bearing kinds get a validated JSON editor) but not the precise per-kind cut line.
- **Whether `assertModuleRow` should hard-throw on a malformed `draft`** vs. degrade — the draft is
  admin-only and validated on write; decide the read-side guard posture when wiring Chunk 1.
- **`type` CHECK constraint** — `modules.type` currently has no CHECK. Whether to add one for custom
  lessons (Chunk 6) or validate `type` only in the function — decide at implementation.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation
> specification. The implementing agent should treat it as context, not code to reproduce.*

Draft → publish lifecycle for one `modules` row:

```
                 admin edits (Save)              admin clicks Publish
   LIVE cols  ───────────────────────────────▶  LIVE cols := draft
   (what          draft jsonb := working copy    status   := 'published'
   learners       status/live UNCHANGED          version  := version + 1 (absolute, in fn)
   read)          learners still see LIVE         draft    := null
                                                  learners now see new LIVE
```

Request flow (every CMS write):

```
CMS UI (admin only, StaffArea)
  │  raw fetch + session token
  ▼
/functions/v1/admin-content        ── CORS allow-list ─ getUser() (anon→401) ─ @navapbc.com (403)
  │                                   ─ rate-limit (429) ─ parse+validate body (400)
  │  service_role client (bypasses RLS)
  ▼
modules / (later) content_versions  ── authz: is_admin / BOOTSTRAP_ADMIN_EMAILS (403)
  │
  ▼
learner read path (fetchCurriculum) reads LIVE cols, archived_at is null, unchanged otherwise
```

Curriculum grouping after this plan:

```
phases = [ Stage 1a, Stage 1b, Stage 2,  Additional lessons (origin='custom', ungated) ]
gating.ts: only ever inspects stage ∈ {1a,2}; origin='custom' (stage=null) is invisible to gating
```

## Implementation Units

> Each unit below is **one chunk = one PR**, in dependency order. Dependencies:
> **1 → 2 → {3, 4, 5 may parallel} → 6**.

- [ ] **Chunk 1 (P5.4-1): Foundation — schema + service_role write path + draft→publish + read-path wiring**

**Goal:** Land the data-layer spine so every later chunk is additive UI. Schema migration; the
`admin-content` service_role Edge Function with the draft→publish action; read-path wiring (map new
fields, exclude archived, learners read live not draft, custom lessons in an ungated group); tutor
grounding includes published `tutor_reference_md`.

**Requirements:** R3, R4, R5, R6, R7 (foundation for R1, R2, R8).

**Dependencies:** None (prerequisite P5.1 already merged).

**Files:**
- Create: `supabase/migrations/<ts>_admin_cms_foundation.sql` (idempotent: add `draft jsonb`,
  `video_url text`, `tutor_reference_md text`, `origin text NOT NULL default 'matrix' CHECK
  (origin in ('matrix','custom'))`, `archived_at timestamptz`; make `stage` nullable / relax its
  CHECK to allow `null` for custom; **no** new client write policy on `modules`).
- Create: `supabase/functions/admin-content/index.ts` (handler: CORS, authn, @navapbc.com,
  rate-limit, admin authz, service_role write; actions: `save-draft`, `publish`, `archive`,
  `restore` — `create`/`delete-custom` land in Chunk 6).
- Create: `supabase/functions/admin-content/admin-content-core.ts` (pure: body parse/validate,
  draft→live promotion helper, `quiz_json`/`lab_config_json`/`sorter_config_json` validators —
  full validators are exercised by Chunks 4/5 but authored here).
- Create: `supabase/functions/admin-content/admin-content-core.test.ts`.
- Create: `src/lib/adminContent.ts` (client seam: raw fetch + typed action creators, mirrors
  `src/lib/adminCohorts.ts`).
- Modify: `src/lib/modules.ts` (`MODULE_COLUMNS`, `ModuleRow`, `assertModuleRow`, `mapRowToModule`
  add `video_url→videoUrl`, `tutor_reference_md→tutorReference`, `origin`, `archived_at`; filter
  `archived_at is null` in `fetchCurriculum`; `groupIntoPhases` adds the "Additional lessons" group
  for `origin='custom'`).
- Modify: `src/types.ts` (`Module` gains persisted `videoUrl?`, `tutorReference?`, `origin`;
  `Phase` may gain an `ungated`/`origin` marker for the custom group).
- Modify: `src/lib/gating.ts` (ensure `origin='custom'` / `stage=null` rows are ignored by
  `stage1aProgress` and `isModuleLocked`).
- Modify: `src/components/LocalTutorFAB.tsx` (`buildGroundingContext` appends published
  `tutorReference`; filter grounding to `status==='published'`).
- Test: `src/lib/adminContent.test.ts`, extend `src/lib/modules.test.ts` and
  `src/lib/gating.test.ts`; create `supabase/functions/admin-content/*.test.ts`; create a gated
  `src/lib/adminContent.integration.test.ts` (RLS + function behavior, `RUN_DB_TESTS`).

**Approach:**
- Migration is idempotent (`add column if not exists`, guarded). No `version = version + 1` in SQL.
- The function's `publish` action does the absolute version bump and the draft→live copy atomically
  (single UPDATE), then nulls `draft`.
- Keep `modules` client-write-closed — do **not** add INSERT/UPDATE/DELETE RLS. (Optionally add a
  W2-2-style `prevent_*` trigger only if a defense-in-depth check is wanted; the absence of a write
  policy already denies the authenticated path.)

**Execution note:** Start with the gated RLS/integration test for the security contract (non-admin
client write denied; admin write via the function succeeds; publish flips live; draft absent from
the learner fetch; archived excluded) — it is the acceptance core of R5/R3/R6.

**Patterns to follow:** `supabase/functions/admin-cohorts/` (whole shape), `src/lib/adminCohorts.ts`
(client seam), `src/lib/rls.integration.test.ts` + `cohorts.integration.test.ts` (gated DB tests),
the idempotent-seed conventions in existing migrations.

**Test scenarios:**
- Integration (DB): a non-admin authenticated client `UPDATE`/`INSERT`/`DELETE` on `modules` is
  **denied** (no policy) → proves R5 write-lockdown.
- Integration (DB): the `admin-content` function with an **admin** caller performs `save-draft`
  (writes `draft`, leaves live + status unchanged) → succeeds.
- Integration (DB): the function with a **non-admin** caller returns **403**; with the **bare anon
  key** returns **401**; with a non-`@navapbc.com` user returns **403**.
- Integration (DB): `publish` copies `draft → live`, sets `status='published'`, bumps `version` by
  exactly 1 (absolute), and nulls `draft`.
- Unit (`modules.ts`): `fetchCurriculum` excludes `archived_at is not null` rows; `mapRowToModule`
  maps `video_url`/`tutor_reference_md`/`origin`; `groupIntoPhases` emits a 4th "Additional lessons"
  group for `origin='custom'` and never mislabels matrix cells.
- Unit (`gating.ts`): adding a `custom`/`stage=null` lesson does **not** change `stage1aProgress`
  denominator or unlock Stage 2; a custom lesson is never `isModuleLocked`.
- Unit (`gating.ts`/learner read): a row with a populated `draft` still returns its **live** content
  to learners (draft never in the learner fetch) → proves R3.
- Unit (core): `quiz_json`/`lab_config_json`/`sorter_config_json` validators accept a known-good
  payload and reject a malformed one with a named error (skeleton; deepened in Chunks 4/5).
- Unit (`LocalTutorFAB`/grounding): grounding includes a published cell's `tutorReference` and
  **excludes** a draft/in_review cell's reference content → proves R7.

**Verification:** `npm run lint && build && test` green; `supabase db reset` clean + idempotent
(twice); the gated integration suite passes with `RUN_DB_TESTS=1`; a manual smoke against local
Supabase shows an admin save-draft + publish round-trip with the learner view reflecting only
published content. **⚠ ACCESS-CONTROL + SCHEMA → open the PR but DO NOT auto-merge; pause for human
review.**

---

- [x] **Chunk 2 (P5.4-2): CMS shell + lesson list (read-only)**

**Goal:** An admin-only CMS entry inside `StaffArea` that lists all lessons (matrix + custom) with
status, an archived filter, and a read-only detail view. No editing yet.

**Requirements:** R1, R2, R5 (UI surface + read), partial R6 (archived filter view).

**Dependencies:** Chunk 1.

**Files:**
- Create: `src/components/cms/CmsHome.tsx` (list), `src/components/cms/CmsLessonDetail.tsx`
  (read-only detail).
- Create: `src/lib/cmsContent.ts` (pure list/detail shaping over the fetched rows — fetch all
  statuses + archived for admins; the CMS reads directly, modules is authenticated-readable).
- Modify: `src/components/StaffArea.tsx` (add a CMS tile/sub-view shown only when `isAdmin`,
  mirroring the `CohortManagement` gating + in-page navigation).
- Test: `src/components/cms/CmsHome.test.tsx`, `src/lib/cmsContent.test.ts` (jsdom per-file for
  components).

**Approach:** Reuse `useCurriculum`-style fetching but in an **admin variant** that does not filter
`archived_at` and includes all statuses (so admins can see drafts/in_review/archived). Distinguish
matrix vs custom and show status + a draft-pending indicator (row has a non-null `draft`).

**Patterns to follow:** `src/components/StaffArea.tsx` sub-view pattern (`CohortManagement`,
`ReviewQueue`), `src/components/CohortManagement.tsx` list/detail in-page navigation, the pure
`buildCohortManagement`/`buildReviewQueue` shaping style.

**Test scenarios:**
- Unit (`cmsContent.ts`): builds a combined list (28 matrix + N custom), tags each with status,
  `hasPendingDraft`, and `archived`; archived filter on/off includes/excludes correctly.
- Component: the CMS tile/sub-view renders **only** for `isAdmin` (a champion in `StaffArea` does
  not see it) → UI half of R5.
- Component: clicking a lesson opens a read-only detail showing current live + (if present) draft
  fields; no editable inputs are rendered in this chunk.
- Component: empty/loading/error states render (mirrors dashboard conventions).

**Verification:** lint/build/test green; manual smoke — an admin opens Staff → CMS, sees all 28
cells + any custom lessons with statuses, toggles the archived filter, opens a read-only detail; a
champion sees no CMS tile. **Merge autonomously** after PM-agent + code review + CI green.

---

- [x] **Chunk 3 (P5.4-3): Lesson editor (text / video / tutor-ref) + draft → preview → publish** — **Done (#92)** ✓ — shared `LessonMarkdown` (extracted from `ModuleRenderer` so preview ≡ live lesson, R9); `LessonEditor` (markdown body + live preview, video-URL field w/ inline http(s) validation, tutor-reference field; Save=`save-draft` leaves live untouched per R3; Publish promotes draft→live per R4; `buildDraft` merges over any existing draft so a text-only save can't wipe a pending quiz/lab draft); Edit affordance wired from the read-only detail; client `isValidVideoUrl` mirror (server stays authoritative, W2-7/D-16). lint+build+476 unit tests green; new e2e admin edit→preview→save→publish (write stubbed; real round-trip covered by the gated `admin-content` integration suite); CI build+db-tests green.

**Goal:** Deliver the headline value end-to-end for existing cells: a markdown editor with **live
preview** for `body_md`, a **video-URL** field, the **tutor-reference** field; **Save** (=draft),
**Preview** (renders the draft as a learner would see it), **Publish**.

**Requirements:** R1 (text/video/tutor-ref), R3, R4, R7, R9.

**Dependencies:** Chunk 2 (and Chunk 1's function actions `save-draft`/`publish`).

**Files:**
- Create: `src/components/cms/LessonEditor.tsx` (markdown textarea + live preview pane, video URL
  input, tutor-reference textarea, Save/Preview/Publish controls + status display).
- Create: `src/components/cms/MarkdownPreview.tsx` **only if** the learner renderer isn't already a
  reusable component — otherwise reuse the existing react-markdown render from
  `src/components/ModuleRenderer.tsx` so preview ≡ live lesson (R9).
- Modify: `src/lib/adminContent.ts` (ensure `saveDraft`/`publish` creators cover these fields).
- Modify: `src/components/cms/CmsLessonDetail.tsx` (wire an "Edit" affordance into the editor).
- Test: `src/components/cms/LessonEditor.test.tsx`; extend `e2e/` with an admin edit→publish spec
  (Claude stubbed; the CMS write hits the live local function or is stubbed at
  `**/functions/v1/admin-content`).

**Approach:** Save posts a `save-draft` action (writes `draft` only — live + learner view
unchanged). Preview renders `draft` through the learner renderer. Publish posts `publish` (Chunk 1
promotion). A basic video-URL validation (http(s) URL) lives in the shared core validator.

**Patterns to follow:** the learner react-markdown render in `src/components/ModuleRenderer.tsx`;
`src/lib/useLabGrading.ts`-style hook state (loading/error/retry) for the save/publish calls;
Playwright stub pattern in `e2e/helpers.ts`.

**Test scenarios:**
- Component: typing markdown updates the live preview; the preview uses the **same** renderer as the
  learner lesson (assert via shared component / identical output) → R9.
- Component: Save calls `adminContent.saveDraft` with the edited fields; the live/published view is
  not mutated client-side.
- Component: Publish calls `adminContent.publish`; on success the editor reflects `status='published'`
  and an empty draft.
- Component (error path): a failed save/publish surfaces an error affordance and does not silently
  drop edits (mirror `GradeError`/`useLabGrading`).
- Edge: an empty `body_md` save is allowed (draft) but flagged; an invalid video URL is rejected with
  an inline message (server is authoritative).
- E2E: admin edits 2.9 body → Preview shows the change → Publish → a learner view reflects the new
  published body (no redeploy) → R4; before Publish, the learner still sees the **old** body → R3.

**Verification:** lint/build/test + E2E green; manual smoke — edit a real cell, preview, publish,
confirm the learner view updates and the pre-publish learner view was unchanged. **Merge
autonomously** after reviews + CI.

---

- [x] **Chunk 4 (P5.4-4): Quiz editor** — **Done (#94)** ✓ — `QuizEditor.tsx` (per-question fieldset:
  text · 4 options w/ a correct-answer radio · explanation; add/remove/reorder; inline validation);
  Save merges the assembled `quiz_json` over any existing draft so a pending body/lab edit isn't
  wiped (R3), Publish promotes draft → live (R4). Finalized the `quiz_json` validator (R8 / closes
  W2-7/D-16 for quizzes): server `validateQuizJson` tightened from ≥2 to **exactly 4** options
  (verified safe — all 88 seed + 174 migration/GLAT questions are 4-option), still authoritative; a
  client mirror `validateQuizQuestions` (house pattern, like `isValidVideoUrl`) drives inline
  feedback. Reached via a new "Edit quiz" affordance on the read-only detail; `CmsHome` tracks which
  editor (lesson | quiz) is open in-page. lint+build+490 unit tests green (core exactly-4/range/
  single-question + QuizEditor add/remove/**reorder-preserves-correctIndex**/invalid-blocks/merge/
  failed-save + CmsHome quiz-path); CI build+db-tests green; squash-merged to main.

**Goal:** Structured CRUD over `quiz_json`: per question — text, exactly 4 options, `correctIndex`,
explanation; ≥1 question; validation. Draft → publish.

**Requirements:** R1 (quiz), R8 (closes W2-7/D-16 for `quiz_json`).

**Dependencies:** Chunk 2 (+ Chunk 1 actions/validators). May parallel Chunks 3 & 5.

**Files:**
- Create: `src/components/cms/QuizEditor.tsx` (add/remove/reorder questions, edit options, pick
  correct option, explanation).
- Modify: `supabase/functions/admin-content/admin-content-core.ts` (finalize the `quiz_json`
  validator: array, ≥1 item, each `{question:string, options:string[4], correctIndex:0..3,
  explanation:string}`).
- Modify: `src/lib/adminContent.ts` if a quiz-specific creator helps; otherwise reuse `saveDraft`.
- Test: `src/components/cms/QuizEditor.test.tsx`; extend
  `supabase/functions/admin-content/admin-content-core.test.ts` with `quiz_json` validation cases.

**Approach:** The client editor uses the **shared** validator from `admin-content-core.ts` for
inline feedback; the function re-validates on write (server-authoritative). Matches `QuizQuestion`
in `src/types.ts`.

**Patterns to follow:** `QuizQuestion` shape (`src/types.ts`); the hand-rolled `{ok|error}`
validator style in `chat-core.ts`/`admin-cohorts-core.ts`.

**Test scenarios:**
- Unit (validator): accepts a valid `quiz_json`; rejects empty array, a question with ≠4 options,
  `correctIndex` out of range, non-string fields — each with a specific error → R8.
- Component: add/remove a question, set the correct option, edit text; Save posts a `draft` with the
  assembled `quiz_json`.
- Component (error path): attempting to Save/Publish an invalid quiz surfaces the inline validation
  error and blocks the publish (server would 400 regardless).
- Edge: a single-question quiz is valid; reordering preserves `correctIndex` association.

**Verification:** lint/build/test green; manual smoke — edit a cell's quiz, publish, confirm the
learner quiz reflects it. **Merge autonomously** after reviews + CI.

---

- [ ] **Chunk 5 (P5.4-5): Lab editor (kind-aware)**

**Goal:** A `lab_config_json` editor that is aware of the `LabConfig` `kind`: structured forms for
the **simple** kinds, and a **validated JSON fallback** for the complex/markdown-bearing kinds
(don't hand-build ~20 bespoke editors for the MVP). Also covers `sorter_config_json`. Draft →
publish.

**Requirements:** R1 (lab), R8 (closes W2-7/D-16 for `lab_config_json`/`sorter_config_json`).

**Dependencies:** Chunk 2 (+ Chunk 1 actions/validators). May parallel Chunks 3 & 4.

**Files:**
- Create: `src/components/cms/LabEditor.tsx` (kind picker; renders a structured sub-form for simple
  kinds — e.g. `reflection`, `signoff-checklist`, `tool-triage`, `scenario-sort`, the
  `ScenarioExercise` family — and a JSON textarea with validation for complex kinds — e.g.
  `critique`, `synthesis`, `voice-edit`, `prompt-eval`, `iteration`, `use-case-portfolio`,
  `prompt-construction`, `glat`).
- Modify: `supabase/functions/admin-content/admin-content-core.ts` (finalize per-`kind`
  `lab_config_json` validation + `sorter_config_json` validation, discriminated on `kind`).
- Test: `src/components/cms/LabEditor.test.tsx`; extend the core test with per-kind validation cases.

**Approach:** Validation is driven off the `LabConfig` discriminated union in `src/types.ts`. The
JSON fallback parses → validates against the kind's shape → reports a named error (no white-screen;
this is exactly the W2-7/D-16 fix). Determine the precise simple-vs-fallback cut line at
implementation (deferred question); the policy is: rich/markdown/rubric-bearing kinds use the JSON
fallback, low-field kinds get a form.

**Patterns to follow:** the `LabConfig` union + `renderExercise` switch in
`src/components/ModuleRenderer.tsx`; `SorterConfig` in `src/types.ts`; the validator style in
`*-core.ts`.

**Test scenarios:**
- Unit (validator): for each represented `kind`, a known-good config validates; a config with a
  wrong/missing discriminated field is rejected with a kind-specific error → R8.
- Unit (validator): `sorter_config_json` requires `kind:'scenario-sort'` + well-formed `scenarios[]`
  (each with a valid `correct` category) and rejects malformed ones.
- Component (simple kind): editing a `reflection`/`tool-triage` form assembles a valid config and
  Save posts a draft.
- Component (complex kind / JSON fallback): pasting valid JSON saves; pasting malformed or
  schema-violating JSON shows a named error and blocks Save → W2-7/D-16 containment.
- Edge: switching `kind` resets/guards the config so a stale field from a previous kind can't be
  saved.

**Verification:** lint/build/test green; manual smoke — edit a simple-kind lab via form and a
complex-kind lab via JSON, publish each, confirm the learner lab renders. **Merge autonomously**
after reviews + CI.

---

- [ ] **Chunk 6 (P5.4-6): Create + remove free-form lessons**

**Goal:** Create a new `origin='custom'` lesson (title, type, chosen content types) that appears in
the ungated "Additional lessons" group; soft-delete (archive) + restore. Reuses the editors from
Chunks 3–5.

**Requirements:** R2, R6.

**Dependencies:** Chunks 3, 4, 5 (reuses their editors) — i.e., the last chunk.

**Files:**
- Modify: `supabase/functions/admin-content/index.ts` + `admin-content-core.ts` (add `create-custom`
  — generates `cell_id = custom-<slug>`, `origin='custom'`, `stage=null`, a `sort_order` within the
  custom group — and `delete-custom` which is **archive** for custom; restore reuses Chunk 1's
  `restore`).
- Create: `src/components/cms/CreateLessonModal.tsx` (title, type, which content types to include).
- Modify: `src/components/cms/CmsHome.tsx` (a "New lesson" affordance + an archived section with a
  Restore action).
- Modify: `src/lib/adminContent.ts` (`createCustom`, `deleteCustom`/`archive`, `restore` creators).
- Test: extend `src/components/cms/CmsHome.test.tsx`, `src/lib/cmsContent.test.ts`,
  `admin-content-core.test.ts`, and the gated integration test with custom-lesson create/archive/
  restore + ungated-grouping assertions.

**Approach:** A custom lesson starts as a draft (no live content) and is invisible to learners until
Publish (R3). After publish it renders in "Additional lessons" outside gating (R2). Archive sets
`archived_at`; restore clears it (R6). Slug generation is deterministic + collision-guarded in the
core (testable).

**Patterns to follow:** Chunk 1's function action shape; `CohortManagement` create/delete flows;
the idempotent slug/`on conflict` conventions.

**Test scenarios:**
- Unit (core): `create-custom` slugifies the title to `custom-<slug>`, sets `origin='custom'`,
  `stage=null`, and a valid `sort_order`; a duplicate title yields a distinct, collision-free
  cell_id.
- Integration (DB): a created custom lesson is **absent** from the learner fetch until published,
  then appears in the "Additional lessons" group and **does not** affect Stage gating → R2, R3.
- Integration (DB): `archive` sets `archived_at` and the lesson drops from learner + default CMS
  queries; `restore` brings it back; the row is never hard-deleted → R6.
- Component: the create modal validates required fields and posts `create-custom`; the archived
  section shows a Restore action.
- Edge: archiving a **matrix** cell is allowed in CMS (hidden from learners) but the seeded row is
  never hard-deleted; restore works.

**Verification:** lint/build/test + gated integration + E2E green; `supabase db reset` clean +
idempotent; manual smoke — create a custom lesson, add body/quiz/lab via the reused editors,
publish, see it in "Additional lessons" as a learner (ungated), archive + restore it. **Merge
autonomously** after reviews + CI.

## System-Wide Impact

- **Interaction graph:** the learner read path (`useCurriculum` → `modules.ts` → `Academy`/
  `Sidebar`/`ModuleRenderer`), gating (`gating.ts`), and the tutor (`LocalTutorFAB`) all consume the
  mapped `Module`/`Phase`. Chunk 1 changes these; every later chunk is additive UI under `StaffArea`.
- **Error propagation:** function returns `{ok|error}` with proper status codes (400/401/403/429);
  client editors surface errors via a `useLabGrading`-style affordance — no silent drops. A
  malformed `lab_config_json`/`quiz_json` is rejected at write (closes the white-screen class W2-7/
  D-16) and contained at read by the existing `SectionBoundary`.
- **State lifecycle risks:** draft→live promotion + version bump + draft-null must be one atomic
  UPDATE in the function (no partial promote). Absolute version numbers only (DATA-05). The admin
  CMS read variant must not be cached in a way that leaks across user switch (mirror `useRole`'s
  no-cache posture; the CMS is admin-only anyway).
- **API surface parity:** the `admin-content` function mirrors `admin-cohorts`/`review-grade` (CORS,
  authn, authz, rate-limit, audit) — keep the copied core helpers in sync (functions bundle
  independently; cross-function import isn't viable — documented convention).
- **Integration coverage:** gated `RUN_DB_TESTS` integration tests prove the RLS write-lockdown,
  function authz, publish promotion, archived exclusion, and custom-lesson ungated grouping — the
  parts unit tests + mocks cannot prove.
- **Unchanged invariants:** the 28 matrix cells' **gating** (Stage 2 locked until Stage 1a done) is
  untouched; `groupIntoPhases` still returns the three matrix stages plus the new custom group;
  `content_versions` stays writer-less and its SEC-07 lockdown test stays green; the D10 "draft —
  under review" badge behavior is preserved (learners read live regardless of status).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Chunk 1 regresses the learner read path or gating (28 cells) | Read-path + gating unit tests assert no change for matrix cells; E2E stage-gating spec must stay green; learners read **live** columns only. |
| `draft jsonb` + `status` semantics drift (which is "what learners see") | Single rule, tested: learners read **live** columns, `archived_at is null`, ignore `draft`. Documented in `modules.ts`. |
| Adding the "Additional lessons" group breaks `assertModuleRow`/`STAGE_META`/gating | Use `origin` + nullable `stage`; extend the guard/grouping explicitly; gating unit tests prove custom lessons are ignored. |
| Write-time JSON validators incomplete across ~20 lab kinds | Author validators in Chunk 1's core; finalize per-kind in Chunk 5 with the JSON fallback covering complex kinds; per-kind validation tests. |
| Tutor grounding change alters tutor answers / cost | Filter to `published` (also fixes the current draft-leak into grounding); grounding stays prompt-cached; smoke the tutor after Chunk 1. |
| Concurrent admin edits to the same row | Single-row promotion is atomic; last-write-wins on draft is acceptable for the MVP (no multi-admin locking; note for a later slice). |
| Access-control mistake in Chunk 1 | Chunk 1 PR is **not** auto-merged — human review required; gated RLS/authz tests + served-function smoke (admin 200 / non-admin 403 / anon 401) are acceptance gates. |

## Documentation / Operational Notes

- Update `PROJECT-PLAN.md`: these 6 chunks **supersede** the old `P5.4a/b/c/d/e` rows — mark each
  chunk Done with its PR# as it lands; note that `content_versions` writer (X.2) + rollback are
  re-deferred to a later slice, and that the SME-sign-off publish gate is deferred.
- Update `docs/content-guide.md`: the authoring workflow now has a CMS path (edit-in-app → draft →
  publish) alongside the migration/seed path; clarify which is source-of-truth to avoid the DATA-04
  drift class (a CMS publish becomes the authoritative content for that cell).
- Reference audit IDs in commits/PRs: **W2-2** (write path), **W2-7 / D-16** (validation),
  **W3-2 / D10** (status/badge preserved), **SEC-07** (`content_versions` untouched), **DATA-05**
  (idempotent/absolute versions), **P5.4-1..6** (chunk IDs).
- Per the auto-build loop directive: Chunk 1 (access-control + schema) **pauses for human merge**;
  Chunks 2–6 may merge autonomously after PM-agent review + code review + CI green.

## Sources & References

- Source spec: the `/ce-plan` task prompt (resolved requirements + recommended architecture +
  6-chunk breakdown) — in the invoking message.
- `PROJECT-PLAN.md` (Phase 5 table P5.4a–e; open product calls; auto-build loop directive).
- `docs/DEBT-REPORT.md` (W2-2, W2-7/D-16, W3-2/D10, SEC-07, DATA-04/05).
- Code: `supabase/migrations/20260602130334_modules_content_as_data.sql`, `src/lib/modules.ts`,
  `src/lib/useCurriculum.ts`, `src/types.ts`, `src/lib/gating.ts`,
  `src/components/ModuleRenderer.tsx`, `src/components/LocalTutorFAB.tsx`,
  `src/components/StaffArea.tsx`, `supabase/functions/admin-cohorts/*`,
  `supabase/functions/review-grade/*`, `src/lib/adminCohorts.ts`,
  `src/lib/rls.integration.test.ts`, `src/lib/cohorts.integration.test.ts`.
- Prior PRs: #85/#86/#87 (P5.5a/b/c — the service_role write-function + gated-test template).
