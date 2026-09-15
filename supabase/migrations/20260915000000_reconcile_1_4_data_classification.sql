-- reconcile_1_4_data_classification — fix 1.4 to match the corrected Week 5
-- "Classify & Route" answers (feat/week5-classify-route-fixes, PR #122).
--
-- WHY: 20260602190000_load_curriculum_content.sql is a plain UPDATE, but it
-- only reaches a database that re-runs that migration (a fresh `supabase db
-- reset`). Against an environment where it already ran — i.e. this cell is
-- already live — a change to supabase/seed-data/curriculum-content.json alone
-- is a silent no-op. This migration carries the same content as an explicit
-- UPDATE so every environment converges on the corrected copy.
--
-- WHAT CHANGED: 1.4 ("Data classification and privacy hygiene for prompts")
-- taught that regulated PII/PHI is safe to paste into "the firm-sanctioned
-- tool cleared for that data class" — the redaction-trap misconception that
-- Week 5's Classify & Route activity was deliberately rewritten to stop
-- teaching (a managed/enterprise tool is not automatically cleared for
-- regulated or confidential data; redaction someone else did is not
-- reclassification). This UPDATE brings 1.4's body copy and quiz back in
-- line with Week 5's verified-correct rule: regulated/confidential data
-- defaults to no external tool, sanctioned or not, unless you've verified
-- de-identification yourself or a contract explicitly clears the tool. Also
-- adds the "this guidance is still developing / contract supersedes" framing
-- already present in Week 5's body copy.
--
-- DATA-04: this UPDATE is UNCONDITIONAL and would overwrite a CMS edit to
-- this cell. 1.4's quiz is live, so confirm it hasn't been independently
-- edited through the admin CMS since the seed was last generated before
-- deploying; if it has, fold that live copy into
-- supabase/seed-data/curriculum-content.json first so the two don't diverge
-- again.
update public.modules
   set body_md   = $md$A caseworker is summarizing a tricky appeal and pastes the full case notes, name and all, into a personal ChatGPT account to get a cleaner write-up. The summary is good. The paste was a problem.

## What it is

Data classification is sorting information by how sensitive it is before you do anything with it. A common ladder runs from public (already released to anyone) to internal (routine work, not for outsiders) to confidential (would harm Nava or a client if exposed) to regulated. Regulated data includes personally identifiable information (PII), protected health information (PHI), and controlled unclassified information (CUI). The class you're holding decides which tools, if any, you may paste it into.

## Why it matters to you

One careless paste can end a contract and break trust with the people whose data you exposed. Federal acquisition rules now bar vendors from training commercial AI models on non-public government data without contractual authorization, and they require clarity on who owns the data and outputs ([OMB M-25-22, issued April 3, 2025](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf)). That obligation binds the work Nava does for agencies. When you paste client data into an unsanctioned tool, you may be handing it to a model's training set or another vendor's systems, outside any agreement your client signed.

## How to do it / what to watch for

Before you paste anything, classify it, then apply one test:

- Would I be fine if this exact text showed up in a vendor's training set?
- Would I be fine if it leaked in a breach?
- Would I be fine if it surfaced in another customer's AI response?

If any answer is no, it does not go in an external tool, sanctioned or not. Confidential and regulated data (client PII and PHI, a contractor's proprietary data, unreleased solicitations, personnel records) default to **no external tool at all** — being on your organization's managed AI tool doesn't by itself clear it, unless that specific data class has been contractually cleared for that tool. The red flag is reaching for any tool, personal or managed, because it's faster than checking. Redaction is not reclassification: stripping identifiers only counts if you did it yourself and can verify nothing linkable is left, not if you're relying on someone else's redaction.

## Example

The caseworker's instinct, a cleaner summary, was fine. The execution was not. Those case notes are regulated PII tied to a real person and a government program. Pasting them into a personal ChatGPT account sends them outside every agreement the client signed and possibly into training data the client never authorized. The fix is not to abandon AI. It is to strip the name and case number yourself and verify nothing identifying remains before using any tool, or, if you can't verify that, to skip AI for this pass and write the summary yourself.

## In practice

Classify before you paste. If you'd flinch seeing it in a leak or a stranger's AI answer, it doesn't go in an external tool — and when you're not sure what class it is, the safe default is no tool until you confirm with your program lead.

**A note on this guidance:** Nava's data-class guidance is still being developed — treat it as a way to reason about what's safe to share, not as published policy. Your contract's rules always supersede it.

## Sources

- [OMB M-25-22, Driving Efficient Acquisition of AI in Government](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf)$md$,
       quiz_json = $json$[
  {
    "question": "You're drafting a summary of a Medicaid appeal and want AI help. The case file has the claimant's name, address, and medical history. What's the right way to proceed?",
    "options": [
      "Paste it into your personal ChatGPT to move fast, then delete the chat afterward.",
      "Use your organization's managed AI tool, since regulated data is fine there as long as it isn't a personal account.",
      "Strip the name, address, and medical history yourself and verify nothing identifying remains before using any tool — if you can't verify that, don't use an external tool at all.",
      "Email it to yourself first so there's a record, then paste it into a free AI tool."
    ],
    "correctIndex": 2,
    "explanation": "Name, address, and medical history are regulated PII and PHI, and it doesn't matter whether the account is personal or managed. Option 2 is the trap: being on a managed tool doesn't by itself clear regulated data, so 'it's not a personal account' isn't the test. The safe default is no external tool at all, unless you've de-identified the notes yourself and verified nothing linkable remains. Classify before you paste."
  },
  {
    "question": "A teammate wants to use a free AI assistant to clean up a draft of an unreleased federal solicitation Nava is preparing. They argue it's 'just formatting.' What should you tell them?",
    "options": [
      "Formatting is low-risk, so a free tool is fine for this.",
      "It's okay if they remove the agency's name from the document first.",
      "Don't; an unreleased solicitation is confidential and stays out of any external tool, sanctioned or not, until it's public.",
      "It's fine as long as they paste only one section at a time."
    ],
    "correctIndex": 2,
    "explanation": "Unreleased solicitations are confidential until released, and confidential data doesn't go into any external tool — including your organization's managed one — until it's public, not just personal or unsanctioned ones. The task being 'just formatting' doesn't change the sensitivity of the content, which is the trap in option 1. Splitting it into pieces or stripping a name doesn't make confidential procurement material safe to expose either. If you'd flinch seeing it in a leak, it doesn't go in an external tool."
  },
  {
    "question": "Before pasting a chunk of internal text into an AI tool, which question best captures the privacy test you should apply?",
    "options": [
      "Would I be comfortable if this exact text appeared in a vendor's training set, a leak, or another customer's AI response?",
      "Has anyone on my team pasted something like this before without getting in trouble?",
      "Is the AI tool popular and widely used by other professionals?",
      "Can I paste it quickly before the end of the day so I stay on schedule?"
    ],
    "correctIndex": 0,
    "explanation": "The privacy test asks you to imagine the worst plausible exposure: training data, a breach, or another customer's output. If any of those would bother you, the text doesn't belong in an unsanctioned tool. Option 2 substitutes 'no one got caught' for actual risk thinking, which is how careless habits spread. Popularity and your deadline have nothing to do with whether the data is safe to share."
  }
]$json$::jsonb,
       updated_at = now()
 where cell_id = '1.4';
