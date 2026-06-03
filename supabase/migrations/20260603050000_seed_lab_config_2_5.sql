-- seed_lab_config_2_5 (P4.5a): context-window diagnostic lab config as content-as-data.
--
-- Cell 2.5 ("Working with the context window") gains a `context-diagnostic`
-- exercise: the learner reads realistic civic-tech AI-session scenarios and, for
-- each, picks the best diagnosis/remedy. It auto-grades against `correctIndex`,
-- reveals a per-item "why", and compiles the correct calls into a keepable
-- "Working with the context window — quick reference" takeaway. This reuses the
-- existing ScenarioExercise component (the same single-select-scenario shape as
-- 1.9 disclosure-builder / 1.10 regulatory-check) — only a new `kind`. It is
-- auto-graded PRACTICE that records a lab_submissions row but does NOT gate
-- completion (the inline quiz still does).
--
-- Content (see docs/superpowers/specs/2026-06-03-p4.5a-context-diagnostic-design.md
-- §4 for the full answer key): conceptual best-practices grounded in the 2.5
-- lesson + the IBM context-window framing (the window is the model's working
-- memory, ~1.5 tokens/word; anything outside it effectively doesn't exist;
-- irrelevant context degrades answers, not just overflow; restart/re-paste/paste-
-- only-the-relevant-section/one-thread-per-task when it drifts). Factual risk is
-- low; the right answers are genuinely correct and the distractors plausibly
-- wrong. The five scenarios deliberately use DIFFERENT specifics (SNAP appeal
-- window, a Medicaid transport waiver, a public-housing waitlist letter, a token-
-- budget intuition) from both the 2.5 lesson's worked example (a Medicaid renewal
-- that flips annual->monthly) and the inline quiz (a 40-min contradiction, an
-- 80-page manual, a marathon thread), so the lab reinforces the concepts without
-- handing the learner the quiz answers verbatim. Token figures are illustrative
-- round numbers used to build intuition ("about ...").
--
-- DRAFT content (status='in_review') pending SME review. Idempotent: only sets
-- lab_config_json when it is still null, so a later CMS/Studio edit is never
-- clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "context-diagnostic",
  "takeaway": {
    "title": "Working with the context window — quick reference",
    "intro": "The context window is the model's working memory — your prompt, what you paste, and the conversation so far, at roughly 1.5 tokens per word. When it overflows or fills with clutter, answers drift and contradict facts the model got right earlier. Keep these moves handy:"
  },
  "items": [
    {
      "prompt": "You've spent about 40 minutes refining a SNAP denial notice with an AI tool. Earlier in the thread it correctly said the household has 90 days to appeal. Now, deep in the same conversation, it says 30 days. What's the best move?",
      "options": [
        "The model got worse over time — switch to a different AI tool and start the work there.",
        "Start a fresh thread and re-paste the authoritative appeal-window rule, then continue.",
        "Stay in the thread and point out the mistake — it'll self-correct from here.",
        "Paste the full 200-page SNAP policy manual into the thread to remind it of every rule."
      ],
      "correctIndex": 1,
      "why": "The correct 90-day appeal window scrolled out of the context window as the thread grew — the model didn't degrade, and it won't reliably self-correct a fact it can no longer see. A fresh thread with just the authoritative rule and the current draft brings the fact back into working memory. Pasting the whole manual floods the window with material the task doesn't need and buries the rule that matters."
    },
    {
      "prompt": "A caseworker needs one narrow answer: does a specific Medicaid waiver cover non-emergency medical transport? They're about to paste the entire 300-page waiver handbook so the model 'has everything.' What's the better move?",
      "options": [
        "Paste the whole handbook — more context always makes the answer more accurate.",
        "Paste nothing and let the model answer the waiver question from general knowledge.",
        "Paste only the transport-coverage section the question is actually about.",
        "Split the handbook across ten messages so the whole thing still fits in the thread."
      ],
      "correctIndex": 2,
      "why": "The window has hard limits, and irrelevant material doesn't just risk overflow — it pulls the answer off target. Pasting only the transport-coverage section gives the model exactly what the question needs. Answering from general knowledge invites a confident but unsourced guess about a specific waiver, and splitting the handbook across messages still floods the window with pages the question never touches."
    },
    {
      "prompt": "A teammate keeps a single AI thread open all week — eligibility questions, a grant narrative, meeting notes, code snippets, all in one conversation — because they think 'the model remembers more that way.' What would you tell them?",
      "options": [
        "They're right — one long thread is always sharper because the model retains everything.",
        "It doesn't matter — thread length has no effect on answer quality either way.",
        "Just tell the model to ignore the earlier topics and keep using the one thread.",
        "Start a new thread for each task — unrelated history piles up in the window and pulls answers off course."
      ],
      "correctIndex": 3,
      "why": "A week of unrelated topics fills the window with stale context that crowds out the current task and causes drift — more history isn't more accuracy. A fresh thread per task keeps only what's relevant in view. Telling the model to 'ignore' the earlier topics doesn't reclaim the space: that text still sits in the window competing for attention."
    },
    {
      "prompt": "In a long thread drafting a public-housing waitlist letter, you set a firm rule early on: never tell applicants their spot is guaranteed. Forty messages later the latest draft promises a guaranteed unit. You'd rather not lose this thread. What's the most reliable fix?",
      "options": [
        "Re-state the 'never promise a guaranteed spot' rule in your next message, right before asking for the revision.",
        "Trust that the rule you set early in the thread still holds and just ask for small edits.",
        "Scroll up, find your original instruction, and click it — that re-activates the rule.",
        "Conclude the model can't follow rules and write the whole letter by hand instead."
      ],
      "correctIndex": 0,
      "why": "The early instruction has drifted far from the current turn and lost its grip — that's why the draft now contradicts it. Re-stating the constraint in your next message puts it back in the model's immediate working memory. Scrolling to the old message changes nothing: what governs the answer is what you send now, not what's visible on your screen — and abandoning AI entirely overcorrects for a context problem you can fix in one line."
    },
    {
      "prompt": "A context window holds about 8,000 tokens, and text runs about 1.5 tokens per word. Roughly how much of that budget does a single 2,000-word policy excerpt consume?",
      "options": [
        "About 300 tokens — a tiny fraction, so length rarely matters.",
        "About 2,000 tokens — one token per word.",
        "About 3,000 tokens — nearly 40% of the window, so paste excerpts, not whole manuals.",
        "None — pasted documents don't count against the budget, only your typed prompt does."
      ],
      "correctIndex": 2,
      "why": "At about 1.5 tokens per word, 2,000 words is roughly 3,000 tokens — nearly 40% of an 8,000-token window from one excerpt. Pasted material counts against the budget exactly like your prompt and the running conversation do, which is why a 'paste everything' habit fills the window fast. A rough token sense tells you to bring in the section you need, not the whole manual."
    }
  ]
}
$json$::jsonb,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.5'
  and lab_config_json is null;
