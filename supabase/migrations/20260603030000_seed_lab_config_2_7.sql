-- seed_lab_config_2_7 (P4.4a): synthesis lab config as content-as-data.
--
-- Cell 2.7 ("AI for synthesis") gains a `synthesis` exercise: the learner reads a
-- set of source excerpts (synthetic user-interview notes) in which most
-- participants agree but one or two dissent, and writes a synthesis that PRESERVES
-- the minority view instead of flattening it into a tidy false consensus. The
-- P4.2/#48 LLM-judge anchor-scores it in place. This is graded PRACTICE — it
-- records a lab_submissions row but does NOT gate completion (the inline quiz
-- still does). Reuses the {brief, sections[]} judge + GradeResultCard from #48 with
-- no judge change.
--
-- Content notes (see docs/superpowers/specs/2026-06-03-p4.4a-synthesis-lab-design.md
-- §6 for the full answer key): the interview notes are SYNTHETIC (authored for the
-- exercise) so there is no external-fact risk, but they are internally consistent
-- and the minority/dissenting voices are GENUINELY PRESENT so the rubric is fair.
-- Two voices materially matter and a good synthesis must keep them: P7 (no home
-- internet/device, filed on library wi-fi, the session timed out before she could
-- finish) and P9 (gig/1099 worker with no way to enter self-employment income,
-- unsure his claim is accurate). Fidelity traps are planted on purpose: P3's note
-- is explicitly the researcher's PARAPHRASE (rendering it as a verbatim quote is
-- fabrication); there is NO satisfaction statistic in the notes (any "% satisfied"
-- is invented); the timeout is specific to P7's library-wi-fi context. The scenario
-- (a UI-claim flow) and the minority-voice types (low connectivity, gig income)
-- intentionally DIFFER from the 2.7 lesson's worked example (a benefits portal
-- where a screen-reader user's failure was lost to a "clarity" theme), so the
-- exercise doesn't give away the answer.
--
-- DRAFT content (status='in_review') pending SME review. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "synthesis",
  "title": "Synthesis: write the readout that keeps the voice that matters",
  "subtitle": "Compress these ten interview notes into themes — without smoothing away the reaction that should change the design.",
  "brief": {
    "instruction": "A researcher gave you these notes from ten interviews about the new online unemployment-claim flow, and a readout is due tomorrow. Synthesize them into the themes you'd present — but don't let the tidy summary drop the voice that should change the design. Cover the themes, how widely each was felt, and what still needs follow-up."
  },
  "sources": {
    "label": "User-research notes — online unemployment-claim flow (10 interviews)",
    "bodyMd": "**Research question:** How did claimants experience filing an *initial* unemployment-insurance claim through the new online portal, which replaced the phone-only intake?\n\n*Condensed researcher notes from ten moderated sessions. Lines marked \"paraphrase\" are the researcher's wording, not the participant's.*\n\n- **P1** — Filed in about fifteen minutes. Said it beat the old phone line, where he'd once waited on hold for two hours and given up.\n- **P2** — The step-by-step progress bar kept her oriented; she always knew how many sections were left.\n- **P3** — *(paraphrase)* The plain-language explanation of the \"base period\" made her feel the form wasn't trying to trip her up.\n- **P4** — Completed on a home laptop with no trouble; called it \"straightforward.\"\n- **P5** — Liked being able to save a half-finished claim and come back the next day.\n- **P6** — The confirmation screen with a claim number lowered his anxiety — proof it \"went through.\"\n- **P7** — Has no home internet or computer; filed from her phone on the public library's wi-fi. While she looked up a former employer's address, the session timed out after about twenty minutes of inactivity and cleared her entries. She restarted once, then the library closed. She left without a submitted claim.\n- **P8** — Got through it fine; minor gripe that the Social Security number field didn't auto-format, so he wasn't sure he'd entered it correctly.\n- **P9** — Drives for two delivery apps (1099). The employer section required an employer name and a state UI account number, with no option for self-employment or independent-contractor income. He guessed by entering an app's name and isn't confident the claim is accurate.\n- **P10** — Smooth overall; wished a phone number was offered somewhere for when she got stuck."
  },
  "rubric": {
    "anchors": [
      { "id": "surface-minority-voice", "label": "Surface the dissenting voice", "description": "The synthesis surfaces the minority reactions that materially matter — the claimant who couldn't finish on the library wi-fi before the session timed out (no home internet or device) and the gig/1099 worker with no way to enter self-employment income — rather than presenting a false consensus that the flow works for everyone." },
      { "id": "honest-weighting", "label": "Weight the views honestly", "description": "The synthesis represents how many felt what without distortion: most participants (about 8 of 10) completed quickly and positively, while one could not finish and one is unsure the claim is accurate — neither overstating the positive ('everyone' / 'all users') nor inflating the minority, and noting the sample is small." },
      { "id": "source-fidelity", "label": "Stay faithful to the source", "description": "The synthesis invents no quotes or statistics: it does not turn the researcher's paraphrase (P3) into a verbatim participant quote, does not cite a satisfaction percentage that isn't in the notes, and attributes the session timeout to the specific library-wi-fi context rather than generalizing it to all users." },
      { "id": "flag-follow-up", "label": "Flag the gaps", "description": "The synthesis flags what needs follow-up or where the sample is thin — a small single-channel sample of ten skews toward people with devices and connectivity who completed the flow, and the self-employment/1099 income path and the low-connectivity/timeout experience need dedicated research." }
    ]
  }
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.7'
  and lab_config_json is null;
