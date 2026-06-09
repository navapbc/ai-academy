# Nava Generative AI Literacy Test (GLAT) — question bank

**Source:** provided by Nava (product owner), 2026-06-09. Authoritative content for **P4.10** (the
GLAT-style objective gate, cell 2.14).

**How it's used (decision D7):** there is **no Stage 3** in the app. Passing the GLAT is the program
**exit credential** — scoring **≥80% on the objective bank** sets a **completion marker** ("passed
the course") and unlocks nothing else. No `stage='3'` schema concept is added.

- The **objective questions** below (General GLAT Supplemental + Nava GLAT Supplemental) have answer
  keys and are what the ≥80% gate is computed from.
- The **soft / self-reported questions** are diagnostic CBAM-style Likert items (integration stage,
  delegation calibration, personal-evidence artifact, cross-practice transfer, stewardship). They
  are **not scored** for the gate — captured for calibration only.

---

## Section A — Soft / self-reported (diagnostic, NOT scored; 5-point scales)

### A1 — Integration stage (CBAM LoU mapped to matrix Stages 1–5)
*In the past month, which best describes how generative AI shows up in your work?*
1. I have not used AI in my work in the past month.
2. I have tried AI for one or two specific tasks but it isn't part of my regular workflow.
3. I use AI regularly for specific recurring tasks where I am confident it helps me.
4. AI is integrated across most of my workflow, and I make deliberate choices about when to use it and when not to.
5. I help others on my team adopt AI in their work, or I contribute to shared AI practices in my practice or organization.

### A2 — Delegation calibration (Cell 1.3; the "I declined" marker separating Stage 1 from Stage 2+)
*In the past month, can you recall a time when you deliberately decided NOT to use AI on a task you could have given it to?*
1. I have not declined to use AI for a task I could have given it.
2. I have declined, but I couldn't easily explain my reasoning.
3. I declined and could explain my reasoning (accountability, sensitivity, judgment required, etc.) in one sentence.
4. I keep a working sense of which task categories I do not delegate to AI, and I can name three of them in my work.
5. I help teammates think through delegation lines and where AI use is or isn't appropriate.

### A3 — Personal-evidence artifact (Cells 2.9 + 2.11; harder to inflate — asks about something produced)
*Which of the following do you maintain about your own AI use?*
1. I don't track my AI use in any systematic way.
2. I keep mental notes about where AI helps me and where it doesn't.
3. I have a written list of prompts or tasks where AI has worked well for me.
4. I have a written record of AI failures I have hit on real work — including the prompt, the failure mode, and the verification move that caught it.
5. I maintain a use-case library and have written at least one diligence statement documenting how I used AI on a high-stakes task.

### A4 — Cross-practice transfer (Stage 3; far-transfer marker per dossier §9.8)
*In the past three months, have you used AI to help with work that sits outside your primary practice area?*
1. I have not.
2. I have tried, but I wasn't able to evaluate the quality of what AI produced because the work was outside my expertise.
3. I have used AI for cross-practice work and had a teammate from that practice review the output.
4. I have used AI for cross-practice work and I can spot when its output gets the discipline-specific conventions wrong.
5. I regularly use AI to participate substantively in adjacent practices' work, and teammates come to me for cross-practice judgment calls.

### A5 — Stewardship / sharing behavior (Stage 5a marker)
*In the past three months, how often have others come to you for advice, prompts, or examples about using AI on their work?*
1. Never.
2. Once or twice, informally.
3. Occasionally — I have shared a useful prompt or pattern with a teammate.
4. Regularly — I help teammates calibrate their AI use or troubleshoot when AI isn't working for them.
5. I run, lead, or contribute to a forum, library, or peer-learning structure for AI use on my team or in my practice.

---

## Section B — General GLAT objective questions (SCORED; correctIndex is 0-based)

> Each item carries an `if correct` / `if incorrect` explanation, reproduced as the rationale.

### B1 — Cell 1.1 (mental model)
*Which of the following best describes "Generative AI"?*
0. A form of artificial intelligence that focuses on translating languages in real-time.
1. An AI system designed to enhance the speed and accuracy of data retrieval in search engines.
2. **AI that creates new content like text, images, or music by learning from existing data.** ✓
3. AI technology used primarily for managing and organising large databases.
- **Why:** Generative AI is defined by producing new artifacts (text, images, audio, code, video) from patterns in training data — distinct from discriminative AI (classification, search ranking, retrieval) and rule-based systems. The distinction predicts where it helps (synthesis, drafting, ideation) vs. struggles (precise retrieval, deterministic output).

### B2 — Cell 1.1 (mental model)
*Which of the following statements best describes an LLM?*
0. It generates text by translating input text into multiple languages simultaneously.
1. It generates text by analysing and summarising large volumes of web content.
2. **It generates text by predicting the next word based on the context of previous words.** ✓
3. It generates text by using pre-defined templates and filling in the blanks.
- **Why:** Next-token prediction is the foundational mental model — it explains output variability, why fluency is independent of factuality, and why hallucination is structural, not a fixable bug.

### B3 — Cell 1.3 (delegation literacy)
*Which of the following tasks can Generative AI perform with a high degree of accuracy?*
0. Predicting stock market trends
1. Diagnosing rare diseases
2. **Generating human-like text based on prompts** ✓
3. Making ethical decisions in complex scenarios
- **Why:** Fluent contextual text is what generative AI was built for. Markets/diagnosis/ethics are high-cost-of-wrong tasks where it produces plausible-but-unreliable output — the basis of delegation literacy.

### B4 — adjacent to Cell 1.1 (technical concept)
*In the context of Generative AI, what is "zero-shot learning"?*
0. **The ability of a model to perform a task without any task-specific training.** ✓
1. A method of reducing the model's training time to zero.
2. Training a model without any data.
3. A technique for generating synthetic training data.
- **Why:** Zero-shot = performing a task it wasn't explicitly trained on, relying on general pre-training. Explains why one LLM is useful across tasks and why prompt construction (which scopes the task) matters.

### B5 — Cell 2.1 (prompt construction)
*Which of the following is a potential challenge when using prompt-based development for text generation?*
0. **Crafting a prompt that accurately captures the desired context and nuances.** ✓
1. The need for extensive labelled data to train the model.
2. The language model can only generate binary outputs.
3. The requirement for complex feature engineering.
- **Why:** Prompt construction is the highest-leverage skill; a poor prompt yields plausible-but-wrong output costlier to fix than to redo. Labelled data / binary output / feature engineering are classical-ML concerns, not prompting.

### B6 — Cell 1.1 (tokens)
*What does the term "token" refer to in the context of an LLM?*
0. A security measure used to authenticate API requests to the language model.
1. A reward given to users for contributing valuable data to train the language model.
2. A unique identifier assigned to each user interacting with the language model.
3. **A unit of text, such as a word or a subword, that the model processes individually.** ✓
- **Why:** Tokens are the unit of input/output; token count governs context-window usage and API cost. Foundational to managing context, cost, and prompt design.

### B7 — adjacent to Cell 1.1/1.2 (AGI)
*Which of the following is NOT a requirement for an AI to be considered AGI?*
0. The capacity to understand and generate natural language.
1. **The ability to predict future events with perfect accuracy.** ✓
2. The ability to learn and adapt to new tasks without human intervention.
3. The capability to perform tasks across various domains with human-like proficiency.
- **Why:** AGI = human-like generality, not omniscience. Perfect prediction is a capability no human has and isn't required; the trap is treating AGI as omniscience.

### B8 — Cell 2.5 / 2.12 (RAG)
*How does RAG (Retrieval-Augmented Generation) enhance the capabilities of an LLM?*
0. By increasing its computational speed.
1. By improving its grammar and syntax.
2. By enabling it to understand multiple languages.
3. **By providing it with real-time and relevant data.** ✓
- **Why:** RAG changes what the model can access at inference time by retrieving relevant docs into context — right for queries depending on fresh or proprietary data.

### B9 — Cell 2.1 (prompt construction)
*When using generative AI to create a marketing pitch, which strategy is LEAST likely to be effective?*
0. **Providing the AI with a list of competitors' products** ✓
1. Supplying the AI with information about the target audience
2. Requesting the AI to use persuasive language techniques
3. Asking the AI to include unique selling points and benefits
- **Why:** A pitch communicates your value to your audience. Competitor info aids positioning but not persuasive content about you, and tends to produce generic comparison-shaped output. Audience/techniques/USPs directly inform output.

### B10 — Cell 1.12 / 2.9 (root-cause)
*A deployed customer-service chatbot frequently provides outdated policy info. Best course of action?*
0. Set up escalation of complex/policy queries to human agents.
1. Conduct a comprehensive audit of performance metrics.
2. Implement a user feedback loop to flag outdated info.
3. **Schedule regular updates to the chatbot's training data to include the latest policies.** ✓
- **Why:** Root cause is stale training data; regular updates address the source. Escalation/audits/feedback treat symptoms while the underlying knowledge stays stale.

### B11 — Cell 2.12 / 2.5 (RAG advantage)
*Email-dataset Q&A: which scenario best illustrates the advantage of RAG over plain prompting?*
0. You want to reduce the size of the language model to save computational resources.
1. You want to ensure the model can answer questions even if it has never seen similar questions before.
2. You need to generate creative writing pieces based on the email content.
3. **You need to answer questions that require specific information from different parts of the email dataset.** ✓
- **Why:** RAG's defining advantage is access to specific info from a defined corpus, retrieved at query time and grounding the answer.

### B12 — Cell 2.2 / 1.2 (verification)
*As a student using an LLM for an assignment, how should you approach the info it provides?*
0. Always more trustworthy than the internet; use without verification.
1. Generally more trustworthy than internet sources, but still verify.
2. Less trustworthy than internet sources because it relies on outdated information.
3. **Not necessarily more trustworthy; cross-check with other credible references.** ✓
- **Why:** LLMs aren't authoritative; fluency ≠ accuracy. The literate posture is cross-checking against credible sources, as with any uncited claim.

### B13 — Cell 1.1 / 2.5 (knowledge cutoff; True/False)
*"It is unlikely for an LLM to provide an accurate summary of the latest financial market trends in real-time." True or false?*
0. False, because the LLM synthesises the latest market data automatically.
1. True, because the LLM is not good at handling numbers and structured data.
2. **True, because the LLM's data may be outdated due to its knowledge cutoff.** ✓
3. False, because the LLM frequently updates its knowledge base.
- **Why:** LLMs are trained to a cutoff and don't update continuously; without retrieval they can't summarize "the latest" anything. Knowing the cutoff exists is fundamental.

### B14 — Cell 2.2 (verification)
*An AI summary states a research finding. Next step?*
0. Accept it because AI tools are generally reliable.
1. **Cross-check the summary with the original research paper.** ✓
2. Ask the AI for more details about methodology and results.
3. Use another AI tool to generate a comparison summary.
- **Why:** Cross-checking the original source is the canonical Discernment move. AI can fabricate findings or invert effects; comparing two AI tools tests consistency, not accuracy.

### B15 — adjacent to Cell 1.2 (deepfake/media forensics)
*Which characteristic confirms a video of a public figure was NOT generated by AI?*
0. The public figure's voice sounds like themselves.
1. The video has a professional and polished appearance.
2. The video is high-quality with smooth transitions.
3. **None of the above.** ✓
- **Why:** Modern AI video reproduces authentic-sounding voice, polish, and smooth transitions. Surface signals don't establish authenticity — provenance and source verification do.

### B16 — Cell 1.7 (bias/fairness)
*AI screening job applications: what fairness issue might arise?*
0. Misinterpret minor formatting differences in resumes.
1. Not effectively handle applications in various languages.
2. **Reinforce existing biases found in historical hiring data.** ✓
3. Overlook applicants' unique achievements/extracurriculars.
- **Why:** Models trained on historical hiring data inherit and scale its biases with the appearance of objectivity — the canonical fairness failure for AI hiring.

### B17 — adjacent to Cell 1.1 / 2.8 (explainability)
*An accurate AI model recommends treatments but doctors don't trust it because they can't understand how it concluded. Core issue?*
0. **The AI model behaves as a black box.** ✓
1. The training dataset lacks sufficient diversity.
2. The treatment guidelines input are incorrect.
3. The AI model uses obsolete training data.
- **Why:** Opaque reasoning makes even an accurate model hard to trust in high-stakes domains. The fix is interpretability/explanation tooling, not just better data.

### B18 — adjacent to Cell 1.9 (copyright/IP)
*Copyright implications for a journalist using an AI-generated image in a commercial article?*
0. **The journalist needs to check the licensing policy of the AI tool they used.** ✓
1. The image cannot be used in any commercial context because it is AI-generated.
2. The AI-generated image is automatically free to use without any restrictions.
3. The journalist must pay a standard licensing fee.
- **Why:** Generators differ in licensing terms (broad commercial, non-commercial, or unclear from training-data disputes). Check the specific tool's policy before commercial use.

### B19 — Cell 1.8 (honest-conversation posture)
*Should we impose restrictions on the outputs of generative AI technologies?*
0. Yes, to reduce the computational resources required.
1. **Yes, to prevent the dissemination of harmful or misleading content.** ✓
2. No, because users should have freedom to access all generated content.
3. No, as it would hinder innovation and creativity.
- **Why:** Output restrictions are typically motivated by safety — preventing harmful/misleading content at scale (disinfo, deepfakes, NCII, weaponizable instructions).

### B20 — Cell 1.4 (data classification / privacy; True/False framing)
*"Sending personal information to cloud-based generative AI tools has little privacy concern."*
0. False — quantum computing can decipher the encrypted data.
1. True — encrypted with sophisticated algorithms during transmission.
2. **False — generative AI tools may train on unencrypted data and can output private info based on their probabilistic nature.** ✓
3. True — they are black-box systems and cannot output personal info even if used for training.
- **Why:** Transport encryption protects data in motion, not what the vendor does with input after arrival. Consumer-tier tools may train on inputs, which can resurface in outputs.

---

## Section C — Nava GLAT Supplemental objective questions (SCORED)

> Authored to fill gaps against the Matrix v2 Stage 1–2 universal cells the 20-question survey misses.

### C1 — Cell 1.5 (approved-tool literacy)
*Approved tools: enterprise chatbot (data-use agreement), consumer chatbot (personal account), internal retrieval system. You must draft a summary of a confidential client memo. Most appropriate tool?*
0. The consumer chatbot — fastest and most familiar.
1. **The enterprise chatbot — it operates under a data-use agreement covering the memo's data class.** ✓
2. Whichever produced the best summary on an unrelated task last week.
3. Any of the three — modern tools encrypt inputs in transit.
- **Why:** "AI" is a portfolio of tools with different data-handling terms. Match the data class of the work to the tool's coverage, not convenience. Transport encryption doesn't govern post-arrival use.

### C2 — Cell 1.6 (setup and access)
*Newly granted access to the approved AI tool. Most important setting to review before your first work prompt?*
0. The display theme (light vs. dark).
1. **The data-controls and chat-history settings — they determine whether prompts can be retained or used to train the model.** ✓
2. The default response length.
3. The keyboard shortcuts.
- **Why:** Defaults often allow retention/training use. Check data-controls/history before the first work prompt — the equivalent of checking data-handling rules before sending info.

### C3 — Cell 1.9 (disclosure norms)
*You used AI to draft major sections of a federal-agency client deliverable and edited it yourself. Most appropriate disclosure?*
0. No disclosure needed since you reviewed/edited it.
1. **Disclose AI use clearly (e.g., methodology note/footnote) — it's a client deliverable subject to attribution and accountability norms.** ✓
2. Disclose only if the client/agency explicitly asks.
3. Disclose only the prompts, not that AI was involved.
- **Why:** Undisclosed AI erodes trust catastrophically when discovered; federal deliverables err toward transparency. *Moffatt v. Air Canada* (BC CRT, 2024): organizations are responsible for what their AI tells stakeholders.

### C4 — Cell 1.10 (regulatory floor; EU AI Act Art. 4)
*Under the EU AI Act (Article 4, in application since 2 Feb 2025), the current baseline obligation for organizations whose work touches AI?*
0. Every employee must complete a vendor-issued AI certification within 12 months of hire.
1. **Staff who use, deploy, or oversee AI systems must have a sufficient level of AI literacy, proportional to their role and the risk of the systems involved.** ✓
2. Only employees who build or train AI models are subject to literacy obligations.
3. Organizations must publish a public AI literacy policy, but no individual training is required.
- **Why:** Art. 4 entered application 2 Feb 2025 (enforcement begins 2 Aug 2026). "Proportional to role and risk" scopes obligations to users and deployers, not just builders — aligned with the DOL AI Literacy Framework and OMB M-25-21.

### C5 — Cell 1.11 (honest framing of job-shape change)
*Research on AI and work points in different directions (novice productivity gains, expert skill atrophy, perception-vs-actual gaps). Best response?*
0. AI will replace most knowledge work within five years; prepare for displacement.
1. **AI's impact varies by task, role, and worker — engage with both the productivity findings and the risks (skill atrophy, perception-actuality gaps) without dismissing either.** ✓
2. Concerns are largely overstated by media; research consistently shows AI is complementary in nearly all cases.
3. Until peer-reviewed evidence is conclusive, organizations should pause adoption.
- **Why:** Evangelism and denial both disengage workers. Engage with Stanford "Canaries in the Coal Mine," Anthropic's craftsmanship-loss study, and METR's perception-inversion without cherry-picking.

### C6 — Cell 1.12 (civic-tech harm patterns)
*Using AI to draft public-facing benefit-eligibility guidance; it returns a confident, well-written summary. Most important next step before publishing?*
0. **Verify the rules against the authoritative agency policy — confident AI output on benefits/eligibility/legal matters can mislead vulnerable applicants with real consequences.** ✓
1. Run the summary through a second AI tool to check internal consistency.
2. Publish it — AI-generated benefits guidance is functionally equivalent to a junior staffer's draft.
3. Edit for tone and plain-language clarity, then publish.
- **Why:** Highest-stakes civic-tech failure mode. NYC's MyCity chatbot (2024) gave wrong benefits guidance; *Moffatt v. Air Canada* (2024) established organizational responsibility. The harm lands on the applicant — verify against the authoritative source.

### C7 — Cell 1.13 (non-practitioner involved in AI)
*As a program manager (you don't build AI), asked to sign off on a vendor's AI tool to screen veterans' benefit applications. Your literacy obligation?*
0. None — literacy obligations apply only to staff who build/train models.
1. **You are a "non-practitioner involved in AI" under OMB M-25-21: you need enough literacy to ask informed questions about purpose, training data, risks, and human-review gates before signing off.** ✓
2. Defer to the vendor's technical team and approve if they certify compliance.
3. Complete the same technical training as the engineers before signing off.
- **Why:** M-25-21 extends literacy obligations to those who review/sign-off/are accountable for AI they didn't build. The literate move is role-proportional literacy — enough to ask informed questions.

### C8 — Cell 2.3 (polished-output trap)
*AI returns a well-formatted, confident, finished-looking policy memo. Most appropriate next step?*
0. Ship as-is — it meets professional formatting and writing standards.
1. **Push back: ask the AI to identify the assumptions it made, what context it lacked, and where its confidence is lowest — then verify those points yourself.** ✓
2. Edit only for tone and voice; the substance is likely sound given the quality.
3. Re-run the same prompt several times and use whichever reads best.
- **Why:** The Anthropic AI Fluency Index found polished outputs reduce fact-checking/reasoning-scrutiny. Forcing the AI to surface its own uncertainty beats the visual trap of a finished-looking document.

### C9 — Cell 2.4 (iteration)
*A prompt's answer mostly meets your need but misses a key constraint. Most effective next step?*
0. Accept it and manually fix the missing constraint after the fact.
1. **Refine your prompt (add the constraint, ask the AI to critique its own answer, push back on specific points) and iterate until the output meets the goal.** ✓
2. Start a new conversation with the same prompt.
3. Switch to a different AI tool and try again from scratch.
- **Why:** The AI Fluency Index found iteration the most reliable correlate of effective use (85.7% of effective conversations). The missing constraint is usually one refinement away; restarting discards useful context.

### C10 — Cell 2.6 (AI for writing tasks)
*An AI draft in your professional voice is fluent and clean but generic — it could be anyone in your field. Most appropriate next step?*
0. Publish — fluent professional writing is what the tool is designed to produce.
1. **Edit it yourself to restore the voice-specific phrasing, references, and perspective the AI flattened into generic-professional prose.** ✓
2. Ask the AI to make it "more interesting" without further direction.
3. Discard the draft and write from scratch without AI.
- **Why:** AI writing converges on a generic-professional register (heavily represented in training data). Use the AI's structure and your voice — voice flattening is the failure mode this cell catches.

### C11 — Cell 2.9 (failure modes specific to your work)
*Over months you've hit fabricated citations, smoothed contradictions, wrong dates, wrong tone. Most useful habit?*
0. Avoid using AI for tasks where these failures have occurred.
1. **Maintain a running log of your specific failures (prompt, failure mode, the verification move that caught it) and consult it as a pre-flight check on similar future tasks.** ✓
2. Rely on the general lists of common failure modes in training materials.
3. Wait for the vendor to patch these in future model updates.
- **Why:** General training can't predict your specific failure modes. Your own evidence base converts each failure into a future pre-flight check — the personal-evidence anchor that makes Stage 2 calibration work.

### C12 — Cell 2.10 (test-driven / constraint-first prompting)
*You run the same weekly client-summary task through AI every Friday. Most effective way to make the prompt reliable over time?*
0. Use the same one-line ask each week and accept output variation.
1. **Develop a reusable prompt with explicit constraints (length, required sections, must-include/exclude, examples of good and bad outputs) and evaluate each week's output against them.** ✓
2. Use a longer, more elaborate prompt each week.
3. Rotate among different AI tools each week.
- **Why:** Constraint-first prompting bridges "sometimes good" to "reliable on recurring tasks." Length ≠ structure; rotating tools adds variation, not less.

### C13 — Cell 2.11 (use-case library + Diligence Statement)
*Several months in, the most useful artifact to maintain over time?*
0. A list of every prompt you've ever written, chronologically.
1. **A personal library of where AI helps and where it doesn't, paired with a written diligence statement for ≥1 high-stakes use case (what you delegated, how you described the task, how you evaluated outputs, what you disclosed).** ✓
2. A folder of screenshots of your best AI outputs.
3. A ranked list of all AI tools you've tried, by preference.
- **Why:** A use-case library compounds literacy across tasks; the Diligence Statement (Anthropic 4D) converts Stage 2 from self-claim to inspectable portfolio. A highlight reel skips the failures, which are the most useful data.

### C14 — Cell 2.13 (productivity illusions)
*After months you feel ~25% faster. Most accurate interpretation?*
0. Subjective speedup is reliable evidence of actual productivity improvement.
1. **Subjective and actual speedup often diverge — controlled studies found workers feeling faster while performing slower/the same — so the feeling isn't evidence on its own; a paired comparison with measured time and quality is what would tell you.** ✓
2. The feeling is probably an underestimate — AI delivers more than users perceive.
3. The feeling is irrelevant; only the vendor's reported metrics are valid.
- **Why:** METR's controlled study (July 2025) found experienced devs measurably slower with AI while believing they were faster. A feeling of speedup is a hypothesis, not an observation.

### C15 — Cell 2.15 (paired AI-on / AI-off calibration)
*What gives the most reliable evidence of how AI is actually affecting your work over time?*
0. Tracking how many AI-assisted tasks you complete each week.
1. **Completing one task with AI and a comparable task without, then comparing your subjective speedup estimate against actual elapsed time and a reviewer's quality check on both outputs.** ✓
2. Asking the AI tool to estimate how much faster it's making you.
3. Comparing your output volume this month vs. the month before AI.
- **Why:** The paired task is the operational "performance under fading scaffolding." It yields a per-worker calibration number — the validity check on every other Stage 2 self-report — and over rounds, a longitudinal deskilling signal.

---

## Scoring (for P4.10)
- **Scored set:** Sections B + C (objective, single correct answer each). Section A is diagnostic only.
- **Gate:** **≥80%** of the scored set correct → sets the program **completion marker**.
- The soft self-report (Section A) is captured for calibration but excluded from the pass computation.
