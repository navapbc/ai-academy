-- seed_lab_config_1_2 (P4.3a): output-audit lab config as content-as-data.
--
-- Cell 1.2 ("Hallucination as a structural feature, not a bug") gains an
-- `output-audit` exercise: the learner reads a polished, realistic AI-generated
-- Housing Choice Voucher notice and audits it claim-by-claim, marking each as
-- SUPPORTED vs FABRICATED/UNVERIFIABLE. It is AUTO-GRADED against the answer key
-- (no LLM call) — the deterministic sibling of P4.3b's `critique`. This is graded
-- PRACTICE: it records a lab_submissions row but does NOT gate completion (the
-- inline quiz still does).
--
-- Content notes (see docs/superpowers/specs/2026-06-03-p4.3a-error-seeding-design.md
-- §6 for the full answer key + sources, verified 2026-06-03 against eCFR/Cornell
-- LII, HUD.gov, and the Federal Register). The cited provisions are REAL and
-- described accurately; the planted FABRICATED claims are defensible
-- confabulations:
--   * "payment standard fixed at $1,850 nationwide" — no national flat figure
--     exists; 24 CFR 982.503 sets it locally at 90–110% of area FMR (invented number).
--   * "24 CFR 982.555(c) → request a hearing within 14 calendar days" — the hearing
--     right is real (982.555) but the section sets NO day-count; (c) ("Notice to
--     family") only requires the PHA to STATE a deadline, which its admin plan sets.
--   * "leases up 91% within 60 days vs 69% national" — unsourced, unverifiable from
--     the notice; lease-up/success rates are PHA- and year-specific (HUD VMS/PIC).
-- The artifact deliberately does NOT reuse cell 1.2's own worked example (a fake
-- court case + fake regulation citation in a benefits-appeal legal memo), nor
-- P4.3b's SNAP/Medicaid material.
--
-- DRAFT content (status='in_review') pending SME sign-off. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "output-audit",
  "intro": "An AI assistant drafted this Housing Choice Voucher notice for a caseworker to send to a family. It reads clean and authoritative — but fluency isn't proof. Audit each claim: mark it Supported if it is verifiable and correctly stated, or Fabricated / unverifiable if it is a confabulation or can't be checked from the document alone.",
  "artifact": {
    "label": "AI-generated Housing Choice Voucher notice",
    "bodyMd": "**Housing Choice Voucher — Eligibility & Next Steps** *(AI-generated draft for caseworker review)*\n\n**Household:** Ramirez (household of four)  ·  **Status:** Voucher issued\n\n**Program.** Your household has been issued a tenant-based voucher under the Housing Choice Voucher (HCV) program, administered by this public housing agency under **24 CFR Part 982**.\n\n**What you'll pay.** As a participant, your household generally pays the highest of **30% of your monthly adjusted income** or 10% of your monthly gross income toward rent — this is your total tenant payment. The agency pays the remainder directly to the owner as the housing assistance payment.\n\n**Choosing a unit.** The payment standard sets the maximum subsidy. For a two-bedroom unit, the **federal payment standard is fixed at $1,850 per month nationwide**, so any unit renting at or below that amount is fully covered.\n\n**Inspections.** Before the housing assistance payments (HAP) contract begins, the agency must inspect the unit, and it re-inspects the unit at least once every two years while you receive assistance.\n\n**Moving.** You may use this voucher to lease a unit in another jurisdiction that operates a voucher program — this is called portability.\n\n**If you disagree with a decision.** Under **24 CFR § 982.555(c)**, a household that disagrees with a termination of assistance must request an informal hearing **within 14 calendar days** of the agency's notice.\n\n**Track record.** You're in good hands: our agency **leases up 91% of issued vouchers within 60 days, well above the national average of 69%**.\n\n**Next step.** Begin your housing search now — your voucher search term starts on the issue date."
  },
  "claims": [
    {
      "id": "authority",
      "text": "The Housing Choice Voucher program is administered by the public housing agency under 24 CFR Part 982.",
      "status": "supported",
      "why": "Verifiable and correct. 24 CFR Part 982 (\"Section 8 Tenant-Based Assistance: Housing Choice Voucher Program\") is the governing regulation, administered by public housing agencies. Confirm it on eCFR (24 CFR Part 982)."
    },
    {
      "id": "tenant-share",
      "text": "A participant generally pays the highest of 30% of monthly adjusted income or 10% of monthly gross income toward rent (the total tenant payment).",
      "status": "supported",
      "why": "Verifiable. The total tenant payment is the \"highest of\" formula in 24 CFR § 5.628 — 30% of monthly adjusted income, 10% of monthly gross income, or the applicable minimum. Stated accurately here (note: adjusted income, not gross)."
    },
    {
      "id": "payment-standard",
      "text": "The federal payment standard for a two-bedroom unit is fixed at $1,850 per month nationwide.",
      "status": "fabricated",
      "why": "Confabulated. There is no fixed nationwide dollar payment standard. Under 24 CFR § 982.503 the PHA sets the payment standard locally, between 90% and 110% of the area's published Fair Market Rent — it varies by area and unit size and changes annually. A precise national flat figure can't be verified from the notice and contradicts the rule. The confident specific number is the tell."
    },
    {
      "id": "inspection",
      "text": "The agency must inspect the unit before the HAP contract begins and re-inspect it at least every two years during assistance.",
      "status": "supported",
      "why": "Verifiable. 24 CFR § 982.405 requires an initial inspection before the HAP contract and inspections at least biennially during assisted occupancy."
    },
    {
      "id": "portability",
      "text": "The family may use the voucher to lease a unit in another jurisdiction that operates a voucher program (portability).",
      "status": "supported",
      "why": "Verifiable. \"Portability\" under 24 CFR §§ 982.353 and 982.355 lets a family lease outside the issuing PHA's jurisdiction, anywhere a Housing Choice Voucher program operates."
    },
    {
      "id": "hearing-deadline",
      "text": "Under 24 CFR § 982.555(c), a household must request an informal hearing within 14 calendar days of a termination notice.",
      "status": "fabricated",
      "why": "Confabulated. The right to an informal hearing on a termination is real (24 CFR § 982.555), but the regulation sets NO day-count — \"14 days\" appears nowhere in it. Subsection (c) (\"Notice to family\") only requires the PHA to STATE a deadline; the actual number is set by each PHA's administrative plan, not by the CFR. Citing § 982.555(c) as the source of a fixed federal 14-day deadline misstates what it says — verify the citation actually supports the claim."
    },
    {
      "id": "lease-up-stat",
      "text": "The agency leases up 91% of issued vouchers within 60 days, well above the national average of 69%.",
      "status": "fabricated",
      "why": "Unverifiable. These figures cite no source and can't be checked from the notice. Lease-up and success rates are PHA- and year-specific (and \"utilization\" vs. \"success rate\" are different metrics); real data comes from HUD's VMS/PIC systems and PD&R research, not a fixed published constant. Treat unsourced statistics as unverified."
    }
  ]
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '1.2'
  and lab_config_json is null;
