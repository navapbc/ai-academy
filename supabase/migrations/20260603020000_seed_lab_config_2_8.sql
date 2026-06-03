-- seed_lab_config_2_8 (P4.3c): calibration lab config as content-as-data.
--
-- Cell 2.8 ("Calibrated trust (avoiding over- and under-reliance)") gains a
-- `calibration` exercise: the learner sees several outputs from the SAME AI tool
-- across different task types/stakes and, for each, picks the right verification
-- posture on an ordered scale. AUTO-GRADED against the answer key (no LLM) — the
-- deterministic sibling of P4.3a's `output-audit` — and reports an OVER-/UNDER-
-- reliance summary. This is graded PRACTICE: it records a lab_submissions row but
-- does NOT gate completion (the inline quiz still does).
--
-- Content notes (see docs/superpowers/specs/2026-06-03-p4.3c-confidence-calibration-design.md
-- §6 for the full answer key + rationale). The items are deliberately LOW on hard
-- factual claims — the exercise is about the verification POSTURE, not the output's
-- correctness — so no specific regulatory facts are asserted as true (the lone
-- citation in the last item is attributed to the tool's output, not stated as
-- fact). Targets were SME-reviewed for defensibility. The items deliberately do
-- NOT reuse cell 2.8's own worked examples (tighten an email, a meeting summary,
-- pulling the exact statute/citation for an appeal).
--
-- The `scale` order is load-bearing: index 0 (use-as-is) = most trusting →
-- index 4 (dont-rely) = least trusting. Picking below the target = over-reliance;
-- above = under-reliance.
--
-- DRAFT content (status='in_review') pending SME sign-off. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "calibration",
  "intro": "Below are outputs from the same AI tool across different tasks. It's reliable on some of these and shaky on others. For each, pick how much you'd verify before acting — then see where you over-trusted (forwarded risky output) or under-trusted (over-checked safe output).",
  "scale": [
    { "id": "use-as-is", "label": "Use as-is", "description": "No real check — act on it directly." },
    { "id": "light-check", "label": "Skim it", "description": "A quick read to catch anything obviously off." },
    { "id": "verify-key-claims", "label": "Verify the key facts", "description": "Check the load-bearing claims against a source." },
    { "id": "verify-everything", "label": "Verify every specific", "description": "Check each fact against the source of record." },
    { "id": "dont-rely", "label": "Don't rely on it", "description": "Do it yourself or escalate — don't act on this output." }
  ],
  "items": [
    {
      "id": "format-list",
      "task": "You asked the tool to reformat a list you wrote — bullets and spacing — without changing any of the wording.",
      "target": "use-as-is",
      "why": "Pure formatting of your own words carries no factual risk. A glance is plenty; running a full verification pass here is wasted effort — that's the under-reliance failure this exercise is naming."
    },
    {
      "id": "recap-decision",
      "task": "You asked the tool to write a short team-chat message recapping a decision your team already made.",
      "target": "light-check",
      "why": "Low stakes and internal, but the tool is now generating content, so it can misstate the decision. A quick skim to confirm it matches what you actually decided is the right level — no more."
    },
    {
      "id": "condense-manual",
      "task": "You asked the tool to condense a long section of a state policy manual into key points for your team.",
      "target": "verify-key-claims",
      "why": "Summaries quietly drop conditions or invent thresholds. For an internal digest, check the load-bearing points against the manual — not every clause, but the ones people will act on."
    },
    {
      "id": "draft-faq",
      "task": "You asked the tool to draft a public FAQ about a benefit program — a first pass you'll edit before it's published.",
      "target": "verify-key-claims",
      "why": "Public-facing work tempts a verify-everything pass, but this is a first draft with a human edit still ahead. Verify the load-bearing program facts now; the edit catches the rest. Over-correcting to check every word is its own (under-reliance) waste."
    },
    {
      "id": "benefit-figure",
      "task": "You asked the tool to compute a household's exact monthly benefit amount to enter on an eligibility determination notice.",
      "target": "verify-everything",
      "why": "Case-specific arithmetic against program rules is squarely outside the tool's reliable zone, and the number drives an official determination. The figure is usable only if you independently re-derive every input against the source of record."
    },
    {
      "id": "eligibility-ruling",
      "task": "You asked the tool whether a household with an unusual immigration-status mix qualifies for a benefit, and it returned a confident yes/no with a statutory citation.",
      "target": "dont-rely",
      "why": "A novel, high-stakes eligibility judgment is the canonical over-reliance trap: the confident tone and the citation read as authority, but confidence doesn't track correctness on rare edge cases. Escalate to policy or legal — don't act on the model's ruling."
    }
  ]
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.8'
  and lab_config_json is null;
