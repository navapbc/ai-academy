-- P3.8: seed the 1.9 disclosure-builder and 1.10 regulatory-check exercises.
-- Both are single-select scenario exercises that share ONE component
-- (ScenarioExercise). For each item the learner picks one of four options,
-- graded against correctIndex; after grading the correct option text of every
-- item is compiled into a keepable takeaway panel (a disclosure cheat-sheet for
-- 1.9, a model client response for 1.10).
-- Idempotent: only sets lab_config_json when it is still null.

-- 1.9 — disclosure-builder. Every item reuses the same 4 disclosure-level
-- options (in a fixed order); only the artifact and the correct call change.
update public.modules
set lab_config_json = $json$
{
  "kind": "disclosure-builder",
  "takeaway": {
    "title": "Your disclosure cheat-sheet",
    "intro": "Disclose in client-facing, public, and durable/accountable artifacts; skip it for low-stakes personal-internal drafting; and some tasks (like personnel matters) shouldn't use AI at all."
  },
  "items": [
    {
      "prompt": "A report you're delivering to the agency client.",
      "options": [
        "No disclosure needed.",
        "A brief note that AI assisted.",
        "Explicit disclosure in the artifact, noting AI use and that a human verified it.",
        "Don't use AI for this task."
      ],
      "correctIndex": 2,
      "why": "Client-facing deliverables expect disclosure; undisclosed AI in a deliverable is a contract and trust risk, and the organization owns whatever its AI produced (the Moffatt principle)."
    },
    {
      "prompt": "A quick Slack message drafting your own note to teammates.",
      "options": [
        "No disclosure needed.",
        "A brief note that AI assisted.",
        "Explicit disclosure in the artifact, noting AI use and that a human verified it.",
        "Don't use AI for this task."
      ],
      "correctIndex": 0,
      "why": "Low-stakes internal drafting needs no disclosure. The disclosure paradox cuts both ways — over-disclosing trivial use erodes the signal of disclosure that matters."
    },
    {
      "prompt": "A blog post published under Nava's name.",
      "options": [
        "No disclosure needed.",
        "A brief note that AI assisted.",
        "Explicit disclosure in the artifact, noting AI use and that a human verified it.",
        "Don't use AI for this task."
      ],
      "correctIndex": 2,
      "why": "Public-facing content under Nava's name expects disclosure per the publication's norm; undisclosed AI erodes trust badly when it's discovered."
    },
    {
      "prompt": "An architecture decision record (ADR) — internal, but a durable accountability artifact.",
      "options": [
        "No disclosure needed.",
        "A brief note that AI assisted.",
        "Explicit disclosure in the artifact, noting AI use and that a human verified it.",
        "Don't use AI for this task."
      ],
      "correctIndex": 1,
      "why": "ADRs carry decision lineage; a brief 'AI-assisted' note keeps that lineage honest and avoids an audit-failing artifact later."
    },
    {
      "prompt": "A draft performance review about a colleague.",
      "options": [
        "No disclosure needed.",
        "A brief note that AI assisted.",
        "Explicit disclosure in the artifact, noting AI use and that a human verified it.",
        "Don't use AI for this task."
      ],
      "correctIndex": 3,
      "why": "Personnel matters are sensitive, accountability-bearing human-judgment tasks — don't delegate them to AI; if any assistance is used, it needs heavy disclosure and clear human ownership."
    }
  ]
}
$json$::jsonb
where cell_id = '1.9'
  and lab_config_json is null;

-- 1.10 — regulatory-check. Each item asks which statement is accurate to put in
-- a client response. The facts mirror the lesson: be precise about what binds
-- you versus what guides you, and never misstate a date or an EO number.
update public.modules
set lab_config_json = $json$
{
  "kind": "regulatory-check",
  "takeaway": {
    "title": "Your model client response",
    "intro": "Assemble the accurate statements into a short, cited answer you can adapt: be precise about what BINDS you versus what GUIDES you, and never overclaim or misstate a date."
  },
  "items": [
    {
      "prompt": "On the EU AI Act's AI-literacy duty (Article 4), which statement is accurate to put in the response?",
      "options": [
        "It takes effect in August 2026, so there's nothing to do yet.",
        "It has applied since 2 February 2025; the August 2026 date is when enforcement powers begin, so treat the duty as already live.",
        "It only applies to EU-based firms, so US public-sector work is exempt.",
        "It's voluntary guidance rather than an obligation."
      ],
      "correctIndex": 1,
      "why": "Article 4's literacy duty applied from 2 February 2025; August 2026 is when enforcement powers begin, not when the duty starts. Confusing the two leads firms to wrongly delay action — treat the duty as live now and be precise about dates."
    },
    {
      "prompt": "On the NIST AI Risk Management Framework, which statement is accurate to put in the response?",
      "options": [
        "It's a legally binding mandate for all federal contractors.",
        "It's voluntary guidance, organized around Govern, Map, Measure, and Manage.",
        "It replaces the EU AI Act for US firms.",
        "It only covers generative AI."
      ],
      "correctIndex": 1,
      "why": "The NIST AI RMF is voluntary and organized around Govern, Map, Measure, and Manage. Calling voluntary guidance a binding mandate is the overclaim that fails an audit — name what merely guides you accurately."
    },
    {
      "prompt": "On the NIST Generative AI Profile (AI 600-1), which statement is accurate to put in the response?",
      "options": [
        "It's a mandatory certification all contractors must hold.",
        "It's voluntary guidance that names 12 generative-AI risk categories, including confabulation.",
        "It defines exactly 4 risk categories.",
        "It supersedes the NIST AI Risk Management Framework."
      ],
      "correctIndex": 1,
      "why": "The Generative AI Profile is voluntary and names 12 risk categories, including confabulation (the technical term for hallucination). Precision about its status and scope is what makes 'aware and aligned' credible."
    },
    {
      "prompt": "On OMB memos M-25-21 and M-25-22, which statement is accurate to put in the response?",
      "options": [
        "They were both issued in February 2025.",
        "They were both issued on 3 April 2025, covering federal AI use and AI acquisition respectively.",
        "They are the same memo under two numbers.",
        "They were rescinded in 2026."
      ],
      "correctIndex": 1,
      "why": "Both were issued 3 April 2025 — M-25-21 on federal AI use, M-25-22 on AI acquisition. Misstating the date (for example, saying February) is exactly the kind of inaccuracy that undermines a credible posture."
    },
    {
      "prompt": "On OMB memo M-26-04, which statement is accurate to put in the response?",
      "options": [
        "It implements Executive Order 14179.",
        "It was issued 11 December 2025 and implements Executive Order 14319 on unbiased AI.",
        "It's a voluntary NIST profile.",
        "It predates the EU AI Act."
      ],
      "correctIndex": 1,
      "why": "M-26-04 was issued 11 December 2025 and implements Executive Order 14319 on unbiased AI — not EO 14179. Getting the EO number and date exactly right separates a credible answer from an overclaim that fails an audit."
    }
  ]
}
$json$::jsonb
where cell_id = '1.10'
  and lab_config_json is null;
