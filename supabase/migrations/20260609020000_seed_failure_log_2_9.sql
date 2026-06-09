-- seed_failure_log_2_9 (P4.9): add the failure-log config to cell 2.9. DRAFT
-- content (status='in_review'). 2.9 has no lab_config yet, so this sets the whole
-- column; body_md/quiz_json/type are untouched, so the lesson + inline quiz (the
-- completion gate) stay intact. The IS NULL guard makes this idempotent.
update public.modules
set lab_config_json = $json$
{
  "kind": "failure-log",
  "intro": "Start your own record of how AI breaks on the work you actually do. These are your patterns, not the textbook risks — and they predict your next mistake better than any generic warning.",
  "title": "Your personal failure-mode log",
  "helper": "Log a real failure for each entry: the task, what went wrong, how you caught it, and the tell that gave it away. Group the repeats — three fabricated citations is a pattern, not bad luck — and read the matching entries before a similar task. Aim to build this to six entries over time; record what you have so far now.",
  "minEntries": 3,
  "targetEntries": 6,
  "taskPlaceholder": "The task — e.g. \"Draft a renewal eligibility summary from case notes\"",
  "errorPlaceholder": "What went wrong — the exact error (a fabricated citation, a wrong date, two facts smoothed into one)",
  "caughtPlaceholder": "How you caught it — the check that surfaced it (looked up the rule, compared to the source record)",
  "tellPlaceholder": "The tell to watch next time — the signal that gives it away (e.g. an oddly specific subsection number)"
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.9' and lab_config_json is null;
