# Curriculum and Content Guide

The curriculum is **content-as-data**: every lesson lives as a row in the Supabase
`modules` table (one row per matrix cell, e.g. `1.4`, `2.1`), **not** in source files. The
app fetches it at runtime (`src/lib/useCurriculum.ts` → `src/lib/modules.ts`, which maps
rows to the `Module`/`Phase` types in `src/types.ts`), so editing a row changes the lesson
with **no rebuild**. There is no static `PHASES` array, `QUIZ_DATA`, or `src/content/*.md` —
those were removed when content moved into the DB (P3.2).

## The `modules` table

Each row is one matrix cell. The columns that drive a lesson:

| Column | Purpose |
| --- | --- |
| `cell_id` | Primary key, e.g. `1.4` for matrix cells, `custom-<slug>` for custom lessons. Matches `module_progress.module_id`. |
| `stage` | `1a` \| `1b` \| `2` — drives nav grouping + Stage-2 gating. **null** for custom (free-form) lessons, which are ungated. |
| `origin` | `matrix` (one of the 28 fixed cells, "Supplemental coursework") \| `custom` (free-form lesson, "Resources & additional lessons") \| `course` (Course-week lesson, rendered under its assigned week). |
| `title`, `type` | Display title and module type (see below). |
| `dimension[]`, `evidence_type`, `self_report_validity` | Matrix metadata (the 4D tags, primary evidence, self-report trust). |
| `body_md` | The lesson markdown. |
| `video_url` | Optional lesson video link (URL only — no media uploads). |
| `tutor_reference_md` | Extra grounding for the in-app tutor on this cell (used only when the cell is `published`). |
| `quiz_json` | Quiz questions (`QuizQuestion[]`), or null. |
| `lab_config_json` | Interactive-lab config — a `LabConfig` discriminated union keyed by `kind`. |
| `sorter_config_json` | Scenario-sorter config, or null. |
| `mastery_anchor`, `emergent_anchor` | Rubric anchor text (authored later). |
| `status` | `draft` \| `in_review` \| `published`. Non-published **matrix** rows render with a "draft — under review" badge but stay testable (decision D10); custom lessons are hidden from learners until published. |
| `draft` | The admin CMS working copy (jsonb) of the editable fields. **Learners never read it** — they always read the live columns; Publish copies `draft` → live and clears it. |
| `archived_at` | Soft-delete timestamp. Non-null rows are hidden from learners and default CMS queries; restore sets it back to null. Nothing is hard-deleted. |
| `sort_order` | Within-stage nav order. |

`modules` is read-only over RLS for any signed-in user — there is **no client write policy**.
Writes happen two ways: (1) migrations/seed (below), and (2) the **admin CMS** (P5.4), which
routes every write through the `admin-content` service_role Edge Function (the service_role
key never reaches the browser; mirrors `admin-cohorts`). `content_versions` remains an
append-only history table with **no writer yet** — the version-history/rollback slice is
deferred.

## Module types (`ModuleType`)

`content` · `lab` · `simulator` · `use-case` · `quiz` · `glossary` · `sorter`.

A module's **completion gate** is usually its quiz. Interactive labs are driven by
`lab_config_json`; `ModuleRenderer.tsx` dispatches on `labConfig.kind` to the matching
`src/components/exercises/*` component. Add a new interactive exercise **additively**: a new
member of the `LabConfig` union in `types.ts` plus a new case in the renderer switch (cell
2.1 is the deliberate exception where the lab, not the quiz, gates — decision D8).

## Editing or adding content

There are **two authoring paths**, and which one is authoritative depends on the cell's history:

- **In-app admin CMS (P5.4)** — an admin edits a lesson in the browser (Staff → CMS), which
  saves a `draft`, previews it, and **publishes** (draft → live columns, with `version`
  bumped). Published changes reach learners with **no redeploy**. This is the path for routine
  content edits and for creating free-form (`origin='custom'`) lessons. **Once a cell has been
  published through the CMS, the DB row — not the seed JSON — is the source of truth for that
  cell;** re-running an old seed migration's `UPDATE … by cell_id` would silently overwrite the
  CMS edit (the DATA-04 drift class), so update via the CMS, or regenerate the seed from the
  current DB before a reset.
  - **Free-form (custom) lessons (P5.4-6):** "New lesson" in the CMS creates a standalone lesson
    — the server generates `custom-<slug>` from the title (collision-guarded, length-capped),
    `origin='custom'`, `stage=null`, and `status='draft'`, so it is **hidden from learners until
    published**. Add body/quiz/lab via the same editors as matrix cells, then Publish; it then
    appears in the ungated **"Resources & additional lessons"** group (never the matrix).
    **Archive** soft-deletes any lesson (matrix or custom) — hidden from learners, never
    hard-deleted — and **Restore** brings it back. Custom lessons are not seeded, so a
    `supabase db reset` removes them (they live only in the cloud/local DB, not in a migration).
- **Migrations / seed** — the path below seeds the initial 28 matrix cells and is what a fresh
  `supabase db reset` reloads. Use it for the baseline curriculum and bulk/programmatic changes.

### Course authoring (cohort restructure, U3)

- **Weeks & assignment:** Staff → CMS → **Course management** manages a course's weeks
  (create/rename/reorder/delete) and assigns lessons to a week (**published lessons only** can
  be assigned; a week appears to learners once it has at least one published member). Assigning
  a matrix or custom lesson to a week moves it out of its Supplemental/Resources group and
  renders it under that week.
- **Course lessons:** the CMS **"New lesson"** modal offers **Course lesson** alongside the
  default custom lesson — it creates a `course-<slug>` row (`origin='course'`,
  `visibility='program'`, hidden from learners until published *and* assigned to a week via
  Course management). Body/quiz/lab are edited with the same editors as every other lesson.
- **Publish with reset (R17):** the publish dialog's "Reset learner progress" checkbox durably
  clears every learner's completion of that lesson (epoch protocol — stale caches/outboxes
  cannot resurrect it); learners see a dismissible "progress was reset" notice.

### Migration / seed path

- **Lesson body + quiz:** the source of truth is `supabase/seed-data/curriculum-content.json`
  (28 cells, each a cited markdown lesson + a 3–4 question quiz). The migration
  `supabase/migrations/*_load_curriculum_content.sql` is **generated programmatically from
  that JSON — do not hand-edit the SQL.** Change the JSON, regenerate the migration, then
  `npx supabase db reset` to reload. Each statement is an idempotent `UPDATE … by cell_id`.
- **Lab / sorter config:** seeded by per-cell migrations (`*_seed_lab_config_*.sql`,
  `*_seed_*_config_*.sql`). Add a new dated migration; the JSON shape must match the cell's
  `LabConfig` member.
- **Re-running:** seed migrations are written to be safe under `supabase db reset`
  (`on conflict do nothing` for inserts, `update … by cell_id` for content).
- **Course 1 content (separate pipeline, U8):** the Course-1 Week 0–4 lessons
  (`origin='course'`, e.g. `c1-w1-same-prompt-3x`) live in
  `supabase/seed-data/course1-content.json`; `node scripts/generate-course1-seed.mjs`
  regenerates `supabase/migrations/20260715040000_seed_course1_content.sql` (INSERT …
  `on conflict (cell_id) do nothing`, plus `course_week_modules` membership by the fixed
  week uuids). **Do not hand-edit the generated SQL**, and never fold course content into
  the matrix pipeline above. The generator also enforces the Week 0/1 pre-reveal copy rule
  ("Claude", never "LLM").

## Authoring conventions

- **Branding placeholders:** use `{{COMPANY}}` / `{{FULL_COMPANY}}` / `{{TAGLINE}}` in
  markdown instead of hardcoded names — `injectBranding()` (`src/branding.ts`) substitutes
  them at render time.
- **Markdown:** rendered with `react-markdown` + `remark-gfm` and Tailwind Typography
  (`prose`). Use `##` headings and standard GFM.
- **Citations:** lessons carry inline source links and a `## Sources` section (see existing
  cells in the seed JSON for the house style).
- **Resources:** the `Module` type carries an optional `resources` array (`{ title, url }`)
  for further reading.

> Note: the model layer is **Claude via the server-side `chat` Edge Function** — there is no
> local model / "local engine" to reference in lessons (local models were dropped, decision
> D1). The in-lesson AI affordance is the Playground / tutor, which calls Claude.
