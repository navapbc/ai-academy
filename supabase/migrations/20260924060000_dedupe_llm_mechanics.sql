-- dedupe_llm_mechanics — give the token/context-window explanation one home
-- each instead of three, and converge two cells that had drifted from the seed.
--
-- WHY: 1.1 ("Mechanical mental model"), 2.5 ("Working with the context window")
-- and the Resources lesson "How Claude works: tokens & context windows" all
-- opened by defining the context window as the model's working memory, and 1.1
-- and 2.5 both measured it at ~1.5 tokens per word citing the same IBM page. A
-- learner working the supplemental section read it three times.
-- See docs/content/supplemental-audit.md.
--
-- WHO OWNS WHAT NOW
--   1.1  — the mechanics: next-token prediction, what a token is. Names the
--          context window in one clause and points at 2.5 for the depth.
--   2.5  — managing the window: the two failure modes (overflow, and irrelevant
--          context degrading the answer), the tactics, the lab. Points back at
--          1.1 for the mechanics instead of restating them, and out to the
--          Resources lesson for Claude-specific behaviour (compaction, cost).
--   Resources lesson — UNCHANGED. It is the only Nava-specific copy (Week 1
--          recap, compaction warnings, token budget) and now duplicates nothing.
--
-- DELIBERATELY NOT GUTTED: the audit floated stripping 2.5 back to a framing
-- paragraph plus its lab. On a close read only its opening definition was
-- duplicated — the two failure modes, the four tactics and the worked example
-- appear nowhere else — so cutting them would have destroyed unique teaching
-- rather than removing repetition. Only the duplicated definition went.
--
-- DRIFT REPAIRED (found while doing the above, unrelated to de-duplication):
-- 1.1 and 1.3 were the only two matrix cells whose body in
-- supabase/seed-data/curriculum-content.json did not match the database. Both
-- carried an unshipped plain-language clarification — 1.1 expanding "working
-- memory", 1.3 expanding "pattern-matching or synthesis" — written into the JSON
-- but never carried into a migration, so they were a silent no-op against every
-- already-seeded environment (exactly the trap these reconcile migrations exist
-- to close). 1.3's clarification ships here verbatim and is its only change.
-- 1.1's is superseded: the de-duplication removes the whole clause it expanded.
--
-- ALSO FIXED in 1.1: the Example cited IBM's context-window page for a claim
-- about the model sampling from "a range of probabilities". That page does not
-- support it, so the hyperlink is dropped; the wording stands and IBM is still
-- cited (correctly) for the token measurement.
--
-- After this migration all 28 matrix bodies match the seed JSON byte for byte.
--
-- Re-runnable: a second apply rewrites the same values.

update public.modules
   set body_md = $md$A teammate says the chatbot "looked up" the SNAP income limit and got it wrong, so the database must be out of date. There is no database. Knowing what the model actually does is the difference between trusting it and checking it.

## What it is

A large language model is a next-token predictor. It was trained on a huge pile of text to guess the next chunk of text, called a token (roughly part of a word; figure about [1.5 tokens per word](https://www.ibm.com/think/topics/context-window)). It also holds only a limited amount of text at once, its context window. When it answers, it is completing a pattern, not pulling a fact from a stored record.

This lesson is the mental model underneath everything else. Lesson 2.5 picks up the context window itself and how to work inside it.

## Why it matters to you

If you think the model retrieves facts, you cannot reason about when it fails. You will treat a wrong Medicaid figure as a lookup glitch instead of what it is: a plausible guess. The mechanical model is the foundation under every other skill. A [validated literacy test](https://arxiv.org/abs/2411.00283) found that what people actually know about these systems predicts how well they use them far better than how confident they feel. Memorized rules break the first time a new situation appears; a working model travels.

## How to do it / what to watch for

Hold four facts in mind whenever you use a model:

- It predicts text. It is not searching a fact database, so "it looked it up" is the wrong picture.
- Its memory is finite. Long threads and big documents can push earlier content out of the context window.
- The same prompt can give different answers, because the model samples from probabilities rather than returning one fixed result.
- Sounding sure is not the same as being right. The model has no internal signal for "I don't know."

The red flag is any moment you catch yourself saying the model "knows" or "remembers" something. That language hides the machine and leads you to skip verification on exactly the claims that need it.

## Example

You run the same prompt twice, asking a model to summarize a state's Medicaid renewal rule. The two answers differ in wording, and one adds a deadline the other left out. A colleague calls it a bug. It is not. Because the model samples its next token from a range of probabilities, repeated runs vary by design. The right response is not to pick the version you like. It is to verify the deadline against the official rule, since neither run is a retrieval.

## In practice

The model completes patterns; it does not look things up. Verify any fact it states.

## Sources

- [GLAT: GenAI Literacy Assessment Test (arXiv 2411.00283)](https://arxiv.org/abs/2411.00283)
- [IBM, What is a context window?](https://www.ibm.com/think/topics/context-window)
- [NIST Generative AI Profile (AI 600-1)](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)$md$,
       updated_at = now()
 where cell_id = '1.1';

update public.modules
   set body_md = $md$You're staring at two tasks before lunch: summarize a 60-page state Medicaid policy, and decide whether one family's renewal gets denied. A teammate suggests AI for both. One of those is a good idea.

## What it is

This is the habit of sorting a task before you reach for a tool. Ask one question: is this mainly pattern-matching or synthesis — recognizing something similar to what it's seen before, or combining information in a new way — where speed and breadth help? Or is it a values, ethics, or accountability call, where a person's judgment is the actual point? AI is built to find and recombine patterns at scale. It cannot own a decision or answer for its consequences. That distinction decides whether AI belongs anywhere near the work.

## Why it matters to you

The worst civic-tech AI failures are not bad outputs. They are choosing to use AI on a task that should have stayed human. AI performs well inside its competence and quietly worse on tasks that only look similar, so the line between them is easy to miss ([Dell'Acqua et al., "Navigating the Jagged Technological Frontier"](https://pubsonline.informs.org/doi/10.1287/orsc.2025.21838)). When the task affects someone's benefits, discipline, or legal standing, getting that sorting wrong is not an editing problem. It is a harm to a real person who is counting on a fair, accountable decision.

## How to do it / what to watch for

Before delegating, name the task type. Keep these categories human-led, with AI doing background research at most:

- Disciplinary or personnel decisions about a specific person
- Sensitive client communications (denials, terminations, bad news)
- Novel policy interpretation where no clear precedent exists
- Life-affecting eligibility calls (benefits, housing, immigration status)

For everything else, ask whether speed or breadth genuinely helps. Drafting, summarizing, and surfacing options are good fits, as long as a person verifies and signs off. The discernment to judge what should and should not be delegated is itself a core AI skill ([Anthropic's 4D AI Fluency](https://www.anthropic.com/learn/claude-for-you)). The red flag: deadline pressure pushing you to delegate the decision, not just the prep.

## Example

A caseworker faces a benefits-eligibility determination. The rule is human-only: a person's income, household, and access to support hang on it, and someone must be accountable for the call. But that same caseworker can hand AI the 60-page policy document and ask for a plain-language summary of the income rules, then read the cited sections to confirm. Same morning, two tasks, one line drawn correctly. AI accelerates the reading. The human makes the determination.

## In practice

Delegate the prep, never the judgment. If a person must answer for the outcome, a person makes the call.

## Sources

- [Anthropic, 4D AI Fluency](https://www.anthropic.com/learn/claude-for-you)
- [Dell'Acqua et al., "Navigating the Jagged Technological Frontier," Organization Science](https://pubsonline.informs.org/doi/10.1287/orsc.2025.21838)$md$,
       updated_at = now()
 where cell_id = '1.3';

update public.modules
   set body_md = $md$You've been refining a benefits notice with an AI tool for 40 minutes across a sprawling thread. Now it contradicts a rule it stated correctly earlier, and you can't tell why. The model didn't get dumber. The conversation outgrew what it could hold.

## What it is

The context window is everything the model can read at once: your prompt, the pasted material, and the conversation so far — [the model's working memory](https://www.ibm.com/think/topics/context-window). Lesson 1.1 covers the mechanics underneath it, including what a token is and why the model predicts rather than retrieves; this lesson is about managing the window you have. Anything outside it effectively doesn't exist for the model, so the skill is being deliberate about what you put in and what you leave out.

## Why it matters to you

Most "the AI gave me a weird answer" moments are context-management failures, not model failures. Two problems cause them. First, the window overflows, so earlier instructions or a key policy excerpt fall out of view and the model contradicts itself. Second, and less obvious, irrelevant context degrades answers too. Padding a prompt with material the model doesn't need can pull it off target, the same way a cluttered desk slows you down. Both cost you accuracy on work that reaches a beneficiary.

## How to do it / what to watch for

Treat the window like working memory with hard limits:

- **Bring in what's relevant:** paste the specific policy section the task needs, not the whole manual.
- **Summarize or chunk** long material so the essential parts fit.
- **Start a fresh thread** when old context has drifted and the model is contradicting itself.
- **Cut the clutter:** leave out tangents and stale detail that can pull the answer off course.

The red flag is self-contradiction across a long thread, or answers that drift further from your actual question the more you add. When that happens, summarize what matters into a clean new prompt and restart.

For how Claude in particular behaves as a chat fills up — compaction, the warnings you will see, and what a long thread costs — see "How Claude works: tokens & context windows" in Resources.

## Example

In a long thread, you ask the model to rewrite a Medicaid notice. Early on it correctly states the renewal is annual. Forty messages later, after detours into formatting and tone, it calls the renewal monthly. The correct fact scrolled out of its working memory. You open a fresh thread, paste only the renewal rule and the draft, and the contradiction disappears.

## In practice

The model only knows what's in the window; bring in what matters, and restart when it drifts.

## Sources

- [IBM, What is a context window?](https://www.ibm.com/think/topics/context-window)$md$,
       updated_at = now()
 where cell_id = '2.5';
