#!/usr/bin/env node
// Course 1 content seed generator (cohort-restructure U8).
//
// Reads supabase/seed-data/course1-content.json (the source of truth for the
// Course 1 Week 0–4 modules + their week assignments) and regenerates
// supabase/migrations/20260715040000_seed_course1_content.sql.
//
// This is a SEPARATE pipeline from the matrix one (curriculum-content.json →
// *_load_curriculum_content.sql). Differences are deliberate:
//   - the matrix pipeline UPDATEs 28 pre-existing rows by cell_id;
//   - this pipeline INSERTs brand-new `origin='course'` (and one
//     `origin='custom'` resource) rows with ON CONFLICT (cell_id) DO NOTHING
//     (idempotent, D-25) and assigns course-week membership by the FIXED week
//     uuids minted in 20260715000000_course_structure.sql.
//
// Usage:  node scripts/generate-course1-seed.mjs
// Then:   npx supabase db reset   (verify it applies; migration is re-runnable)
//
// Never hand-edit the generated SQL — change the JSON and re-run this script.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'supabase', 'seed-data', 'course1-content.json');
const TARGET = join(ROOT, 'supabase', 'migrations', '20260715040000_seed_course1_content.sql');

const data = JSON.parse(readFileSync(SOURCE, 'utf8'));

// ---------------------------------------------------------------------------
// Validation — fail loudly before emitting SQL.
// ---------------------------------------------------------------------------
const WEEK_IDS = data.weeks;
if (!WEEK_IDS || typeof WEEK_IDS !== 'object') {
  throw new Error('course1-content.json must carry a `weeks` uuid map.');
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
for (const [key, id] of Object.entries(WEEK_IDS)) {
  if (!UUID_RE.test(id)) throw new Error(`weeks.${key} is not a uuid: ${id}`);
}

const VISIBILITIES = ['public', 'program'];
const ORIGINS = ['course', 'custom'];
const TYPES = ['content', 'lab', 'simulator', 'use-case', 'quiz', 'glossary', 'sorter'];
const EVIDENCE = ['quiz', 'performance-task', 'work-sample', 'portfolio', 'reflection', 'observation'];
const DIMENSIONS = ['Delegation', 'Description', 'Discernment', 'Diligence'];

/** Modules that render BEFORE the Week-1 live-session reveal must say
 *  "Claude", never "LLM" (origin doc is explicit about not spoiling it). */
const PRE_REVEAL_WEEKS = new Set(['week0', 'week1']);

const seenCells = new Set();
for (const m of data.modules) {
  const where = `module ${m.cell_id ?? '<missing cell_id>'}`;
  if (!m.cell_id || typeof m.cell_id !== 'string') throw new Error(`${where}: bad cell_id`);
  if (seenCells.has(m.cell_id)) throw new Error(`${where}: duplicate cell_id`);
  seenCells.add(m.cell_id);
  if (!ORIGINS.includes(m.origin)) throw new Error(`${where}: bad origin ${m.origin}`);
  if (!VISIBILITIES.includes(m.visibility)) throw new Error(`${where}: bad visibility`);
  if (!TYPES.includes(m.type)) throw new Error(`${where}: bad type ${m.type}`);
  if (!EVIDENCE.includes(m.evidence_type)) throw new Error(`${where}: bad evidence_type`);
  if (!Array.isArray(m.dimension) || m.dimension.some((d) => !DIMENSIONS.includes(d))) {
    throw new Error(`${where}: bad dimension array`);
  }
  if (typeof m.title !== 'string' || !m.title) throw new Error(`${where}: bad title`);
  if (typeof m.body_md !== 'string' || !m.body_md.trim()) throw new Error(`${where}: bad body_md`);
  if (!Number.isInteger(m.sort_order)) throw new Error(`${where}: bad sort_order`);
  if (m.week !== null && !(m.week in WEEK_IDS)) throw new Error(`${where}: unknown week ${m.week}`);
  if (m.week !== null && !Number.isInteger(m.week_sort_order)) {
    throw new Error(`${where}: week_sort_order required when week is set`);
  }
  if (m.origin === 'custom' && m.week !== null) {
    throw new Error(`${where}: the custom resource lesson must stay unassigned (Resources group)`);
  }

  // Dollar-quote safety: the emitted SQL wraps these in $md$…$md$ / $json$…$json$.
  const labJson = m.lab_config_json ? JSON.stringify(m.lab_config_json, null, 2) : '';
  if (m.body_md.includes('$md$')) throw new Error(`${where}: body_md contains $md$`);
  if (labJson.includes('$json$')) throw new Error(`${where}: lab config contains $json$`);

  // Pre-reveal copy rule ("Claude", never "LLM", before the Week 1 reveal).
  if (m.week !== null && PRE_REVEAL_WEEKS.has(m.week)) {
    const copy = `${m.title}\n${m.body_md}\n${labJson}`;
    if (/\bLLMs?\b/.test(copy)) {
      throw new Error(`${where}: pre-reveal copy (Week 0/1) must say "Claude", never "LLM"`);
    }
  }
}

// ---------------------------------------------------------------------------
// SQL emit helpers.
// ---------------------------------------------------------------------------
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const dimArray = (dims) =>
  dims.length === 0 ? 'ARRAY[]::text[]' : `ARRAY[${dims.map(q).join(', ')}]::text[]`;

function moduleInsert(m) {
  const lab = m.lab_config_json
    ? `$json$${JSON.stringify(m.lab_config_json, null, 2)}$json$::jsonb`
    : 'null';
  return `-- ${m.cell_id} — ${m.title}
insert into public.modules
  (cell_id, stage, origin, visibility, status, title, type, dimension,
   evidence_type, self_report_validity, sort_order, body_md, lab_config_json)
values
  (${q(m.cell_id)}, null, ${q(m.origin)}, ${q(m.visibility)}, 'published', ${q(m.title)}, ${q(m.type)},
   ${dimArray(m.dimension)}, ${q(m.evidence_type)}, 'na', ${m.sort_order},
   $md$${m.body_md}$md$,
   ${lab})
on conflict (cell_id) do nothing;
`;
}

const assigned = data.modules.filter((m) => m.week !== null);
const membershipRows = assigned
  .map((m) => `  ('${WEEK_IDS[m.week]}', ${q(m.cell_id)}, ${m.week_sort_order})`)
  .join(',\n');

const sql = `-- seed_course1_content (cohort-restructure U8): Course 1 Weeks 0–4 content.
--
-- GENERATED by scripts/generate-course1-seed.mjs from
-- supabase/seed-data/course1-content.json — DO NOT HAND-EDIT. Change the JSON
-- and re-run the generator. (This is a separate pipeline from the matrix
-- curriculum-content.json one; it never touches the 28 matrix cells.)
--
-- Copy source: the AI Academy Outline (program design doc) — Week 0 set-up,
-- Week 1 "Break Claude on Purpose" (pre-reveal: says "Claude", never "LLM"),
-- Week 2 "Ground & Scope", Weeks 3–4 pod activities incl. the "Walk the
-- Workflow" Marina delivery scenario, plus one public custom resource lesson.
--
-- Mechanics:
--   - modules: INSERT … ON CONFLICT (cell_id) DO NOTHING (idempotent, D-25).
--     origin='course', stage=null, status='published'; visibility='public' for
--     Week 0 (the R8 getting-started exemption), 'program' for everything else.
--   - membership: INSERT into course_week_modules resolving weeks BY the FIXED
--     uuids minted in 20260715000000_course_structure.sql; ON CONFLICT DO
--     NOTHING keeps re-runs (and the unique(cell_id) invariant) clean.
--   - Re-runnable end to end: running twice inserts nothing the second time.

${data.modules.map(moduleInsert).join('\n')}
-- ---------------------------------------------------------------------------
-- Week membership (fixed week uuids from 20260715000000_course_structure.sql).
-- The custom resource lesson is deliberately NOT assigned — it renders in the
-- "Resources & additional lessons" group (R13).
-- ---------------------------------------------------------------------------
insert into public.course_week_modules (week_id, cell_id, sort_order)
values
${membershipRows}
on conflict do nothing;
`;

writeFileSync(TARGET, sql);
stdout.write(
  `Wrote ${TARGET}: ${data.modules.length} modules (${assigned.length} week-assigned).\n`,
);
