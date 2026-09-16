-- reconcile_1_4_lab_config — fix 1.4's "Classify & Route" practice
-- (lab_config_json, kind 'data-classifier') to match Week 5's corrected
-- answers (feat/week5-classify-route-fixes, PR #122).
--
-- WHY: 20260602200000_seed_exercises_1_4_1_5.sql only sets lab_config_json
-- while it is still null, so it never reaches a database where 1.4's lab is
-- already seeded (i.e. live). This migration carries the same content as an
-- explicit, unconditional UPDATE so every environment converges on the
-- corrected copy.
--
-- WHAT CHANGED (mirrors the 1.4 quiz fix in
-- 20260915000000_reconcile_1_4_data_classification.sql and the original
-- Week 5 design doc, docs/superpowers/specs/2026-07-17-week5-classify-route-fixes-design.md):
--   - Item 2 (redacted benefits letter): was Confidential/enterprise ("redaction
--     lowers it to confidential, a managed tool is acceptable") — the exact
--     redaction-trap misconception Week 5 was rewritten to stop teaching. Now
--     Regulated (PII/PHI/CUI)/local: redaction is not reclassification.
--   - Item 4 (unreleased solicitation): was Confidential/enterprise. Now
--     Confidential/local — confidential material stays out of any external
--     tool, managed or not, until it's public.
--   - Item 5 (staff salaries memo): was Confidential/enterprise. Now
--     Regulated (PII/PHI/CUI)/local, matching Week 5's deliberately
--     conservative call (personnel data kept out of external tools rather
--     than filed as confidential-managed-OK).
--   - Items 1, 3, 6 (Slack message, public PR comment, blog draft) were
--     already correct and are unchanged.
--   - Tool labels relabeled to the deck's vocabulary (ids unchanged, so every
--     item's `tool` reference stays valid):
--       enterprise: "Enterprise Claude (Nava-contracted, data-protected)"
--         -> "Managed all-staff tool (Claude / Gemini / Copilot)"
--       local: "Local / no external AI tool"
--         -> "No tool / local (no external AI)"
--       consumer: "Consumer chatbot (e.g., personal ChatGPT)"
--         -> "Unsanctioned / consumer tool (e.g., personal ChatGPT)"
--
-- DATA-04: this UPDATE is UNCONDITIONAL and would overwrite a CMS edit to
-- this cell's lab config. Confirm 1.4 hasn't been independently edited
-- through the admin CMS since this lab was last authored before deploying.
update public.modules
set lab_config_json = $json$
{
  "kind": "data-classifier",
  "tools": [
    { "id": "enterprise", "label": "Managed all-staff tool (Claude / Gemini / Copilot)" },
    { "id": "local", "label": "No tool / local (no external AI)" },
    { "id": "consumer", "label": "Unsanctioned / consumer tool (e.g., personal ChatGPT)" }
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
      "dataClass": "Regulated (PII/PHI/CUI)",
      "tool": "local",
      "why": "Redaction is not reclassification. Removing identifiers doesn't make the rest safe — leftover details can still be linkable, and a redaction you didn't do yourself and can't verify doesn't count. Treat it as regulated: no external tool by default, and check the contract before using even a managed tool."
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
      "tool": "local",
      "why": "Procurement-sensitive and not yet public — confidential. Confidential material stays out of any external tool, managed or not, until it's released."
    },
    {
      "text": "An internal memo listing staff salaries.",
      "dataClass": "Regulated (PII/PHI/CUI)",
      "tool": "local",
      "why": "Salaries are personnel data — regulated and off-limits in any external tool, managed or not. Local/no-external only."
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
where cell_id = '1.4';
