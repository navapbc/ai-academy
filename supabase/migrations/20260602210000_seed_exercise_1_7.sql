-- P3.7: seed the 1.7 failure-spotter exercise config.
-- Each item shows a flawed AI-generated artifact (markdown) plus two graded
-- multiple-choice questions: what's wrong (issue) and what to do (mitigation).
-- Idempotent: only sets lab_config_json when it is still null.
update public.modules
set lab_config_json = $json$
{
  "kind": "failure-spotter",
  "items": [
    {
      "id": "hiring",
      "artifactMd": "**AI-generated candidate shortlist** (from a demographically mixed resume pile):\n\n1. John Miller\n2. James Anderson\n3. Robert Thompson\n4. William Davis\n5. Michael Clark",
      "issue": {
        "prompt": "What's the problem with this shortlist?",
        "options": [
          "Nothing — it picked the top 5.",
          "It skews toward one demographic, a sign the model amplified bias in the data or its training.",
          "The names are in a numbered list.",
          "There are too few candidates."
        ],
        "correctIndex": 1,
        "why": "From a mixed pile, an all-similar shortlist signals the model amplifying bias. Models reflect biases in their training data and their builders' choices."
      },
      "mitigation": {
        "prompt": "Best next step?",
        "options": [
          "Use the shortlist; the model is neutral.",
          "Don't use AI to screen candidates for selection; if used at all, audit for representativeness and keep a human deciding.",
          "Ask the model to add more names.",
          "Re-run until it looks balanced."
        ],
        "correctIndex": 1,
        "why": "Selection is a high-stakes accountability task — keep a human in the loop and check representativeness rather than letting the model's pattern stand."
      }
    },
    {
      "id": "ui",
      "artifactMd": "**AI-generated form snippet:**\n\n```html\n<div onclick=\"submit()\">Submit</div>\n<input type=\"text\" placeholder=\"Full name\">\n<input type=\"text\" placeholder=\"SSN\">\n<span style=\"color:red\">* Required</span>\n<img src=\"agency-seal.png\">\n```",
      "issue": {
        "prompt": "What's wrong with this snippet?",
        "options": [
          "It's missing several accessibility basics: a real <button>, <label>s instead of placeholders, a non-color cue for 'required', and alt text on the image.",
          "Nothing — it renders fine.",
          "It should use a table for layout.",
          "The colors are off-brand."
        ],
        "correctIndex": 0,
        "why": "A clickable div isn't keyboard-focusable, placeholders aren't labels, a color-only 'required' fails users who can't perceive color, and the image has no alt text — all Section 508 / WCAG failures."
      },
      "mitigation": {
        "prompt": "Best fix?",
        "options": [
          "Ship it and add accessibility later.",
          "Use a real <button>, pair each input with a <label>, add a text/icon cue beside the color, add alt text, then run an accessibility check.",
          "Add more CSS.",
          "Replace the form with an image of a form."
        ],
        "correctIndex": 1,
        "why": "AI-generated UI routinely omits accessibility primitives; add labels, a real button, a non-color cue, and alt text, then verify before it ships."
      }
    },
    {
      "id": "summary",
      "artifactMd": "**AI summary of a benefits-eligibility policy:**\n\n> Applicants qualify if household income is below the limit. The renewal is annual.\n\n(The source policy also lists a state-specific disability deduction and a 60-day grace period for one county.)",
      "issue": {
        "prompt": "What did the summary do?",
        "options": [
          "Nothing — it's concise.",
          "It flattened the policy, dropping a state-specific deduction and a county exception that change who qualifies.",
          "It used too many words.",
          "It invented a rule."
        ],
        "correctIndex": 1,
        "why": "AI synthesis smooths toward the 'average' and drops exceptions and minority cases — which in benefits work are exactly the details that decide eligibility."
      },
      "mitigation": {
        "prompt": "Best next step?",
        "options": [
          "Use it; the main rule is right.",
          "Treat it as a draft, verify against the source policy, and restore the deduction and exception before it reaches anyone.",
          "Ask for an even shorter summary.",
          "Add a disclaimer and send it."
        ],
        "correctIndex": 1,
        "why": "Synthesis is a draft to verify, not a finding to ship — check it against the source and restore the dropped exceptions."
      }
    },
    {
      "id": "transcript",
      "artifactMd": "**Chatbot transcript:**\n\n- **User (in Spanish):** ¿Necesito volver a solicitar?\n- **Bot:** Yes. You must reapply.\n\n(An English speaker asking the same question got a detailed, accurate answer.)",
      "issue": {
        "prompt": "What's the issue?",
        "options": [
          "Nothing — it answered.",
          "The bot degraded for the non-English speaker (terse, wrong language, possibly inaccurate), so service quality depends on the user's language.",
          "The user should write in English.",
          "The transcript is too short."
        ],
        "correctIndex": 1,
        "why": "Models often degrade for non-dominant languages and dialects; here a Spanish-speaking applicant gets a worse, possibly wrong answer — an equity failure that lands on people already facing barriers."
      },
      "mitigation": {
        "prompt": "Best response?",
        "options": [
          "Tell users to use English.",
          "Don't rely on the bot for critical multilingual guidance; route to human bilingual support and have a fluent speaker review translated instructions.",
          "Trust the translation.",
          "Disable Spanish."
        ],
        "correctIndex": 1,
        "why": "For critical instructions, keep a fluent human in the loop; a wrong AI translation can flip a meaning, and the cost falls hardest on vulnerable users."
      }
    }
  ]
}
$json$::jsonb
where cell_id = '1.7'
  and lab_config_json is null;
