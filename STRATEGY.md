---
title: Nava AI Academy — Strategy
last_updated: 2026-06-03
status: active
---

# Nava AI Academy — Strategy

## Target Problem (diagnosis)

Nava's ~750 staff — designers, PMs, ops, and engineers, not just technical
roles — build government digital services where accuracy, privacy,
accessibility (Section 508), and public trust are non-negotiable. They have no
structured path from "AI-curious" to "competent, responsible practitioner."

Existing AI training fails them on two axes: it's either too shallow (prompt
tips, slogans) or engineer-only, and none of it maps to the competencies Nava
actually cares about. The cost is concrete: uneven and sometimes risky AI use in
high-stakes public work, no measurable literacy baseline across the org, no way
to evidence competency, and people reinventing guidance ad hoc.

## Our Approach (guiding policy)

**The bet:** for a high-stakes civic-tech org, *demonstrated, matrix-mapped
competency built through hands-on Claude practice* beats generic seat-time
training. Four choices shape everything downstream:

- **The training *is* the Nava AI Literacy Skills Matrix.** Every module maps 1:1
  to the 28 universal cells (Stages 1–2) and the 4D AI Fluency framework
  (Delegation, Description, Discernment, Diligence). We do not build a parallel
  curriculum alongside the matrix.
- **Completion is gated on demonstrated mastery** — a 100% quiz pass plus
  lab/exercise artifacts — never seat-time or self-report.
- **Real Claude-powered labs, not videos.** People practice the actual craft
  in-browser, with the API key held server-side and usage governed.
- **Content-as-data, civic-tech-specific.** L&D/admins edit lessons and quizzes
  with no deploy, and every example is grounded in Nava's work (508, privacy,
  public trust, government context) because generic examples don't transfer.

This means we accept a real tradeoff: the hard mastery gate will hold
completion rates *down* relative to a seat-time course. That is the strategy
working — rigor over completion theater — not a funnel to "fix" by softening
the gate.

## Who It's For (persona)

**Primary:** a non-engineer Nava employee (e.g., a service designer or PM) who
uses AI occasionally, is unsure what "responsible/good" looks like in government
work, and needs a credible, role-relevant path. Concrete enough to design
against: completes hands-on labs in the browser, needs plain language not ML
jargon, and cares about accessibility and privacy because their output is
public-facing.

**Secondary:** Nava L&D / admins who curate the curriculum and need live
completion and score dashboards.

## Key Metrics

- **Coverage:** % of staff completing Stage 1, then Stage 2.
- **Demonstrated mastery (not self-report):** per-cell quiz pass at the 100%
  gate, plus lab/exercise artifacts submitted.
- **Funnel:** completion drop-off by cell — where learners stall (a
  content-quality signal, read against the mastery-gate tradeoff above).
- **Content freshness:** lessons/quizzes updated by L&D without a deploy;
  dashboard usage.
- **Guardrail:** Claude API cost per learner and in total — must stay within the
  modeled budget for ~750 learners.

## Tracks (coherent action — active workstreams)

1. **Core learning loop.** navapbc.com SSO, curriculum-as-data, lessons +
   100%-gated quizzes, progress/score tracking. (MVP — largely built.)
2. **Hands-on labs & interactive exercises.** Claude prompt labs, graded
   exercises, reflections — the 4D-fluency practice surface. (In progress.)
3. **Content trustworthiness.** Anti-hallucination, cited, civic-tech-specific
   curriculum + SME review, governed by a content-authoring standard. (Ongoing.)
4. **Hardening & reliability.** Full test suite, debt audit, the app's *own* 508
   accessibility, security/RLS, server-side key handling — the tool must embody
   the standards it teaches. (Just queued.)
5. **Admin portal.** CMS for content editing + live completion/score dashboard
   for L&D.

## Not Working On (locked non-goals)

- Local/offline AI models (removed — Claude-only).
- Per-user BYOK keys (one org key, server-side).
- Training our own model.
- Replacing human SME judgment or content review.
- External certification/credentialing (internal evidence only, for now).
- Matrix Stages 3–4 (start with the universal Stages 1–2).

## Milestones

GATE A demo passed → hardening pass complete → labs MVP → admin portal → cloud
deploy to the navapbc.com subdomain (Vercel + Supabase), last — after the app
runs end-to-end locally. No committed dates; sequencing lives in the issue
tracker.

## Marketing (internal positioning only)

The credible, hands-on way Nava builds responsible AI literacy, mapped to our
own matrix. Internal capability — not an external or commercial product.
