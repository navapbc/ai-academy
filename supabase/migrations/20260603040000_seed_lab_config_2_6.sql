-- seed_lab_config_2_6 (P4.4b): voice-edit lab config as content-as-data.
--
-- Cell 2.6 ("AI for writing tasks") gains a `voice-edit` exercise: the learner
-- reads a dense, jargon-heavy source + a writing brief, generates an AI FIRST
-- DRAFT live (streamChat through the chat Edge Function), then revises that draft
-- "AI off" in their own voice — restoring specifics the draft dropped or
-- generalized and fixing reading level + tone. The revision is anchor-scored in
-- place by the P4.2/#48 LLM-judge against three sections (Source + AI first draft +
-- the revision). This is graded PRACTICE — it records a lab_submissions row but
-- does NOT gate completion (the inline quiz still does). Reuses streamChat + the
-- {brief, sections[]} judge + GradeResultCard with no judge change.
--
-- Why a seeded source (see docs/superpowers/specs/2026-06-03-p4.4b-voice-edit-design.md
-- §2/§6 for the full answer key): the AI draft is generated live and is
-- non-deterministic, so the exercise can't depend on the draft being bad. Instead
-- the SOURCE carries the must-preserve specifics and the constraints live in the
-- brief; the learner's job — and the rubric — is to verify the draft against the
-- source and restore/fix what's needed, which holds regardless of how good the
-- live draft is. The source is SYNTHETIC (an authored internal case note) so there
-- is no external-fact risk, but it is internally consistent and carries FIVE
-- must-preserve specifics that a good revision must keep: (1) Form CCS-9
-- (Redetermination); (2) the two most recent pay stubs; (3) the August 15, 2026
-- deadline; (4) the new $72 monthly copay (up from $45) effective September 1,
-- 2026; (5) the consequence — the subsidy ends August 31, 2026 if nothing is
-- returned (reapply, up to 30 days, slot not guaranteed). Figures are marked
-- "(illustrative)". The scenario (a child-care-subsidy redetermination) and these
-- specifics intentionally DIFFER from the 2.6 lesson's worked example (a 14-page
-- eligibility policy turned into a notice that drops a form name + a June 30 date),
-- so the exercise doesn't give away the answer.
--
-- DRAFT content (status='in_review') pending SME review. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "voice-edit",
  "title": "Voice-edit: turn the case note into a notice a parent can use",
  "subtitle": "Generate an AI first draft, then revise it in your own voice — keep every specific, write it plainly, and end with one clear next step.",
  "source": {
    "label": "Internal case note — Child Care Subsidy (CCS) annual redetermination",
    "bodyMd": "**Program:** Child Care Subsidy (CCS) — annual redetermination.\n\n**Case summary (internal):** The household's 12-month eligibility period ends **August 31, 2026**. Per CCS policy, continued assistance requires a completed redetermination before the period closes. The caseworker must notify the family of the action required, the supporting documentation, the deadline, and the consequence of non-response.\n\n- **Action required:** Submit a completed **Form CCS-9 (Redetermination)** and the household's **two most recent pay stubs** to verify current earned income.\n- **Deadline:** Documents must be received **no later than August 15, 2026** — fifteen business days before the eligibility period closes.\n- **Copay adjustment:** Updated income places the household in a higher copay tier. If the redetermination is approved, the **monthly family copay rises from $45 to $72 (illustrative)**, effective **September 1, 2026**.\n- **Consequence of non-response:** If the form and pay stubs are not received by August 15, 2026, the **subsidy ends August 31, 2026**. The family would then need to reapply; a new eligibility determination can take **up to 30 days**, during which the provider is not guaranteed to hold the child's slot."
  },
  "brief": {
    "instruction": "A caseworker handed you this internal case note and needs a notice to send the family today. Generate an AI first draft, then revise it — AI off — for the parent who will actually read it. AI drafts tend to flatten the specifics into vague reassurance and adopt a generic voice; your job is to keep every concrete detail, write it plainly and warmly, and end with one clear next step.",
    "constraints": [
      "About 150 words or fewer.",
      "Sixth-grade reading level — short sentences, common words, active voice, and 'you'. Don't make the reader decode jargon like 'redetermination' or 'eligibility period'.",
      "Warm, respectful tone — this is a family, not a file.",
      "Preserve every specific: Form CCS-9, the two most recent pay stubs, the August 15, 2026 deadline, the new $72 monthly copay starting September 1, 2026, and the consequence that the subsidy ends August 31, 2026 if nothing is returned.",
      "End with one clear next step."
    ]
  },
  "rubric": {
    "anchors": [
      { "id": "preserve-specifics", "label": "Keep every specific", "description": "The revision keeps every concrete detail from the source — Form CCS-9, the two most recent pay stubs, the August 15, 2026 deadline, the new $72 monthly copay effective September 1, 2026, and the consequence that the subsidy ends August 31, 2026 — rather than dropping any or softening them into vague phrases like 'submit your documents soon'." },
      { "id": "plain-language", "label": "Hit the plain-language target", "description": "The revision reads at roughly a sixth-grade level — short sentences, common words, active voice, and 'you' — and explains or avoids program jargon (e.g. 'redetermination', 'eligibility period') so a parent can act without decoding it." },
      { "id": "tone-and-next-step", "label": "Right tone, one next step", "description": "The revision reads in a warm, respectful tone appropriate for a family and ends with one clear next step the reader can take (return Form CCS-9 and the two pay stubs by August 15, 2026), rather than a vague 'contact us' or a list of competing actions." },
      { "id": "improves-on-draft", "label": "Improve on the draft", "description": "The revision genuinely improves on the AI first draft — it restores specifics the draft dropped or generalized and fixes tone or reading-level problems — rather than submitting the draft essentially verbatim." }
    ]
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.6'
  and lab_config_json is null;
