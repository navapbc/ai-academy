# Design — Post-login landing / intro page

- **Date:** 2026-07-17
- **Branch:** `feat/landing-page` (off `feat/cohort-program-restructure`)
- **Scope:** A full-screen intro page shown after login that explains what the AI Academy
  is, how it's structured, and how to get around, with an "Enter AI Academy" button.
  Shown on **first entry only**, remembered per user. No data-layer changes.

## Problem

Today `App.tsx` goes straight from `Login` → `AcademyApp` (curriculum load) → `Academy`
(the main sidebar/header/content UI). A first-time user lands in the middle of the app
with no orientation. We want a welcoming intro that explains the app and how it works,
then lets the user explicitly enter — shown the first time and skipped on later logins.

## Approach (decided in brainstorming)

A new full-screen `LandingPage` component gated inside `Academy` on a per-user
`hasEntered` flag persisted in localStorage. Full hide of the app chrome while the
landing shows; "Enter AI Academy" marks the user entered and reveals the app. First-run
only; a "view intro again" affordance is out of scope for v1.

## Architecture

### 1. Entry gate — `src/App.tsx` (`Academy` component)

`Academy` already receives `userId` and owns the top-level app state, so the gate lives
there (it renders before any of the sidebar/header/content chrome).

- **State (lazy init, per-user):**
  ```ts
  const [hasEntered, setHasEntered] = useState(() => {
    try {
      return localStorage.getItem(`academy-entered-${userId}`) === '1';
    } catch {
      return false;
    }
  });
  ```
- **Enter handler:**
  ```ts
  const handleEnter = () => {
    setHasEntered(true);
    try {
      localStorage.setItem(`academy-entered-${userId}`, '1');
    } catch {
      /* storage disabled — entry still works for this session */
    }
  };
  ```
- **Render gate:** at the top of `Academy`'s `return`, before the main layout:
  ```tsx
  if (!hasEntered) {
    return <LandingPage onEnter={handleEnter} />;
  }
  ```
  This must sit after the hooks (state/effects) — React hooks run unconditionally; only
  the returned JSX branches. Place the early return immediately before the existing
  `return ( <div className="flex h-screen …"> … )`.

The **per-user key** (`academy-entered-<userId>`) means a different user signing in on the
same machine sees the intro fresh, and it composes with the existing `key={userId}`
remount of the academy subtree. All storage access is try/catch-guarded (private mode /
disabled storage must never crash the app) — matching the codebase's defensive pattern.

### 2. Landing component — `src/components/LandingPage.tsx`

Props: `{ onEnter: () => void }`. A full-screen (`min-h-screen`), chrome-free, on-brand
intro. **Build with the `frontend-design` skill** for a distinctive, polished look
(the implementer should invoke it). Uses `BRANDING` (`name`, and optionally `mission`)
and Nava tokens (nava-green/plum/gold/mint), theme-consistent with the rest of the app.

Content — three parts, then the CTA:

1. **What it is** — a hero with `BRANDING.name` and a one-line description: Nava's
   AI-literacy training program (may draw on `BRANDING.mission`).
2. **How it's structured** — three short cards:
   - **Course weeks** — the champion-led cohort path (Course 1, Weeks 0–8): a guided,
     sequenced program.
   - **Supplemental coursework** — the AI Literacy Skills Matrix cells; ungated,
     explore any time.
   - **Resources & additional lessons** — standalone references and extras.
3. **How to get around** — the left sidebar moves you between lessons; "Mark as explored"
   records progress; the study-buddy button (bottom-right) answers questions any time.

Primary CTA: a prominent **"Enter AI Academy"** button (green primary action) calling
`onEnter`. Accessibility: the page has a single `<h1>` (the hero title), the CTA is a real
`<button>`, and the content is keyboard-reachable. No auto-focus trap.

### Why gate in `Academy` (not `AcademyApp` or a `view`)

- Gating in `Academy` runs after the curriculum is loaded, so "Enter" reveals a ready app
  with no further spinner, and `userId` is in scope for the per-user key.
- A `view`-based landing (like learning/playground) was rejected: it would render inside
  the sidebar/header chrome, not as a clean pre-app welcome.

## Testing

- **Component test** — `src/components/LandingPage.test.tsx` (jsdom): renders the hero
  (`BRANDING.name`), the three structure cards (assert their headings/text), and the
  "Enter AI Academy" button; clicking the button calls the `onEnter` spy once.
- **Gate/persistence** — verified in the preview (the logic is in `Academy`, which has no
  isolated unit harness): first load after sign-in shows the landing; "Enter AI Academy"
  reveals the app; reload goes straight to the app (persisted); clearing the
  `academy-entered-<userId>` key (or a different user id) shows the landing again.
- `npm run lint` / `npm test` (Node 22).

## Out of scope

- A "view intro again" / re-entry affordance — v1 is first-run-only. Easy follow-up: a
  small control (e.g. in the support modal or header) that clears the
  `academy-entered-<userId>` key.
- Any change to `Login`, the curriculum load, the sidebar/header, or the data layer.
- Persisting entry server-side (localStorage is sufficient and matches the app's other
  client-only UI prefs).
