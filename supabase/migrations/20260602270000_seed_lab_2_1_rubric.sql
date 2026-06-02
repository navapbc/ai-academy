-- seed_lab_2_1_rubric (P4.2): add the LLM-as-judge anchor rubric to cell 2.1's
-- lab config. DRAFT content (status='in_review'). Additive jsonb_set; leaves
-- brief/scaffoldHints/title/kind intact. Targets the single 2.1 row.
update public.modules
set lab_config_json = jsonb_set(
      lab_config_json,
      '{rubric}',
      $json$
{
  "anchors": [
    { "id": "role-context", "label": "Role & context", "description": "The prompt states who the model should act as and gives the background it needs." },
    { "id": "constraints-up-front", "label": "Constraints up front", "description": "The prompt states the key constraints explicitly — length, reading level, tone, and what to avoid (e.g. jargon)." },
    { "id": "definition-of-done", "label": "Definition of done", "description": "The prompt describes what a finished, correct answer looks like." },
    { "id": "output-meets-brief", "label": "Output meets the brief", "description": "Claude's output actually satisfies the brief's targets (length, reading level, tone, one next step, no jargon)." }
  ]
}
$json$::jsonb,
      true
    ),
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.1' and lab_config_json->>'kind' = 'prompt-construction';
