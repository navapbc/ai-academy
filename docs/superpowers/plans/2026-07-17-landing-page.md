# Post-login Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a full-screen intro page after login (what the AI Academy is, how it's structured, how to navigate) with an "Enter AI Academy" button; shown on first entry only, remembered per user.

**Architecture:** A new `LandingPage` component, gated inside `Academy` (`App.tsx`) on a per-user `hasEntered` flag persisted in localStorage. When not entered, `Academy` early-returns `<LandingPage>` (no sidebar/header/FAB chrome); "Enter AI Academy" sets the flag and reveals the app. No data-layer changes.

**Tech Stack:** React 19 + TypeScript, `lucide-react`, Tailwind (Nava tokens), Vitest + Testing Library (jsdom). Task 1 uses the `frontend-design` skill for the visual.

## Global Constraints

- **Node 22 required** for `npm run lint` / `npm test` (jsdom `ERR_REQUIRE_ESM` on Node 20). Run `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22` before any npm/npx; confirm `node -v` is v22.
- **Strict TypeScript:** zero `any` / `@ts-ignore`.
- **localStorage key:** `academy-entered-<userId>`; value `'1'` = entered. All access try/catch-guarded (storage may be disabled).
- **Tested anchors (must not change):** an `<h1>` containing `BRANDING.name`; three card titles exactly `Course weeks`, `Supplemental coursework`, `Resources & additional lessons`; a button whose accessible name is `Enter AI Academy`.
- **Branch:** `feat/landing-page` (already created off `feat/cohort-program-restructure`). Never commit to `main`. A pre-existing unstaged `package-lock.json` change exists — never stage it.

---

### Task 1: `LandingPage` component

**Files:**
- Create: `src/components/LandingPage.tsx`
- Test: `src/components/LandingPage.test.tsx`

**Interfaces:**
- Consumes: `BRANDING` from `src/branding.ts`.
- Produces: default-exported `LandingPage` component, props `{ onEnter: () => void }`.

- [ ] **Step 1: Write the failing test `src/components/LandingPage.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingPage from './LandingPage';
import { BRANDING } from '../branding';

describe('LandingPage', () => {
  test('renders the hero, the three structure cards, and the Enter button', () => {
    render(<LandingPage onEnter={() => {}} />);
    expect(
      screen.getByRole('heading', { level: 1, name: new RegExp(BRANDING.name) }),
    ).toBeTruthy();
    expect(screen.getByText('Course weeks')).toBeTruthy();
    expect(screen.getByText('Supplemental coursework')).toBeTruthy();
    expect(screen.getByText('Resources & additional lessons')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enter AI Academy/i })).toBeTruthy();
  });

  test('clicking "Enter AI Academy" calls onEnter once', () => {
    const onEnter = vi.fn();
    render(<LandingPage onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /Enter AI Academy/i }));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npx vitest run src/components/LandingPage.test.tsx
```
Expected: FAIL — cannot resolve `./LandingPage`.

- [ ] **Step 3: Create `src/components/LandingPage.tsx` (functional baseline)**

This baseline is complete and passes the test. **After it's green, elevate the visual
with the `frontend-design` skill** (Step 4) — but keep the tested anchors unchanged
(the `<h1>` with `BRANDING.name`, the three exact card titles, and the `Enter AI Academy`
button).

```tsx
import { GraduationCap, BookOpen, Library, Compass, ArrowRight } from 'lucide-react';
import { BRANDING } from '../branding';

interface Props {
  onEnter: () => void;
}

const STRUCTURE = [
  {
    icon: GraduationCap,
    title: 'Course weeks',
    desc: "The champion-led cohort path — a guided, sequenced program (Course 1, Weeks 0–8) that builds your AI judgment step by step.",
  },
  {
    icon: BookOpen,
    title: 'Supplemental coursework',
    desc: 'The AI Literacy Skills Matrix — focused lessons you can explore any time, in any order. Nothing is locked.',
  },
  {
    icon: Library,
    title: 'Resources & additional lessons',
    desc: 'Standalone references and extras to support your practice as you go.',
  },
];

export default function LandingPage({ onEnter }: Props) {
  return (
    <div className="min-h-screen bg-nava-grey text-[#1A1A1A] font-sans overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-12">
        <header className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-nava-mint rounded-2xl flex items-center justify-center text-nava-plum">
            <GraduationCap className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Welcome to {BRANDING.name}</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Nava's AI-literacy training — a hands-on program for building the judgment to
            use AI well and responsibly in civic-tech work.
          </p>
        </header>

        <section className="space-y-6">
          <h2 className="text-center text-xs font-bold uppercase tracking-widest text-gray-500">
            How it's organized
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STRUCTURE.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white border-2 border-nava-mint rounded-3xl p-6 space-y-3 shadow-sm"
              >
                <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-plum">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-bold">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Compass className="w-5 h-5 text-nava-plum" aria-hidden="true" />
            <h2 className="font-bold">Finding your way around</h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 leading-relaxed">
            <li>
              Use the <strong>sidebar</strong> on the left to move between lessons and sections.
            </li>
            <li>
              Hit <strong>“Mark as explored”</strong> on any lesson to track your progress.
            </li>
            <li>
              The <strong>study-buddy button</strong> (bottom-right) can answer questions any time.
            </li>
          </ul>
        </section>

        <div className="text-center">
          <button
            onClick={onEnter}
            className="inline-flex items-center gap-2 px-10 py-4 bg-nava-green text-white rounded-2xl font-bold text-lg shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 transition-all active:scale-95"
          >
            Enter AI Academy
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to green, then apply `frontend-design` polish**

```bash
npx vitest run src/components/LandingPage.test.tsx
```
Expected: 2 tests PASS. Then invoke the `frontend-design` skill to make the page
distinctive and on-brand (typography, spacing, a hero treatment, card styling, subtle
motion if desired). Constraints while polishing: keep the `<h1>` containing
`BRANDING.name`, the three exact card titles, and the `Enter AI Academy` button; use Nava
tokens (nava-green/plum/gold/mint); stay theme-consistent with the rest of the app. Re-run
the test after polishing — it must still pass.

- [ ] **Step 5: Lint**

```bash
npm run lint
```
Expected: clean (no unused imports — every imported icon is used; zero `any`).

- [ ] **Step 6: Commit**

```bash
git add src/components/LandingPage.tsx src/components/LandingPage.test.tsx
git commit -m "feat(landing): full-screen intro page with Enter AI Academy CTA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Gate the landing in `Academy`

**Files:**
- Modify: `src/App.tsx` (import; `hasEntered` state; `handleEnter`; early return in `Academy`)

**Interfaces:**
- Consumes: `LandingPage` (default export from Task 1); `userId` (already a prop of `Academy`).
- Produces: nothing new (gate wiring).

- [ ] **Step 1: Import `LandingPage` in `src/App.tsx`**

Add near the other component imports (after `import LocalTutorFAB from './components/LocalTutorFAB';`):
```tsx
import LandingPage from './components/LandingPage';
```

- [ ] **Step 2: Add `hasEntered` state + `handleEnter` in the `Academy` component**

After the existing `useState` block (right after `const [selectedPersona, setSelectedPersona] = useState<AIPersona>('default');`, ~line 124), add:
```tsx
  // First-run landing gate (per user). Shown until the user clicks "Enter AI
  // Academy"; persisted in localStorage so later logins go straight to the app.
  const [hasEntered, setHasEntered] = useState(() => {
    try {
      return localStorage.getItem(`academy-entered-${userId}`) === '1';
    } catch {
      return false;
    }
  });
  const handleEnter = () => {
    setHasEntered(true);
    try {
      localStorage.setItem(`academy-entered-${userId}`, '1');
    } catch {
      /* storage disabled — entry still works for this session */
    }
  };
```

- [ ] **Step 3: Add the early return before the main layout**

Find the start of `Academy`'s main return (around line 186):
```tsx
  return (
    <div className="flex h-screen bg-nava-grey text-[#1A1A1A] font-sans overflow-hidden" id="app-container">
```
Insert immediately before it:
```tsx
  if (!hasEntered) {
    return <LandingPage onEnter={handleEnter} />;
  }

```
(The gate sits after all hooks — hooks run unconditionally; only the returned JSX
branches. The full-screen `LandingPage` replaces the entire app render, so no sidebar,
header, or study-buddy FAB shows on the landing.)

- [ ] **Step 4: Typecheck + full test + lint**

```bash
npx tsc --noEmit
npm test
npm run lint
```
Expected: tsc clean; suite green (incl. the new LandingPage tests); lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(landing): gate Academy behind the first-run landing (per-user persisted)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6 (preview verification — if a dev server is available):**

Sign in as `demo@navapbc.com` (fresh — clear the key if needed via
`localStorage.removeItem('academy-entered-<userId>')` in the console) and confirm:
1. After sign-in the **landing page** shows (hero + three cards + "Enter AI Academy"), with no sidebar/header/FAB.
2. Clicking **"Enter AI Academy"** reveals the full app (sidebar + content).
3. **Reload** → goes straight into the app (no landing) — persisted.
4. In the console, `localStorage.removeItem('academy-entered-<userId>')` then reload → the landing shows again (first-run reset).

---

## Self-Review

**Spec coverage:**
- `LandingPage` component, props `{onEnter}`, full-screen, three-part content + CTA (spec §2) → Task 1. ✅
- Built with `frontend-design` (spec §2) → Task 1, Step 4. ✅
- Gate in `Academy` with per-user lazy-init state + `handleEnter` + early return (spec §1) → Task 2, Steps 2–3. ✅
- localStorage key `academy-entered-<userId>`, try/catch (spec §1) → Task 2, Step 2. ✅
- Component test (hero/cards/Enter → onEnter) (spec Testing) → Task 1, Step 1. ✅
- Gate/persistence via preview (spec Testing) → Task 2, Step 6. ✅
- No `Login`/curriculum/data-layer changes; view-again out of scope → nothing in the plan touches them. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". The baseline component is complete code; `frontend-design` polish is an explicit, bounded elevation step with fixed anchors, not a placeholder. ✅

**Type consistency:** `LandingPage` props `{ onEnter: () => void }`; `handleEnter` is `() => void` (matches). The `academy-entered-${userId}` key is identical in init and handler. `BRANDING.name` used in the h1 and matched by the test's `new RegExp(BRANDING.name)`. The `Enter AI Academy` button label is identical in the component and the test's `name: /Enter AI Academy/i`. ✅
