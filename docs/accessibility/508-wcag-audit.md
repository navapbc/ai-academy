# Nava AI Academy — Section 508 / WCAG 2.1 AA Accessibility Audit

**Status:** Automated pass complete (P6.4). **Manual assistive-technology verification is outstanding — this app is NOT yet 508-certified.**

Automated tooling (static + runtime) catches roughly 30–40% of WCAG issues. The remainder — keyboard-only operation, screen-reader comprehension, visible-focus and contrast judgment — requires human testing with real assistive technology. This document records what the automated pass verified/fixed and enumerates exactly what a human must still check before a 508 sign-off.

## What the automated pass covers

- **Static (all JSX):** `eslint-plugin-jsx-a11y` recommended ruleset at **error** severity (31 active rules) — `npm run lint` fails on any violation. Zero violations in app source. (One `jsx-a11y/aria-role` false positive suppressed in two test files where `role` is a domain prop, not an ARIA attribute.)
- **Runtime (representative surfaces):** `vitest-axe` (axe-core 4.x) assertions in `src/test/a11y.axe.test.tsx`, zero violations, over: Login, PiiNotice, UsageMonitoring, CohortDashboard (staff), ModuleRenderer (content lesson + quiz), Lab (2.1), Critique/SourcedFreeTextLab, HarmRubric.
- **Prior a11y work (W2-9):** focus management on view change, `role="status"`/`aria-live` grading regions, `sr-only` correctness on HarmRubric, decorative icons `aria-hidden`.

Legend: **A** = automated-verified (jsx-a11y and/or axe) · **F** = fixed in this work · **M** = needs manual verification.

## WCAG 2.1 AA criteria

### Perceivable
| SC | Criterion | Status | Note |
|----|-----------|--------|------|
| 1.1.1 | Non-text content (alt text) | A | `jsx-a11y/alt-text` at error; axe checks images. |
| 1.2.x | Time-based media (captions, audio desc) | M | No app-authored media today; video-URL lessons (CMS) embed external video — **manual: verify any embedded video has captions.** |
| 1.3.1 | Info & relationships (labels, roles, structure) | A/F | jsx-a11y (label/role) + axe (`label`, `select-name` — fixed Lab model select). |
| 1.3.2 | Meaningful sequence | M | Manual: verify DOM/reading order matches visual order across flows. |
| 1.3.5 | Identify input purpose (autocomplete) | M | Manual: review form fields (login) for appropriate `autocomplete`. |
| 1.4.1 | Use of color | M | Manual: confirm no info conveyed by color alone (e.g. quiz correctness, distribution bands, over-threshold flag). |
| 1.4.3 | Contrast (minimum) | M | axe flags some contrast in jsdom but not layout-accurate — **manual: verify all text/UI contrast ≥ 4.5:1 (3:1 large) in the real rendered app**, incl. amber PiiNotice, band colors, badges. |
| 1.4.4 | Resize text (200%) | M | Manual: zoom to 200%, verify no loss of content/function. |
| 1.4.10 | Reflow (320px) | M | Manual: verify no 2-D scrolling / loss at 320px width. |
| 1.4.11 | Non-text contrast | M | Manual: verify control/focus-indicator/graphic contrast ≥ 3:1. |

### Operable
| SC | Criterion | Status | Note |
|----|-----------|--------|------|
| 2.1.1 | Keyboard | A/M | jsx-a11y (`click-events-have-key-events`, `interactive-supports-focus`) enforces the static shape; **manual: full keyboard-only walkthrough of every flow** (nav, labs, quiz, sorter drag-drop 1.3, staff dashboards, tutor FAB). |
| 2.1.2 | No keyboard trap | M | Manual: verify focus can leave modals (CreateLessonModal), the tutor FAB, and all overlays. |
| 2.4.1 | Bypass blocks (skip link) | M | **Manual: verify a skip-to-content link exists** — likely a gap to add. |
| 2.4.3 | Focus order | A/M | W2-9 manages focus on view change; manual: verify logical focus order in modals/dynamic content. |
| 2.4.7 | Focus visible | M | Manual: verify a visible focus indicator on every interactive element (Tailwind focus styles). |
| 2.5.3 | Label in name | A | jsx-a11y; axe checks accessible name contains visible label. |

### Understandable
| SC | Criterion | Status | Note |
|----|-----------|--------|------|
| 3.1.1 | Language of page | M | **Manual: verify `<html lang="en">`** is set (check `index.html`). |
| 3.2.x | Predictable (on focus/input, consistent nav) | A/M | No jsx-a11y `onchange`-navigation violations; manual: confirm no unexpected context changes. |
| 3.3.1 | Error identification | A/M | Grading/validation errors use `role="status"` (W2-9); manual: verify form errors (login) are programmatically associated. |
| 3.3.2 | Labels or instructions | A/F | jsx-a11y label rules + axe (`label`); Lab select label fixed. |

### Robust
| SC | Criterion | Status | Note |
|----|-----------|--------|------|
| 4.1.2 | Name, role, value | A/F | jsx-a11y + axe across covered surfaces; Lab select fixed. |
| 4.1.3 | Status messages | A | W2-9 `role="status"`/`aria-live` on grading/async regions. |

## Manual follow-up checklist (human — required for 508 sign-off)

Perform on the deployed app (or `npm run dev`) with real assistive technology:

1. **Keyboard-only walkthrough** of every key flow: sign-in → curriculum nav → a content lesson → a quiz → the 1.3 scenario-sorter (drag-drop — verify a keyboard alternative) → a Claude lab (2.1) → GLAT (2.14) → staff dashboard + CMS. No trap; all actions reachable; visible focus throughout.
2. **Screen-reader testing** with **VoiceOver (Safari/macOS)** and **NVDA (Firefox/Windows)** of the same flows: headings/landmarks navigable, form fields named, grading/streaming status announced (`aria-live`), quiz correctness conveyed non-visually, PiiNotice read at each input.
3. **Visual checks:** `html lang`, a skip-to-content link, visible focus indicators, text/UI contrast ≥ 4.5:1 (3:1 large / non-text), 200% zoom, 320px reflow, and "no info by color alone" (quiz correctness, score bands, over-threshold flag).
4. **Record results** and remediate; then a designated owner signs off.

**508 sign-off:** owner ______________  date __________  (blocked until 1–3 pass)

## Maintaining the floor
- jsx-a11y stays at **error** — new components must be a11y-clean to pass CI.
- Add new user-facing surfaces to `src/test/a11y.axe.test.tsx` as they ship.
- Re-run this audit's manual checklist before each release that changes UI.
