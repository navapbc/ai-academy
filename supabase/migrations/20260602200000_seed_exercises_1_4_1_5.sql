-- seed_exercises_1_4_1_5 (P3.6): interactive graded-practice exercises for the
-- 1.4 (data-classifier) and 1.5 (tool-triage) cells, stored as content-as-data
-- in modules.lab_config_json (keyed by the `kind` discriminator). These render
-- after the lesson body as auto-graded practice and record a lab_submissions
-- row; module completion still belongs to each cell's inline quiz.
--
-- Timestamped AFTER the #22 curriculum load (…190000) so that load doesn't
-- overwrite these rows on a fresh `supabase db reset`.
--
-- Additive/idempotent: updates the existing row's lab_config_json only while it
-- is still null, so a later CMS/Studio edit is never clobbered by a re-apply.
--
-- NOTE: the tool labels below are NOTIONAL PLACEHOLDERS. Nava's real
-- approved-tool inventory (and its exact, contractually-authorized names) should
-- replace them — this is content-as-data, editable later directly or via the CMS
-- with no code change.

-- 1.4 — Data classification + tool routing (kind 'data-classifier')
update public.modules
set lab_config_json = $json$
{
  "kind": "data-classifier",
  "tools": [
    { "id": "enterprise", "label": "Enterprise Claude (Nava-contracted, data-protected)" },
    { "id": "local", "label": "Local / no external AI tool" },
    { "id": "consumer", "label": "Consumer chatbot (e.g., personal ChatGPT)" }
  ],
  "classes": ["Public", "Internal", "Confidential", "Regulated (PII/PHI/CUI)"],
  "items": [
    {
      "text": "A Slack message that includes a client's name and a detail from their case.",
      "dataClass": "Regulated (PII/PHI/CUI)",
      "tool": "local",
      "why": "Client name + case detail is regulated PII/PHI — keep it out of any external tool; use a local/no-external path or fully redact first."
    },
    {
      "text": "A benefits determination letter with all names, SSNs, and identifiers removed.",
      "dataClass": "Confidential",
      "tool": "enterprise",
      "why": "Redaction lowers it to confidential, so a Nava-contracted, data-protected tool is acceptable — but re-check that no re-identifying detail remains."
    },
    {
      "text": "A comment on a public, open-source GitHub pull request.",
      "dataClass": "Public",
      "tool": "enterprise",
      "why": "Already public, so any approved tool is fine. Don't over-restrict public data."
    },
    {
      "text": "An excerpt from an unreleased government solicitation (procurement-sensitive).",
      "dataClass": "Confidential",
      "tool": "enterprise",
      "why": "Procurement-sensitive and not yet public — confidential; only an approved, contractually-authorized tool, never a consumer chatbot."
    },
    {
      "text": "An internal memo listing staff salaries.",
      "dataClass": "Confidential",
      "tool": "enterprise",
      "why": "Personnel data is confidential; keep it in an approved tool, never a consumer account."
    },
    {
      "text": "A blog post draft intended for public release next week.",
      "dataClass": "Internal",
      "tool": "enterprise",
      "why": "Not public yet (treat as internal) but low-sensitivity and destined for release — an approved tool is fine."
    }
  ]
}
$json$::jsonb
where cell_id = '1.4'
  and lab_config_json is null;

-- 1.5 — Approved-tool triage (kind 'tool-triage')
update public.modules
set lab_config_json = $json$
{
  "kind": "tool-triage",
  "tools": [
    { "id": "enterprise", "label": "Enterprise Claude (Nava-contracted, data-protected)" },
    { "id": "local", "label": "Local / no external AI tool" },
    { "id": "consumer", "label": "Consumer chatbot (e.g., personal ChatGPT)" }
  ],
  "cases": [
    {
      "text": "Summarize a 50-page, already-public Medicaid policy manual.",
      "tool": "enterprise",
      "why": "Public data; any approved tool works, and Enterprise Claude handles the length."
    },
    {
      "text": "Draft talking points that quote a beneficiary's case notes, including their name.",
      "tool": "local",
      "why": "Regulated PII — use a local/no-external path, or redact identifiers first. Never a consumer account."
    },
    {
      "text": "Brainstorm plain-language UI labels for a public benefits page (no real user data).",
      "tool": "consumer",
      "why": "No sensitive data and public-facing — a consumer tool is acceptable here, though an approved tool is fine too."
    },
    {
      "text": "Analyze an unreleased vendor solicitation for risks.",
      "tool": "enterprise",
      "why": "Procurement-sensitive/confidential — only an approved, contractually-authorized tool (M-25-22 limits how vendors may use government data); never a consumer chatbot."
    }
  ]
}
$json$::jsonb
where cell_id = '1.5'
  and lab_config_json is null;
