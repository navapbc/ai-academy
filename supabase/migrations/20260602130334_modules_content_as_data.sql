-- modules_content_as_data (P3.2.1): content-as-data foundation.
--
-- Introduces two additive tables that mirror the curriculum currently hard-coded
-- in src/data/phases.ts, so course content can later be authored in the DB and
-- served from the cloud. THIS STEP IS PURELY ADDITIVE: the running app keeps
-- reading the static phases.ts; nothing here changes existing behavior, and no
-- FK is added from the existing module_progress to modules.
--
--   modules           — one row per matrix cell (28 universal cells), seeded
--                       below from the source-of-truth values in phases.ts /
--                       quiz.ts / the authored lesson markdown.
--   content_versions  — append-only version history of a module's snapshot.
--                       Empty for now; the admin CMS (Phase 6) writes here.
--
-- RLS:
--   modules          — enabled; authenticated users may SELECT (read-only).
--                      No insert/update/delete policy: writes come via
--                      migrations/seed now and the admin CMS later.
--   content_versions — enabled with NO permissive policy (fully locked down).
--                      The admin CMS adds policies in Phase 6.

-- ---------------------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------------------
create table public.modules (
  cell_id              text primary key,                 -- e.g. '1.4' (matches module_progress.module_id)
  stage                text not null check (stage in ('1a', '1b', '2')),
  title                text not null,
  type                 text not null,                    -- content | lab | simulator | use-case | quiz | glossary
  dimension            text[] not null,                  -- 4D tags
  evidence_type        text not null,
  self_report_validity text not null
                       check (self_report_validity in ('low', 'medium', 'high', 'na')),
  body_md              text,                             -- lesson markdown (placeholder text for stubs)
  quiz_json            jsonb,                            -- quiz questions, null if none
  lab_config_json      jsonb,                            -- lab config, null if none
  mastery_anchor       text,                             -- nullable (authored later)
  emergent_anchor      text,                             -- nullable (authored later)
  status               text not null default 'published'
                       check (status in ('draft', 'in_review', 'published')),
  version              int not null default 1,
  sort_order           int not null,                     -- preserves nav order within a stage
  updated_by           uuid,
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- content_versions
-- ---------------------------------------------------------------------------
create table public.content_versions (
  id            uuid primary key default gen_random_uuid(),
  cell_id       text references public.modules (cell_id) on delete cascade,
  version       int not null,
  snapshot_json jsonb not null,
  author_id     uuid,
  note          text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.modules          enable row level security;
alter table public.content_versions enable row level security;

-- modules: read-only for any signed-in user. No write policies (writes happen
-- via migrations/seed and, later, the admin CMS under service-role/admin paths).
create policy "Modules are viewable by authenticated users"
  on public.modules for select
  to authenticated
  using (true);

-- content_versions: locked down — RLS enabled with no permissive policy, so all
-- access is denied to non-service roles until the admin CMS adds policies (P6).

-- ---------------------------------------------------------------------------
-- Seed: all 28 universal matrix cells, derived from src/data/phases.ts.
--   - metadata (stage, title, type, dimension[], evidence_type,
--     self_report_validity) mirror the CellSpec arrays.
--   - sort_order preserves the current within-stage nav order: Stage 1a, then
--     1b, then 2, in the existing sequence.
--   - body_md: authored lesson for cells in REAL_CONTENT (1.4, 2.1); for stubs,
--     the same "## {title}\n\n*Coming soon.* Part of {stageName}." text the app
--     generates today.
--   - quiz_json: QUIZ_DATA['1.4'] for cell 1.4; null otherwise.
--   - lab_config_json: null (no lab config exists in source yet).
--   - status 'published', version 1 (column defaults).
-- Safe to re-run on a fresh `supabase db reset`: on conflict (cell_id) do nothing.
-- ---------------------------------------------------------------------------
insert into public.modules
  (cell_id, stage, title, type, dimension, evidence_type, self_report_validity, sort_order, body_md, quiz_json)
values
  -- ----- Stage 1a · Rules & Access -----
  ('1.3', '1a', 'Recognizing when AI is appropriate vs. when human judgment is essential', 'content',
   ARRAY['Delegation'], 'performance-task', 'medium', 1,
   $md$## Recognizing when AI is appropriate vs. when human judgment is essential

*Coming soon.* Part of Stage 1a · Rules & Access.$md$, null),

  ('1.4', '1a', 'Data classification and privacy hygiene for prompts', 'content',
   ARRAY['Diligence'], 'performance-task', 'low', 2,
   $md$# Data Classification & Privacy Hygiene for Prompts

Before you paste anything into an AI tool, you need to know what *kind* of data you're handling — and
whether this tool is allowed to see it. At Nava, that judgment is the difference between a useful draft
and a contract-ending data incident.

## The data classes
From least to most sensitive:
- **Public** — already released to the world (published blog posts, public docs).
- **Internal** — not secret, but not for outside eyes (internal memos, draft plans).
- **Confidential** — would cause harm if disclosed (contract details, security findings, personnel matters).
- **Regulated** — legally protected: **PII** (names, SSNs, addresses), **PHI** (health data), **CUI**
  (controlled unclassified information). For Nava's government clients, this is the highest-stakes category.

## The one question to ask first
> *Would I be comfortable if this text showed up in the vendor's training data, in a breach, or in
> another customer's response?*

If the answer is anything but a confident "yes," stop and reclassify.

## Off-limits in unsanctioned tools
Never paste these into a consumer AI tool (e.g., a personal ChatGPT account):
- **Client PII/PHI** — beneficiary names, case details, health information.
- **Contractor or partner proprietary data.**
- **Unreleased solicitations** or procurement-sensitive material.
- **Personnel data** — salaries, performance reviews, HR matters.

## Why this matters at Nava
We build services for government. A single careless paste of confidential code or beneficiary data into
an unsanctioned tool can trigger a notification obligation, breach a contract, or harm the people we
serve. **OMB M-25-22** binds Nava as a contractor on how AI vendors may use government data — including
training-data restrictions. Classification isn't bureaucracy; it's how we keep client trust.

## The habit
1. **Classify before you paste** — name the data class.
2. **Match the class to an approved tool** (see *Approved-tool literacy*) — regulated data goes only
   where contracts and security posture allow.
3. **When unsure, treat it as more sensitive, not less.**$md$,
   $json$[
     {
       "question": "A caseworker wants to paste a benefits applicant's name and case notes into their personal ChatGPT account to draft a summary. What should they do?",
       "options": [
         "Go ahead — it's just a draft.",
         "Stop — applicant names and case notes are regulated PII/PHI and must not go into an unsanctioned tool.",
         "Remove only the last name, then paste.",
         "Paste it, but delete the chat afterward."
       ],
       "correctIndex": 1,
       "explanation": "Applicant names + case notes are regulated PII/PHI. Trimming a name or deleting the chat doesn't undo that the data left Nava's control and may be logged or trained on. Use an approved tool, or fully redact."
     },
     {
       "question": "Which question best captures the pre-paste test for prompt data?",
       "options": [
         "\"Is this tool fast enough?\"",
         "\"Would I be comfortable if this text appeared in the vendor's training data, a breach, or another customer's response?\"",
         "\"Has anyone else pasted this before?\"",
         "\"Is my internet connection secure?\""
       ],
       "correctIndex": 1,
       "explanation": "The habit is imagining the worst-case exposure. If you wouldn't be comfortable seeing the data in a leak or training set, don't paste it."
     },
     {
       "question": "A published Nava blog post falls into which data class?",
       "options": ["Regulated", "Confidential", "Public", "Internal"],
       "correctIndex": 2,
       "explanation": "Already-released material is Public. Classification works both ways — don't over-restrict public data, and don't under-protect regulated data."
     },
     {
       "question": "Why does OMB M-25-22 matter for how Nava staff use AI?",
       "options": [
         "It bans all AI use by contractors.",
         "It binds Nava as a contractor on how AI vendors may use government data, including training-data restrictions.",
         "It only applies in the EU.",
         "It sets the price of API tokens."
       ],
       "correctIndex": 1,
       "explanation": "M-25-22 governs federal AI acquisition and contractor obligations — including restrictions on vendor use of government data — which is a concrete compliance reason classification is non-negotiable."
     }
   ]$json$::jsonb),

  ('1.5', '1a', 'Approved-tool literacy', 'content',
   ARRAY['Delegation'], 'performance-task', 'medium', 3,
   $md$## Approved-tool literacy

*Coming soon.* Part of Stage 1a · Rules & Access.$md$, null),

  ('1.6', '1a', 'Setup and access', 'content',
   ARRAY['Description'], 'observation', 'high', 4,
   $md$## Setup and access

*Coming soon.* Part of Stage 1a · Rules & Access.$md$, null),

  ('1.9', '1a', 'Disclosure norms and practices', 'content',
   ARRAY['Diligence'], 'performance-task', 'medium', 5,
   $md$## Disclosure norms and practices

*Coming soon.* Part of Stage 1a · Rules & Access.$md$, null),

  ('1.10', '1a', 'Regulatory floor awareness', 'content',
   ARRAY['Diligence'], 'performance-task', 'medium', 6,
   $md$## Regulatory floor awareness

*Coming soon.* Part of Stage 1a · Rules & Access.$md$, null),

  ('1.13', '1a', 'Non-practitioner-involved-in-AI literacy', 'content',
   ARRAY['Delegation', 'Diligence'], 'portfolio', 'medium', 7,
   $md$## Non-practitioner-involved-in-AI literacy

*Coming soon.* Part of Stage 1a · Rules & Access.$md$, null),

  -- ----- Stage 1b · Orienting Frames -----
  ('1.1', '1b', 'Mechanical mental model of how LLMs work', 'content',
   ARRAY['Discernment'], 'quiz', 'low', 8,
   $md$## Mechanical mental model of how LLMs work

*Coming soon.* Part of Stage 1b · Orienting Frames.$md$, null),

  ('1.2', '1b', 'Hallucination as a structural feature, not a bug', 'content',
   ARRAY['Discernment'], 'quiz', 'low', 9,
   $md$## Hallucination as a structural feature, not a bug

*Coming soon.* Part of Stage 1b · Orienting Frames.$md$, null),

  ('1.7', '1b', 'Recognizing AI bias, fairness, and accessibility blind spots', 'content',
   ARRAY['Discernment'], 'performance-task', 'low', 10,
   $md$## Recognizing AI bias, fairness, and accessibility blind spots

*Coming soon.* Part of Stage 1b · Orienting Frames.$md$, null),

  ('1.8', '1b', 'Energy, environmental, and sovereignty conversation', 'content',
   ARRAY['Diligence'], 'reflection', 'low', 11,
   $md$## Energy, environmental, and sovereignty conversation

*Coming soon.* Part of Stage 1b · Orienting Frames.$md$, null),

  ('1.11', '1b', 'Honest framing of job-shape change', 'content',
   ARRAY['Delegation'], 'reflection', 'low', 12,
   $md$## Honest framing of job-shape change

*Coming soon.* Part of Stage 1b · Orienting Frames.$md$, null),

  ('1.12', '1b', 'Civic-tech-specific AI harm patterns', 'content',
   ARRAY['Discernment', 'Diligence'], 'performance-task', 'low', 13,
   $md$## Civic-tech-specific AI harm patterns

*Coming soon.* Part of Stage 1b · Orienting Frames.$md$, null),

  -- ----- Stage 2 · Active Practitioner -----
  ('2.1', '2', 'Prompt construction as a craft', 'lab',
   ARRAY['Description'], 'work-sample', 'low', 14,
   $md$# Prompt Construction as a Craft

The single biggest lever on the quality of an AI response is how you ask. A vague ask gets a vague,
generic answer; a well-constructed prompt gets something you can actually use.

## The anatomy of a strong prompt
1. **Role & context** — who the model should act as, and the background it needs.
2. **The task, with concrete constraints** — exactly what to produce, and the limits: length, format,
   reading level, what to include, what to avoid.
3. **Examples or format** — a sample of "good," or the structure you want (a table, a template).
4. **Definition of "done"** — what a finished, correct answer looks like.

## Put the important stuff where the model attends
Models weight the start and end of a prompt most. Lead with the role and core task; don't bury the key
constraint in the middle of a wall of text.

## Separate instructions from content
When you paste a document to act on, use clear delimiters (e.g., triple backticks) so the model doesn't
confuse *the thing to work on* with *the instruction*.

## Constraint-first beats conversation-first
A one-line ask ("summarize this") forces the model to guess your constraints — and it guesses generic.
Stating them up front ("5 bullets, 8th-grade reading level, no jargon, flag anything uncertain") gets a
usable answer on the first try.

## It's iterative
Even a strong prompt is a starting point. Read the output, see what's missing, refine. The literate move
is to iterate, not to accept the first draft.

**In this lab:** you'll get a realistic task and a target output. Write a constraint-first prompt, run it
against Claude, and see how much the structure changes the result.$md$, null),

  ('2.2', '2', 'Output validation as a verifiable skill', 'content',
   ARRAY['Discernment'], 'work-sample', 'low', 15,
   $md$## Output validation as a verifiable skill

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.3', '2', 'Counteracting the polished-output trap', 'content',
   ARRAY['Discernment'], 'work-sample', 'low', 16,
   $md$## Counteracting the polished-output trap

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.4', '2', 'Iteration as the literate behavior', 'content',
   ARRAY['Description'], 'work-sample', 'low', 17,
   $md$## Iteration as the literate behavior

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.5', '2', 'Working with the context window', 'content',
   ARRAY['Description'], 'performance-task', 'medium', 18,
   $md$## Working with the context window

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.6', '2', 'AI for writing tasks', 'content',
   ARRAY['Description'], 'work-sample', 'medium', 19,
   $md$## AI for writing tasks

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.7', '2', 'AI for synthesis', 'content',
   ARRAY['Discernment'], 'work-sample', 'low', 20,
   $md$## AI for synthesis

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.8', '2', 'Calibrated trust (avoiding over- and under-reliance)', 'content',
   ARRAY['Discernment'], 'performance-task', 'low', 21,
   $md$## Calibrated trust (avoiding over- and under-reliance)

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.9', '2', 'Recognizing AI failure modes specific to your work', 'content',
   ARRAY['Discernment'], 'portfolio', 'medium', 22,
   $md$## Recognizing AI failure modes specific to your work

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.10', '2', 'Test-driven and constraint-first prompting', 'content',
   ARRAY['Description'], 'work-sample', 'medium', 23,
   $md$## Test-driven and constraint-first prompting

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.11', '2', 'Personal AI use-case library + Diligence Statement', 'content',
   ARRAY['Delegation', 'Diligence'], 'portfolio', 'high', 24,
   $md$## Personal AI use-case library + Diligence Statement

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.12', '2', 'Recognizing when to switch tools, models, or modes', 'content',
   ARRAY['Delegation'], 'performance-task', 'medium', 25,
   $md$## Recognizing when to switch tools, models, or modes

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.13', '2', 'Resisting metric and productivity illusions', 'content',
   ARRAY['Discernment'], 'performance-task', 'low', 26,
   $md$## Resisting metric and productivity illusions

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.14', '2', 'GLAT-style objective gate', 'content',
   ARRAY['Discernment'], 'quiz', 'na', 27,
   $md$## GLAT-style objective gate

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null),

  ('2.15', '2', 'Paired AI-on / AI-off calibration', 'content',
   ARRAY['Delegation', 'Discernment'], 'performance-task', 'na', 28,
   $md$## Paired AI-on / AI-off calibration

*Coming soon.* Part of Stage 2 · Active Practitioner.$md$, null)
on conflict (cell_id) do nothing;
