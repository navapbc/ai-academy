-- seed_lab_config_2_4 (P4.5c): iteration-log scorer lab config as content-as-data.
--
-- Cell 2.4 ("Iteration as the literate behavior") gains an `iteration` exercise: the
-- learner conducts a real MULTI-TURN refinement conversation with Claude toward a
-- constrained goal (a plain-language benefits OVERPAYMENT notice). Each turn sends
-- the growing messages[] array via streamChat (the VoiceEdit/PromptEval streaming
-- pattern); once they've taken at least `minTurns` (3) turns they submit the whole
-- conversation, and the P4.2/#48 LLM-judge ({brief, sections}) scores the QUALITY OF
-- THE LEARNER'S ITERATION (their steering turns) — NOT the non-deterministic final
-- output — and the anchor-scored result renders in place via GradeResultCard. It
-- reuses streamChat + the #48 judge + GradeResultCard (no new grading/streaming
-- seam). It is LLM-graded PRACTICE that records a lab_submissions row but does NOT
-- gate completion (the inline quiz still does).
--
-- Content (see docs/superpowers/specs/2026-06-03-p4.5c-iteration-lab-design.md §4 for
-- the full answer key): the scenario is deliberately DISTINCT from the 2.1
-- SNAP-recertification prompt lab, the 2.6 CCS-notice voice-edit, AND the cell 2.4
-- lesson's own benefits-appeal example — it is a benefits OVERPAYMENT notice. The
-- source notice is SYNTHETIC (authored here), so factual risk is low. The constraints
-- are chosen so the FIRST draft commonly misses something (a specific dollar figure +
-- deadline that must survive verbatim, a sixth-grade reading level, the appeal/waiver
-- right, "no invented specifics"), so iteration is genuinely needed. The 4 rubric
-- anchors are written about the LEARNER'S TURNS (specific/targeted refinements,
-- building across turns, stress-testing/catching a weakness, reaching the goal and
-- recognizing "done"), judge-scored 0/1/2 — robust regardless of how good the live
-- model's replies happen to be.
--
-- DRAFT content (status='in_review') pending SME review. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "iteration",
  "title": "Practice: iterate toward a usable draft",
  "subtitle": "Steer across a few turns — refine, push back, ask it to critique itself. This is graded practice — it doesn't affect your module completion.",
  "brief": {
    "instruction": "You've received a benefits overpayment notice written in dense agency language. Work with Claude across a few turns to turn it into a short, plain-language explanation the recipient can act on. Read each draft critically and steer — the first draft usually misses something.\n\nThe raw notice:\n\"Notice of Overpayment — Case SNAP-7781. Our records indicate an overpayment of $1,248.00 for the benefit period January–April 2026, resulting from unreported earned income. You must respond within 30 days of the notice date (notice dated 2026-09-12). You may: (a) repay the balance in full; (b) request a repayment agreement; or (c) request a waiver or appeal the determination.\"",
    "constraints": [
      "Keep the exact overpayment amount ($1,248.00) and the 30-day deadline (notice dated 2026-09-12).",
      "Sixth-grade reading level; about 150 words or fewer.",
      "Must tell the recipient they can request a waiver or appeal.",
      "No invented specifics — don't add a phone number, amount, or date that isn't in the notice."
    ]
  },
  "starter": "Try a starter like: \"Rewrite this overpayment notice in plain language for the person who received it.\" Then read the reply against the constraints above and steer from there — name what to fix, add a missing constraint, or ask it to critique its own draft.",
  "minTurns": 3,
  "rubric": {
    "anchors": [
      {
        "id": "specific-targeted",
        "label": "Refinements are specific and targeted",
        "description": "The learner's turns reference the actual output and the unmet constraints (e.g. \"you dropped the $1,248 figure\", \"still above a sixth-grade level\") rather than vague \"make it better.\""
      },
      {
        "id": "builds-across-turns",
        "label": "Builds across turns",
        "description": "Each turn carries the work forward toward the goal, keeping what already worked, rather than restarting from scratch or re-asking the same thing each time."
      },
      {
        "id": "stress-tests",
        "label": "At least one turn stress-tests or catches a weakness",
        "description": "A turn asks the model to critique its own answer, checks that a specific figure/deadline/constraint survived, or corrects a wrong assumption — cell 2.4's core iteration move."
      },
      {
        "id": "reaches-goal",
        "label": "Reaches the goal and recognizes \"done\"",
        "description": "The final result meets the brief's constraints (exact amount + deadline kept, plain language, the waiver/appeal right stated, nothing invented) and the learner recognizes when it's done rather than thrashing."
      }
    ]
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.4'
  and lab_config_json is null;
