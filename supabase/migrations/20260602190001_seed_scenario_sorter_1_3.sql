-- seed_scenario_sorter_1_3 (P3.5): turn cell 1.3 into the scenario-sorter.
-- Sets type='sorter', loads 8 delegate/assist/human-only/refuse scenarios with
-- rationale into sorter_config_json, and clears the prior MC quiz (quiz_json) so
-- the sorter is the sole interactive + completion gate. DRAFT content pending SME
-- review (status='in_review'). The authored lesson (body_md) is unchanged.
-- Replay-safe: targets the single cell_id row.
update public.modules set
  type = 'sorter',
  quiz_json = null,
  sorter_config_json = $json$
{
  "kind": "scenario-sort",
  "intro": "Sort each real task into how AI should (or shouldn't) be involved. The hard calls are 'delegate vs. assist' and 'human-only vs. refuse.'",
  "scenarios": [
    {
      "id": "s1",
      "text": "Reformat an already-published, public benefits FAQ into a one-page bulleted cheat-sheet for your team.",
      "correct": "delegate",
      "rationale": "The content is already public and the task is mechanical reformatting with nothing sensitive at stake. AI can do it end-to-end; a quick skim is all the verification it needs."
    },
    {
      "id": "s2",
      "text": "Convert a finalized, public office-hours schedule into a formatted table for an internal wiki page.",
      "correct": "delegate",
      "rationale": "The data is public and already finalized, and the task is mechanical formatting with nothing sensitive at stake. AI can produce the table end-to-end; a quick check that the rows match is all the verification it needs."
    },
    {
      "id": "s3",
      "text": "Write a first draft of a plain-language explainer for a public Medicaid eligibility page that you will fact-check and edit before it ships.",
      "correct": "assist",
      "rationale": "AI accelerates the drafting, but the content is public-facing and must be accurate, so a person owns the final version — checking facts and reading level. AI assists; you decide what ships."
    },
    {
      "id": "s4",
      "text": "Brainstorm a list of candidate interview questions for upcoming user research with caseworkers.",
      "correct": "assist",
      "rationale": "Idea generation is a strength of AI, but you curate, cut, and sequence the questions for your actual study. The human shapes the final instrument."
    },
    {
      "id": "s5",
      "text": "Decide whether a specific family qualifies for benefits today based on their submitted documents.",
      "correct": "human-only",
      "rationale": "A life-affecting eligibility determination needs an accountable human decision-maker. AI may help summarize the file or the policy, but it must never make the call."
    },
    {
      "id": "s6",
      "text": "Write the official message telling an applicant their benefits have been denied.",
      "correct": "human-only",
      "rationale": "A denial is a sensitive, high-stakes communication tied to someone's livelihood and appeal rights. A person must own its content and tone — this is judgment, not drafting."
    },
    {
      "id": "s7",
      "text": "Paste a beneficiary's full case file — name, SSN, and health notes — into your personal ChatGPT account to get a quick summary.",
      "correct": "refuse",
      "rationale": "This is regulated PII/PHI going into an unsanctioned tool. The data class forbids it outright (see cell 1.4) — the answer isn't 'have a human do it,' it's don't use this tool for this data at all."
    },
    {
      "id": "s8",
      "text": "Stand up an unapproved AI tool to automatically issue final eligibility determinations with no human in the loop.",
      "correct": "refuse",
      "rationale": "This combines an unauthorized tool with automated decisions on people's rights and no human accountability. It shouldn't be built — refuse, rather than try to make it 'assist.'"
    }
  ]
}
$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.3';
