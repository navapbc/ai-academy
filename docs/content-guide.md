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
| `cell_id` | Primary key, e.g. `1.4`. Matches `module_progress.module_id`. |
| `stage` | `1a` \| `1b` \| `2` (drives nav grouping + Stage-2 gating). |
| `title`, `type` | Display title and module type (see below). |
| `dimension[]`, `evidence_type`, `self_report_validity` | Matrix metadata (the 4D tags, primary evidence, self-report trust). |
| `body_md` | The lesson markdown. |
| `quiz_json` | Quiz questions (`QuizQuestion[]`), or null. |
| `lab_config_json` | Interactive-lab config — a `LabConfig` discriminated union keyed by `kind`. |
| `sorter_config_json` | Scenario-sorter config, or null. |
| `mastery_anchor`, `emergent_anchor` | Rubric anchor text (authored later). |
| `status` | `draft` \| `in_review` \| `published`. Non-published rows render with a "draft — under review" badge but stay testable (decision D10). |
| `sort_order` | Within-stage nav order. |

`modules` is read-only over RLS for any signed-in user; writes happen via migrations/seed
(and, later, the admin CMS). `content_versions` is an append-only history table, locked
down until the Phase-6 CMS.

## Module types (`ModuleType`)

`content` · `lab` · `simulator` · `use-case` · `quiz` · `glossary` · `sorter`.

A module's **completion gate** is usually its quiz. Interactive labs are driven by
`lab_config_json`; `ModuleRenderer.tsx` dispatches on `labConfig.kind` to the matching
`src/components/exercises/*` component. Add a new interactive exercise **additively**: a new
member of the `LabConfig` union in `types.ts` plus a new case in the renderer switch (cell
2.1 is the deliberate exception where the lab, not the quiz, gates — decision D8).

## Editing or adding content

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
