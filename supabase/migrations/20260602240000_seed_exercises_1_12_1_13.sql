-- seed_exercises_1_12_1_13 (P3.9): set lab_config_json for the harm-rubric (1.12)
-- and the role/sign-off checklist (1.13). DRAFT content (status='in_review').
-- Does NOT touch body_md, quiz_json, or type — the cells keep their lessons and
-- their inline quiz as the completion gate. Replay-safe: one row each by cell_id.

update public.modules set
  lab_config_json = $json$
{
  "kind": "harm-rubric",
  "patterns": [
    { "id": "errors-at-scale", "label": "Errors at scale", "desc": "An automated error repeats across many cases at once." },
    { "id": "automation-bias", "label": "Automation bias", "desc": "People defer to the tool's suggestion over their own judgment." },
    { "id": "opacity", "label": "Opacity / no explanation", "desc": "No real reason can be given; due process and appeal suffer." },
    { "id": "exclusion", "label": "Exclusion / digital divide", "desc": "The hardest-to-serve are quietly shut out." }
  ],
  "scenarios": [
    {
      "id": "eligibility-rule",
      "text": "A state rolls out an automated eligibility screen. A mis-coded rule wrongly disqualifies everyone with a certain income pattern — and it applies to every matching application overnight.",
      "correct": "errors-at-scale",
      "why": "One coding error doesn't stay contained: the automated process applies the same flaw to thousands of cases instantly, turning a small mistake into mass harm."
    },
    {
      "id": "rubber-stamp",
      "text": "A caseworker sees the tool recommend 'deny' for a borderline application and approves it without re-reading the file, even though the documents look unusual.",
      "correct": "automation-bias",
      "why": "Deferring to the recommendation instead of exercising independent judgment is automation bias — it erodes the human review meant to protect applicants."
    },
    {
      "id": "system-flagged",
      "text": "An applicant is denied benefits and asks why. The only answer staff can give is 'the system flagged your case.'",
      "correct": "opacity",
      "why": "People often have a right to a real reason. 'The system decided' undermines due process and the ability to appeal — an explainability failure."
    },
    {
      "id": "english-only",
      "text": "A new AI chat intake works smoothly only in English and on a fast connection, so applicants in rural areas or with limited English give up partway through.",
      "correct": "exclusion",
      "why": "A 'more efficient' tool that the hardest-to-serve can't actually use widens the gap — exclusion via the digital divide."
    },
    {
      "id": "fraud-score",
      "text": "Reviewers begin trusting an AI fraud-risk score so much that they stop investigating cases the model rates 'high risk,' even when the evidence is thin.",
      "correct": "automation-bias",
      "why": "Treating the score as the answer and dropping independent investigation is automation bias — the human check becomes a rubber stamp."
    }
  ]
}
$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.12';

update public.modules set
  lab_config_json = $json$
{
  "kind": "signoff-checklist",
  "intro": "You don't have to build AI to be responsible for how it's used. Pick the role that best fits how you're involved, then sign off on the commitments you'll hold.",
  "roles": [
    { "id": "commission", "label": "I commission or scope AI work", "desc": "I decide that AI gets used or set the requirements for it." },
    { "id": "review", "label": "I review or approve AI outputs", "desc": "I check AI-produced work before it's used or sent." },
    { "id": "decide", "label": "I make decisions informed by AI", "desc": "I act on AI-assisted recommendations." },
    { "id": "procure", "label": "I procure or contract for AI tools", "desc": "I select vendors or sign contracts for AI." },
    { "id": "oversee", "label": "I oversee a team or program using AI", "desc": "I'm accountable for how a group uses AI." }
  ],
  "commitments": [
    { "id": "c1", "text": "I will ask whether a human meaningfully reviews AI-influenced decisions that affect people." },
    { "id": "c2", "text": "I will insist on an explanation a denied person could actually understand — not 'the system decided.'" },
    { "id": "c3", "text": "I will check that any AI tool handling regulated data is approved for that data class." },
    { "id": "c4", "text": "I will ask who is accountable when the AI is wrong, and how far an error could spread." },
    { "id": "c5", "text": "I will ask whether the hardest-to-serve can actually use an AI-driven process." },
    { "id": "c6", "text": "I will raise concerns rather than defer to a confident-sounding output." }
  ]
}
$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.13';
