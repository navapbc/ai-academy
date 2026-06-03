-- seed_lab_config_2_2_2_3 (P4.3b): critique lab configs as content-as-data.
--
-- Cells 2.2 ("Output validation as a verifiable skill") and 2.3 ("Counteracting
-- the polished-output trap") gain a `critique` exercise: the learner reads a
-- polished, realistic AI-generated artifact and writes a critique, which the
-- P4.2 LLM-judge anchor-scores in place. This is graded PRACTICE — it records a
-- lab_submissions row but does NOT gate completion (the inline quiz still does).
--
-- Content notes (see docs/superpowers/specs/2026-06-03-p4.3b-clean-critique-design.md
-- §6 for the full answer key + sources): the cited provisions (7 CFR 273.10,
-- 42 CFR 435.916) are REAL and described accurately. The only intentionally
-- unverifiable elements are the planted effective date(s) and statistic(s),
-- which are fabricated for the exercise. The artifacts deliberately do NOT reuse
-- the worked examples in the lessons themselves (which would give away the
-- answer): 2.2's lesson uses 42 CFR 435.916 + "March 1, 2024"; 2.3's lesson uses
-- the partial-submissions question.
--
-- DRAFT content (status='in_review') pending SME review. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

-- 2.2 — critique a polished AI SNAP eligibility summary.
update public.modules
set lab_config_json = $json$
{
  "kind": "critique",
  "title": "Critique: validate the AI eligibility summary",
  "subtitle": "Read it the way you'd read any unverified draft — then say what you'd trust, what you'd flag, and what you'd check.",
  "brief": {
    "instruction": "An AI tool produced this SNAP eligibility summary for a caseworker to forward to a client. Write a short critique: which claims can you rely on, which can't you verify from this document alone, and what would you check before acting on it?"
  },
  "artifact": {
    "label": "AI-generated eligibility summary",
    "bodyMd": "**SNAP Eligibility Summary — Household #4471** *(AI-generated draft for caseworker review)*\n\n**Determination:** Income-eligible. Estimated monthly allotment: **$412**.\n\n**Basis.** Eligibility and benefit levels are set under **7 CFR § 273.10**, \"Determining household eligibility and benefit levels,\" which combines countable income, allowable deductions, and household size into the monthly allotment.\n\n**Income test.** Reported gross monthly income is **$1,980** for a household of three — below the 130% federal poverty line. After the standard deduction and the 20% earned-income deduction, net income falls within the net-income limit.\n\n**Recent change.** Effective **March 1, 2025**, the standard deduction for a three-person household rose to **$224**, increasing this household's allotment by roughly $30 per month.\n\n**Statewide context.** About **88%** of eligible households in the state are already enrolled, so additional outreach for this case is likely unnecessary.\n\n**Recommendation.** Approve and certify for a 12-month period."
  },
  "rubric": {
    "anchors": [
      { "id": "flag-citation-verify", "label": "Verify the citation", "description": "The critique flags the cited regulation (7 CFR 273.10) or its authoritative-sounding paraphrase as something to confirm against the primary source, rather than trusting it because a citation is present." },
      { "id": "flag-unverifiable-numbers", "label": "Catch unverifiable claims", "description": "The critique identifies the specific effective date and deduction amount (the March 2025 / $224 change) and the ~88% enrollment statistic as claims that cannot be verified from this document alone." },
      { "id": "distinguish-verifiable", "label": "Don't blanket-reject", "description": "The critique distinguishes claims that are verifiable in principle (the income-vs-poverty-line math, the household size) from the unverifiable ones, instead of rejecting the entire summary." },
      { "id": "name-verification-step", "label": "Name a concrete check", "description": "The critique names at least one concrete verification step — e.g. open eCFR for 7 CFR 273.10, check the deduction against the current USDA/FNS figure, or request the source behind the 88% statistic." }
    ]
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.2'
  and lab_config_json is null;

-- 2.3 — critique a slick AI PRD that reads "done" but buried a decision.
update public.modules
set lab_config_json = $json$
{
  "kind": "critique",
  "title": "Critique: interrogate the polished PRD",
  "subtitle": "It looks finished. Find what the polish is hiding before it ships.",
  "brief": {
    "instruction": "An AI tool drafted this PRD and it reads ready to circulate. Write a short critique: what open question did it quietly decide, which statements are assumptions dressed up as facts, and what would you confirm with stakeholders before building it?"
  },
  "artifact": {
    "label": "AI-generated product requirements document",
    "bodyMd": "# PRD: \"Quick Renew\" — Medicaid Renewal *(AI-generated draft)*\n\n**Status:** Ready for review  ·  **Confidence:** High\n\n## Summary\nQuick Renew lets enrollees complete their annual Medicaid renewal in a single online session. The system checks available data, confirms ongoing eligibility, and returns a renewal decision immediately.\n\n## Background\nRenewals are governed by **42 CFR § 435.916**. When the agency can confirm ongoing eligibility from data already available to it, it renews automatically (an *ex parte* renewal); otherwise the enrollee completes a prepopulated renewal form.\n\n## How it works\n1. The enrollee signs in and sees a prepopulated renewal form.\n2. The system verifies income against available electronic data sources.\n3. If the data confirms eligibility, the renewal is approved in the same session.\n4. The enrollee receives a confirmation email.\n\n## Acceptance criteria\n- Every enrollee completes renewal in under five minutes.\n- All enrollees receive a digital confirmation notice.\n- Renewal decisions are issued in a single session.\n\n## Adoption\nInternal data shows 95% of enrollees renew online, so a mail-in path is out of scope for v1."
  },
  "rubric": {
    "anchors": [
      { "id": "surface-open-question", "label": "Surface the buried decision", "description": "The critique surfaces at least one silently-decided open question — e.g. what data counts as 'reliable' enough to auto-renew (ex parte) versus drop to the manual form, or how the no-match / ambiguous-data case is handled." },
      { "id": "separate-assumptions", "label": "Assumptions are not facts", "description": "The critique separates stated assumptions from verified facts — flagging claims like 'all enrollees receive a digital notice,' 'under five minutes,' or the 95%-online figure as assumptions, not established facts." },
      { "id": "name-false-completeness", "label": "Name the false 'done'", "description": "The critique names the false sense of completeness — the confident, caveat-free 'Ready for review / High confidence' framing hides unresolved decisions rather than resolving them." },
      { "id": "propose-stakeholder-confirm", "label": "Confirm before building", "description": "The critique proposes what to confirm with stakeholders before acting — e.g. the reliable-data definition, the real digital-access rate, the non-digital/mail-in path, or authorized-representative submission." }
    ]
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.3'
  and lab_config_json is null;
