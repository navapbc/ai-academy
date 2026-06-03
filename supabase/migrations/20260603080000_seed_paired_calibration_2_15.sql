-- seed_paired_calibration_2_15 (P4.6): add the paired AI-on/AI-off calibration
-- config to cell 2.15. DRAFT content (status='in_review'). 2.15 has no lab_config
-- yet, so this sets the whole column; body_md/quiz_json/type are untouched, so the
-- lesson + inline quiz (the completion gate) stay intact. Targets the single row.
update public.modules
set lab_config_json = $json$
{
  "kind": "paired-calibration",
  "intro": "Run a real paired test on yourself. Do one task without AI and a comparable one with Claude — the app times each. Then guess how much faster AI made you, before you see the clock. Work honestly; the point is to measure your own perception-vs-reality gap.",
  "offTask": {
    "label": "Recertification reminder — Household A",
    "brief": "Without any AI, write a short, plain-language SNAP recertification reminder (about 80 words, 8th-grade reading level, warm, no jargon) for a household whose recert is due in 30 days and who must upload two pay stubs."
  },
  "onTask": {
    "label": "Recertification reminder — Household B",
    "brief": "Now, using Claude, write the comparable reminder for a different household whose recert is due in 14 days and who must complete an interview by phone. Same constraints: about 80 words, 8th-grade level, warm, no jargon."
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.15';
