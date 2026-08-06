# Content review plan — Sarah Grayvin, 2026-08-03

Consolidated execution plan for the L&D content/UX review of `docs/content/content-review.md`
(generated 2026-07-29 from the live curriculum DB). Source: **29 inline comments `[0]`–`[28]`
plus 81 tracked-change paragraphs**, all authored by Sarah Grayvin (L&D) in Suggesting mode.

Planning only — no files were edited producing this document.

## Orientation

**What the review covers.** Every comment and tracked change lands inside Course 1
(`origin='course'` / `origin='custom'` rows). Zero land on the 28 matrix cells. Eight lessons are
touched: `c1-w0-claude-setup`, `c1-w1-confidently-wrong`, `c1-w1-lookup-vs-predict` (delete),
`c1-w2-delegation-sort` (delete), `c1-w2-ground-and-scope`, `c1-w34-pod-kickoff`,
`c1-w34-walk-the-workflow-general`, `c1-w34-scavenger-hunt` — plus
`c1-w34-walk-the-workflow-delivery`, which received **nine comments and zero tracked changes**
(see W4.4; that is a gap, not a green light).

**Headline shape: 37 work items.**

| change_type | count | notes |
|---|---|---|
| content-data | 14 | seed JSON edits; the bulk of the tracked changes are mechanical |
| component-code | 6 | decision-scenario affordances + chat-compare rework + test churn |
| needs-decision | 5 | blocking product/L&D calls (see §4) |
| ops-migration | 4 | write path, retirement, resource lessons, generator gap |
| schema-type | 4 | LabConfig additions, sidebar nesting, dead `resources[]` field |
| investigation | 3 | CMS drift audit, Week 0 deploy diagnosis, denominator bug |
| already-done | 1 | `[16]`'s ordering ask is already satisfied |

**Three things are already implemented or already true** — say so to Sarah rather than building
them again:

1. **`[3]` Week 0 Skills section exists in the repo.** `supabase/seed-data/course1-content.json:27`
   and `supabase/migrations/20260727000000_update_week0_claude_setup_skills_video.sql:13-114` are
   byte-identical and both contain agenda item 6 *and* the `## 6. Skills` heading. This is a
   **deploy/data-state problem**, not a content gap (W0.2).
2. **`[22]`/`[26]` Submit already exists — for multi-select only.** `DecisionScenario.tsx:223-233`
   renders a "Check answer" button gating reveal on multi-select checkpoints. It is missing on the
   three single-select checkpoints Sarah anchored against (`choose()` at
   `DecisionScenario.tsx:76-79` selects and reveals in one action). The fix is unification, not
   new functionality (W3.2).
3. **`[16]`'s ordering is already correct.** `c1-w34-pod-kickoff` (0),
   `walk-the-workflow-delivery` (1), `walk-the-workflow-general` (2), `scavenger-hunt` (3) are
   already contiguous members of the same week —
   `supabase/migrations/20260715040000_seed_course1_content.sql:1040-1042`. Only the *visual*
   signal of subordination is missing (W6.1).

**The one hard infeasibility.** `[9]` asks whether Claude can "pull that text in only if it is
given that direct instruction." It cannot. `src/lib/llm.ts:41-135` POSTs only
`{ messages, system, model, max_tokens }` to the `chat` Edge Function — there is no tool,
retrieval, or attachment channel. Text is either in the request or the model never sees it. The
deterministic equivalent (client-side per-prompt grounding flag) is planned as W5.2/W5.3.

**The delivery mechanic that bites everything.** `scripts/generate-course1-seed.mjs:112` emits
`on conflict (cell_id) do nothing`. Editing `course1-content.json` and regenerating **only affects
a fresh `npx supabase db reset`** — it is a silent no-op against staging/prod. Every content item
below therefore needs a paired dated UPDATE migration or a CMS publish (W0.3).

---

## 1. Coverage table — all 29 comments

| # | Sarah's ask (one line) | Target cell / file | change_type | Effort | Item |
|---|---|---|---|---|---|
| [0] | Header note: "topics to find and add resources on" | Resources section | needs-decision | S | W7.1 |
| [1] | Add Claude-specific training videos/tutorials (beginner–intermediate) | new `custom-claude-training-videos` | content-data | M | W7.1, W7.2 |
| [2] | Add beginner–intermediate prompting videos/tutorials | new `custom-prompting-resources` | content-data | M | W7.1, W7.2, W2.1 |
| [3] | Skills section not visible in the Academy, missing from agenda list | `c1-w0-claude-setup` | investigation | S | W0.2 |
| [4] | "Lookup or Predict?" can be completely deleted | `c1-w1-lookup-vs-predict` | ops-migration | M | W1.1, W1.2 |
| [5] | "Full-AI, Assisted, or Human-Only?" can be completely deleted | `c1-w2-delegation-sort` | ops-migration | M | W1.1, W1.2 |
| [6] | General rewrite: neutral setup, separate prompt boxes, add a 2nd example | `c1-w2-ground-and-scope` | needs-decision | L | W5.1, W5.3, W5.4 |
| [7] | Pane headings show the number of the prompt the learner selected | `ChatCompare.tsx:47-49`, `types.ts:674-680` | component-code | M | W5.3 |
| [8] | Suggested prompts become numbered variants of one task | `c1-w2-ground-and-scope` lab config | content-data + code | M | W5.3, W5.5 |
| [9] | Inject the bulletin only when the prompt asks for it | `ChatCompare.tsx:55-58`, `llm.ts:41-135` | schema-type | M | W5.2, W5.3 |
| [10] | Each prompt should show one evident scope/grounding weakness; #3 best | `c1-w2-ground-and-scope` | content-data | M | W5.5 |
| [11] | Prompt #1 weakness: wrong audience, complex language, fabricated detail | `c1-w2-ground-and-scope` | content-data | M | W5.5 |
| [12] | Prompt #2 weakness: paragraph format, missing critical context | `c1-w2-ground-and-scope` | content-data | M | W5.5 |
| [13] | Prompt #4 weakness: bare numbers + definitions, no email language | `c1-w2-ground-and-scope` | content-data | M | W5.5 |
| [14] | Delete the "Keep in mind: Grounding lowers the odds…" caveat | `c1-w2-ground-and-scope` `reflectionMd` | content-data | S | W5.5 |
| [15] | Add Example 2 — non-delivery (Slack post announcement) | `c1-w2-ground-and-scope` or new row | content-data | L | W5.1, W5.6 |
| [16] | Make the two Walk-the-Workflow lessons sub-tabs of Pod Kickoff | Sidebar / `course_week_modules` | already-done (ordering) + content-data | S–M | W6.1, W6.2, W6.3 |
| [17] | Delivery scenario duplicates Week 2 — generate a new one? Eng-specific? | `c1-w34-walk-the-workflow-delivery` | needs-decision | L | W4.1, W4.2 |
| [18] | …or re-scenario Week 2 instead. Either way. | `c1-w2-ground-and-scope` | needs-decision | L | W4.1 |
| [19] | Scenario story/context should appear on each checkpoint | `DecisionScenario.tsx:366-381` | component-code | S | W3.1 |
| [20] | …make it easy to revisit — click-to-expand box | `DecisionScenario.tsx` | component-code | S | W3.1 |
| [21] | Add a retake so learners can try a different answer | `DecisionScenario.tsx:76-89` | needs-decision | M | W3.4 |
| [22] | Add a Submit button (DELEGATE checkpoint) | `DecisionScenario.tsx:223-233` | component-code | M | W3.2 |
| [23] | Retake + multi-select feedback must show the entire answer key | `DecisionScenario.tsx:151-174` | component-code | S | W3.3, W3.4 |
| [24] | Submit + retake on SCOPE | `DecisionScenario.tsx` | component-code | M | W3.2, W3.4 |
| [25] | Submit + retake on VERIFY | `DecisionScenario.tsx` | component-code | M | W3.2, W3.4 |
| [26] | Same Submit + Retake asks for the General Operations scenario | `DecisionScenario.tsx` (shared component) | component-code | M | W3.2, W3.4 |
| [27] | Expandable story summary on every slide (General Ops) | `DecisionScenario.tsx` | component-code | S | W3.1 |
| [28] | Full answer key on multi-select (General Ops) | `DecisionScenario.tsx:151-174` | component-code | S | W3.3 |

Tracked-change paragraph coverage (81 paras, all accounted for):
`c1-w0-claude-setup` 74/76/105 (W2.1) · `c1-w1-confidently-wrong` 210 (W2.2) ·
`c1-w1-lookup-vs-predict` 219–239, 18 paras = whole-module delete (W1.1) ·
`c1-w2-delegation-sort` 243–263, 18 paras = whole-module delete (W1.1) ·
`c1-w2-ground-and-scope` 271/272/273/289/291/293/298/299/314–318/327/329/331/333, 17 paras
(W5.4, W5.5, W5.6) · `c1-w34-pod-kickoff` 337/361/368/370/371/375/376/377 (W2.3) ·
`c1-w34-walk-the-workflow-general` 492/509/515/518/534/548/550/565/567/571 (W2.4) ·
`c1-w34-scavenger-hunt` 582/585/587/595/597/601 (W2.5).

> **Heading-path caveat for executing agents:** `review.json` heading level 2 is *stale* for paras
> 492–601 — it reads `Activity 2/3: …`, which are `##` headings inside `c1-w34-pod-kickoff`'s
> `body_md`. Use the deepest numbered `###` heading as the authoritative container. Paras 361–377
> genuinely *are* pod-kickoff body (`docs/content/content-review.md:366`–`:413`).

---

## 2. Workstreams and work items (dependency-ordered)

### WS-0 — Foundations (gates everything)

#### W0.1 — Run the CMS-drift + progress audit
**change_type:** investigation · **effort:** S · **blocks:** every write item

**Steps.** Against the deployed DB (and re-confirm local):

```sql
select cell_id, version, status, updated_at, updated_by is not null as cms_touched,
       draft is not null as has_draft, archived_at, progress_reset_at
  from public.modules where origin in ('course','custom') order by cell_id;
select cell_id, version, note, created_at from public.content_versions order by created_at desc;
select cell_id, action, actor_email, created_at, detail from public.content_changes order by created_at desc;
select module_id, count(*) from public.module_progress where module_id like 'c1-%' group by 1;
```

Drift predicate: `version > 1 or updated_by is not null or draft is not null`. Only the CMS writes
those — `admin-content/index.ts:58` stamps `updated_by`, `admin-content-core.ts:925-941` bumps
`version` absolutely, and no migration ever writes either (there is no `updated_at` trigger on
`modules`). For each drifted cell, dump the live `body_md`/`lab_config_json` and diff it against
the seed JSON; the **merged** text is what a reconcile migration may write.

**Known state.** Local stack: all 17 course/custom rows at `version=1`, `updated_by` null, `draft`
null, `archived_at` null, `updated_at = 2026-07-29 14:02:17`; `content_versions` and
`content_changes` both empty; zero `module_progress` rows for any `c1-*` cell. Spot-checks of
`docs/content/content-review.md:302/:328/:348/:427` against `course1-content.json` match
byte-for-byte, so **no CMS drift is observable for these 8 cells as of 2026-07-29**. Deployed is
unverified.

**Risks.** `content_changes` has RLS on with no permissive policy
(`20260618000000_admin_cms_foundation.sql:90-92`) — service-role/Studio access required. Skipping
this makes every UPDATE-by-cell_id a silent clobber.

**Open question.** Who has service-role access, and is there more than one deployed environment?

---

#### W0.2 — Diagnose `[3]`: Week 0 Skills section not visible
**change_type:** investigation · **effort:** S · **comment:** [3]

The repo is correct — nothing to author. Diagnose the environment.

1. **Establish the DB.** `.github/workflows/deploy.yml:5-7` maps `main`→staging, `release`→prod;
   `git branch -a` shows **no origin/release**. Prod's last 3 runs were `workflow_dispatch` on
   2026-06-25/26 — before the entire `20260715*` cohort restructure existed.
2. **One-question triage.** Ask Sarah whether the Week 0 lesson shows a video. `video_url` is set
   **only** by `20260727000000_…sql:115`; the generator's INSERT column list
   (`generate-course1-seed.mjs:105-106`) omits it entirely. No video ⇒ the migration never landed.
   Video present but no Skills ⇒ something overwrote `body_md` afterwards.
3. **Migration history:** `select version from supabase_migrations.schema_migrations where version >= '20260715040000';`
   plus `select cell_id, video_url, body_md like '%## 6. Skills%' from public.modules where cell_id='c1-w0-claude-setup';`
4. **CI evidence already gathered:** run 30270108347 (the migration's own merge, 2026-07-27)
   **failed** at "Push database migrations" with `Unauthorized`; run 30382844778 failed
   identically; the first success afterwards (30388293855) logged `Remote database is up to date.`
   and applied nothing. **No run in repo history ever logs `Applying migration 20260727000000`.**

**Remediation forks.** (A) never applied → re-run deploy / `supabase db push`. (B) history row
present but content old → a NEW dated migration (20260727000000 will never re-run). (C) stale
unpublished CMS draft → one Publish click.

**Pipeline guard (recommended regardless).** `supabase db push` printing "Remote database is up to
date" while a new migration file is in the checkout is silent drift. Add a post-push assertion to
`deploy.yml:91-97` comparing `ls supabase/migrations | wc -l` against `supabase migration list --linked`.

---

#### W0.3 — Adopt seed-JSON-first + one dated reconcile migration
**change_type:** ops-migration · **effort:** M · **depends on:** W0.1

The shared write path for every content item. Do it once, not per lesson.

1. All content edits land in `supabase/seed-data/course1-content.json` **only**. Never hand-edit
   `supabase/migrations/20260715040000_seed_course1_content.sql` (`generate-course1-seed.mjs:19`).
2. Run `node scripts/generate-course1-seed.mjs`. (Verified idempotent today: re-running produces a
   zero-byte diff.)
3. Because the generated seed is `insert … on conflict (cell_id) do nothing`
   (`generate-course1-seed.mjs:112`), add **one** new dated migration —
   `supabase/migrations/20260806000000_content_review_sarah_grayvin.sql` — of explicit
   `update public.modules set body_md = $md$…$md$, lab_config_json = $json$…$json$::jsonb, title = '…' where cell_id = '…';`
   one statement per touched cell. Model the header on
   `supabase/migrations/20260727000000_update_week0_claude_setup_skills_video.sql:1-11`, including
   its DATA-04 caveat line (`:9`).
4. **Generator hard gates:** unique `cell_id`, allow-listed origin/visibility/type/evidence,
   integer `sort_order`, week key must exist (`:54-77`); `$md$`/`$json$` must not appear in
   body/lab JSON (`:78-81`); Week 0/1 copy must say "Claude", never "LLM" (`:52`, `:83-89`).
   **Weeks 2 and 3–4 are NOT covered by the pre-reveal guard** — verified: `c1-w34-pod-kickoff`,
   `…-walk-the-workflow-delivery` and `…-scavenger-hunt` all contain "LLM" today and the generator
   passes. Keep saying "Claude" in Week 2 as house style, but know it is not enforced.
5. **Verify before merge:** `npm test` — `admin-content-core.seed.test.ts:20-73` re-parses every
   `$json$…$json$` block out of **all** migrations and re-validates it against the CMS write
   validators. Then `npx supabase db reset` and re-run the W0.1 query.

**Risks.** Two source-of-truth copies of the same prose (JSON + migration) can diverge in a later
edit — copy-paste, never retype. The reconcile migration overwrites CMS edits by construction.

**Open question.** Should the generator instead emit `on conflict (cell_id) do update set …`? That
removes the reconcile migration but starts clobbering CMS edits on every `db reset` — a deliberate
contract change, not a cleanup.

---

#### W0.4 — Close the generator's column gap (`video_url`, `quiz_json`, `sorter_config_json`)
**change_type:** ops-migration · **effort:** S · **depends on:** W0.3 · **optional**

`moduleInsert` emits only `(cell_id, stage, origin, visibility, status, title, type, dimension,
evidence_type, self_report_validity, sort_order, body_md, lab_config_json)`
(`generate-course1-seed.mjs:105-106`). No module in `course1-content.json` carries a `video_url`
key, yet the live Week 0 row has one — set only by `20260727000000:115`. **Consequence: a fresh
`db reset` on a machine that somehow skips that migration loses the Week 0 video, and
"regenerate the seed from the DB" is a lossy round-trip.**

Add optional `video_url` (string/null, validated as http(s) like `adminContent.ts:38-46`) plus
`quiz_json` / `sorter_config_json` / `tutor_reference_md` to the generator's column list and VALUES
tuple, reusing the existing dollar-quote guards. Then add
`video_url: 'https://www.youtube.com/watch?v=0vZ_UVLhSQQ'` to the `c1-w0-claude-setup` entry.

**Risk.** Regeneration rewrites the whole 83 KB migration — eyeball the diff and re-run `npm test`.

---

### WS-1 — Deletions `[4]` `[5]` (gates the Week 2 restructure)

#### W1.1 — Remove both lessons from the seed pipeline
**change_type:** content-data · **effort:** M · **comments:** [4] [5] · **depends on:** W0.3

1. Delete the module object at `supabase/seed-data/course1-content.json:457`
   (`c1-w1-lookup-vs-predict`) and at `:514` (`c1-w2-delegation-sort`). Membership rows drop out
   automatically (`generate-course1-seed.mjs:116-119`).
2. Renumber: set `c1-w2-ground-and-scope`'s `week_sort_order` from 1 → 0 (it was 1 only because the
   delegation sort held 0). Its `sort_order=903` collision with `c1-w1-lookup-vs-predict` resolves
   itself.
3. `node scripts/generate-course1-seed.mjs`. Expect SQL lines 714-766 and 768-839 (the two INSERT
   blocks) and lines 1044-1045 (the two membership tuples) to disappear; header count → 15 modules
   / 10 week-assigned.
4. `npx supabase db reset`; Week 1 shows 2 modules, Week 2 shows 1.

**This step alone changes nothing in any already-migrated DB** — see W1.2.

**Downstream.** Week 2 collapses to a single module (`c1-w2-ground-and-scope`), which is
simultaneously being rewritten. Sequence this deletion first so the Week 2 restructure is planned
against the final module list. Verified: **no other module's `body_md` or `lab_config_json`
mentions either sort** — nothing dangles.

---

#### W1.2 — Retirement migration (unassign, then archive)
**change_type:** ops-migration · **effort:** S · **depends on:** W1.1 · must ship together

New hand-authored dated migration, modelled on
`supabase/migrations/20260715060000_retire_workshops.sql` (RAISE NOTICE audit + idempotent
mutation). **Order matters:**

1. `delete from public.course_week_modules where cell_id in ('c1-w1-lookup-vs-predict','c1-w2-delegation-sort');`
   — first, because the CMS refuses to archive a week-assigned lesson
   (`admin-content/index.ts:239-254` → `archiveBlockedReason` at `admin-content-core.ts:1039-1046`),
   and `buildCourseAuthoring` (`src/lib/adminCourses.ts:164-173`) keeps listing an archived module
   as a week member — it only filters `archived_at` out of the assignable picker (`:192`).
2. `update public.modules set archived_at = coalesce(archived_at, now()) where cell_id in (…);`
   Learners stop seeing them immediately (`src/lib/modules.ts:317` filters `.is('archived_at', null)`).
3. `update public.course_week_modules set sort_order = 0 where cell_id = 'c1-w2-ground-and-scope';`
4. RAISE NOTICE the affected counts.

**Archive, not hard delete** (see Decision 2): a `delete from public.modules` cascades
`content_versions` (`20260602130334_modules_content_as_data.sql:50-58`), destroying CMS version
history irreversibly. `module_progress.module_id` is plain `text` with **no FK**
(`20260528221204_init_core.sql:23-31`), so neither path cascades progress — hard delete just
orphans it more opaquely.

---

#### W1.3 — Tests + the champion-dashboard denominator
**change_type:** component-code · **effort:** S · **depends on:** W1.1

1. **Delete `src/lib/course1Seed.delegation.test.ts`.** Its single test asserts
   `expect(modules.length).toBeGreaterThan(0)` (`:19`) over `delegation-sort` configs in the seed;
   `c1-w2-delegation-sort` is the only one anywhere. The invariant it guards survives in
   `src/components/exercises/DelegationSort.test.tsx` if the component stays.
2. **`src/lib/courseStructure.integration.test.ts`** — remove `'Week 1:c1-w1-lookup-vs-predict'`
   (`:174`) and `'Week 2:c1-w2-delegation-sort'` (`:176`) from the exact-equality membership array,
   and update the narrating comment at `:158-161`. This is **DB-gated** (`RUN_DB_TESTS=1` + live
   stack) and skips silently locally — run it deliberately, or CI's `db-tests` job goes red.
3. **e2e needs no change.** Grepped all specs: zero references to either cell id, title, or lab
   kind. `e2e/21-enrollment-visibility.spec.ts:30-38` already omits both from its `toHaveCount(0)`
   list; `:79-85` only enumerates Weeks 3–4.
4. **Fix `published_modules_total()`.** Verified at
   `supabase/migrations/20260715010000_enrollment_visibility.sql:55-65`:
   `select count(*)::int from public.modules where status = 'published'` — **no `archived_at`
   filter.** It feeds `modules_total` and the `completion_pct` divisor in
   `learner_progress_summary` (`:110`, `:119`). Under the archive path the two retired lessons stay
   `status='published'` and permanently sit in every learner's denominator. `create or replace` it
   with `and archived_at is null`, keeping SECURITY DEFINER / STABLE / `set search_path = ''` and
   re-issuing the grants at `:70-73`. Signature unchanged, so the view needs no re-creation.
   **Do not** also filter the `modules_completed` numerator — that retroactively lowers already-
   recorded completions (a product call, not a bug fix).

**Risk.** The denominator fix visibly bumps every champion-dashboard `completion_pct` upward the
moment it lands. Warn champions if a cohort is mid-flight.

---

#### W1.4 — Decision: keep the `prediction-sort` / `delegation-sort` components
**change_type:** needs-decision · **effort:** S · **recommendation: KEEP — take no code action**

Both kinds appear **zero times** in `supabase/seed-data/curriculum-content.json` (the 28 matrix
cells) and are each used by exactly one Course-1 cell, both retired here. Recorded so a later agent
does not garbage-collect them.

**Why keep.** (1) `src/lib/modules.ts:190` casts `lab_config_json` straight through with no runtime
`kind` validation — an archived-but-surviving row with `kind='prediction-sort'` would fall through
`ModuleRenderer.tsx:266-268` `default: return null` and render the FE-06 "no activity" notice.
(2) CLAUDE.md's convention is *additive* exercise kinds; subtraction inverts it and conflicts with
in-flight branches. (3) Sarah's objection is that these *activities* are run live, not that the
interaction pattern is bad.

**If reversed**, removal is a coordinated 10-site change that must land atomically or TS won't
compile: `src/types.ts:277-300`, `:302-328`, `:810-811`; `ModuleRenderer.tsx:35-36`, `:244-253`;
`labValidation.ts:39-40`, `:75-76` (`LAB_KIND_LABELS` is `Record<LabConfig['kind'], string>` — a
leftover key is a hard error), `:498-530`; `admin-content-core.ts:238-239`, `:678-712`; plus four
component/test files and blocks at `labValidation.test.ts:127-180` and
`admin-content-core.test.ts:333-380`.

---

### WS-2 — Mechanical tracked-change copy edits (parallel-safe, low risk)

All five items are pure `body_md` / `lab_config_json` string edits routed through W0.3. **Five copy
defects in Sarah's own inserted text must be fixed, not adopted verbatim** — she is editing a docx,
not markdown:

- **Para 571:** "…is the right approach, and fixing any errors as you go, is the right approach." — duplicated clause.
- **Para 585:** "…about 1 hour on these tasks. **.**" — orphan period.
- **Para 595:** "If you succeed**,**what made…" — missing space.
- **Paras 293 and 361:** lost paragraph break at a sentence join ("…to compare.When both…",
  "…each decision point.Come back…") — restore as `\n\n`.
- **Para 327:** ends in `.`, should be `?`.

#### W2.1 — `c1-w0-claude-setup` (paras 74, 76, 105 + agenda label alignment)
**change_type:** content-data · **effort:** S · **depends on:** W0.2, W7.2

- **74** (`## 5. Prompting basics`, last line): replace "You'll practice all of this during the
  course — no need to master it today." with "You won't need advanced prompting skills for this
  course, but feel free to explore more on this topic in the resources section."
  **Forward reference** — do not merge unless the prompting resource lesson (W7.2) ships in the
  same release, or the pointer goes nowhere. Consider naming the actual nav label,
  "Resources & additional lessons" (`src/lib/modules.ts:64`).
- **76:** insert directly under `## 6. Skills`, before the "A **skill** is a reusable set of
  instructions…" paragraph: "Note: you're not required to use Claude skills in this course; however,
  you may choose to explore them and may find opportunities to begin or expand your work with
  skills as part of your learning."
- **105:** this is a **hyperlink insertion**, not a text change (identical del/ins runs). Wrap as
  `[AI Tool Policy](https://navasage.atlassian.net/wiki/spaces/NH/pages/763494410/AI+Tool+Use+Policy)`.
  Strip the docx `?search_id=…&additional_analytics=…` tracking params.
- **Cosmetic follow-up (not requested by Sarah — confirm before spending on it):** agenda item 3
  reads "A tour of the key areas in the tool" vs heading `## 3. Key areas in the tool`; item 4
  "…(including custom instructions)" vs `## 4. Recommended starter settings`; item 6 "Installing and
  using Skills" vs `## 6. Skills`. Numbering is internally consistent; only three labels drift.

**Highest DATA-04 exposure in the review** — this row has already been force-UPDATEd once
(`20260727000000_…sql:9`). Dump the live `body_md` and diff before writing an UPDATE. **Batch all
Week 0 edits into one migration** rather than three.

#### W2.2 — `c1-w1-confidently-wrong` (para 210)
**change_type:** content-data · **effort:** S

`lab_config_json.reflectionMd`, item 1: append " Hint: you may have to do some of your own research
to determine this." Pre-reveal guard applies (week1) but the insertion contains no "LLM". Zero risk.

#### W2.3 — `c1-w34-pod-kickoff` (paras 337, 361, 368, 370, 371, 375, 376, 377)
**change_type:** content-data · **effort:** S · **related:** [16]

One `title` change plus seven `body_md` edits. List levels confirmed from the docx `numPr`
(`numId=5`): 370/376/377 are `ilvl=1` sub-bullets; 368/371/375 are `ilvl=0` items (375 is a new
top-level item 4).

- **337 → `title`:** "Pod Kickoff: Intros & AI Delegation Brainstorm" → "Meeting 1: Intros → Walk
  the Workflow → Delegation List". (The "7." prefix is generator-added; do not store it.)
- **361:** the Activity 2 paragraph → "Choose one Walk the Workflow activity to complete as a group.
  Choose whether you'd like to complete a **delivery-** or **non-delivery-based** scenario and go to
  the relevant tab. Then follow your selected scenario and complete each decision point.\n\nCome
  back to this section afterward to pick up with the next activity."
- **368:** → "5-7 minutes. Independently brainstorm **3 items you would delegate to AI and 3 items
  you would not**."
- **370:** NEW `ilvl=1` bullet under item 1: "You can choose tasks that you have already delegated
  before or tasks that you think you could delegate or want to delegate."
- **371:** → "7-10 minutes. Discuss what you brainstormed **as a group**:"
- **375:** NEW `ilvl=0` item 4: "3-5 minutes. If it makes sense for your pod's interests, choose a
  shared goal(s)…"
- **376, 377:** NEW `ilvl=1` bullets under item 4, in order.

**Risks.** (a) Para 361's "go to the relevant tab" asserts an affordance that does not exist — see
Decision 8; either land it with the navigation work or soften to "open the relevant lesson".
(b) The "(20 min)" in the Activity 3 heading no longer matches 5-7 + 7-10 + 3-5 = 15–22 min.
(c) **Para 375 is the antecedent for para 587** in the scavenger hunt — ship W2.3 and W2.5 together
or 587 dangles.

#### W2.4 — `c1-w34-walk-the-workflow-general` (10 lab-config edits)
**change_type:** content-data · **effort:** S · **related:** [23] [28]

All 10 land in `lab_config_json`. Nine mechanical; **518 needs a human call**.

- **492** `introMd` ¶1: "people-operations team" → "People Operations team".
- **509** `checkpoints[0].options[2].feedbackMd`: replace the final sentence with "AI-assisted, with
  Devon owning the final content, is the better choice."
- **515** `checkpoints[1].setupMd` bullet 1: delete " accurately".
- **518** `checkpoints[1].setupMd` bullet 4: "…useful pain points**, mixed in with individual
  employees' names and personal situations**." → "…useful pain points **that the team hasn't
  addressed yet**." ← **CONFLICT, see below.**
- **534** `checkpoints[1].options[3].feedbackMd`: → "…but giving Claude access to the thread mixes
  the content with the individual employees' names and any personal situations they may have posted
  about."
- **548** `checkpoints[2].options[0]`: → "Starting a fresh chat for a fresh task and chunking the
  work is the best option."
- **550** `checkpoints[2].options[1]`: append " Using a new chat and chunking the work is the best
  option."
- **565 / 567 / 571** `checkpoints[3].options[0]/[1]/[3]`: append the "walking through the new guide
  step by step is the right approach" closers — **fix 571's duplicated clause**.

**Real internal conflict (518 vs 534).** Para 518 removes the PII disclosure from the Slack-thread
option's *setup*, but 534 keeps feedback asserting the thread "mixes the content with the individual
employees' names…". After 518 the learner cannot reason to the answer 534 gives. It may be
deliberate — the checkpoint prompt already says "do not select any options that may be risky
**without more information**" — but it changes the answer key's defensibility. **See Decision 9.**

**Note the pattern.** 509/548/550/565/567/571 systematically make every *wrong* option's feedback
also name the *right* answer. That is a text-level workaround for what `[23]`/`[28]` actually ask
for (show the full key on every submission, W3.3) — not a substitute for it.

#### W2.5 — `c1-w34-scavenger-hunt` (paras 582, 585, 587, 595, 597, 601)
**change_type:** content-data · **effort:** S · **depends on:** W2.3 (para 375 ↔ 587)

- **582 → `title`:** "AI Practice Scavenger Hunt" → "Meeting 2: AI Practice Scavenger Hunt".
- **585:** → "We recommend completing this activity during your second pod meeting of Weeks 3-4.
  Plan to spend about 1 hour on these tasks." (drop the orphan period).
- **587:** insert "Think back to any goals you set as a group at the end of your first meeting."
  immediately **before** "The goal is to build familiarity with self-led experimentation."
- **595:** "If you succeed — what made…" → "If you succeed, what made…" (restore the space).
- **597:** em-dash aside → parenthetical.
- **601:** hyperlink insertion — `[skill library](https://hub.navapbc.com)`, the same URL already
  used in `c1-w0-claude-setup`'s Skills section. Only the first occurrence is linked; leave the
  second unless L&D asks otherwise.

This module says "Ask the LLM" (item 3) and is `weeks34`, so the pre-reveal guard does not apply.

---

### WS-3 — Decision-scenario UI `[19]`–`[28]`

Shared component: `src/components/exercises/DecisionScenario.tsx` (409 lines). State is four
`useState`s (`:63-70`); `CheckpointState = { selected: number[]; revealed: boolean }` (`:41-45`);
all in-memory, so a refresh restarts the walk (documented `:33-34`). **All four items below are
scenario-agnostic** — they can be built against today's Marina config and survive a scenario swap
(WS-4).

**Completion timing is unaffected by every item here.** `recordRun()` (`:100-126`) is the
component's only `recordLabSubmission` call and fires once, from the Finish branch of
`handleContinue` (`:128-140`). `recordLabSubmission` (`src/lib/progress.ts:347-365`) emits
`{ via:'lab' }` on the participation seam at `:363`. **Do not** wire per-checkpoint recording.

#### W3.1 — Persistent expandable scenario recap on every checkpoint
**change_type:** component-code · **effort:** S · **comments:** [19] [20] [27]

`config.introMd` (`types.ts:753-754`) renders **only** on `step < 0` (`DecisionScenario.tsx:366-381`)
— it vanishes the moment the walk starts. Confirmed: `:190` renders only `cp.setupMd` per checkpoint.

1. Add `const [contextOpen, setContextOpen] = useState(false)` (component-level, not per-checkpoint,
   so it stays open across checkpoints — that is what `[20]` asks for).
2. Add a collapsible: `<button aria-expanded aria-controls="decision-scenario-context">` with a
   ChevronDown, labelled "Scenario recap"; on open, a div rendering
   `<ReactMarkdown remarkPlugins={[remarkGfm]}>{config.contextMd ?? config.introMd}</ReactMarkdown>`.
   Copy the ARIA/markup shape from `CollapsibleSection` in
   `src/components/LearnerDashboard.tsx:42-78` (mirrored at `src/components/layout/Sidebar.tsx:153`)
   — no `<details>` element is used anywhere in `src/components`.
3. Mount it inside the stepper branch (above `renderCheckpoint` at `:383-384`), **collapsed by
   default** so the decision prompt stays above the fold. Not on the intro screen, not in the
   post-finish read-through.
4. Ship against today's data via the `?? config.introMd` fallback — **zero data migration**.

**Risk.** Rendering `introMd` verbatim repeats its trailing pod instruction ("Walk through Marina's
task one decision at a time. At each checkpoint, discuss as a pod…") on every checkpoint. Acceptable,
or add `contextMd` (W3.5).

**Tests.** Add cases: recap button present on checkpoint 1, absent before Start, `aria-expanded`
flips, expanding surfaces the intro text.

#### W3.2 — Submit gates feedback on single-select checkpoints
**change_type:** component-code · **effort:** M · **comments:** [22] [24] [25] [26]

Today `choose()` (`:76-79`) sets `{ selected:[oi], revealed:true }` in one action — selecting *is*
submitting. `toggle()` (`:82-89`) + `checkAnswer()` (`:91-95`) already give multi-select the exact
gate Sarah wants, labelled "Check answer" (`:223-233`). Unify.

1. `choose()` → `setAnswer(index, { selected: [optionIndex], revealed: false })`; drop its
   `if (answers[index].revealed) return` early-out in favour of the multi-select guard, so a learner
   can change their pick before submitting.
2. Option-button `disabled={locked}` (`:245`) → single-select buttons stay enabled while
   `!a.revealed`; `aria-pressed` reflects the pending selection.
3. Lift the "Check answer" button out of the `cp.multiSelect` branch so **one** Submit control
   renders for both. Relabel "Submit" (Sarah's word). Keep `disabled={a.selected.length === 0}`;
   hide when `!interactive || a.revealed`. `checkAnswer()` already handles both branches.
4. Leave `handleContinue` untouched — Continue/Finish stays gated on `answers[step].revealed`.
5. **No completion-timing change.** Verify no `recordLabSubmission` call is added to Submit.

**Risks.** Largest behavioral edit in the cluster; ~7 of 11 tests in `DecisionScenario.test.tsx`
need edits (`walkToFinish()` at `:92-104`, plus `:139-154`, `:186-196`, `:198-218`, `:220-231`,
`:233-257`, `:278-287`). The header comment at `DecisionScenario.tsx:20-34` and the config doc at
`types.ts:738-748` both describe the old behavior and must be rewritten.
`e2e/21-enrollment-visibility.spec.ts:95-103` only asserts intro text, "Start the scenario",
"Checkpoint 1 of 4" and the DELEGATE badge — **stays green**.

#### W3.3 — Multi-select feedback shows the entire answer key
**change_type:** component-code · **effort:** S · **comments:** [23] [28]

`:151-174` maps `a.selected.slice().sort()` → only picked options' feedback renders. Change the map
source to iterate all options, still gated on `a.revealed`.

**No content authoring is required.** Every `DecisionOption` already carries non-empty `feedbackMd`
— required by `types.ts:714-718` and enforced by both validators (`labValidation.ts:487-489`,
`admin-content-core.ts:667-669`). And the seeded GROUND options already open with a verdict
sentence ("A best choice." / "Risky without more information." / "Not a good grounding source." /
"Do not put this in." / "Risky as-is."), which is ~90% of Sarah's second sub-ask ("whether or not it
is an appropriate choice").

1. Visually distinguish picks: keep the nava-plum card + "You chose this" marker for
   `a.selected.includes(oi)`; muted/neutral card for the rest. Consider ordering chosen first.
2. **Scope to multi-select only** (`gate on cp.multiSelect`). `[23]`/`[28]` are explicitly about
   multi-select; showing every distractor's feedback on single-select DELEGATE/SCOPE/VERIFY is a
   separate pedagogical call nobody asked for.

**Tests.** Flip the negative assertions at `DecisionScenario.test.tsx:177` and `:183`
(`queryByText(/Audience framing shapes the tone/)).not.toBeInTheDocument()`) to positive; re-check
the `getAllByText('Your choice')).toHaveLength(5)` count at `:245`.

#### W3.4 — Retake — reverses a documented, thrice-tested invariant
**change_type:** needs-decision · **effort:** M · **comments:** [21] [23] [24] [25] [26]
**depends on:** W3.3 (decide that first)

Immutability is deliberate: the header comment (`:26-28`) states the choice is immutable once
revealed and "Previous re-reads completed checkpoints … but never re-answers", and three tests
assert it (`DecisionScenario.test.tsx:139-154`, `:156-184`, `:198-218`). **See Decision 7 for the
options and recommendation.** Implementation notes either way:

- **Option A (per-checkpoint, where Sarah anchored):** render a secondary button after `a.revealed`
  calling `setAnswer(index, { selected: [], revealed: false })`; delete the `revealed` guards in
  `choose()` (`:77`) and `toggle()` (`:83`); rewrite the header comment and `types.ts:741-743`.
  Transcript records the *final* answer only.
- **Option B (whole-scenario, from the finished screen):** reset `answers`/`step`/`finished`/`saved`.
  **Must** withhold the button while `saving` — copy the DATA-04 guard and comment from
  `DelegationSort.tsx:172-197`. **Must** clear `saved` or `recordRun`'s `if (saving || saved) return`
  (`:101`) silently no-ops. A second finish appends a second `lab_submissions` row and re-emits
  participation — safe: `useProgress.ts:318` short-circuits re-completion ("navigation only — no
  second write"), and nothing reads these transcripts
  (`src/components/progress/ProgressPanels.tsx:134`: "badges only — no transcript reading").

**Interaction with W3.3.** Once every option's feedback is on screen, retaking a multi-select is
answer-copying, not learning. Sarah half-anticipates this ("Although I think it is less relevant for
this one").

#### W3.5 — Optional config additions (`contextMd`, option `verdict`)
**change_type:** schema-type · **effort:** M · **depends on:** W3.1, W3.3 · **only if fallbacks judged insufficient**

1. `types.ts`: `contextMd?: string` on `DecisionScenarioConfig` (after `introMd`, ~`:754`);
   optionally `verdict?: 'best' | 'risky' | 'avoid'` on `DecisionOption` (~`:717`) for a correctness
   chip.
2. Mirror optional checks into **both** validators — `labValidation.ts:464-495` and
   `admin-content-core.ts:644-675`. They are line-for-line copies; keep them so. Both already pass
   unknown extras through (`admin-content-core.ts:352-354`), so this is house-style rigor rather
   than a functional requirement.
3. Test cases in `labValidation.test.ts` (extend `:80-107`) and the Deno-side core test.
4. **No `LabEditor.tsx` change:** decision-scenario is not in `FORM_LAB_KINDS`
   (`labValidation.ts:48` = `['reflection','failure-log','paired-calibration']`), so the CMS edits
   it as validated raw JSON.

**Risk.** If Decision 1 replaces the Marina delivery scenario outright, any `contextMd` authored for
`c1-w34-walk-the-workflow-delivery` is wasted. **Land the code (W3.1–W3.3) first; author content
once the scenario is settled.**

---

### WS-4 — Scenario duplication `[17]` `[18]` (gates the Week 2 rewrite)

**Sarah is right, and it is worse than "same domain" — it is literally the same fictional incident,
task, deliverable, and grounding source.** Week 2's `body_md` (`course1-content.json:113`) and
`panes[1].sourceMd` (`:125`) embed "Meridian State Department of Labor — Policy Bulletin 26-04 —
Change to how claimants report part-time earnings"; Weeks 3–4 `introMd` (`:166`) is "Marina … a state
unemployment-insurance claimant portal. A benefit rule just changed: how claimants report part-time
earnings … the claimant notification email." Week 2's suggested prompts and Weeks 3–4's SCOPE best
option (`:228`) are near-restatements of each other.

**Sarah's own tracked changes make it worse.** Para 291 inserts into Week 2: "Your task: You're
responsible for writing an email that will go to claimants explaining the policy change and you've
decided to delegate to AI" — verbatim Marina's job, and "you've decided to delegate" pre-resolves
Marina's DELEGATE checkpoint.

**Prior art:** `docs/brainstorms/cohort-program-restructure-requirements.md:121-123` (R12) already
registered "a third, eng-specific delivery scenario is desirable".

#### W4.1 — Decide which lesson re-scenarios + pick the eng premise
**change_type:** needs-decision · **effort:** S · **See Decision 1.**

Shortlist of eng-flavored, low-technicality client-delivery premises that map onto the existing
4-checkpoint spine: (1) plain-language release notes + runbook update for an agency deploy;
(2) a post-incident summary for a non-technical agency contact; (3) converting a legacy integration
guide for a partner agency. Options 1 and 2 give natural GROUND sources: public vendor/API docs
(safe), the internal runbook (safe), production logs containing claimant PII (do-not-put-in), the
`#incident` channel (risky/noisy). Must avoid **both** unemployment-insurance/claimant-portal
(Week 2) and benefits-enrollment/guide-rewrite (Devon, `course1-content.json:277`).

#### W4.2 — Author the replacement scenario
**change_type:** content-data · **effort:** L · **depends on:** W4.1, W3.5

Replace `introMd` (`:166`), all four checkpoints (`:167-257`), and `closingMd` (`:258`). **Preserve
`cell_id`, `week`, `week_sort_order`, `sort_order`, `dimension`, `evidence_type`, `type`** so
membership and existing progress survive.

**Re-skin the existing spine, don't invent a shape.** The delivery and general scenarios are already
structurally identical (compare `:167-257` with `:278-368`): DELEGATE = 3 options (full-AI /
AI-assisted-human-owns [best] / no-AI) → GROUND = `multiSelect: true`, 4 sources (2 safe, 1
unreliable, 1 sensitive-or-noisy) → SCOPE = 3 options (polluted long-running chat / one broad ask /
fresh chat + chunking [best]) → VERIFY = 4 options (disclaimer / skim-and-defer / own step-by-step
check [best] / scrap-everything). Roughly 14 option feedbacks + 4 `setupMd` beats + intro + closing.

**No code change needed** — `DecisionScenarioConfig` (`types.ts:749-759`) imposes no cap on
checkpoints or options; the validator (`labValidation.ts:463-496`) requires non-empty `introMd` and
≥1 checkpoint with `id` / `phase ∈ delegate|ground|scope|verify` / `setupMd` / `prompt` / ≥2 options
of `{text, feedbackMd}`. Weeks 3–4 is exempt from the pre-reveal rule, so "LLM" is permitted (the
current copy uses it at `:192`).

**Risk.** ~2,500 words of pedagogically load-bearing copy. The GROUND checkpoint must keep exactly
one clearly-sensitive and one merely-unreliable source or the multi-select teaching point (and W3.3)
collapses.

#### W4.3 — Update every cross-reference
**change_type:** content-data · **effort:** S · **depends on:** W4.2

Three content locations name the sibling by title and must move together:
`course1-content.json:147` (pod-kickoff Activity 2 bullets — **also rewritten by para 361 in W2.3
and by `[16]` in W6.2; coordinate so `:147` isn't edited three times**), `:161` (delivery's own
body pointer), `:272` (general's mirrored pointer back). Plus:

- `e2e/21-enrollment-visibility.spec.ts:100` asserts `/Marina is a content strategist/` against the
  real seeded config — **must be updated or e2e breaks.** (`:92` also asserts the Week 2 pane labels
  `'Without source material'` / `'With source material'`, which W5 removes.)
- `scripts/generate-course1-seed.mjs:131` — the header comment string "the 'Walk the Workflow'
  Marina delivery scenario" is emitted verbatim into the regenerated migration.
- **No change needed** in `DecisionScenario.test.tsx:34-80`, `labValidation.test.ts:83-88`, or
  `admin-content-core.test.ts:246-251` — those use their own inline "Marina" fixtures unconnected to
  the seed.
- Leave `docs/plans/…-cohort-program-restructure-plan.md:640` and
  `docs/brainstorms/…requirements.md:122` alone — they record what was built.

#### W4.4 — GAP: mirror the answer-key feedback pattern onto the delivery scenario
**change_type:** content-data · **effort:** M · **depends on:** W4.1

**Recorded so nobody reads "zero tracked changes" as "no work needed."** The delivery scenario
carries nine comments (`[17]`–`[25]`) and not one tracked change — Sarah commented on it and did her
line-editing on the *general* scenario instead. The pattern she established there via paras
509/548/550/565/567/571 (every non-best option's `feedbackMd` also names the correct answer) must be
authored **by hand** for the delivery scenario. Nothing in the docx supplies that text.

**Sequence after Decision 1** — if the delivery scenario is replaced wholesale, mirroring the
pattern onto the current Marina text is wasted effort.

---

### WS-5 — Week 2 Ground & Scope rewrite `[6]`–`[15]` (largest and last)

This is one module row absorbing: a body rewrite, a schema change, a component change, four
re-authored prompts with authored weaknesses, and a whole second example. It is also the row that
`[17]`/`[18]` may re-scenario. **Do not start authoring until Decisions 1, 5 and 6 are settled.**

#### W5.1 — Decide: tabbed examples vs. two module rows
**change_type:** needs-decision · **effort:** S · **comments:** [6] [15] [16] · **See Decision 5.**

A module row carries exactly one `lab_config_json` and `ModuleRenderer.tsx:232-235` renders exactly
one exercise, so Example 1 + Example 2 cannot coexist in `c1-w2-ground-and-scope` as-is.

#### W5.2 — Extend the chat-compare schema + both validators in lockstep
**change_type:** schema-type · **effort:** S–M · **comments:** [6] [7] [8] [9]
**Land this BEFORE the component work** so the CMS can accept the new config. **See Decision 6 for
the extend-in-place vs new-union-member disagreement.**

Fields needed regardless of which shape wins:
- `promptMode?: 'shared' | 'per-pane'` (default `'shared'` — keeps `c1-w1-same-prompt-3x` and
  `c1-w1-confidently-wrong` and `e2e/20-chat-compare.spec.ts:33/:59/:91` untouched).
- `groundingSourceMd?: string` at config level (keeping `ChatComparePane.sourceMd`,
  `types.ts:678-679`, for Week 1 back-compat) — the bulletin currently appears **twice** in the
  seed row (`body_md` "## Source material" and `panes[1].sourceMd`); this is the moment to make it
  one authored copy.
- `suggestedPrompts` widened from `string[]` (`types.ts:703`) to
  `Array<string | { text: string; usesSource?: boolean }>` — a union keeps every existing config
  valid. Sarah's paras 316/317/318 all say "Reference only the attached policy bulletin"
  (`usesSource: true`); para 315 does not (`usesSource: false`) — which *is* the grounding contrast
  the activity teaches.

Mirror **identically** into `src/lib/labValidation.ts:439-458` and
`supabase/functions/admin-content/admin-content-core.ts:619-638` — the second is the server-side gate
on CMS publish; drift means a config that passes in-browser and 400s on publish. Add cases to both
test files (`admin-content-core.test.ts:213-238` has the existing chat-compare block). Add one shared
`normalizeSuggestedPrompts()` helper rather than inlining the union check at each use site. No
`LabEditor.tsx` change (chat-compare is absent from `FORM_LAB_KINDS`, `labValidation.ts:48`).

#### W5.3 — Component: per-pane prompts, numbered chips, dynamic labels, prompt-level grounding
**change_type:** component-code · **effort:** L · **comments:** [6] [7] [8] [9] · **depends on:** W5.2

**Confirmed not implemented today.** One shared textarea — `const [prompt, setPrompt] = useState('')`
at `ChatCompare.tsx:97`, label "Your prompt — every pane gets the same one" (`:285`), fanned to all
panes by `handleSubmit` (`:203-205`). `paneLabel()` (`:47-49`) returns `pane.label ?? 'Response N'`
— purely static. Chips (`:262-280`) render the raw prompt string with no numbering.
`buildPaneUserContent` (`:55-58`) prepends `pane.sourceMd` **unconditionally**.

**Ship as ONE component PR.** `[6]`, `[7]`, `[8]` and `[9]` all rewrite the same seam
(prompt state → `runPane` → `buildPaneUserContent` → pane heading). Three sequential PRs means three
rewrites and three rounds of test churn.

1. **Per-pane prompts (`[6]`):** `prompts: string[]` state; in `'shared'` mode mirror index 0 to
   every pane so the existing single-textarea path is byte-identical. `activePromptRef` (`:113`)
   becomes an array so pane-local Retry (`:239-241`) re-asks *that* pane's submitted prompt.
2. **Numbered chips (`[8]`):** render an ordinal badge derived from the array index, **never baked
   into the prompt string** — a baked "1. " would be sent to Claude via `buildPaneUserContent` and
   pollute the transcript at `:225`. Change `key={s}` (`:270`) → `key={i}`: the four new prompts are
   near-identical variants and will collide. The chips are also much longer now; the flex-wrap pill
   row (`:267`) likely needs to become a stacked list.
3. **Dynamic pane headings (`[7]`):** track `selectedPromptIdx: (number|null)[]`, set on chip apply,
   **cleared to null the moment the learner edits that pane's textarea** so the heading never lies.
   Freeze the heading to the *submitted* selection (mirroring `activePromptRef`) rather than the
   live one, so it can't change mid-stream. Keep `pane.label` as an optional override so Week 1 is
   unaffected. Delete the `'Without source material'` / `'With source material'` labels from the
   seed row.
4. **Prompt-level grounding (`[9]`):** rewrite `buildPaneUserContent` to take a resolved
   `source: string | undefined` decided by the caller from the pane's selected prompt. Render an
   honest per-pane indicator ("Grounding source attached") — today `sourceMd` is never shown at all.
   **Do not** use marker-phrase detection on typed prompts; see Decision 6b.
5. **Copy that currently asserts the opposite** and must change together: default subtitle
   (`:93-95` "One prompt, every pane."), input label (`:284-286`), `aria-label` (`:293`), the file
   header (`:13-27`), the type doc (`types.ts:683-693`).
6. **Transcript:** `:225` records one `prompt` for the whole run. Add per-pane `{promptIdx,
   promptText, groundingUsed}` to `PaneResult` (`:87`). Safe — `src/lib/progress.ts:335` types
   transcripts `unknown` and `ProgressPanels.tsx:134` reads badges only.

**Tests.** `ChatCompare.test.tsx` `submitPrompt` helper (~`:73-79`) targets
`getByLabelText(/Your prompt for every pane/i)`; the transcript assertion (`:120-135`) pins the
single-`prompt` shape. `e2e/20-chat-compare.spec.ts` survives **only** if `'shared'` stays the
default. `e2e/21-enrollment-visibility.spec.ts:92-93` dies and must be retargeted.

#### W5.4 — Rewrite `body_md` (neutral setup)
**change_type:** content-data · **effort:** S · **comment:** [6] · **depends on:** W5.1

Replace ¶2 (`course1-content.json:113`, "This activity is about the first habit — **grounding**…")
with para 271 verbatim; keep the untouched opening line. Rename `## Source material` → `## Example 1:
Meridian State Department of Labor` (para 272); replace the framing sentence with para 273. Leave the
Bulletin 26-04 blockquote as-is (or move it into config under Decision 5 option A, where it becomes
one authored copy instead of two).

**Flag:** para 271 silently deletes the only in-course pointer to the
`custom-reusing-context-claude-projects` resource lesson. Confirm that's intended. **Paras 271/272
forward-reference an Example 2 that does not exist — they must ship with W5.6 or with interim
wording.**

#### W5.5 — Rebuild the Example 1 exercise config
**change_type:** content-data · **effort:** M · **comments:** [8] [10] [11] [12] [13] [14]
**depends on:** W5.2, W5.3

- `subtitle` = "Same task, two ways." (para 289).
- `introMd` = para 291 + para 293 **with the missing paragraph break restored**.
- `sources.meridianBulletin` = the existing `panes[1].sourceMd` string (`:125`), stored **once**.
- `suggestedPrompts` = paras 315–318 verbatim, numbered 1–4. #1 gets **no** source (it never says
  "attached"); #2/#3/#4 get the bulletin — that is what makes `[9]` work.
- **Authored weaknesses `[10]`–`[13]`.** These are *sketches in comment text*, not replacement copy;
  no prose exists. The house pattern for steering Claude is `ChatComparePane.systemPromptMd`
  (`types.ts:676-677` → `StreamOptions.system` at `ChatCompare.tsx:167`), already used by
  `c1-w1-confidently-wrong` with an explicit "sanctioned training simulation" framing. Author a
  per-prompt `systemPromptMd` for #1 (wrong audience + over-complex language + fabricated
  "internet sources" detail), #2 (dense paragraph prose, changes only, effective date and other
  critical context omitted), #4 (bare numbers-and-definitions, no connective email language).
  **#3 gets no rig** — it is the intended "most correct" (`[10]`).
- `reflectionMd`: keep Q1–Q3 (Sarah's diff leaves them untouched), append para 327 as Q4 with `?`,
  **delete** the "Keep in mind: Grounding lowers the odds…" block (para 329 = `[14]`), and close with
  para 331.

**Two risks worth surfacing to L&D.** (a) Without a rig the weaknesses are probabilistic, not
"evident" as `[10]` requires; with a rig you are deliberately instructing Claude to produce a poor
answer (and for #1, to fabricate) — acceptable per the `c1-w1-confidently-wrong` precedent, but it
needs explicit sign-off. Over-rigging inverts the lesson by making prompt quality look irrelevant.
(b) **Sarah did not edit reflection Q2/Q3** (`docs/content/content-review.md:355-356`). Q3 — "What
was different about **what each pane had to work from**" — becomes factually wrong once both panes
run learner-chosen prompts. Rewrite it or flag it.

**Also confirm with Sarah:** her `[12]` sentence is garbled — "comes is paragraph format that's
organized in a way that makes sense for a quick read" almost certainly means *not* organized for a
quick read.

#### W5.6 — Author Example 2 — non-delivery Slack post `[15]`
**change_type:** content-data · **effort:** L · **depends on:** W5.1, W5.3

Nothing exists beyond Sarah's placeholder heading (para 333). 100% net-new copy mirroring Example 1:
neutral "Your task: …" setup; a short fictional grounding source (an internal event brief with
date/time/audience/registration link/speakers, labelled fictional and safe, same framing as para
273); four numbered prompt variants echoing the progression (#1 vague/ungrounded, #2 grounded but
wrongly scoped for the channel, #3 intended best, #4 grounded but wrong output shape); matching rigs
for #1/#2/#4; parallel reflection questions ending in the same "which prompt is best for your task"
discussion question.

**Under Decision 5 option B** this becomes a new row: `cell_id` `c1-w2-ground-and-scope-slack`,
`origin='course'`, `visibility='program'`, `type='lab'`, `dimension: ['Description','Diligence']`,
`evidence_type='performance-task'`, `week='week2'`, and a `sort_order` in the free band (**not 903
— that value is already duplicated** between `c1-w2-ground-and-scope` and
`c1-w1-lookup-vs-predict`; use e.g. 922). Membership is emitted automatically
(`generate-course1-seed.mjs:116-119`), but **a new row does not reach any deployed DB** via the
existing migration — it needs its own dated INSERT (W0.3).

**Open question.** Is "Slack post announcing a team presentation" the right scenario, or does Sarah
want something else ("or something else!")? Does Example 2 need source material at all, or is it
deliberately source-free to contrast with Example 1?

#### W5.7 — Test updates for the Week 2 rewrite
**change_type:** component-code · **effort:** S · **depends on:** W5.3, W5.5, W5.6

- `e2e/21-enrollment-visibility.spec.ts:92-93` asserts the literal `'Without source material'` /
  `'With source material'` pane labels — both strings disappear. Retarget. Note the spec locates the
  lab by `page.locator('#chat-compare')`; decide whether the container id changes.
- `src/lib/courseStructure.integration.test.ts:170-183` pins exact week→cell_id membership — adding
  an Example 2 row under option B requires a new entry (and W1.1 removes two). **Coordinate.**
- Add component tests for per-pane inputs, prompt-level grounding attach/skip (`[9]`), numbered pane
  labels, and per-prompt system-prompt pass-through.

**Risk.** e2e is not wired into CI (per CLAUDE.md), so a stale assertion fails silently until
someone runs Playwright on a freshly reset DB. `courseStructure.integration.test.ts` is DB-gated and
skips locally.

---

### WS-6 — Navigation `[16]`

#### W6.1 — Already done: the three lessons are already adjacent and correctly ordered
**change_type:** already-done · **effort:** S

Verified at `supabase/migrations/20260715040000_seed_course1_content.sql:1040-1042`. Report this to
Sarah so nobody does a pointless reorder migration. Frame the options below as "how much visual
hierarchy do you want to buy", not "can we reorder these".

Also note: **there is no lesson-level nesting anywhere and no tab UI in the learner shell.** The
sidebar renders exactly three fixed levels and stops — course title (`Sidebar.tsx:273-277`), week
header (`:144-169`), then a **flat** `section.modules.map(renderModuleRow)` (`:172`).
`renderModuleRow` (`:104-142`) takes only a `Module`; no depth/parent parameter. The data model is
flat by construction: `CurriculumSection.modules: Module[]` (`types.ts:141-146`),
`course_week_modules` has `primary key (week_id, cell_id)` + `unique (cell_id)` and **no parent
column** (`20260715000000_course_structure.sql:153-160`). And markdown links can't jump to a lesson:
`LessonMarkdown.tsx:12` is a bare ReactMarkdown with no custom `a` renderer, and there is no router
or hash navigation in the app — selection is local state via `selectModule` (`App.tsx:197-210`).

#### W6.2 — Cheapest fix (recommended first): titles + prose, zero code
**change_type:** content-data · **effort:** S · **depends on:** W4.3 (same `:147` paragraph)

Course-origin sidebar rows render `module.title` and nothing else (`Sidebar.tsx:132-134`; the
numeric id chip at `:129-131` is matrix-only). So the title *is* the lever.

1. Retitle both scenarios so the parent activity leads: e.g. "Activity 2 · Option A — Delivery
   Scenario" / "Activity 2 · Option B — General Operations Scenario". Keep them short — the row
   truncates (`Sidebar.tsx:132`).
2. Optionally retitle pod-kickoff per para 337 (W2.3) so the group reads Meeting 1 / Activity 2
   Option A / Activity 2 Option B / Meeting 2.
3. Rewrite the Activity 2 body to apply para 361 **and** make the pointer unambiguous, e.g. "Pick ONE
   of the two lessons directly below this one in the sidebar…" — this is also the fix for para 361's
   nonexistent "tab".

**Risk.** Titles echo in the Header breadcrumb (`Header.tsx:49`), ModulePager Next/Previous
(`ModulePager.tsx:44,63`) and My Progress. They are display-only — no id change, so progress,
`lab_submissions` and membership are untouched. Grep e2e/unit fixtures for the old titles.

#### W6.3 — Optional: true one-level nesting (`parent_cell_id` + indented sidebar rows)
**change_type:** schema-type · **effort:** M · **only if W6.2 is judged insufficient**

1. New migration: `alter table public.course_week_modules add column if not exists parent_cell_id
   text;` with a composite FK `(week_id, parent_cell_id) references course_week_modules (week_id,
   cell_id) on delete set null` — leaning on the existing PK to guarantee same-week parents. Depth-1
   cannot be expressed in a CHECK; enforce via trigger or in `admin-courses` validation.
2. `parentCellId` on `CourseWeekModule` (`types.ts:123-128`), `parentId?` on `Module`. **Keep
   `CurriculumSection.modules` FLAT.** That single decision is what keeps `App.tsx:103-104`,
   `ModulePager`, sidebar counts and `courseWeekProgress.ts` working untouched.
3. Read path: add the column to the select (`modules.ts:321`), map it (`:359-366` — nullable, so it
   must **not** go in the required-string list at `:360`), stamp `parentId` in `groupCurriculum`
   (`:223-256`).
4. Sidebar: `renderModuleRow(mod, depth: 0|1)`; at depth 1 add `ml-4 pl-3 border-l` and a lighter
   weight; replace the flat map at `:172` with a two-pass parent→children render. Leave every count
   untouched. Optional: insert the parent title into the breadcrumb (`Header.tsx:44-51`).
5. **CMS write path is not free:** the structure tables have no client write policy ("writes are
   service_role only", `course_structure.sql:176-179`), so a settable parent needs a new action in
   `admin-courses/index.ts` (alongside `assign_module` at `:132-187`), its core validation, a wrapper
   in `adminCourses.ts:26-79`, and a control in `CourseManagement.tsx:258`. Budget as a separate M.

**Accessibility.** The section panel (`Sidebar.tsx:170-174`) is a plain div of buttons. Either keep
it flat for AT and rely on the breadcrumb, or promote to `ul > li > ul`. **Do not** add `aria-level`
to buttons without a `listitem`/`treeitem` role.

#### W6.4 — Investigate: "choose one scenario" makes Weeks 3–4 impossible to complete
**change_type:** investigation · **effort:** S · **live today, independent of `[16]`**

Activity 2 says "choose one" scenario, but **both** count toward Weeks 3–4. `currentWeek` only
advances when `completedCount === totalCount` (`courseWeekProgress.ts:46-53`) and `totalCount` is the
raw member count (`:29-30`), so a learner who follows the instruction can never show Weeks 3–4
complete, and overall % (`App.tsx:268`) is permanently short by one module. The sidebar badge
(`Sidebar.tsx:162`) reads 3/4 forever.

Confirm against a live stack, check whether any other week has a "pick one of N" shape, then take it
to product. **See Decision 12.**

---

### WS-7 — Resources `[0]` `[1]` `[2]`

"The Resources section" = **"Resources & additional lessons"** — `RESOURCES_META` at
`src/lib/modules.ts:60-66`, built in `groupCurriculum` (`:265-270`) from `origin === 'custom'` rows
not assigned to a visible week; renders only when ≥1 exists (`:268`); last in nav order. Five custom
lessons populate it today (`course1-content.json:387, 401, 415, 429, 443`; `sort_order` 950–954), all
`week: null`, `origin: 'custom'`, `visibility: 'public'`, `type: 'content'`.

**Nothing Sarah asks for is implemented** — `[0]`–`[2]` are a content-sourcing request with no
existing rows. What *is* in place is the delivery mechanism and five precedent lessons.

#### W7.1 — Human curation gate
**change_type:** needs-decision · **effort:** S · **blocks W7.2**

No agent should pick which third-party Claude/prompting videos Nava endorses. L&D must produce two
vetted lists (Claude training; prompting), each entry with title, canonical URL, publisher
(Anthropic-official vs third-party), format, runtime, and a one-line "why this one / who it's for"
annotation — the existing custom lessons are annotated prose, not bare URLs
(`course1-content.json:387-454` is the house style).

Constraints for the curator: prefer YouTube if an embed is ever wanted (`ModuleRenderer.tsx:63-66`
only extracts ids from `youtube.com/watch?v=` and `youtu.be/`; everything else is iframed verbatim at
`:345-354` and will render blank under `X-Frame-Options`); links must be publicly reachable without
login (the section is `visibility='public'`); flag anything version-specific for re-check, because
Claude's UI churns.

#### W7.2 — Seed the new custom resource lessons
**change_type:** content-data · **effort:** M · **depends on:** W7.1

Add module objects copying the shape at `course1-content.json:387-454`: `cell_id`
`custom-claude-training-videos` / `custom-prompting-resources`, `week: null`,
`week_sort_order: null` (the generator throws if a custom row carries a week,
`generate-course1-seed.mjs:76-78`), `origin: 'custom'`, `visibility: 'public'`, `type: 'content'`,
`dimension: []`, `evidence_type: 'reflection'`, `sort_order` 955/956. `body_md` = a framing paragraph
plus `##` sections of annotated markdown links. Cross-link to each other and to
`custom-how-claude-works-tokens` in house style. Then `node scripts/generate-course1-seed.mjs` and
`npx supabase db reset` to verify.

**Do NOT author these through the admin CMS.** `docs/content-guide.md:68-69`: custom lessons are not
seeded, so a `supabase db reset` removes them — and CLAUDE.md requires a reset before every e2e run.

#### W7.3 — Dated migration so the new lessons reach the deployed DB
**change_type:** ops-migration · **effort:** S · **depends on:** W7.2

`20260715040000` is already applied and will not re-run. Add e.g.
`supabase/migrations/20260810000000_seed_resource_lessons.sql` with the same
`insert … on conflict (cell_id) do nothing` statements the generator emitted, header modelled on
`20260727000000_…sql:1-10`. **Use INSERT…DO NOTHING, never UPDATE** — new `cell_id`s have no CMS
history, so DO NOTHING is DATA-04-safe. On a fresh reset both run and the second no-ops, so fresh and
deployed converge. Verify by running `npx supabase db reset` twice.

**Forgetting this is the silent-failure mode:** the lessons work locally and never appear in prod.

#### W7.4 — Resolve the dead `Module.resources[]` field
**change_type:** schema-type · **effort:** M · **recommendation: DELETE**

`Module.resources?: { title: string; url: string }[]` is declared at `src/types.ts:67` (verified) and
rendered as a "Deep Dive Resources" grid at `ModuleRenderer.tsx:389-410`, but **nothing populates
it**: `mapRowToModule` (`modules.ts:167-193`) never sets it, there is no `resources` column in
`MODULE_COLUMNS` (`modules.ts:99-100`) or any migration, `DraftFields` lacks it
(`adminContent.ts:20-28`), and the generator doesn't emit it. **`docs/content-guide.md:118-119`
documents it as usable — that line is stale.**

- **Fork A (recommended):** remove the field, the render block, and the stale doc bullet. Zero
  learner-visible change. Check whether the `Library`/`ExternalLink` lucide imports are used
  elsewhere in `ModuleRenderer.tsx` before removing (strict `noUnusedLocals`).
- **Fork B (wire it up):** nullable `resources_json jsonb` column + `MODULE_COLUMNS` + `ModuleRow` +
  `mapRowToModule` with a shape check in `assertModuleRow` (`modules.ts:109-160` house pattern) +
  both validators + a CMS surface + generator support. **Do not choose B merely to satisfy
  `[1]`/`[2]`** — a markdown link list in `body_md` gives the same learner experience.

**Also optional:** `video_url` is a *single* nullable column (`modules.ts:82`), so it cannot represent
"videos/tutorials" plural, and setting it **replaces the lesson title banner**
(`ModuleRenderer.tsx:345-362`). Default recommendation: skip embedding; use a link list.

---

## 3. Where the researchers disagreed (stated plainly)

1. **Week 2 chat-compare mechanism.** The `chat-compare-ui` researcher recommends extending
   `ChatCompareConfig` additively with `promptMode`; the `ground-scope-rewrite` researcher
   recommends a **new union member** (`prompt-compare`) per CLAUDE.md's additive convention, leaving
   `chat-compare` untouched. Both agree Week 1 must not regress. → **Decision 6.**
2. **What `[16]` means.** The `navigation-subtabs` researcher reads Sarah's own para 361 ("go to the
   relevant tab") as meaning "sidebar lesson row" and recommends titles + optional nesting; the
   `ground-scope-rewrite` and `scenario-duplication` researchers see a tabbed-examples mechanism
   solving `[15]` and `[16]` together. → **Decision 8.**
3. **Retake semantics.** `decision-scenario-ui` presents Option A (per-checkpoint, matching where
   Sarah anchored) and Option B (whole-scenario from the finished screen) as composable but distinct;
   no researcher picked one unilaterally. → **Decision 7.**
4. **Delete vs archive.** `lesson-deletion` and `write-path` both recommend **archive**;
   `tracked-changes-map` proposed a hard `delete from public.modules`. Archive wins — hard delete
   cascades `content_versions`. → **Decision 2.**
5. **Scope of W3.3.** `decision-scenario-ui` recommends multi-select only; the tracked-change pattern
   Sarah applied to the *general* scenario (509/548/550/565/567/571) implies she wants the "here's
   the right answer" signal on single-select too, just as prose. Both are defensible; W3.3 gates on
   `cp.multiSelect` and W2.4 delivers the prose.
6. **DATA-04 naming trap.** `docs/content-guide.md:58-61` calls seed-vs-DB drift the "DATA-04 drift
   class", but `DATA-04` in `docs/DEBT-REPORT.md:148` is an unrelated exercises bug. The id is
   reused — don't chase the wrong ledger entry.

---

## 4. Decisions needed from a human before execution

**1. Which lesson gets the new scenario? (`[17]` `[18]`)**
Options: (a) rewrite Weeks 3–4 delivery, keep Meridian in Week 2; (b) rewrite Week 2; (c) rewrite
both; (d) add an eng scenario as a *third* sibling; (e) do neither and reframe the reuse as a
deliberate callback.
**Recommend (a).** Sarah's own tracked changes have already re-authored Week 2 *around* Meridian
(paras 272/273/291/315–318) and comments `[10]`–`[13]` design weaknesses against those exact
Meridian prompts — changing Week 2 discards that work and orphans four comments. R12
(`cohort-program-restructure-requirements.md:121-123`) already registered a desire for an
eng-specific delivery scenario. Week 2 needs a short number-verifiable source artifact and the
bulletin is purpose-built; the decision-scenario never shows source text, so re-skinning it needs no
new artifact. And Week 2 is already carrying `[6]`–`[15]`. **(c) is over-scoped; (d) leaves the
duplication intact and worsens `[16]`.** Also needs: which eng premise, and what "not too technical"
means.

**2. Archive or hard-delete `c1-w1-lookup-vs-predict` and `c1-w2-delegation-sort`? (`[4]` `[5]`)**
**Recommend ARCHIVE** (unassign → `archived_at`). Hard delete cascades `content_versions`
(`20260602130334_…sql:50-58`), destroying CMS history irreversibly; `docs/content-guide.md:30` and
`20260618000000_…sql:32-33` both state nothing is hard-deleted; archive is reversible mid-pilot with
a one-line `archived_at = null`. Sarah says "completely deleted" but she is describing the learner
view, not the data model — confirm. **Sub-decision:** should the two lab *kinds* also be removed from
the CMS lab-kind picker (`LAB_KINDS` / `LAB_KIND_LABELS`) so nobody authors a new lesson using a
pattern L&D just retired, even though the components stay (W1.4)?

**3. Write path + CMS drift.** Has any of the 8 cells been published through the admin CMS on
staging/prod since 2026-07-29? Local shows zero drift; deployed is unverified. Choose the standing
channel for Course-1 content edits: (a) **seed JSON + one dated UPDATE migration** (reaches every env
deterministically, but clobbers CMS edits by construction); (b) CMS publish (no drift, but the next
`db reset` reverts it and breaks e2e unless the JSON is back-ported in the same PR).
**Recommend (a), gated on the W0.1 audit** — fold any legitimate CMS wording into the JSON before
emitting the UPDATE. Also decide whether the generator should ever emit `do update set` (W0.3's open
question). Note chat-compare and decision-scenario have **no structured CMS form** (`LabEditor.tsx:24-33`,
`:47-70`) — L&D cannot self-serve these edits either way.

**4. Does learner progress reset on the rewritten Week 2 lab?**
Mechanics: `progress_reset_at` is minted **inside the Edge Function** (`admin-content/index.ts:190`),
so a migration-based edit resets **nothing**; to reset from SQL you must replicate the ordering in one
transaction (`update modules set progress_reset_at = now()` then
`delete from module_progress where module_id = … and (reset_epoch is null or reset_epoch < <epoch>)`,
per `20260715050000_progress_reset_epoch.sql:41-94`). Reset deletes `module_progress` only, never
`lab_submissions` (`index.ts:209-213`).
**Recommend: check the deployed per-cell completion count first (W0.1), and reset only if > 0 and
only for `c1-w2-ground-and-scope` and any swapped Walk-the-Workflow scenario.** Locally there are
zero `module_progress` rows for any `c1-*` cell, consistent with the pilot not having started — in
which case reset is a no-op that only fires a spurious "progress was reset" notice. **Never** reset
for cosmetic prose (WS-2) or for the Submit/Retake affordances.

**5. Week 2 Example 2: tabbed examples or a second module row? (`[6]` `[15]`)**
Options: (A) one lesson, config-level `examples[]` + tab strip — matches Sarah's paras 271/272/333
literally and is the same affordance `[16]` asks for; (B) a second module row
(`c1-w2-ground-and-scope-slack`) — zero extra component work, but produces two sidebar siblings, the
exact UX she flagged as confusing in `[16]`.
**Recommend (A)** — it resolves `[15]` and `[16]` with one mechanism. If (A): does each tab record its
own `lab_submissions` row, and does completing either count as participation? If (B): where does the
row sit in Week 2 order after the W1.1 renumber?

**6. chat-compare: extend in place, or a new `prompt-compare` union member?**
(a) `promptMode?: 'shared' | 'per-pane'` on `ChatCompareConfig`, default `'shared'` — smallest diff,
keeps one component, but a widely-shared component grows a mode. (b) A new union member + new
`ModuleRenderer` case + a cloned component — matches CLAUDE.md's additive convention and leaves Week
1 provably untouched, but duplicates ~150 lines of subtle abort/generation-counter logic (the FIX B-1
/ B-2 comments at `ChatCompare.tsx:111-121`); a careless copy reintroduces fixed bugs.
**Recommend (a)** — the default-`'shared'` escape hatch gives the same safety without the duplication,
and duplicating the streaming machinery is the larger real risk.
**6b. Sub-decision (`[9]`, pedagogy not engineering):** when a learner writes their *own* prompt, does
the pane get the bulletin? Options: an explicit per-pane "attach the source material" checkbox (most
honest and most teachable — **recommended**); never, unless a suggested prompt is selected; or
marker-phrase detection (**not recommended** — teaches a magic incantation). Do **not** always attach
with a system-prompt instruction to ignore it: the model complies inconsistently and the Week 2
contrast becomes non-deterministic in a live cohort.

**7. Retake: per-checkpoint, whole-scenario, or both? (`[21]` `[23]`–`[26]`)**
Option A reverses a deliberate, thrice-tested immutability invariant chosen so the recorded transcript
reflects a pod's real first instinct — arguably the pedagogical point of a discussion activity.
Option B preserves it within a run.
**Recommend A for `[21]`/`[24]`/`[25]` (that is literally where the comments sit), plus B if pods want
a clean second pass — they compose.** Decide W3.3 first: once every option's feedback is on screen,
per-checkpoint retake on the GROUND checkpoints is answer-copying, and Sarah herself hedged ("less
relevant for this one"). If A: does the transcript capture only the final answer or full attempt
history? Should retaking via Previous be allowed?

**8. `[16]`: how much navigation hierarchy to buy?**
(a) Titles + prose only, zero code (W6.2); (b) + `parent_cell_id` and indented sidebar rows (W6.3);
(c) merge both scenarios into one lesson with in-lesson tabs.
**Recommend (a) first, (b) if insufficient. (c) is rejected unless explicitly directed** — it destroys
per-scenario submission attribution (`DecisionScenario.tsx:109` writes one row keyed on the module),
shifts Weeks 3–4 denominators 4→3 mid-cohort, and collides head-on with WS-3 and WS-4 on the same
component and the same two config blobs. Sarah's own para 361 says "go to the relevant tab", which
reads as two destinations — i.e. the sidebar interpretation. Confirm before anyone touches
`DecisionScenario`.

**9. Para 518 vs 534 — is removing the PII detail deliberate?**
518 deletes "mixed in with individual employees' names and personal situations" from the GROUND
setup, but 534's feedback still asserts the thread mixes in exactly that. After 518 the learner cannot
reason to 534's answer. It may be intended (the prompt says "risky **without more information**"), but
it changes the answer key's defensibility. **Needs Sarah.** Recommend not shipping 518 until answered.

**10. Resources curation (`[0]`–`[2]`).** Which links exactly? Anthropic-official only or third-party
too? One combined lesson or two? Does linking to external training need brand/legal sign-off? And
does W7.4 delete the dead `Module.resources[]` field or wire it up? **Recommend: two lessons, markdown
link lists, delete the dead field.** Note `[2]`'s dependency: para 74's Week 0 copy points learners at
this section, so W2.1 must not merge ahead of W7.2.

**11. Champion-dashboard denominator.** Should archived-lesson completions also drop from the
`modules_completed` **numerator**, not just the denominator? That retroactively lowers some learners'
recorded completions. **Recommend no** — fix the denominator only (W1.3).

**12. "Choose one scenario" completion (W6.4).** (a) accept and reword so learners don't expect a full
checkmark; (b) tell learners to do both (contradicts para 361); (c) exclude alternative siblings from
the denominator (needs a data marker — `parent_cell_id` is the natural carrier — plus changes at
`Sidebar.tsx:162`, `courseWeekProgress.ts:29-30`, `App.tsx:256-259`, `Sidebar.tsx:44-53`); (d) treat
completing either as completing the pair (most learner-correct, most invasive — touches completion
semantics). **Recommend (a) for the pilot, (c) if the sidebar nesting of Decision 8b ships.** Any
denominator change moves already-displayed percentages for live learners and should be announced.

---

## 5. Suggested execution swarm

**Gate 0 — serialize, one agent, before anything else.**
W0.1 (drift + progress audit) and W0.2 (Week 0 deploy diagnosis) can run concurrently — both are
read-only. W0.3 (write-path convention) lands next and every content item inherits it. Nothing else
starts until Decisions 1, 2, 3 and 5 are answered.

**Wave A — fully parallel, no file overlap (4 agents).**

| Batch | Items | Files touched |
|---|---|---|
| A1 | W1.1 + W1.2 + W1.3 (deletions) | `course1-content.json` (two module objects), new retirement migration, 2 test files, `20260715010000` fn |
| A2 | W2.1 + W2.2 + W2.5 (Week 0, Week 1, scavenger hunt copy) | `course1-content.json` (3 module `body_md` strings) |
| A3 | W3.1 + W3.2 + W3.3 (decision-scenario UI) | `DecisionScenario.tsx` + its test only |
| A4 | W7.2 + W7.3 (resource lessons) — **after** W7.1 curation returns | `course1-content.json` (2 new objects), new INSERT migration |

A1–A4 do not collide: A1/A2/A4 edit **disjoint module objects** in the same JSON file (mechanical
merge, but assign one agent as JSON-merge owner), and A3 is pure component code.

**Wave B — serialized behind decisions (2 agents, staggered).**

| Batch | Items | Blocked on |
|---|---|---|
| B1 | W4.1 → W4.2 → W4.3 → W4.4 (scenario swap) | Decision 1; W4.3 also touches `course1-content.json:147` |
| B2 | W2.3 + W6.2 (pod-kickoff copy + retitles) | Decision 8; **collides with B1's W4.3 on `:147`** |

**B1 and B2 must be serialized** — `course1-content.json:147` (the pod-kickoff Activity 2 bullets) is
rewritten by para 361 (W2.3), by the retitle (W6.2), and by the scenario rename (W4.3). Do all three
in one pass, in one batch. Recommend folding B2 into B1.

**Wave C — the Week 2 monolith (1 agent, strictly serial internally).**
W5.2 (schema + both validators) → W5.3 (component) → W5.4/W5.5/W5.6 (content) → W5.7 (tests).
Blocked on Decisions 1, 5 and 6. **This is the single hottest file set in the review** and should not
be split across agents.

**Conflict map — read before assigning.**

- **`c1-w2-ground-and-scope` `lab_config_json` is edited by `[6]`, `[8]`, `[9]`, `[10]`–`[15]` and
  possibly `[18]`.** One blob, one owner. Wave C only.
- **`ChatCompare.tsx` is rewritten by `[6]`, `[7]`, `[8]` and `[9]` at the same seam** (prompt state →
  `runPane` → `buildPaneUserContent` → pane heading). **One PR, not four.**
- **`DecisionScenario.tsx` is edited by `[19]`–`[28]`** and would be restructured again by Decision 8
  option (c). Wave A3 owns it exclusively; do not let a scenario-content agent near it.
- **`course1-content.json:147`** — three separate asks rewrite the same paragraph (above).
- **`c1-w34-walk-the-workflow-delivery`**: WS-3's *code* is scenario-agnostic and safe to build now;
  WS-4's *content* may throw the current Marina text away. **Build code first, author content after
  Decision 1.**
- **`courseStructure.integration.test.ts:170-183`** is edited by W1.3 (removing two entries) and
  possibly W5.7 (adding one). Same array — coordinate.
- **`e2e/21-enrollment-visibility.spec.ts`** is edited by W4.3 (`:100` Marina) and W5.7 (`:92-93` pane
  labels). Same file, different lines — low risk but assign one owner.
- **Two Deno/client validator pairs must move in lockstep**
  (`labValidation.ts` ↔ `admin-content-core.ts`) in both W3.5 and W5.2. Drift = passes in-browser,
  400s on CMS publish.

**Verification gate for every batch.** `npm run lint` + `npm test` (which includes
`admin-content-core.seed.test.ts:20-73` re-validating every `$json$` block in every migration), then
`npx supabase db reset`, then — for batches touching Week 2, Weeks 3–4 or the sidebar — a Playwright
run against a freshly reset DB, since e2e is not wired into CI.
