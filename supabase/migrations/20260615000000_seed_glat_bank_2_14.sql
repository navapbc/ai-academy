-- seed_glat_bank_2_14 (P4.10): author the GLAT objective gate into cell 2.14 and
-- remove its placeholder 4-question quiz. The `glat` lab now GATES 2.14 (≥80% of
-- the 35 scored B+C items → a passing quiz_attempts row + cell completion). Section
-- A (5 items) is captured diagnostic, not scored. Content is DRAFT (status
-- in_review). The `lab_config_json is null` guard makes this idempotent; the same
-- guarded UPDATE clears quiz_json so the GLAT is the cell's only instrument.
--
-- Source of truth for every item: docs/content/glat-question-bank.md
-- correctIndex is the 0-based position of the ✓-marked option; rationale is the
-- item's "Why:" text.
update public.modules
set lab_config_json = $json$
{
  "kind": "glat",
  "passThreshold": 0.8,
  "sectionA": [
    {
      "id": "A1",
      "prompt": "In the past month, which best describes how generative AI shows up in your work?"
    },
    {
      "id": "A2",
      "prompt": "In the past month, can you recall a time when you deliberately decided NOT to use AI on a task you could have given it to?"
    },
    {
      "id": "A3",
      "prompt": "Which of the following do you maintain about your own AI use?"
    },
    {
      "id": "A4",
      "prompt": "In the past three months, have you used AI to help with work that sits outside your primary practice area?"
    },
    {
      "id": "A5",
      "prompt": "In the past three months, how often have others come to you for advice, prompts, or examples about using AI on their work?"
    }
  ],
  "sectionBC": [
    {
      "id": "B1",
      "question": "Which of the following best describes \"Generative AI\"?",
      "options": [
        "A form of artificial intelligence that focuses on translating languages in real-time.",
        "An AI system designed to enhance the speed and accuracy of data retrieval in search engines.",
        "AI that creates new content like text, images, or music by learning from existing data.",
        "AI technology used primarily for managing and organising large databases."
      ],
      "correctIndex": 2,
      "rationale": "Generative AI is defined by producing new artifacts (text, images, audio, code, video) from patterns in training data — distinct from discriminative AI (classification, search ranking, retrieval) and rule-based systems. The distinction predicts where it helps (synthesis, drafting, ideation) vs. struggles (precise retrieval, deterministic output)."
    },
    {
      "id": "B2",
      "question": "Which of the following statements best describes an LLM?",
      "options": [
        "It generates text by translating input text into multiple languages simultaneously.",
        "It generates text by analysing and summarising large volumes of web content.",
        "It generates text by predicting the next word based on the context of previous words.",
        "It generates text by using pre-defined templates and filling in the blanks."
      ],
      "correctIndex": 2,
      "rationale": "Next-token prediction is the foundational mental model — it explains output variability, why fluency is independent of factuality, and why hallucination is structural, not a fixable bug."
    },
    {
      "id": "B3",
      "question": "Which of the following tasks can Generative AI perform with a high degree of accuracy?",
      "options": [
        "Predicting stock market trends",
        "Diagnosing rare diseases",
        "Generating human-like text based on prompts",
        "Making ethical decisions in complex scenarios"
      ],
      "correctIndex": 2,
      "rationale": "Fluent contextual text is what generative AI was built for. Markets/diagnosis/ethics are high-cost-of-wrong tasks where it produces plausible-but-unreliable output — the basis of delegation literacy."
    },
    {
      "id": "B4",
      "question": "In the context of Generative AI, what is \"zero-shot learning\"?",
      "options": [
        "The ability of a model to perform a task without any task-specific training.",
        "A method of reducing the model's training time to zero.",
        "Training a model without any data.",
        "A technique for generating synthetic training data."
      ],
      "correctIndex": 0,
      "rationale": "Zero-shot = performing a task it wasn't explicitly trained on, relying on general pre-training. Explains why one LLM is useful across tasks and why prompt construction (which scopes the task) matters."
    },
    {
      "id": "B5",
      "question": "Which of the following is a potential challenge when using prompt-based development for text generation?",
      "options": [
        "Crafting a prompt that accurately captures the desired context and nuances.",
        "The need for extensive labelled data to train the model.",
        "The language model can only generate binary outputs.",
        "The requirement for complex feature engineering."
      ],
      "correctIndex": 0,
      "rationale": "Prompt construction is the highest-leverage skill; a poor prompt yields plausible-but-wrong output costlier to fix than to redo. Labelled data / binary output / feature engineering are classical-ML concerns, not prompting."
    },
    {
      "id": "B6",
      "question": "What does the term \"token\" refer to in the context of an LLM?",
      "options": [
        "A security measure used to authenticate API requests to the language model.",
        "A reward given to users for contributing valuable data to train the language model.",
        "A unique identifier assigned to each user interacting with the language model.",
        "A unit of text, such as a word or a subword, that the model processes individually."
      ],
      "correctIndex": 3,
      "rationale": "Tokens are the unit of input/output; token count governs context-window usage and API cost. Foundational to managing context, cost, and prompt design."
    },
    {
      "id": "B7",
      "question": "Which of the following is NOT a requirement for an AI to be considered AGI?",
      "options": [
        "The capacity to understand and generate natural language.",
        "The ability to predict future events with perfect accuracy.",
        "The ability to learn and adapt to new tasks without human intervention.",
        "The capability to perform tasks across various domains with human-like proficiency."
      ],
      "correctIndex": 1,
      "rationale": "AGI = human-like generality, not omniscience. Perfect prediction is a capability no human has and isn't required; the trap is treating AGI as omniscience."
    },
    {
      "id": "B8",
      "question": "How does RAG (Retrieval-Augmented Generation) enhance the capabilities of an LLM?",
      "options": [
        "By increasing its computational speed.",
        "By improving its grammar and syntax.",
        "By enabling it to understand multiple languages.",
        "By providing it with real-time and relevant data."
      ],
      "correctIndex": 3,
      "rationale": "RAG changes what the model can access at inference time by retrieving relevant docs into context — right for queries depending on fresh or proprietary data."
    },
    {
      "id": "B9",
      "question": "When using generative AI to create a marketing pitch, which strategy is LEAST likely to be effective?",
      "options": [
        "Providing the AI with a list of competitors' products",
        "Supplying the AI with information about the target audience",
        "Requesting the AI to use persuasive language techniques",
        "Asking the AI to include unique selling points and benefits"
      ],
      "correctIndex": 0,
      "rationale": "A pitch communicates your value to your audience. Competitor info aids positioning but not persuasive content about you, and tends to produce generic comparison-shaped output. Audience/techniques/USPs directly inform output."
    },
    {
      "id": "B10",
      "question": "A deployed customer-service chatbot frequently provides outdated policy info. Best course of action?",
      "options": [
        "Set up escalation of complex/policy queries to human agents.",
        "Conduct a comprehensive audit of performance metrics.",
        "Implement a user feedback loop to flag outdated info.",
        "Schedule regular updates to the chatbot's training data to include the latest policies."
      ],
      "correctIndex": 3,
      "rationale": "Root cause is stale training data; regular updates address the source. Escalation/audits/feedback treat symptoms while the underlying knowledge stays stale."
    },
    {
      "id": "B11",
      "question": "Email-dataset Q&A: which scenario best illustrates the advantage of RAG over plain prompting?",
      "options": [
        "You want to reduce the size of the language model to save computational resources.",
        "You want to ensure the model can answer questions even if it has never seen similar questions before.",
        "You need to generate creative writing pieces based on the email content.",
        "You need to answer questions that require specific information from different parts of the email dataset."
      ],
      "correctIndex": 3,
      "rationale": "RAG's defining advantage is access to specific info from a defined corpus, retrieved at query time and grounding the answer."
    },
    {
      "id": "B12",
      "question": "As a student using an LLM for an assignment, how should you approach the info it provides?",
      "options": [
        "Always more trustworthy than the internet; use without verification.",
        "Generally more trustworthy than internet sources, but still verify.",
        "Less trustworthy than internet sources because it relies on outdated information.",
        "Not necessarily more trustworthy; cross-check with other credible references."
      ],
      "correctIndex": 3,
      "rationale": "LLMs aren't authoritative; fluency ≠ accuracy. The literate posture is cross-checking against credible sources, as with any uncited claim."
    },
    {
      "id": "B13",
      "question": "\"It is unlikely for an LLM to provide an accurate summary of the latest financial market trends in real-time.\" True or false?",
      "options": [
        "False, because the LLM synthesises the latest market data automatically.",
        "True, because the LLM is not good at handling numbers and structured data.",
        "True, because the LLM's data may be outdated due to its knowledge cutoff.",
        "False, because the LLM frequently updates its knowledge base."
      ],
      "correctIndex": 2,
      "rationale": "LLMs are trained to a cutoff and don't update continuously; without retrieval they can't summarize \"the latest\" anything. Knowing the cutoff exists is fundamental."
    },
    {
      "id": "B14",
      "question": "An AI summary states a research finding. Next step?",
      "options": [
        "Accept it because AI tools are generally reliable.",
        "Cross-check the summary with the original research paper.",
        "Ask the AI for more details about methodology and results.",
        "Use another AI tool to generate a comparison summary."
      ],
      "correctIndex": 1,
      "rationale": "Cross-checking the original source is the canonical Discernment move. AI can fabricate findings or invert effects; comparing two AI tools tests consistency, not accuracy."
    },
    {
      "id": "B15",
      "question": "Which characteristic confirms a video of a public figure was NOT generated by AI?",
      "options": [
        "The public figure's voice sounds like themselves.",
        "The video has a professional and polished appearance.",
        "The video is high-quality with smooth transitions.",
        "None of the above."
      ],
      "correctIndex": 3,
      "rationale": "Modern AI video reproduces authentic-sounding voice, polish, and smooth transitions. Surface signals don't establish authenticity — provenance and source verification do."
    },
    {
      "id": "B16",
      "question": "AI screening job applications: what fairness issue might arise?",
      "options": [
        "Misinterpret minor formatting differences in resumes.",
        "Not effectively handle applications in various languages.",
        "Reinforce existing biases found in historical hiring data.",
        "Overlook applicants' unique achievements/extracurriculars."
      ],
      "correctIndex": 2,
      "rationale": "Models trained on historical hiring data inherit and scale its biases with the appearance of objectivity — the canonical fairness failure for AI hiring."
    },
    {
      "id": "B17",
      "question": "An accurate AI model recommends treatments but doctors don't trust it because they can't understand how it concluded. Core issue?",
      "options": [
        "The AI model behaves as a black box.",
        "The training dataset lacks sufficient diversity.",
        "The treatment guidelines input are incorrect.",
        "The AI model uses obsolete training data."
      ],
      "correctIndex": 0,
      "rationale": "Opaque reasoning makes even an accurate model hard to trust in high-stakes domains. The fix is interpretability/explanation tooling, not just better data."
    },
    {
      "id": "B18",
      "question": "Copyright implications for a journalist using an AI-generated image in a commercial article?",
      "options": [
        "The journalist needs to check the licensing policy of the AI tool they used.",
        "The image cannot be used in any commercial context because it is AI-generated.",
        "The AI-generated image is automatically free to use without any restrictions.",
        "The journalist must pay a standard licensing fee."
      ],
      "correctIndex": 0,
      "rationale": "Generators differ in licensing terms (broad commercial, non-commercial, or unclear from training-data disputes). Check the specific tool's policy before commercial use."
    },
    {
      "id": "B19",
      "question": "Should we impose restrictions on the outputs of generative AI technologies?",
      "options": [
        "Yes, to reduce the computational resources required.",
        "Yes, to prevent the dissemination of harmful or misleading content.",
        "No, because users should have freedom to access all generated content.",
        "No, as it would hinder innovation and creativity."
      ],
      "correctIndex": 1,
      "rationale": "Output restrictions are typically motivated by safety — preventing harmful/misleading content at scale (disinfo, deepfakes, NCII, weaponizable instructions)."
    },
    {
      "id": "B20",
      "question": "\"Sending personal information to cloud-based generative AI tools has little privacy concern.\"",
      "options": [
        "False — quantum computing can decipher the encrypted data.",
        "True — encrypted with sophisticated algorithms during transmission.",
        "False — generative AI tools may train on unencrypted data and can output private info based on their probabilistic nature.",
        "True — they are black-box systems and cannot output personal info even if used for training."
      ],
      "correctIndex": 2,
      "rationale": "Transport encryption protects data in motion, not what the vendor does with input after arrival. Consumer-tier tools may train on inputs, which can resurface in outputs."
    },
    {
      "id": "C1",
      "question": "Approved tools: enterprise chatbot (data-use agreement), consumer chatbot (personal account), internal retrieval system. You must draft a summary of a confidential client memo. Most appropriate tool?",
      "options": [
        "The consumer chatbot — fastest and most familiar.",
        "The enterprise chatbot — it operates under a data-use agreement covering the memo's data class.",
        "Whichever produced the best summary on an unrelated task last week.",
        "Any of the three — modern tools encrypt inputs in transit."
      ],
      "correctIndex": 1,
      "rationale": "\"AI\" is a portfolio of tools with different data-handling terms. Match the data class of the work to the tool's coverage, not convenience. Transport encryption doesn't govern post-arrival use."
    },
    {
      "id": "C2",
      "question": "Newly granted access to the approved AI tool. Most important setting to review before your first work prompt?",
      "options": [
        "The display theme (light vs. dark).",
        "The data-controls and chat-history settings — they determine whether prompts can be retained or used to train the model.",
        "The default response length.",
        "The keyboard shortcuts."
      ],
      "correctIndex": 1,
      "rationale": "Defaults often allow retention/training use. Check data-controls/history before the first work prompt — the equivalent of checking data-handling rules before sending info."
    },
    {
      "id": "C3",
      "question": "You used AI to draft major sections of a federal-agency client deliverable and edited it yourself. Most appropriate disclosure?",
      "options": [
        "No disclosure needed since you reviewed/edited it.",
        "Disclose AI use clearly (e.g., methodology note/footnote) — it's a client deliverable subject to attribution and accountability norms.",
        "Disclose only if the client/agency explicitly asks.",
        "Disclose only the prompts, not that AI was involved."
      ],
      "correctIndex": 1,
      "rationale": "Undisclosed AI erodes trust catastrophically when discovered; federal deliverables err toward transparency. Moffatt v. Air Canada (BC CRT, 2024): organizations are responsible for what their AI tells stakeholders."
    },
    {
      "id": "C4",
      "question": "Under the EU AI Act (Article 4, in application since 2 Feb 2025), the current baseline obligation for organizations whose work touches AI?",
      "options": [
        "Every employee must complete a vendor-issued AI certification within 12 months of hire.",
        "Staff who use, deploy, or oversee AI systems must have a sufficient level of AI literacy, proportional to their role and the risk of the systems involved.",
        "Only employees who build or train AI models are subject to literacy obligations.",
        "Organizations must publish a public AI literacy policy, but no individual training is required."
      ],
      "correctIndex": 1,
      "rationale": "Art. 4 entered application 2 Feb 2025 (enforcement begins 2 Aug 2026). \"Proportional to role and risk\" scopes obligations to users and deployers, not just builders — aligned with the DOL AI Literacy Framework and OMB M-25-21."
    },
    {
      "id": "C5",
      "question": "Research on AI and work points in different directions (novice productivity gains, expert skill atrophy, perception-vs-actual gaps). Best response?",
      "options": [
        "AI will replace most knowledge work within five years; prepare for displacement.",
        "AI's impact varies by task, role, and worker — engage with both the productivity findings and the risks (skill atrophy, perception-actuality gaps) without dismissing either.",
        "Concerns are largely overstated by media; research consistently shows AI is complementary in nearly all cases.",
        "Until peer-reviewed evidence is conclusive, organizations should pause adoption."
      ],
      "correctIndex": 1,
      "rationale": "Evangelism and denial both disengage workers. Engage with Stanford \"Canaries in the Coal Mine,\" Anthropic's craftsmanship-loss study, and METR's perception-inversion without cherry-picking."
    },
    {
      "id": "C6",
      "question": "Using AI to draft public-facing benefit-eligibility guidance; it returns a confident, well-written summary. Most important next step before publishing?",
      "options": [
        "Verify the rules against the authoritative agency policy — confident AI output on benefits/eligibility/legal matters can mislead vulnerable applicants with real consequences.",
        "Run the summary through a second AI tool to check internal consistency.",
        "Publish it — AI-generated benefits guidance is functionally equivalent to a junior staffer's draft.",
        "Edit for tone and plain-language clarity, then publish."
      ],
      "correctIndex": 0,
      "rationale": "Highest-stakes civic-tech failure mode. NYC's MyCity chatbot (2024) gave wrong benefits guidance; Moffatt v. Air Canada (2024) established organizational responsibility. The harm lands on the applicant — verify against the authoritative source."
    },
    {
      "id": "C7",
      "question": "As a program manager (you don't build AI), asked to sign off on a vendor's AI tool to screen veterans' benefit applications. Your literacy obligation?",
      "options": [
        "None — literacy obligations apply only to staff who build/train models.",
        "You are a \"non-practitioner involved in AI\" under OMB M-25-21: you need enough literacy to ask informed questions about purpose, training data, risks, and human-review gates before signing off.",
        "Defer to the vendor's technical team and approve if they certify compliance.",
        "Complete the same technical training as the engineers before signing off."
      ],
      "correctIndex": 1,
      "rationale": "M-25-21 extends literacy obligations to those who review/sign-off/are accountable for AI they didn't build. The literate move is role-proportional literacy — enough to ask informed questions."
    },
    {
      "id": "C8",
      "question": "AI returns a well-formatted, confident, finished-looking policy memo. Most appropriate next step?",
      "options": [
        "Ship as-is — it meets professional formatting and writing standards.",
        "Push back: ask the AI to identify the assumptions it made, what context it lacked, and where its confidence is lowest — then verify those points yourself.",
        "Edit only for tone and voice; the substance is likely sound given the quality.",
        "Re-run the same prompt several times and use whichever reads best."
      ],
      "correctIndex": 1,
      "rationale": "The Anthropic AI Fluency Index found polished outputs reduce fact-checking/reasoning-scrutiny. Forcing the AI to surface its own uncertainty beats the visual trap of a finished-looking document."
    },
    {
      "id": "C9",
      "question": "A prompt's answer mostly meets your need but misses a key constraint. Most effective next step?",
      "options": [
        "Accept it and manually fix the missing constraint after the fact.",
        "Refine your prompt (add the constraint, ask the AI to critique its own answer, push back on specific points) and iterate until the output meets the goal.",
        "Start a new conversation with the same prompt.",
        "Switch to a different AI tool and try again from scratch."
      ],
      "correctIndex": 1,
      "rationale": "The AI Fluency Index found iteration the most reliable correlate of effective use (85.7% of effective conversations). The missing constraint is usually one refinement away; restarting discards useful context."
    },
    {
      "id": "C10",
      "question": "An AI draft in your professional voice is fluent and clean but generic — it could be anyone in your field. Most appropriate next step?",
      "options": [
        "Publish — fluent professional writing is what the tool is designed to produce.",
        "Edit it yourself to restore the voice-specific phrasing, references, and perspective the AI flattened into generic-professional prose.",
        "Ask the AI to make it \"more interesting\" without further direction.",
        "Discard the draft and write from scratch without AI."
      ],
      "correctIndex": 1,
      "rationale": "AI writing converges on a generic-professional register (heavily represented in training data). Use the AI's structure and your voice — voice flattening is the failure mode this cell catches."
    },
    {
      "id": "C11",
      "question": "Over months you've hit fabricated citations, smoothed contradictions, wrong dates, wrong tone. Most useful habit?",
      "options": [
        "Avoid using AI for tasks where these failures have occurred.",
        "Maintain a running log of your specific failures (prompt, failure mode, the verification move that caught it) and consult it as a pre-flight check on similar future tasks.",
        "Rely on the general lists of common failure modes in training materials.",
        "Wait for the vendor to patch these in future model updates."
      ],
      "correctIndex": 1,
      "rationale": "General training can't predict your specific failure modes. Your own evidence base converts each failure into a future pre-flight check — the personal-evidence anchor that makes Stage 2 calibration work."
    },
    {
      "id": "C12",
      "question": "You run the same weekly client-summary task through AI every Friday. Most effective way to make the prompt reliable over time?",
      "options": [
        "Use the same one-line ask each week and accept output variation.",
        "Develop a reusable prompt with explicit constraints (length, required sections, must-include/exclude, examples of good and bad outputs) and evaluate each week's output against them.",
        "Use a longer, more elaborate prompt each week.",
        "Rotate among different AI tools each week."
      ],
      "correctIndex": 1,
      "rationale": "Constraint-first prompting bridges \"sometimes good\" to \"reliable on recurring tasks.\" Length ≠ structure; rotating tools adds variation, not less."
    },
    {
      "id": "C13",
      "question": "Several months in, the most useful artifact to maintain over time?",
      "options": [
        "A list of every prompt you've ever written, chronologically.",
        "A personal library of where AI helps and where it doesn't, paired with a written diligence statement for ≥1 high-stakes use case (what you delegated, how you described the task, how you evaluated outputs, what you disclosed).",
        "A folder of screenshots of your best AI outputs.",
        "A ranked list of all AI tools you've tried, by preference."
      ],
      "correctIndex": 1,
      "rationale": "A use-case library compounds literacy across tasks; the Diligence Statement (Anthropic 4D) converts Stage 2 from self-claim to inspectable portfolio. A highlight reel skips the failures, which are the most useful data."
    },
    {
      "id": "C14",
      "question": "After months you feel ~25% faster. Most accurate interpretation?",
      "options": [
        "Subjective speedup is reliable evidence of actual productivity improvement.",
        "Subjective and actual speedup often diverge — controlled studies found workers feeling faster while performing slower/the same — so the feeling isn't evidence on its own; a paired comparison with measured time and quality is what would tell you.",
        "The feeling is probably an underestimate — AI delivers more than users perceive.",
        "The feeling is irrelevant; only the vendor's reported metrics are valid."
      ],
      "correctIndex": 1,
      "rationale": "METR's controlled study (July 2025) found experienced devs measurably slower with AI while believing they were faster. A feeling of speedup is a hypothesis, not an observation."
    },
    {
      "id": "C15",
      "question": "What gives the most reliable evidence of how AI is actually affecting your work over time?",
      "options": [
        "Tracking how many AI-assisted tasks you complete each week.",
        "Completing one task with AI and a comparable task without, then comparing your subjective speedup estimate against actual elapsed time and a reviewer's quality check on both outputs.",
        "Asking the AI tool to estimate how much faster it's making you.",
        "Comparing your output volume this month vs. the month before AI."
      ],
      "correctIndex": 1,
      "rationale": "The paired task is the operational \"performance under fading scaffolding.\" It yields a per-worker calibration number — the validity check on every other Stage 2 self-report — and over rounds, a longitudinal deskilling signal."
    }
  ]
}
$json$::jsonb,
    quiz_json = NULL,
    status = 'in_review',
    version = version + 1,
    updated_at = now()
where cell_id = '2.14' and lab_config_json is null;
