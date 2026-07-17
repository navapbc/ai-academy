# Week 1: Resources section + "Lookup or Predict?" sorter alignment

**Date:** 2026-07-17
**Branch:** `feat/week1-resources-and-sorter` (off `feat/cohort-program-restructure`)
**Status:** Approved design, pending implementation plan

## Problem

Analysis of the Week 1 live-session run-of-show ("What are we actually working
with?") against the built AI Academy content surfaced two gaps:

1. **The "AI Academy resources section" the deck points to does not exist.** The
   speaker notes send learners there four times — for (a) controlling which tools
   Claude uses vs. which need approval, (b) the "underlying math" of tokens,
   (c) token budget / "tokenmaxxing", and (d) deeper context-window guidance. A
   keyword scan of the entire Course 1 content returns **0** hits for `token`,
   `context window`, `tokenmaxxing`, and only 1 for `permission`. The champion
   would be sending learners to empty shelves.

2. **The "Lookup or Predict?" academy sorter omits the two items the deck calls
   most important.** The facilitator key flags "What's our company's PTO policy?"
   (#3) and "Q3 2025 Medicaid numbers for NJ" (#5) as the highest-stakes,
   Nava-relevant items ("Items 3 and 5 matter most for Nava"). Neither is in the
   seeded sorter (`c1-w1-lookup-vs-predict`), which instead uses more generic
   examples (2043 World Cup, *To Kill a Mockingbird* page, translate).

These are the two well-aligned halves of the session — Week 0 setup and the
"Break Claude on Purpose" experiments — do **not** need changes and are out of
scope here.

## Constraints

- **Content-as-data pipeline (unchanged).** Curriculum lives in
  `supabase/seed-data/course1-content.json`, the source of truth. The migration
  `supabase/migrations/20260715040000_seed_course1_content.sql` is **generated**
  by `scripts/generate-course1-seed.mjs` and must never be hand-edited.
- **Generator schema (enforced at generate time).** For each module: `cell_id`
  unique; `origin ∈ {course, custom}`; `visibility ∈ {public, program}`;
  `type ∈ {content, lab, ...}`; `evidence_type` from the allow-list;
  `dimension` an array of known dimensions (may be empty); non-empty `title`
  and `body_md`; integer `sort_order`. **`origin: custom` requires `week: null`**
  (custom resources are unassigned; they render in the "Resources & additional
  lessons" group). `body_md` may not contain the literal `$md$`; lab config may
  not contain `$json$` (dollar-quote safety).
- **Pre-reveal copy rule.** The generator forbids the token `LLM` only in
  `week0`/`week1` modules. The new resources are `week: null`, so they may use
  "LLM"/"token" language freely — and should, since the live 1.01 reveal
  precedes any learner reaching them.
- Node 22 required for `npm test`/`lint` (jsdom ESM). Base off the restructure
  branch, not `main`.

## Design

### 1. Two new resource lessons

Both are `origin: custom`, `visibility: public`, `type: content`,
`evidence_type: reflection`, `dimension: []`, `week: null`, `lab_config_json:
null` — matching the existing `custom-ai-support-at-nava` resource. They render
in the "Resources & additional lessons" group. `sort_order` follows AI Support
(950): **951** and **952**.

#### Resource A — `custom-how-claude-works-tokens` — "How Claude works: tokens & context windows"

`sort_order: 951`. Body sections (Markdown `##` headings):

- **What a token is** — plain-language: your text is converted to tokens; Claude
  predicts the next most-likely chunk of text, one token at a time, from patterns
  in its training; "a very good autocomplete." Resolves the deck's "underlying
  math of tokens" pointer. No literal math required — conceptual.
- **The context window (working memory)** — limited; only knows the current
  conversation; the page/scroll metaphor (scroll down and the top is gone, and
  you can't scroll back); compaction loses detail you don't get to choose.
  Include the deck's "Start a new chat when…" list (quality declining;
  compaction warning; new topic / logical breaking point).
- **Token budget & cost** — longer conversations cost more (roughly
  super-linearly); Nava's monthly budget is usually sufficient; spinning up new
  chats is the practical habit. Resolves the "tokenmaxxing" pointer without
  going deep.

#### Resource B — `custom-controlling-claude-tools-permissions` — "Controlling what Claude can do: tools & permissions"

`sort_order: 952`. Body sections:

- **Tools: how Claude pulls in its own context** — beyond your prompt, Claude
  can use tools (web search, fetching a page, reading files you share, etc.) to
  gather context before it answers, rather than relying only on what you paste in.
- **What you control** — you decide which tools Claude may use on its own and
  which require your approval each time; where those settings live. Resolves the
  deck's tool-permissions pointer.
- Brief, practical framing (this is a reference, not a lesson).

### 2. "Lookup or Predict?" sorter — item swap

Edit `c1-w1-lookup-vs-predict.lab_config_json.items` only. Keep `kind`
(`prediction-sort`), `introMd`, `bucketLabels`, and `takeaway` unchanged.

Final six items (order preserved for the "feels like lookup dominates" effect):

| id | prompt | why it stays/enters |
| --- | --- | --- |
| `capital` | What's the capital of France? | keep — the core "feels like lookup, actually predicted" aha |
| `offsite` | Give me three ideas for a team offsite. | keep — the clean "obviously generated" anchor |
| `pto` | **What's our company's PTO policy?** | **new** — fabricated internal policy; high-stakes at Nava |
| `summary` | Summarize this paragraph I just pasted. | keep — in-context prediction, usually solid |
| `medicaid` | **What were the Q3 2025 Medicaid enrollment numbers for New Jersey?** | **new** — fabricated statistics; civic-tech danger zone |
| `worldcup` | Who won the 2043 World Cup? | keep — ties directly to Experiment 2's confident-wrong |

**Dropped:** `mockingbird` (page number) and `translate` (good morning → Spanish).
The `worldcup` item preserves the tie back to Experiment 2's confident-wrong
pattern; `pto` and `medicaid` carry the Nava/civic-tech stakes the deck wants.

New `reveal` strings, written in the existing voice (present tense, tie back to
the "it's all prediction" twist and to Experiment 2 where apt):

- `pto`: "Feels like Claude is checking an HR page — but it has no access to
  Nava's policies unless you give them to it. It predicts a plausible-sounding
  policy, which may be wrong in exactly the ways that matter. High-stakes at
  Nava."
- `medicaid`: "Nothing to look up here — Claude predicts plausible-looking
  numbers that can be entirely fabricated. This is the confident-wrong pattern
  from Experiment 2, aimed straight at the kind of data we work with."

(`capital`, `offsite`, `summary`, `worldcup` keep their current reveal text.)

## Out of scope (owner: user, in Google Slides)

The live-session deck is not a repo artifact. Two edits to make there when
convenient — after this lands, the deck's four "resources section" pointers will
resolve:

- "1 million tokens (roughly 500,000 words)" → ≈750,000 words is the closer
  rule of thumb.
- "deterministic tools, called things like skills, harnesses, hooks, and agents"
  — loose for a foundations session; consider "tools like web search and file
  access," leaving skills/hooks/agents for a later week.

## Data flow

1. Edit `supabase/seed-data/course1-content.json`: add two `custom` modules;
   replace the `items` array of `c1-w1-lookup-vs-predict`.
2. Run `node scripts/generate-course1-seed.mjs` → regenerates
   `20260715040000_seed_course1_content.sql` (validation passes = schema OK).
3. `npm run lint && npm test` (Node 22).
4. Optional local verification: `npx supabase db reset` applies the migration
   cleanly (idempotent, re-runnable).

## Testing

- **Generator validation** is the first gate — a bad schema throws before SQL is
  written.
- **No existing test asserts the sorter's item contents.** Verified:
  `courseStructure.integration.test.ts` asserts week *membership* by `cell_id`
  only (unaffected — the two new resources are `week: null`, so they never join
  `course_week_modules`, and the sorter's `cell_id` is unchanged);
  `PredictionSort.test.tsx` and `labValidation.test.ts` use inline fixture
  configs, not the real seed. So the item swap requires **no test changes**.
  (The integration test is DB-gated and skips without `RUN_DB_TESTS=1` + a live
  stack anyway.)
- **Migration re-run:** `npx supabase db reset` must apply without error; the
  INSERTs are `ON CONFLICT DO NOTHING` so re-runs are safe.
- No new exercise kind is introduced (reuse `content` + existing
  `prediction-sort`), so no renderer/type changes and no new component tests.

## Success criteria

- The two resources appear in "Resources & additional lessons," public, and
  cover tokens, context window, token budget, and tool permissions — so every
  deck "resources section" pointer resolves.
- The "Lookup or Predict?" sorter contains the PTO-policy and Medicaid-numbers
  items, dropping Mockingbird + translate, keeping World Cup for the Experiment 2
  tie.
- Generator runs clean; `lint` + `test` green; migration re-applies idempotently.
