-- seed_use_case_portfolio_2_11 (P4.8): add the use-case-portfolio config to cell
-- 2.11. DRAFT content (status='in_review'). 2.11 has no lab_config yet, so this
-- sets the whole column; body_md/quiz_json/type are untouched, so the lesson +
-- inline quiz (the completion gate) stay intact. The IS NULL guard makes this
-- idempotent. The 4D dimensions are Anthropic's 4D AI Fluency framework already
-- cited in the 2.11 lesson (Delegation, Description, Discernment, Diligence).
update public.modules
set lab_config_json = $json$
{
  "kind": "use-case-portfolio",
  "intro": "Build your own record of where AI earns its place in your work — and where it doesn't. Then write one Diligence Statement for a high-stakes use case: a task where a wrong output would reach a beneficiary, a client, or the public.",
  "library": {
    "title": "Your personal AI use-case library",
    "helper": "Log the tasks you've actually tried. For each, say whether AI helped, capture the prompt or approach you used, and name the failure mode to watch next time. Be honest about the misses — the \"Doesn't help\" entries are the ones that save you the most time, and a library of only wins is a warning sign.",
    "minEntries": 3,
    "taskPlaceholder": "The task — e.g. \"Summarize a benefits notice for a claimant\"",
    "approachPlaceholder": "The prompt or approach that worked (or that you tried)",
    "watchPlaceholder": "The failure mode to watch — what went wrong, or what you had to check"
  },
  "diligence": {
    "title": "Diligence Statement — one high-stakes use case",
    "helper": "Pick one high-stakes use case from your library and write it up across the four dimensions below (aim for 250–400 words total). A strong statement is specific: if you can't honestly describe how you validated the output, the diligence isn't finished yet.",
    "dimensions": [
      { "id": "delegation", "label": "Delegation", "prompt": "What did you hand to the model, and what did you deliberately keep for yourself?" },
      { "id": "description", "label": "Description", "prompt": "How did you frame the task — the role, the context, the constraints, and any examples you gave?" },
      { "id": "discernment", "label": "Discernment", "prompt": "How did you evaluate the output? What did you check, and against which source of truth?" },
      { "id": "diligence", "label": "Diligence", "prompt": "How were you accountable for the result — disclosure of AI assistance, validation of the facts, and attribution of sources?" }
    ],
    "targetWords": 300,
    "minWords": 120
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.11' and lab_config_json is null;
