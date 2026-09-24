-- reconcile_1_10_regulatory_floor — re-tense the EU AI Act Article 4 timeline.
--
-- WHY: 20260602190000_load_curriculum_content.sql is a plain UPDATE, but it only
-- reaches a database that re-runs that migration (a fresh `supabase db reset`).
-- Against an environment where it already ran — i.e. this cell is already live —
-- a change to supabase/seed-data/curriculum-content.json alone is a silent no-op.
-- This migration carries the same content as an explicit UPDATE so every
-- environment converges on the corrected copy. Same shape as
-- 20260915000000_reconcile_1_4_data_classification.sql.
--
-- WHAT CHANGED: 1.10 stated the EU AI Act Article 4 enforcement date in the
-- FUTURE tense ("enforcement powers begin 2 August 2026", "ahead of August 2026
-- enforcement"). That date has passed: national market surveillance authorities
-- gained Article 4 enforcement powers on 2 August 2026, on schedule. The lesson's
-- teaching point is unchanged and still correct — the duty applied from
-- 2 February 2025, and the August 2026 date is only when enforcement powers
-- began, not when the obligation started — but every statement of it is re-tensed. The bullet simply states both
-- dates now; it makes no claim about penalties, since Article 99 does not list
-- Article 4 as separately fineable.
--
-- SCOPE: body_md, quiz_json and lab_config_json for cell 1.10. The stale wording
-- appeared in all three; a body-only fix would have left the knowledge check and
-- the regulatory-check lab teaching a date that has already passed.
--
-- NOT IN SCOPE (flagged for an editorial decision, see docs/content/supplemental-audit.md):
-- the Digital Omnibus, Regulation (EU) 2026/1744, in force 27 July 2026, rewrote
-- Article 4 itself — the duty shifted from ensuring "a sufficient level" of AI
-- literacy (an obligation of result) to taking measures to SUPPORT its
-- development (an obligation of effort). 1.10 never characterised the duty either
-- way, so nothing it says is contradicted, and this migration deliberately does
-- not add that nuance. Adding it is a content call for L&D.
--
-- Re-runnable: a second apply rewrites the same values.

update public.modules
   set body_md   = $md$Mid-procurement, an agency client asks a direct question: are your staff trained on AI against any recognized framework? "We use AI carefully" is not an answer that wins the contract. Knowing the floor is.

## What it is

The regulatory floor is the set of recognized frameworks and rules that shape responsible AI use, especially for public-sector work. The main ones to know by name: the EU AI Act's AI-literacy duty (Article 4), the US Department of Labor's AI Literacy Framework, three OMB memos (M-25-21, M-25-22, and M-26-04), and the NIST AI Risk Management Framework with its Generative AI Profile. You don't need to memorize them. You need to know which apply to your work and where to find authoritative guidance.

## Why it matters to you

Clients increasingly ask, in procurement and audits, whether your staff are trained against recognized frameworks. "Aware and aligned" is a defensible answer. A blank look is not. Several of these are voluntary rather than mandates, and that distinction matters when you describe your posture. The NIST framework is voluntary, organized around Govern, Map, Measure, and Manage ([NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)). Its Generative AI Profile is also voluntary guidance and names 12 risk categories, including confabulation, the technical term for hallucination ([NIST Generative AI Profile, AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)). The DOL framework is voluntary too ([DOL AI Literacy Framework, ETA TEN 07-25](https://www.dol.gov/agencies/eta/advisories/ten-07-25)).

## How to do it / what to watch for

Know which floor applies and state it accurately:

- EU AI Act Article 4: the AI-literacy duty applied since 2 February 2025, and enforcement powers began 2 August 2026 ([EU AI Act, Article 4](https://artificialintelligenceact.eu/article/4/)).
- OMB M-25-21 and M-25-22: both issued 3 April 2025, covering federal AI use and AI acquisition ([M-25-21](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf), [M-25-22](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf)).
- OMB M-26-04: issued 11 December 2025, implementing Executive Order 14319 on unbiased AI ([M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)).

The red flag is overclaiming. Don't call voluntary guidance a mandate, and don't misstate a date. Precision is what makes "aware and aligned" credible.

## Example

An agency client asks whether Nava meets EU Article 4 and DOL expectations. A strong answer is specific: staff complete AI-literacy training aligned to recognized frameworks; the team has treated the EU Article 4 duty as live since it applied in February 2025, ahead of the August 2026 start of enforcement powers; and practices map to the voluntary NIST and DOL guidance rather than claiming those are legal mandates. That answer survives a follow-up question. "We're careful" does not. The judgment is in being accurate about what binds you and what merely guides you.

## In practice

Know the floor by name, know which rules bind you versus guide you, and never call voluntary guidance a mandate.

## Sources

- [EU AI Act, Article 4 (AI literacy)](https://artificialintelligenceact.eu/article/4/)
- [OMB M-25-21, Accelerating Federal Use of AI](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf)
- [OMB M-25-22, Driving Efficient Acquisition of AI](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf)
- [OMB M-26-04, Unbiased AI Principles](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)
- [DOL AI Literacy Framework, ETA TEN 07-25](https://www.dol.gov/agencies/eta/advisories/ten-07-25)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST Generative AI Profile, AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)$md$,
       quiz_json = $json$[
  {
    "question": "An agency client asks during procurement whether Nava staff are trained against recognized AI frameworks. Which response is both accurate and defensible?",
    "options": [
      "\"We use AI very carefully and responsibly on every project.\"",
      "\"Our staff complete AI-literacy training aligned to recognized frameworks, including the EU AI Act Article 4 duty and the voluntary NIST and DOL guidance.\"",
      "\"We fully comply with all AI laws, including the mandatory NIST and DOL requirements.\"",
      "\"We don't need framework training because we follow internal best practices.\""
    ],
    "correctIndex": 1,
    "explanation": "A defensible answer names specific frameworks and states their status accurately, which survives a follow-up question. Option 3 is the trap: it sounds strong but calls voluntary NIST and DOL guidance 'mandatory,' an overclaim that collapses under audit. 'We're careful' (option 1) names nothing recognizable. Know the floor by name, and never call voluntary guidance a mandate."
  },
  {
    "question": "A colleague says, \"The EU AI Act's AI-literacy duty didn't matter until enforcement powers started in August 2026.\" How should you correct this?",
    "options": [
      "They're right; there was nothing to do before the 2026 enforcement date.",
      "The duty doesn't apply to US-based firms at all.",
      "The Article 4 literacy duty has applied since February 2025; August 2026 is only when enforcement powers began, so the duty was live long before then.",
      "The duty only applies once a client formally requests compliance."
    ],
    "correctIndex": 2,
    "explanation": "Article 4's AI-literacy duty applied from 2 February 2025; the August 2026 date is when enforcement powers began, not when the obligation started. Option 1 confuses the enforcement date with the effective date, which led firms to wrongly delay action. Be precise about dates, because precision is what makes 'aware and aligned' credible."
  },
  {
    "question": "Which statement about these AI frameworks is accurate?",
    "options": [
      "The NIST AI Risk Management Framework is a legally binding mandate for all contractors.",
      "OMB M-25-21 and M-25-22 were both issued in February 2025.",
      "OMB M-26-04 implements Executive Order 14179.",
      "The NIST Generative AI Profile is voluntary guidance and defines 12 generative-AI risk categories."
    ],
    "correctIndex": 3,
    "explanation": "The NIST Generative AI Profile is voluntary and names 12 risk categories, including confabulation. Option 1 wrongly calls the voluntary NIST framework a binding mandate. M-25-21 and M-25-22 were issued April 3, 2025, not February, and M-26-04 implements EO 14319, not 14179. Getting these facts exactly right is what separates a credible 'aware and aligned' posture from an overclaim that fails an audit."
  }
]$json$::jsonb,
       lab_config_json = $json${"kind": "regulatory-check", "items": [{"why": "Article 4's literacy duty applied from 2 February 2025; August 2026 is when enforcement powers began, not when the duty started. Confusing the two led firms to wrongly delay action — be precise about dates.", "prompt": "On the EU AI Act's AI-literacy duty (Article 4), which statement is accurate to put in the response?", "options": ["It took effect in August 2026, so there was nothing to do before then.", "It has applied since 2 February 2025; the August 2026 date is when enforcement powers began, so the duty was live well before then.", "It only applies to EU-based firms, so US public-sector work is exempt.", "It's voluntary guidance rather than an obligation."], "correctIndex": 1}, {"why": "The NIST AI RMF is voluntary and organized around Govern, Map, Measure, and Manage. Calling voluntary guidance a binding mandate is the overclaim that fails an audit — name what merely guides you accurately.", "prompt": "On the NIST AI Risk Management Framework, which statement is accurate to put in the response?", "options": ["It's a legally binding mandate for all federal contractors.", "It's voluntary guidance, organized around Govern, Map, Measure, and Manage.", "It replaces the EU AI Act for US firms.", "It only covers generative AI."], "correctIndex": 1}, {"why": "The Generative AI Profile is voluntary and names 12 risk categories, including confabulation (the technical term for hallucination). Precision about its status and scope is what makes 'aware and aligned' credible.", "prompt": "On the NIST Generative AI Profile (AI 600-1), which statement is accurate to put in the response?", "options": ["It's a mandatory certification all contractors must hold.", "It's voluntary guidance that names 12 generative-AI risk categories, including confabulation.", "It defines exactly 4 risk categories.", "It supersedes the NIST AI Risk Management Framework."], "correctIndex": 1}, {"why": "Both were issued 3 April 2025 — M-25-21 on federal AI use, M-25-22 on AI acquisition. Misstating the date (for example, saying February) is exactly the kind of inaccuracy that undermines a credible posture.", "prompt": "On OMB memos M-25-21 and M-25-22, which statement is accurate to put in the response?", "options": ["They were both issued in February 2025.", "They were both issued on 3 April 2025, covering federal AI use and AI acquisition respectively.", "They are the same memo under two numbers.", "They were rescinded in 2026."], "correctIndex": 1}, {"why": "M-26-04 was issued 11 December 2025 and implements Executive Order 14319 on unbiased AI — not EO 14179. Getting the EO number and date exactly right separates a credible answer from an overclaim that fails an audit.", "prompt": "On OMB memo M-26-04, which statement is accurate to put in the response?", "options": ["It implements Executive Order 14179.", "It was issued 11 December 2025 and implements Executive Order 14319 on unbiased AI.", "It's a voluntary NIST profile.", "It predates the EU AI Act."], "correctIndex": 1}], "takeaway": {"intro": "Assemble the accurate statements into a short, cited answer you can adapt: be precise about what BINDS you versus what GUIDES you, and never overclaim or misstate a date.", "title": "Your model client response"}}$json$::jsonb,
       updated_at = now()
 where cell_id = '1.10';
