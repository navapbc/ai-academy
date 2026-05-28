import { QuizQuestion } from '../types';
import { BRANDING } from '../branding';

export const QUIZ_DATA: Record<string, QuizQuestion[]> = {
  'p1-m3': [
    {
      question: `What is the primary risk of using 'Cloud AI' with sensitive ${BRANDING.name} client data?`,
      options: [
        "The model might hallucinate the answer.",
        "The data leaves your device and is processed/logged by an external provider.",
        "Local models are always more accurate.",
        "Cloud AI costs more per token."
      ],
      correctIndex: 1,
      explanation: "When data hits the cloud, you lose 'data sovereignty'. Without strict enterprise legal agreements, that data might be used to train future models or could be accessible to the provider's employees for logging purposes. For PII/PHI, this is a non-starter in most govtech contracts."
    },
    {
      question: "Why do we call Large Language Models 'Probabilistic' rather than 'Deterministic'?",
      options: [
        "Because they use random numbers to generate answers.",
        "Because their answers depend on the 'probability' of the next word occurring in their training set.",
        "Because they are only correct about 50% of the time.",
        "Because they can only do math problems."
      ],
      correctIndex: 1,
      explanation: "LLMs don't 'know' facts in a database sense. They calculate the statistical likelihood of the next 'token' (part of a word) based on patterns in their training data. This is why they can be creative, but also why they can confidently state things that aren't true (hallucinations)."
    },
    {
      question: `In the context of ${BRANDING.name}'s mission, what is 'Automation Bias'?`,
      options: [
        "The tendency for humans to over-trust automated systems even when they are wrong.",
        "A bug in the AI's weight distribution.",
        "The speed at which AI replaces manual data entry.",
        "The preference for local models over cloud models."
      ],
      correctIndex: 0,
      explanation: "Automation bias is a psychological trap where humans ignore their own judgment or conflicting data because an automated system suggested an answer. In civic tech, this can lead to catastrophic errors in eligibility or case management if we don't maintain 'human-in-the-loop' workflows."
    },
    {
      question: "What does it mean for a system to be 'Explainable' in government services?",
      options: [
        "The AI can speak multiple languages.",
        "The user can understand the logic or data points that led to a specific decision.",
        "The technical documentation is written in Markdown.",
        "The AI can explain how it was trained."
      ],
      correctIndex: 1,
      explanation: "Explainability is a cornerstone of due process. If a citizen is denied a benefit, they have a legal right to know why. Because LLMs are 'black boxes' with billions of parameters, proving exactly *why* it made a specific choice is a significant technical and ethical challenge."
    }
  ],
  'p2-m3': [
    {
      question: "What does 'Grounding' a model mean in a civic tech context?",
      options: [
        "Turning the model off when it makes a mistake.",
        "Running the model on a physical server instead of a VM.",
        "Providing a specific policy or document for the model to use as its only source of truth.",
        "Ensuring the model's weights are stored locally."
      ],
      correctIndex: 2,
      explanation: "Grounding (often implemented via RAG) forces the model to base its response on provided text rather than its internal 'fuzzy' training memory. This is critical for policy work where precision counts and 'knowledge cutoffs' would otherwise lead to outdated information."
    },
    {
      question: "Which technique is most effective for summarizing a dense 50-page Medicaid manual?",
      options: [
        "Asking the model what it knows about Medicaid.",
        "Zipped file upload for cloud processing.",
        "Retrieval Augmented Generation (RAG) to feed specific sections into the prompt.",
        "Few-shot prompting with five examples of summaries."
      ],
      correctIndex: 2,
      explanation: "RAG allows us to search the document for the most relevant context and feed only those snippets into the prompt. This overcomes 'context window' limits and prevents the model from getting lost in a massive, overwhelming amount of data."
    },
    {
      question: `Why should we use 'Synthetic Personas' during the design phase at ${BRANDING.name}?`,
      options: [
        "To replace real user testing entirely.",
        "To simulate feedback from diverse user types (e.g., low digital literacy) rapidly during early drafts.",
        "Because it's cheaper than hiring consultants.",
        "To generate fake names for demo databases."
      ],
      correctIndex: 1,
      explanation: "Synthetic personas are 'AI-powered stress tests.' While they never replace real community engagement, they allow us to rapidly iterate on designs by simulating how a user with specific constraints (like limited English proficiency or high stress) might interpret our UI labels and instructions."
    }
  ],
  'p3-m3': [
    {
      question: `According to ${BRANDING.name}'s AI Decision Matrix, where should PII (Personally Identifiable Information) be processed?`,
      options: [
        "Standard Cloud AI (ChatGPT/Claude)",
        "Enterprise-contracted Cloud AI with data protection",
        "Local AI (Ollama or LM Studio) only",
        "It shouldn't be processed by AI at all"
      ],
      correctIndex: 2,
      explanation: `To meet high-security government standards like FedRAMP High or FISMA, sensitive PII should never traverse the open internet or reside on third-party servers if possible. Local AI ensures the data never leaves ${BRANDING.name}'s controlled environment or the client's infrastructure.`
    },
    {
      question: "What is the primary bottleneck when running large language models locally?",
      options: [
        "Internet bandwidth",
        "Available System RAM / VRAM",
        "Hard drive speed",
        "The number of browser tabs open"
      ],
      correctIndex: 1,
      explanation: "Local LLMs must be loaded into memory (RAM) to run at usable speeds. If your RAM is insufficient, the system will 'swap' data to the hard drive, which is orders of magnitude slower, resulting in a model that takes minutes to generate a single sentence."
    },
    {
      question: "In the 'Privacy-First' matrix, what is the 'Redaction Bridge'?",
      options: [
        "A physical hardware device for securing data.",
        "A process of stripping sensitive identifiers (names, SSNs) so a cloud model can safely process the underlying problem structure.",
        "A tool for blocking all internet traffic during AI usage.",
        "The bridge between Phase 2 and Phase 3."
      ],
      correctIndex: 1,
      explanation: "Redaction bridges the gap between 'Too Sensitive for Cloud' and 'Powerful Reasoning Needed.' By stripping identities (John Doe -> USER_A), we can use advanced cloud models to find patterns while ensuring that even if the cloud provider is breached, no citizen data is exposed."
    }
  ]
};
