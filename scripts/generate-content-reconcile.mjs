// Generates the dated reconcile migrations that carry course1-content.json
// edits to databases that already ran the seed.
//
// WHY THIS EXISTS. generate-course1-seed.mjs emits `insert … on conflict
// (cell_id) do nothing`, which is correct for a seed — it must never clobber
// content on re-run. The consequence is that editing course1-content.json only
// changes what a FRESH `supabase db reset` produces. Against a database that
// already ran the seed once (staging, prod), the edits are a silent no-op.
//
// So every content pass needs one dated migration carrying explicit
// `update … where cell_id = …` for each cell whose content actually changed.
// Those UPDATEs are unconditional and would overwrite a CMS edit if one
// existed (DATA-04) — re-verify that before deploying to an environment where
// authors have been publishing.
//
// Each entry in RECONCILES below is one such migration. A pass is marked
// `frozen` once its migration has shipped: it renders from the CURRENT seed
// JSON, so regenerating it after a later content edit would silently rewrite an
// already-applied migration. Frozen entries stay here as the record of what
// each pass carried, and are skipped on write.
//
// Run: node scripts/generate-content-reconcile.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_JSON = join(ROOT, 'supabase/seed-data/course1-content.json');
const MIGRATIONS = join(ROOT, 'supabase/migrations');

// One entry per content pass. `targets` lists the cells that pass changed and
// only the columns that changed for each — kept explicit so a migration's blast
// radius is reviewable in the diff rather than inferred at runtime. `notice` is
// the prefix on the migration's raise-notice output.
const RECONCILES = [
  {
    file: '20260806020000_content_review_sarah_grayvin.sql',
    frozen: true, // shipped in #146
    notice: 'content_review',
    title: 'content_review_sarah_grayvin (L&D content pass, plan item W0.3).',
    // Derived by diffing course1-content.json against 7cd805e (the pre-pass
    // baseline, i.e. the content dumped to the review doc on 2026-07-29).
    scope: [
      'SCOPE: the 5 cells the review actually changed, and only the columns that',
      'changed. Derived by diffing the seed JSON against the 2026-07-29 baseline that',
      'was dumped for review; see docs/content/content-review-plan.md.',
    ],
    caveat: [
      'DATA-04: these UPDATEs are UNCONDITIONAL. Human decision 3(a) chose this',
      'channel on the basis that the pilot has not started and no cell has been',
      'published through the admin CMS, so there is no author edit to lose. If that',
      'ever stops being true, reconcile the live copy into the JSON first.',
    ],
    targets: [
      { cell_id: 'c1-w0-claude-setup', columns: ['body_md'], why: 'W2.1 — Sarah\'s Week 0 copy edits (paras 74, 76, 105)' },
      { cell_id: 'c1-w1-confidently-wrong', columns: ['lab_config_json'], why: 'W2.2 — reflection prompt hint (para 210)' },
      { cell_id: 'c1-w2-ground-and-scope', columns: ['body_md', 'lab_config_json'], why: 'WS-5 — the Week 2 rewrite, comments [6]-[15]' },
      { cell_id: 'c1-w34-walk-the-workflow-general', columns: ['lab_config_json'], why: 'W2.4 — Sarah\'s tracked changes, paras 492-571' },
      { cell_id: 'c1-w34-scavenger-hunt', columns: ['title', 'body_md'], why: 'W2.5 — retitle + copy edits (paras 582-601)' },
    ],
  },
  {
    file: '20260811000000_week0_login_sso.sql',
    frozen: true, // shipped in #147
    notice: 'week0_login_sso',
    title: 'week0_login_sso — corrected Week 0 sign-in instructions.',
    scope: [
      'SCOPE: c1-w0-claude-setup body_md only. Section "1. Logging in" now walks',
      'learners through the email + "Continue with SSO" path; the "Continue with',
      'Google" button does not land you on the Nava Claude account, so it is now',
      'called out as the thing NOT to click.',
    ],
    caveat: [
      'DATA-04: this UPDATE is UNCONDITIONAL and would overwrite a CMS edit to this',
      "cell's body. Confirm Week 0 has not been edited through the admin CMS before",
      'deploying; if it has, fold the live copy into the seed JSON first.',
    ],
    targets: [
      { cell_id: 'c1-w0-claude-setup', columns: ['body_md'], why: 'Nava Claude accounts are reached via email → Continue with SSO, not Continue with Google' },
    ],
  },
  {
    file: '20260818000000_week0_skills_org_managed.sql',
    frozen: true, // shipped in #160
    notice: 'week0_skills_org_managed',
    title: 'week0_skills_org_managed — corrected Skills-enablement instructions for Nava\'s Team/Enterprise workspace.',
    scope: [
      'SCOPE: c1-w0-claude-setup body_md only. Section "6. Skills" told every learner',
      'to open Settings → Capabilities and enable "Code execution and file creation"',
      'themselves — that path only exists on individual Free/Pro/Max accounts.',
      'Nava\'s workspace is Team/Enterprise, where that toggle is workspace-level and',
      'set by an admin, so learners could not find it in their own Settings. The copy',
      'now says so and points learners straight to Customize → Skills, with a',
      'fallback to the AI Slack channels if skills are not yet enabled workspace-wide.',
    ],
    caveat: [
      'DATA-04: this UPDATE is UNCONDITIONAL and would overwrite a CMS edit to this',
      "cell's body. Confirm Week 0 has not been edited through the admin CMS before",
      'deploying; if it has, fold the live copy into the seed JSON first.',
    ],
    targets: [
      { cell_id: 'c1-w0-claude-setup', columns: ['body_md'], why: '"Code execution and file creation" is an admin-managed workspace setting on Nava\'s Team/Enterprise plan, not a personal Settings toggle' },
    ],
  },
  {
    file: '20260821000000_weeks34_pod_activity_copy.sql',
    notice: 'weeks34_pod_activity_copy',
    title: 'weeks34_pod_activity_copy — Weeks 3–4 pod-activity copy pass.',
    scope: [
      'SCOPE: the three Weeks 3-4 cells the copy pass changed, and only the columns',
      'that changed. c1-w34-pod-kickoff: Activity 2 now tells pods to pick one Walk',
      'the Workflow tab in the left nav and come back afterward; Activity 3 is',
      're-cut into three timeboxed steps and now sorts tasks into the Week 2 tiers',
      '(Full pass to AI / AI-assisted / Human Only), adds the client-or-manager gut',
      'check, and adds a shared-goal step that sets up the Meeting 2 exploration.',
      'The cell is also retitled "Meeting 1: Intros -> Walk the Workflow ->',
      'Delegation List" so the nav names the meeting and its agenda, matching the',
      '"Meeting 2: AI Practice Scavenger Hunt" cell.',
      'c1-w34-walk-the-workflow-general: Devon is on the people-operations team, the',
      'vendor guide is described as accurate, the Slack thread now says it carries',
      "employees' names and personal situations (so the risky-source call has the",
      'facts behind it), plus two grammar fixes in feedback copy.',
      'c1-w34-scavenger-hunt: opener renumbered as Activity 4, punctuation fixes, a',
      'Cowork prompt hint, and a closing apply-it-to-your-work paragraph.',
      'c1-w34-walk-the-workflow-delivery is deliberately NOT in scope — the review',
      'left it unchanged.',
    ],
    caveat: [
      'DATA-04: these UPDATEs are UNCONDITIONAL and would overwrite a CMS edit to',
      'these cells. Unlike the earlier passes, Weeks 3-4 is live to a running cohort,',
      'so confirm none of these three cells has been published through the admin CMS',
      'before deploying; if one has, fold the live copy into the seed JSON first.',
    ],
    targets: [
      { cell_id: 'c1-w34-pod-kickoff', columns: ['title', 'body_md'], why: 'retitled to name the meeting and its agenda; Activity 2 navigation instructions + Activity 3 rewrite into timeboxed, tiered steps' },
      { cell_id: 'c1-w34-walk-the-workflow-general', columns: ['lab_config_json'], why: 'Devon scenario: team name, source descriptions, and two feedback grammar fixes' },
      { cell_id: 'c1-w34-scavenger-hunt', columns: ['body_md'], why: 'Activity 4 framing, Cowork hint, closing apply-it paragraph' },
    ],
  },
];

const data = JSON.parse(readFileSync(SEED_JSON, 'utf8'));
const modules = new Map(data.modules.map((m) => [m.cell_id, m]));

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const comment = (lines) => lines.map((l) => `-- ${l}`).join('\n');

// Dollar-quoting is only safe while the payload cannot contain the delimiter.
// The seed generator carries the same assumption implicitly; here it is checked,
// because a violation would produce a migration that fails mid-deploy.
function dollar(tag, body) {
  const delim = `$${tag}$`;
  if (String(body).includes(delim)) {
    throw new Error(`payload contains the ${delim} delimiter — pick another tag`);
  }
  return `${delim}${body}${delim}`;
}

function assignment(m, column) {
  switch (column) {
    case 'title':
      return `  title = ${q(m.title)}`;
    case 'body_md':
      return `  body_md = ${dollar('md', m.body_md)}`;
    case 'lab_config_json':
      return `  lab_config_json = ${dollar('json', JSON.stringify(m.lab_config_json, null, 2))}::jsonb`;
    default:
      throw new Error(`unhandled column: ${column}`);
  }
}

function render({ notice, title, scope, caveat, targets }) {
  const statements = targets.map(({ cell_id, columns, why }) => {
    const m = modules.get(cell_id);
    if (!m) throw new Error(`${cell_id} is not in course1-content.json`);
    return `-- ${cell_id} — ${m.title}
-- ${why}
update public.modules set
${columns.map((c) => assignment(m, c)).join(',\n')}
where cell_id = ${q(cell_id)};
`;
  }).join('\n');

  const cellList = targets.map((t) => q(t.cell_id)).join(', ');

  return `-- ${title}
--
-- GENERATED by scripts/generate-content-reconcile.mjs from
-- supabase/seed-data/course1-content.json — DO NOT HAND-EDIT. Change the JSON,
-- re-run the generator.
--
-- WHY: 20260715040000_seed_course1_content.sql is INSERT … ON CONFLICT DO
-- NOTHING, so edits to the seed JSON only reach a fresh \`supabase db reset\`.
-- Against a database that already ran that seed, they are a silent no-op. This
-- migration carries the same content as explicit UPDATEs so every environment
-- converges on the reviewed copy.
--
${comment(scope)}
--
${comment(caveat)}
--
-- Learner progress is deliberately NOT reset. progress_reset_at is minted
-- inside the admin-content Edge Function, so a migration cannot fire the epoch
-- protocol anyway; a copy pass that does need a reset has to go through the
-- admin CMS publish dialog instead.
--
-- Idempotent: re-running writes identical values.

do $$
declare
  missing text[];
begin
  select array_agg(c) into missing
  from unnest(array[${cellList}]) as c
  where not exists (select 1 from public.modules m where m.cell_id = c);

  if missing is not null then
    raise notice '${notice}: % target cell(s) absent, their updates will affect 0 rows: %',
      array_length(missing, 1), array_to_string(missing, ', ');
  end if;
end $$;

${statements}
do $$
declare
  updated int;
begin
  select count(*) into updated
  from public.modules
  where cell_id = any (array[${cellList}]);
  raise notice '${notice}: reconciled % of ${targets.length} reviewed cell(s).', updated;
end $$;
`;
}

for (const spec of RECONCILES) {
  const out = join(MIGRATIONS, spec.file);
  if (spec.frozen) {
    stdout.write(`Skipped ${spec.file}: already applied — frozen.\n`);
    continue;
  }
  writeFileSync(out, render(spec));
  const columns = spec.targets.reduce((n, t) => n + t.columns.length, 0);
  stdout.write(`Wrote ${out}: ${spec.targets.length} cells, ${columns} column updates.\n`);
}
