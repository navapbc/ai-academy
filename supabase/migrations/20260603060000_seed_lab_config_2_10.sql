-- seed_lab_config_2_10 (P4.5b): reusable-prompt eval lab config as content-as-data.
--
-- Cell 2.10 ("Test-driven and constraint-first prompting") gains a `prompt-eval`
-- exercise: the learner reads a RECURRING task + the constraints to encode + a small
-- seeded test set (2 complete benefits-intake records + 1 EDGE case = a record with a
-- MISSING income field), writes ONE reusable, constraint-first prompt, RUNS it live
-- (streamChat, one call per case) against each record, then submits the prompt + its
-- per-case outputs to the P4.2/#48 LLM-judge ({brief, sections}) for an anchor-scored
-- verdict that renders in place via GradeResultCard. It reuses streamChat + the #48
-- judge + GradeResultCard (no new grading/streaming seam). It is LLM-graded PRACTICE
-- that records a lab_submissions row but does NOT gate completion (the inline quiz
-- still does).
--
-- Content (see docs/superpowers/specs/2026-06-03-p4.5b-prompt-eval-design.md §4 for
-- the full answer key): the task is deliberately DISTINCT from the 2.10 lesson's
-- weekly-status worked example and the inline quiz's status-summary questions — it is
-- a reusable "raw benefits-intake record -> standard 3-line case summary for the team
-- queue" prompt. Inputs are SYNTHETIC (authored here), so factual risk is low. The
-- EDGE case (a child-care record with a blank income field) genuinely stresses the
-- prompt: a good, constraint-first prompt makes the model FLAG the gap ("income not
-- provided — follow up") rather than invent a number. This mirrors the cell's quiz Q3
-- (a model that guesses a blank income) WITHOUT handing the learner the quiz answer
-- verbatim. The 4 rubric anchors are judge-scored 0/1/2.
--
-- DRAFT content (status='in_review') pending SME review. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "prompt-eval",
  "title": "Practice: write one reusable, constraint-first prompt",
  "subtitle": "Encode the rules, then test the prompt against every record — including the messy one. This is graded practice — it doesn't affect your module completion.",
  "brief": {
    "instruction": "Your team turns raw benefits-intake records into a standard short summary for the shared case queue. Write ONE reusable, constraint-first prompt that does this for any record: state your rules before the task, then run it against the test records below and check each result against those rules.",
    "constraints": [
      "Exactly 3 lines; about 60 words or fewer.",
      "Must include the case ID, the action needed, and the deadline.",
      "Must not invent missing data — flag the gap instead (e.g. \"income not provided — follow up\").",
      "Plain language; no internal jargon."
    ]
  },
  "testCases": [
    {
      "id": "snap-2231",
      "label": "SNAP recertification — complete record",
      "input": "Case ID: SNAP-2231\nProgram: SNAP recertification\nHousehold: 4 people\nReported monthly income: $2,840\nOn file: two recent pay stubs, current lease\nRequired action: verify the lease address against the utility bill on file\nDeadline: recertification packet due 2026-07-15"
    },
    {
      "id": "med-4417",
      "label": "Medicaid renewal — complete record",
      "input": "Case ID: MED-4417\nProgram: Medicaid renewal\nApplicant: single adult, age 63\nReported monthly income: $1,510\nOn file: photo ID, prior-year tax return\nRequired action: confirm continued disability status from the case file\nDeadline: renewal due 2026-08-01"
    },
    {
      "id": "ccap-3902",
      "label": "Child care assistance — missing income",
      "input": "Case ID: CCAP-3902\nProgram: Child Care Assistance (CCAP)\nHousehold: 3 people, two children, two earners\nReported monthly income: [left blank on the form]\nOn file: application form, one pay stub for ONE of the two earners\nRequired action: collect the second earner's income documentation\nDeadline: eligibility determination due 2026-07-22",
      "note": "Edge case: the income field is blank. A good prompt makes the model flag the gap, not guess a number.",
      "isEdge": true
    }
  ],
  "rubric": {
    "anchors": [
      {
        "id": "constraints-up-front",
        "label": "States its constraints up front",
        "description": "The prompt states the rules before the task: the length/format (3 lines, about 60 words or fewer) AND the must-include set (case ID, action, deadline) AND the must-exclude rule (never invent missing data — flag it instead)."
      },
      {
        "id": "format-on-normal",
        "label": "Outputs meet the format on the normal cases",
        "description": "On the two complete records, each output is about 3 lines / 60 words or fewer in plain language and includes the case ID, the action needed, and the deadline."
      },
      {
        "id": "handles-edge-case",
        "label": "Handles the missing-field edge case",
        "description": "On the record with a blank income field, the output flags the gap (e.g. \"income not provided — follow up\") instead of inventing an income figure."
      },
      {
        "id": "reusable-general",
        "label": "The prompt is reusable, not hardcoded",
        "description": "The prompt is written as general rules for any intake record, not tailored to one record's specific values."
      }
    ]
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.10'
  and lab_config_json is null;
