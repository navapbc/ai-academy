import { QuizQuestion } from '../types';

// Quizzes are reintroduced per-cell starting in P2.2. Each key maps a module id
// to its scored multiple-choice questions; a passing (100%) score records an
// attempt to Supabase and marks the cell complete.
export const QUIZ_DATA: Record<string, QuizQuestion[]> = {
  '1.4': [
    {
      question:
        "A caseworker wants to paste a benefits applicant's name and case notes into their personal ChatGPT account to draft a summary. What should they do?",
      options: [
        "Go ahead — it's just a draft.",
        'Stop — applicant names and case notes are regulated PII/PHI and must not go into an unsanctioned tool.',
        'Remove only the last name, then paste.',
        'Paste it, but delete the chat afterward.',
      ],
      correctIndex: 1,
      explanation:
        "Applicant names + case notes are regulated PII/PHI. Trimming a name or deleting the chat doesn't undo that the data left Nava's control and may be logged or trained on. Use an approved tool, or fully redact.",
    },
    {
      question: 'Which question best captures the pre-paste test for prompt data?',
      options: [
        '"Is this tool fast enough?"',
        '"Would I be comfortable if this text appeared in the vendor\'s training data, a breach, or another customer\'s response?"',
        '"Has anyone else pasted this before?"',
        '"Is my internet connection secure?"',
      ],
      correctIndex: 1,
      explanation:
        "The habit is imagining the worst-case exposure. If you wouldn't be comfortable seeing the data in a leak or training set, don't paste it.",
    },
    {
      question: 'A published Nava blog post falls into which data class?',
      options: ['Regulated', 'Confidential', 'Public', 'Internal'],
      correctIndex: 2,
      explanation:
        "Already-released material is Public. Classification works both ways — don't over-restrict public data, and don't under-protect regulated data.",
    },
    {
      question: 'Why does OMB M-25-22 matter for how Nava staff use AI?',
      options: [
        'It bans all AI use by contractors.',
        'It binds Nava as a contractor on how AI vendors may use government data, including training-data restrictions.',
        'It only applies in the EU.',
        'It sets the price of API tokens.',
      ],
      correctIndex: 1,
      explanation:
        'M-25-22 governs federal AI acquisition and contractor obligations — including restrictions on vendor use of government data — which is a concrete compliance reason classification is non-negotiable.',
    },
  ],
};
