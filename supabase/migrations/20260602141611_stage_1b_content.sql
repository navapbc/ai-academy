-- stage_1b_content (P3.4): author the six Stage 1b "Orienting Frames" cells.
--
-- ⚠️ SUPERSEDED (see DATA-01 in docs/DEBT-REPORT.md): the body_md/quiz_json this
-- migration writes are LATER OVERWRITTEN for all 28 cells by the generated
-- 20260602190000_load_curriculum_content. Only the status='in_review' +
-- version bump below survived, which left these six cells inconsistent with the
-- rest — reconciled forward by 20260602260000_reconcile_stage_1b_provenance.
-- Kept as-is for migration history; the canonical content is the 190000 JSON.
--
-- Turns the "Coming soon" stubs seeded in 20260602130334_modules_content_as_data
-- into real lessons + 4-question scored quizzes. DRAFT content pending SME review,
-- so status is set to 'in_review' (the runtime ignores status; this is a queryable
-- marker, flipped to 'published' on sign-off). Replay-safe: the seed inserts the
-- stub, then these UPDATEs overwrite it. No schema/app changes.

update public.modules set
  body_md = $md$# How LLMs Actually Work: A Mechanical Mental Model

You don't need to be an engineer to use AI well — but you do need an accurate picture of what's happening under the hood. Most mistakes with AI come from imagining it as something it isn't.

## It predicts the next token
A large language model has one core move: given the text so far, predict the next chunk of text (a "token" — roughly a word-piece). Then it does it again, and again, building output one token at a time. There is no database lookup and no reasoning engine consulting facts — just a very sophisticated pattern of "what usually comes next."

## Training vs. inference
- **Training** (done once, by the vendor): the model reads enormous amounts of text and adjusts billions of internal weights so its next-token guesses match real language.
- **Inference** (what you do): the trained model applies those frozen patterns to your prompt. It is **not** learning from you, and it is **not** looking anything up live.

## It's probabilistic, not deterministic
The model produces a probability distribution over possible next tokens and samples from it, so the same prompt can give different answers. A "temperature" setting controls how adventurous that sampling is. This is why output varies — and why it can sound confident while being wrong.

## The context window
The model only "sees" what's in front of it: your prompt plus the conversation so far, up to a fixed size called the context window. Anything outside it — including last week's chat — is gone unless you re-supply it.

## Why this matters at Nava
If you picture the model as *pattern completion, not retrieval or understanding*, the rest of AI literacy follows: you'll expect it to fabricate (cell 1.2), you'll ground it in source material, and you'll verify before trusting. The mental model is the foundation.$md$,
  quiz_json = $json$[
    {
      "question": "What is the single core operation an LLM performs to generate text?",
      "options": [
        "It searches a database of facts for the best match",
        "It predicts the next token (word-piece) given the text so far, repeatedly",
        "It reasons step-by-step from stored first principles",
        "It retrieves the most-cited answer from the internet"
      ],
      "correctIndex": 1,
      "explanation": "An LLM generates one token at a time by predicting what most plausibly comes next. There is no live lookup or reasoning engine — just learned next-token patterns."
    },
    {
      "question": "During inference (when you use the model), what is happening?",
      "options": [
        "The model is learning from your prompt and updating its weights",
        "The model is searching the live internet for your answer",
        "The model applies frozen, pre-trained patterns to your prompt — it is not learning or looking anything up",
        "The model stores your data to retrain itself overnight"
      ],
      "correctIndex": 2,
      "explanation": "Training (weight-adjusting) happens once at the vendor. At inference the weights are frozen; the model is not learning from you or querying live sources."
    },
    {
      "question": "Why can the same prompt produce different answers on different runs?",
      "options": [
        "The model is malfunctioning",
        "Output is sampled from a probability distribution over next tokens (controlled by temperature)",
        "The internet changed between runs",
        "The model remembers and deliberately avoids repeating itself"
      ],
      "correctIndex": 1,
      "explanation": "Generation is probabilistic — the model samples from a distribution, so responses vary. This is also why confident-sounding output can still be wrong."
    },
    {
      "question": "What is the context window?",
      "options": [
        "The model's permanent memory of every conversation it has had",
        "The fixed amount of text (your prompt plus the conversation so far) the model can see at once",
        "A panel that displays the model's sources",
        "The time limit before the model resets"
      ],
      "correctIndex": 1,
      "explanation": "The model only sees what is inside its context window. Anything outside it — like an earlier session — is gone unless you re-supply it."
    }
  ]$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.1';

update public.modules set
  body_md = $md$# Hallucination Is a Feature of the Design, Not a Glitch

When an AI confidently states something false — a made-up case citation, a non-existent policy, a fabricated statistic — that is called a *hallucination*. The critical insight: it is not a malfunction you can patch away. It is a direct consequence of how the model works.

## Why it's structural
From cell 1.1: the model predicts the *most plausible next token*, not the *true* one. It has no internal sense of "I know this" versus "I'm guessing." Producing fluent, plausible text **is** its job — and plausible is not the same as correct. So when it lacks the pattern, it generates something that *looks* right rather than admitting a gap.

## Confident and wrong is the dangerous combination
Hallucinations don't arrive flagged with uncertainty. They are delivered in the same authoritative tone as correct answers — citations, section numbers, official-sounding names. The polish is exactly what makes them risky.

## Where this bites in civic work
- A summary of a **benefits regulation** that invents an eligibility rule.
- A **legal or policy memo** citing a statute that doesn't exist.
- A **data figure** ("42% of applicants…") with no source.

In government services, a confident fabrication can drive a wrong decision that harms a real person.

## What literate practitioners do
- **Assume it can fabricate** — treat every factual claim as unverified until checked.
- **Ground the model** — supply the actual policy or document and instruct it to answer only from that source.
- **Verify against primary sources** before anything leaves your hands.
- **Watch for the tell:** the more specific and confident a claim you can't independently confirm, the more suspicious you should be.

Hallucination isn't going away. Designing your workflow around that fact is the skill.$md$,
  quiz_json = $json$[
    {
      "question": "Why is hallucination considered a structural feature of LLMs rather than a fixable bug?",
      "options": [
        "Vendors simply haven't gotten around to fixing it",
        "The model predicts the most plausible next token, not the true one, and has no internal sense of knowing versus guessing",
        "The internet contains false information",
        "Users write bad prompts"
      ],
      "correctIndex": 1,
      "explanation": "The model optimizes for plausible continuations, not truth, and can't distinguish knowing from guessing. Fabrication falls out of the core mechanism, so it can't simply be patched away."
    },
    {
      "question": "What makes hallucinations especially dangerous in government work?",
      "options": [
        "They are always obviously wrong",
        "They are delivered in the same confident, authoritative tone as correct answers, so they are easy to trust",
        "They only happen with rare topics",
        "They appear in a different font"
      ],
      "correctIndex": 1,
      "explanation": "Hallucinations aren't flagged as uncertain — the confident tone (fake citations, section numbers) is what makes a fabrication likely to drive a wrong, harmful decision."
    },
    {
      "question": "Which practice most directly reduces hallucination risk?",
      "options": [
        "Asking the model to be honest",
        "Grounding the model in the actual source document and instructing it to answer only from that material",
        "Using a longer prompt",
        "Running the prompt twice"
      ],
      "correctIndex": 1,
      "explanation": "Grounding constrains the model to provided source material instead of its training patterns, which is the primary defense. Verifying against primary sources backs it up."
    },
    {
      "question": "A model gives you a specific, confident statute citation for a benefits rule that you can't independently find. What's the literate response?",
      "options": [
        "Trust it — the citation looks official",
        "Treat it as likely fabricated until verified against the primary source",
        "Add it to the memo with a footnote",
        "Ask the model whether it is sure"
      ],
      "correctIndex": 1,
      "explanation": "Specific, confident, and unverifiable is the classic hallucination tell. Verify against the primary source before using it; asking the model to confirm doesn't establish truth."
    }
  ]$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.2';

update public.modules set
  body_md = $md$# Bias, Fairness, and Accessibility Blind Spots

AI systems learn from human-generated data, and human data carries human bias. For an organization building public services, recognizing where AI can be unfair or exclusionary isn't optional — it is central to the mission.

## Where bias comes from
The model's patterns reflect its training data. If that data underrepresents or stereotypes a group, the model will too — reproducing and sometimes amplifying those patterns. This isn't malice; it is statistics inheriting history.

## Disparate impact in benefits work
The people Nava's clients serve are disproportionately low-income, disabled, elderly, immigrants, and non-native English speakers. AI that performs well "on average" can still:
- Misread names, addresses, or dialects outside its training norm.
- Produce content at a reading level or in a tone that excludes the actual audience.
- Encode assumptions ("a typical applicant…") that don't fit the people most in need.

A tool that works for the median user can quietly fail the most vulnerable — exactly the people public services exist to reach.

## Accessibility is part of fairness
Literate use means asking whether the output actually reaches everyone:
- **Plain language** — is it written at the reading level of the real audience?
- **Language access** — does it work for non-English speakers, or assume fluency?
- **Disability access** — does AI-generated content work with screen readers and assistive tech (alt text, structure — not just visual polish)?

## The literate habit
- **Name the affected population** before trusting output for a public-facing task.
- **Check for disparate impact** — would this work equally well for your hardest-to-serve user?
- **Treat accessibility as a requirement, not a nice-to-have.**
- **Keep a human in the loop** for decisions that affect people's access to benefits.$md$,
  quiz_json = $json$[
    {
      "question": "Why do LLMs reproduce societal biases?",
      "options": [
        "They are explicitly programmed with biased rules",
        "They learn statistical patterns from human-generated training data, which carries human bias",
        "They are tested only on biased users",
        "They prefer certain answers to save time"
      ],
      "correctIndex": 1,
      "explanation": "Bias enters through the training data. The model inherits and can amplify the patterns — including stereotypes and underrepresentation — present in what it learned from."
    },
    {
      "question": "What is 'disparate impact' for an AI tool used in benefits services?",
      "options": [
        "The tool responds more slowly for some users",
        "The tool works well on average but fails disproportionately for the vulnerable groups it should serve",
        "The tool costs more in some regions",
        "The tool uses more energy at peak times"
      ],
      "correctIndex": 1,
      "explanation": "A tool that performs well for the median user can still systematically fail low-income, disabled, immigrant, or non-English-speaking users — the populations public services most need to reach."
    },
    {
      "question": "Which of these is an accessibility consideration for AI-generated content?",
      "options": [
        "The model's response time",
        "Whether the content works at an appropriate reading level, for non-English speakers, and with screen readers",
        "The color of the chat window",
        "The number of tokens used"
      ],
      "correctIndex": 1,
      "explanation": "Accessibility is part of fairness: plain language, language access, and compatibility with assistive technology determine whether the output actually reaches everyone."
    },
    {
      "question": "Before trusting AI output for a public-facing benefits task, what should a literate practitioner do first?",
      "options": [
        "Publish it quickly to save time",
        "Name the affected population and check whether the output works for the hardest-to-serve user",
        "Assume average performance is good enough",
        "Ask the model whether it is biased"
      ],
      "correctIndex": 1,
      "explanation": "Naming the affected population and checking for disparate impact — plus keeping a human in the loop for access-affecting decisions — is how you catch exclusion before it harms someone."
    }
  ]$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.7';

update public.modules set
  body_md = $md$# Energy, Environment, and Data Sovereignty

Using AI responsibly means being honest about its costs and where it runs — not just what it can do. As a public-interest organization, Nava is expected to weigh these factors, not hand-wave them.

## AI has a physical footprint
Behind every prompt is a data center. Training a large model consumes enormous electricity; even everyday inference (your individual queries) adds up across millions of requests, drawing power and water for cooling. The cloud is not weightless — it is buildings, chips, and a grid.

This doesn't mean "never use AI." It means **use it deliberately**: the right tool for tasks where it adds real value, not reflexively for everything.

## Data sovereignty: where does the data go?
When you send text to a commercial AI service, it leaves Nava's environment and travels to a vendor's servers — which may sit in another jurisdiction, governed by other laws, with their own retention and training practices.

For government work this is a first-order concern:
- **Residency** — some government data must remain within specific geographic or contractual boundaries.
- **Control** — once data is sent to a vendor, you have ceded some control over how it is stored, logged, or reused.
- **Authorization** — the approved-tool rules (cell 1.5) exist precisely because not every tool is cleared for every data class.

## The honest framing
A literate practitioner can hold two truths at once: AI is genuinely useful **and** it has environmental and sovereignty costs that matter. The move isn't hype or doom — it is proportionate judgment: choose AI where the value justifies the cost, route data only to tools authorized for it, and be able to explain your reasoning.$md$,
  quiz_json = $json$[
    {
      "question": "What is an accurate way to think about the environmental footprint of AI?",
      "options": [
        "AI has no real physical cost because it is just 'the cloud'",
        "Training and large-scale inference consume significant electricity and water in physical data centers",
        "Only training has any cost; using a model afterward is free",
        "The footprint is just the user's internet bandwidth"
      ],
      "correctIndex": 1,
      "explanation": "Every prompt runs in a physical data center. Training is power-intensive, and inference adds up at scale (power plus cooling water). The cloud is buildings, chips, and a grid — not weightless."
    },
    {
      "question": "What does 'data sovereignty' refer to when using a commercial AI tool?",
      "options": [
        "The model's ownership of the answers it produces",
        "Concerns about where data goes, which laws govern it, and who controls it once it leaves Nava's environment",
        "The user's right to a fast response",
        "The vendor's market share"
      ],
      "correctIndex": 1,
      "explanation": "Sending text to a vendor moves it outside Nava's control, possibly to another jurisdiction with its own retention and training practices — a first-order concern for government data."
    },
    {
      "question": "Why do approved-tool rules connect to the sovereignty conversation?",
      "options": [
        "They don't — the two are unrelated",
        "Because not every tool is authorized for every data class; routing data to an unapproved tool can violate residency and control requirements",
        "Because approved tools are always cheaper",
        "Because approved tools make the model faster"
      ],
      "correctIndex": 1,
      "explanation": "Approved-tool literacy (cell 1.5) exists because data residency, control, and authorization vary by tool. Sovereignty is one reason certain data can only go to certain tools."
    },
    {
      "question": "What is the 'honest framing' a literate practitioner takes toward AI's costs?",
      "options": [
        "AI is harmful and should be avoided",
        "AI is consequence-free and should be used for everything",
        "AI is genuinely useful AND has real environmental and sovereignty costs, so use it proportionately and explain your reasoning",
        "The costs are someone else's problem"
      ],
      "correctIndex": 2,
      "explanation": "The literate stance is proportionate judgment, not hype or doom: use AI where the value justifies the cost, route data only to authorized tools, and be able to defend the choice."
    }
  ]$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.8';

update public.modules set
  body_md = $md$# An Honest Framing of How AI Changes Work

There is a lot of noise about AI and jobs — breathless claims of mass replacement on one side, dismissive "it's just hype" on the other. A literate practitioner needs a clearer, more honest frame.

## Task-shape change, not wholesale replacement
AI rarely replaces a whole job. It changes the **shape of the tasks** within a job. Work is a bundle of tasks; AI is good at some (drafting, summarizing, first-pass synthesis) and poor at others (judgment, accountability, relationships, knowing what is actually true). What shifts is the *mix*: less time on certain mechanical tasks, more on the parts that need human judgment.

## Augmentation vs. automation
- **Automation** — the tool does the task end-to-end with no one in the loop.
- **Augmentation** — the tool does a first pass; a person directs, checks, and owns the result.

For most knowledge work in civic tech, augmentation is the realistic and responsible mode: the human stays accountable, especially where decisions affect the public.

## What this means for your role
- The skill that grows in value is **judgment** — framing the problem, evaluating output, knowing when AI is wrong.
- Routine drafting and synthesis get faster; the bottleneck moves to **review and decision-making**.
- "AI literacy" becomes part of the job itself, not a side skill.

## Why honesty matters here
Overselling AI ("it'll do your job") breeds either fear or reckless over-reliance. Underselling it ("it's a toy") leaves people unprepared for a real shift. The literate stance is neither: AI is a capable tool that reshapes how work gets done, and the durable human contributions — judgment, accountability, care for the people we serve — become *more* central, not less.$md$,
  quiz_json = $json$[
    {
      "question": "What is the most accurate framing of how AI typically affects a job?",
      "options": [
        "It replaces the entire job",
        "It changes the shape and mix of tasks within the job — automating some and shifting time toward judgment-heavy work",
        "It has no effect on how work is done",
        "It only affects technical jobs"
      ],
      "correctIndex": 1,
      "explanation": "Jobs are bundles of tasks. AI handles some (drafting, summarizing) well and others (judgment, accountability) poorly, so the task mix shifts rather than the whole role disappearing."
    },
    {
      "question": "What is the difference between augmentation and automation?",
      "options": [
        "They are the same thing",
        "Automation does the task end-to-end with no human; augmentation does a first pass while a person directs, checks, and owns the result",
        "Augmentation is always faster",
        "Automation requires a bigger model"
      ],
      "correctIndex": 1,
      "explanation": "For most civic-tech knowledge work, augmentation is the responsible mode — the human stays accountable, which matters especially when decisions affect the public."
    },
    {
      "question": "As AI handles more routine drafting, where do value and the bottleneck shift?",
      "options": [
        "To typing speed",
        "To judgment, review, and decision-making — framing problems and evaluating output",
        "To owning more hardware",
        "Away from humans entirely"
      ],
      "correctIndex": 1,
      "explanation": "When drafting and synthesis get faster, the scarce, high-value work becomes evaluating output and making sound decisions — human judgment becomes more central."
    },
    {
      "question": "Why does honest framing of AI's job impact matter?",
      "options": [
        "It doesn't; only the technology matters",
        "Overselling breeds fear or reckless over-reliance, while underselling leaves people unprepared — neither supports a proportionate response",
        "Because vendors require it",
        "Because it makes the model more accurate"
      ],
      "correctIndex": 1,
      "explanation": "The literate stance avoids both hype and dismissal: AI reshapes how work gets done, and durable human contributions — judgment, accountability, care — become more central."
    }
  ]$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.11';

update public.modules set
  body_md = $md$# AI Harm Patterns Specific to Civic Tech

General AI risks (bias, hallucination) take on sharper, specific forms when the "user" is a government program and the affected people are benefit recipients. Recognizing these patterns is part of doing this work safely.

## Pattern 1: Wrongful denials and errors at scale
An AI system woven into eligibility or document processing can produce errors that deny or delay benefits — and unlike a single caseworker's mistake, an automated error repeats across thousands of cases instantly. Scale turns a small error rate into mass harm.

## Pattern 2: Automation bias in casework
When a tool suggests a decision, humans tend to defer to it — even against their own judgment or contrary evidence. In benefits work, automation bias can mean a caseworker rubber-stamps a wrong recommendation, eroding the human review that is supposed to protect applicants.

## Pattern 3: Opacity and the right to an explanation
People denied a government benefit often have a legal right to know *why*. An opaque AI ("the model decided") can't give a real reason, undermining due process and the ability to appeal. Explainability isn't a nice-to-have here — it is tied to rights.

## Pattern 4: Exclusion and the digital divide
AI-driven interfaces and content can quietly exclude the people most in need — those with limited connectivity, low digital literacy, disabilities, or limited English. A "more efficient" system that the hardest-to-serve can't use widens the gap.

## Spotting and resisting these patterns
- Ask **"what happens when this is wrong, times ten thousand?"**
- Preserve **meaningful human review** — not a rubber stamp.
- Insist on **explainability** where decisions affect rights.
- Check whether the system **reaches the hardest-to-serve**, not just the average user.

These harms are specific, predictable, and — with awareness — avoidable.$md$,
  quiz_json = $json$[
    {
      "question": "Why is a wrongful AI error in a benefits system more dangerous than a single caseworker's mistake?",
      "options": [
        "It isn't — they are equivalent",
        "An automated error repeats instantly across thousands of cases, turning a small error rate into mass harm",
        "Caseworkers never make mistakes",
        "AI errors are always caught automatically"
      ],
      "correctIndex": 1,
      "explanation": "Scale is the multiplier. An automated process applies the same flaw to every case at once, so even a low error rate can deny or delay benefits for many people simultaneously."
    },
    {
      "question": "What is 'automation bias'?",
      "options": [
        "The model's preference for certain words",
        "The human tendency to defer to a tool's suggestion even against one's own judgment or contrary evidence",
        "A setting that speeds up automation",
        "Bias accidentally written into the automation code"
      ],
      "correctIndex": 1,
      "explanation": "Automation bias erodes the human review meant to protect applicants — a caseworker may rubber-stamp a wrong AI recommendation instead of exercising independent judgment."
    },
    {
      "question": "Why is explainability tied to rights in government benefits decisions?",
      "options": [
        "It makes the interface look more professional",
        "People denied a benefit often have a legal right to know why, and an opaque 'the model decided' undermines due process and the ability to appeal",
        "Explainability makes the model run faster",
        "It reduces energy use"
      ],
      "correctIndex": 1,
      "explanation": "Due process can require a real reason for a denial. An unexplainable AI decision undermines the applicant's ability to understand and appeal it — explainability is a rights issue, not a nicety."
    },
    {
      "question": "Which question best helps spot civic-tech AI harms before they happen?",
      "options": [
        "'How fast is the model?'",
        "'What happens when this is wrong, times ten thousand — and does the system still reach the hardest-to-serve?'",
        "'Is this the newest model available?'",
        "'How many tokens did it use?'"
      ],
      "correctIndex": 1,
      "explanation": "Thinking about errors at scale, preserving meaningful human review, insisting on explainability, and checking that the hardest-to-serve are reached are how these specific, predictable harms get caught."
    }
  ]$json$::jsonb,
  status = 'in_review',
  version = 2,
  updated_at = now()
where cell_id = '1.12';
