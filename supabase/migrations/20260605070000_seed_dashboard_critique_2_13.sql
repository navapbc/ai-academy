-- seed_dashboard_critique_2_13 (P4.7): add the dashboard-critique config to cell
-- 2.13. DRAFT content (status='in_review'). 2.13 has no lab_config yet, so this
-- sets the whole column; body_md/quiz_json/type are untouched, so the lesson +
-- inline quiz (the completion gate) stay intact. The IS NULL guard makes this
-- idempotent. Targets the single row.
update public.modules
set lab_config_json = $json$
{
  "kind": "dashboard-critique",
  "intro": "Leadership loves this dashboard: AI-assisted drafts are going out 30% faster. The speed is real. Before you expand AI use on the strength of it, name the signals this dashboard quietly leaves out — the dimensions these speed numbers drop.",
  "dashboard": {
    "title": "AI-Assisted Drafting — Team Productivity",
    "metrics": [
      { "label": "Drafts / day", "value": "12", "trend": "▲ 30%" },
      { "label": "Avg draft time", "value": "4m", "trend": "▼ 35%" },
      { "label": "Queue cleared", "value": "92%", "trend": "▲" }
    ]
  },
  "signals": [
    { "id": "rework", "label": "Rework / correction rate", "hidden": true, "why": "A speed metric hides how many drafts come back. In the lesson's case, nearly a third needed correction — the dashboard never shows it." },
    { "id": "quality", "label": "Draft quality / accuracy", "hidden": true, "why": "Faster drafts aren't better drafts. Quality and error rate are exactly what a drafts-per-day count drops." },
    { "id": "throughput", "label": "Net throughput (drafts that actually shipped)", "hidden": true, "why": "Once you subtract the rework, net throughput barely moved — the real story the speed number conceals." },
    { "id": "downstream", "label": "Downstream cost (reviewer time, claimant impact)", "hidden": true, "why": "Corrections land on reviewers and beneficiaries downstream. That cost is invisible on a speed-only dashboard." },
    { "id": "drafts", "label": "Drafts per day", "hidden": false, "why": "This is the speed number itself — already shown on the dashboard as Drafts / day (12, ▲30%). It's not a missing signal." },
    { "id": "avgtime", "label": "Average time per draft", "hidden": false, "why": "Also already shown (4m, ▼35%). Flagging it as missing misreads the dashboard." },
    { "id": "queue", "label": "Queue cleared rate", "hidden": false, "why": "Also already on the dashboard (92%, ▲) — another speed/output figure, not a hidden quality signal." }
  ]
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.13' and lab_config_json is null;
