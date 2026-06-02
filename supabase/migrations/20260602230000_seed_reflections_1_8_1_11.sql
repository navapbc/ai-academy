-- P3.10: seed the 1.8 and 1.11 reflections.
-- These are UNGRADED written reflections (no right answer, no correctIndex):
-- the learner reads a prompt + guidance and writes a free-text response that a
-- Champion can review later. kind 'reflection' carries a prompt, guidance, and a
-- soft minWords target shown in a live word counter (the component doesn't hard-
-- block on it). The inline quiz remains the completion gate; nothing here grades
-- or completes the module.
-- Idempotent: only sets lab_config_json when it is still null.

-- 1.8 — Energy, environmental, and sovereignty conversation. minWords 250.
update public.modules
set lab_config_json = $json$
{
  "kind": "reflection",
  "minWords": 250,
  "prompt": "Pick one cost or concern about AI's footprint that you find genuinely hard to weigh — data-center energy and water, the concentration of compute among a few vendors, data sovereignty when prompts leave the country, or the labor behind training data. In about 250 words, lay out the strongest version of a view you do NOT already hold, and name what would change your mind.",
  "guidance": "There's no right answer, and this isn't graded. The goal is honest engagement with a competing perspective — distinguish what's known from what's contested, and avoid both dismissing the concern and catastrophizing it. Your Champion can read what you write."
}
$json$::jsonb
where cell_id = '1.8'
  and lab_config_json is null;

-- 1.11 — Honest framing of job-shape change. minWords 300.
update public.modules
set lab_config_json = $json$
{
  "kind": "reflection",
  "minWords": 300,
  "prompt": "In about 300 words, describe a finding about AI and work that complicated a view you held — for example the signal that AI is hitting early-career employment hardest, the evidence that AI helps novices far more than experts, or the gap between feeling faster and being faster. What did you believe before, what shifted, and what would you still need to see to change your mind further?",
  "guidance": "No right answer, and this isn't graded. Engage honestly with evidence that cuts against your prior view — neither evangelism nor denial. Your Champion can read what you write."
}
$json$::jsonb
where cell_id = '1.11'
  and lab_config_json is null;
