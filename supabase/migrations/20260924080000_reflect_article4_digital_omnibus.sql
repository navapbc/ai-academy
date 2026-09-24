-- reflect_article4_digital_omnibus — record that Article 4 was rewritten, not
-- merely enforced.
--
-- WHY: 20260924010000 re-tensed 1.10's Article 4 timeline and deliberately left
-- this out as a content call. The call has been made: reflect it.
--
-- WHAT IS BEING STATED, and how far the sourcing goes. 1.10 is the lesson that
-- tells learners not to overclaim and not to misstate a date, so this migration
-- only asserts what is corroborated:
--   * The Digital Omnibus is Regulation (EU) 2026/1744 and entered into force on
--     27 July 2026 (adopted by Parliament 16 June 2026, Council 29 June,
--     published in the OJ 24 July). Multiple independent legal summaries agree.
--   * It rewrote Article 4, moving the provider/deployer duty toward taking
--     measures to SUPPORT the development of AI literacy — an obligation of
--     effort rather than one of result.
--   * New paragraphs 2 and 3 place support duties on the Commission and Member
--     States (including publishing practical compliance examples) and on the
--     Board — NOT on providers and deployers. Confirmed against the article text.
--
-- WHAT IS DELIBERATELY NOT QUOTED: the exact operative wording of the amended
-- paragraph 1. artificialintelligenceact.eu renders the original and the
-- amendment together, so the surviving phrasing around "a sufficient level ...
-- to their best extent" could not be pinned down from that page with the
-- confidence this particular lesson demands. The copy therefore describes the
-- DIRECTION of the change, which is well corroborated, and does not put
-- quotation marks around operative text. Anyone tightening this further should
-- read the consolidated Article 4 in EUR-Lex, not the tracked-changes view.
--
-- No URL is given for Regulation (EU) 2026/1744: it is cited by name and number
-- rather than linked, because no canonical URL for it was verified. The only
-- link remains the Article 4 page, which does reflect the amendment.
--
-- The lesson keeps its point rather than just gaining trivia: a softened
-- obligation is not an excuse to stop, and an effort obligation is one you
-- demonstrate — which is what the Academy's own training record is for. That
-- reframing also lands in the Example's procurement answer.
--
-- Same write-path reasoning as 20260915000000_reconcile_1_4_data_classification.sql;
-- the seed JSON is updated to match.
--
-- CHRONOLOGY: the three dates run Feb 2025 (duty applies) -> 27 Jul 2026
-- (Omnibus in force, article rewritten) -> 2 Aug 2026 (enforcement powers). The
-- copy states them in that order; the Omnibus landed days BEFORE enforcement
-- began, not after.
--
-- Re-runnable: a second apply rewrites the same value.

update public.modules
   set body_md = $md$Mid-procurement, an agency client asks a direct question: are your staff trained on AI against any recognized framework? "We use AI carefully" is not an answer that wins the contract. Knowing the floor is.

## What it is

The regulatory floor is the set of recognized frameworks and rules that shape responsible AI use, especially for public-sector work. The main ones to know by name: the EU AI Act's AI-literacy duty (Article 4), the US Department of Labor's AI Literacy Framework, three OMB memos (M-25-21, M-25-22, and M-26-04), and the NIST AI Risk Management Framework with its Generative AI Profile. You don't need to memorize them. You need to know which apply to your work and where to find authoritative guidance.

## Why it matters to you

Clients increasingly ask, in procurement and audits, whether your staff are trained against recognized frameworks. "Aware and aligned" is a defensible answer. A blank look is not. Several of these are voluntary rather than mandates, and that distinction matters when you describe your posture. The NIST framework is voluntary, organized around Govern, Map, Measure, and Manage ([NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)). Its Generative AI Profile is also voluntary guidance and names 12 risk categories, including confabulation, the technical term for hallucination ([NIST Generative AI Profile, AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)). The DOL framework is voluntary too ([DOL AI Literacy Framework, ETA TEN 07-25](https://www.dol.gov/agencies/eta/advisories/ten-07-25)).

## How to do it / what to watch for

Know which floor applies and state it accurately:

- EU AI Act Article 4: the AI-literacy duty has applied since 2 February 2025. The Digital Omnibus (Regulation (EU) 2026/1744, in force 27 July 2026) then rewrote the article, and enforcement powers began days later, on 2 August 2026. The duty on providers and deployers is now framed as taking measures to *support* the development of AI literacy — an obligation of effort rather than a guaranteed result — and new paragraphs put a matching support duty on the Commission and Member States, who are to publish practical compliance examples ([EU AI Act, Article 4](https://artificialintelligenceact.eu/article/4/)).
- What the rewrite does not do is let you stop. The duty still applies, enforcement powers are live, and an effort obligation is one you demonstrate: the training you complete and the record of it are the evidence.
- OMB M-25-21 and M-25-22: both issued 3 April 2025, covering federal AI use and AI acquisition ([M-25-21](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf), [M-25-22](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf)).
- OMB M-26-04: issued 11 December 2025, implementing Executive Order 14319 on unbiased AI ([M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)).

The red flag is overclaiming. Don't call voluntary guidance a mandate, and don't misstate a date. Precision is what makes "aware and aligned" credible.

## Example

An agency client asks whether Nava meets EU Article 4 and DOL expectations. A strong answer is specific: staff complete AI-literacy training aligned to recognized frameworks; the team has treated the EU Article 4 duty as live since it applied in February 2025, ahead of the August 2026 start of enforcement powers, and that training record is exactly the evidence of effort the amended Article 4 asks for; and practices map to the voluntary NIST and DOL guidance rather than claiming those are legal mandates. That answer survives a follow-up question. "We're careful" does not. The judgment is in being accurate about what binds you and what merely guides you.

## In practice

Know the floor by name, know which rules bind you versus guide you, and never call voluntary guidance a mandate.

## Sources

- [EU AI Act, Article 4 (AI literacy), as amended by the Digital Omnibus, Regulation (EU) 2026/1744](https://artificialintelligenceact.eu/article/4/)
- [OMB M-25-21, Accelerating Federal Use of AI](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf)
- [OMB M-25-22, Driving Efficient Acquisition of AI](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf)
- [OMB M-26-04, Unbiased AI Principles](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)
- [DOL AI Literacy Framework, ETA TEN 07-25](https://www.dol.gov/agencies/eta/advisories/ten-07-25)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST Generative AI Profile, AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)$md$,
       updated_at = now()
 where cell_id = '1.10';
