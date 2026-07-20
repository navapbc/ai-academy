# Collapsible Sidebar (desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a desktop user collapse the side navigation and reopen it, with the choice persisted across reloads.

**Architecture:** Extend the existing show/hide (the sidebar already animates width 0↔320 and unmounts when closed; the Header already renders a reopen button when closed). Make the sidebar's close control visible on desktop (it's currently `lg:hidden`), and add desktop-scoped `localStorage` persistence in `App.tsx`. No icon-rail, no new component, no layout refactor.

**Tech Stack:** React 19 + TypeScript, `lucide-react`, Vitest + Testing Library (jsdom). No data-layer changes.

## Global Constraints

- **Node 22 required** for `npm run lint` / `npm test` (jsdom `ERR_REQUIRE_ESM` on Node 20). Run `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22` before any npm/npx; confirm `node -v` is v22.
- **Strict TypeScript:** zero `any` / `@ts-ignore`.
- **localStorage key:** `sidebar-collapsed`; value `'1'` = collapsed; absent = open (open is the default). All access wrapped in try/catch (storage may be disabled).
- **Desktop-scoped persistence:** only persist when `window.innerWidth >= 1024`. The mobile auto-close in `handleModuleSelect` must stay transient (never writes localStorage).
- **Branch:** `feat/collapsible-sidebar` (already created off `feat/cohort-program-restructure`). Never commit to `main`. A pre-existing unstaged `package-lock.json` change exists — never stage it.

---

### Task 1: Desktop collapse control in the sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (import swap `X`→`PanelLeftClose`; the close-button block)
- Test: `src/components/layout/Sidebar.test.tsx`

**Interfaces:**
- Consumes: the existing `onClose: () => void` prop (unchanged).
- Produces: an always-visible collapse button with `aria-label="Collapse sidebar"` that calls `onClose`.

- [ ] **Step 1: Update the `Sidebar.test.tsx` render helper + add the failing test**

In `src/components/layout/Sidebar.test.tsx`, change the `renderSidebar` helper to accept
and return an `onClose` spy. Replace its signature/body's `onClose` line:

Find:
```tsx
function renderSidebar({
  sections = SECTIONS,
  progress = { completedModuleIds: [], currentModuleId: 'c1-w1-a' } as UserProgress,
  isStaff = false,
  onViewChange = vi.fn(),
  onModuleSelect = vi.fn(),
} = {}) {
  const view = render(
    <Sidebar
      isOpen
      onClose={() => {}}
```
Replace with:
```tsx
function renderSidebar({
  sections = SECTIONS,
  progress = { completedModuleIds: [], currentModuleId: 'c1-w1-a' } as UserProgress,
  isStaff = false,
  onViewChange = vi.fn(),
  onModuleSelect = vi.fn(),
  onClose = vi.fn(),
} = {}) {
  const view = render(
    <Sidebar
      isOpen
      onClose={onClose}
```
And update the helper's return to include it — find `return { view, onViewChange, onModuleSelect };` and replace with:
```tsx
  return { view, onViewChange, onModuleSelect, onClose };
```

Then add this test (e.g., right after the first `describe('Sidebar course tree (U2)', …)` block's opening test, or as a new `describe`):
```tsx
describe('Sidebar collapse control', () => {
  test('renders a "Collapse sidebar" button that calls onClose', async () => {
    const { onClose } = renderSidebar();
    const user = userEvent.setup();
    const btn = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npx vitest run src/components/layout/Sidebar.test.tsx -t "Collapse sidebar"
```
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Collapse sidebar"` (the current button is labelled "Close menu").

- [ ] **Step 3: Update the close button in `src/components/layout/Sidebar.tsx`**

(a) Swap the icon import on line 3 — replace `X` with `PanelLeftClose`:
```tsx
import { BarChart3, PanelLeftClose, CheckCircle2, ChevronDown, LifeBuoy, Terminal, ShieldCheck, GraduationCap } from 'lucide-react';
```

(b) Replace the close-button block (currently around lines 186–192):
```tsx
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
```
with:
```tsx
            <button
              onClick={onClose}
              aria-label="Collapse sidebar"
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            >
              <PanelLeftClose className="w-5 h-5" aria-hidden="true" />
            </button>
```
(Removes `lg:hidden` so it shows on desktop; `X` is now unused — the import swap in (a) removes it.)

- [ ] **Step 4: Run the test to verify it passes + lint**

```bash
npx vitest run src/components/layout/Sidebar.test.tsx
npm run lint
```
Expected: all Sidebar tests pass (including the new one); lint clean (no unused `X` import — it was replaced).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx
git commit -m "feat(sidebar): always-visible collapse control (PanelLeftClose)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Desktop-scoped persistence + reopen label

**Files:**
- Modify: `src/App.tsx` (init state from localStorage; add collapse/open handlers; wire props)
- Modify: `src/components/layout/Header.tsx` (reopen button `aria-label`)

**Interfaces:**
- Consumes: `Sidebar`'s `onClose` and `Header`'s `onOpenSidebar` props (both `() => void`).
- Produces: persisted desktop collapse state via the `sidebar-collapsed` localStorage key.

- [ ] **Step 1: Initialize `isSidebarOpen` from localStorage in `src/App.tsx`**

Replace line 122:
```tsx
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
```
with:
```tsx
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') !== '1';
    } catch {
      return true;
    }
  });
```

- [ ] **Step 2: Add the collapse/open handlers**

Immediately after the `handleModuleSelect` function (it ends around line 161, after the
mobile auto-close block), add:
```tsx
  // Desktop-scoped sidebar persistence: an explicit collapse/expand at >=1024px
  // records the preference; the mobile drawer auto-close in handleModuleSelect stays
  // transient and never writes it.
  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    if (window.innerWidth >= 1024) {
      try {
        localStorage.setItem('sidebar-collapsed', '1');
      } catch {
        /* storage disabled — collapse still works for this session */
      }
    }
  };
  const handleOpenSidebar = () => {
    setIsSidebarOpen(true);
    if (window.innerWidth >= 1024) {
      try {
        localStorage.removeItem('sidebar-collapsed');
      } catch {
        /* storage disabled */
      }
    }
  };
```
Leave `handleModuleSelect`'s mobile auto-close (`if (window.innerWidth < 1024) setIsSidebarOpen(false);`) exactly as-is — it must not persist.

- [ ] **Step 3: Wire the handlers into the props**

Replace line 190:
```tsx
        onClose={() => setIsSidebarOpen(false)}
```
with:
```tsx
        onClose={handleCloseSidebar}
```
Replace line 204:
```tsx
          onOpenSidebar={() => setIsSidebarOpen(true)}
```
with:
```tsx
          onOpenSidebar={handleOpenSidebar}
```

- [ ] **Step 4: Relabel the reopen button in `src/components/layout/Header.tsx`**

In the `{!isSidebarOpen && (…)}` button (around line 41), change the `aria-label`:
```tsx
          <button onClick={onOpenSidebar} aria-label="Show sidebar" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
```
(Only `aria-label="Open menu"` → `aria-label="Show sidebar"`; icon and behavior unchanged.)

- [ ] **Step 5: Typecheck + full test + lint**

```bash
npx tsc --noEmit
npm test
npm run lint
```
Expected: tsc clean; suite green; lint clean. (No new unit test here — the persistence logic is in App.tsx handlers with no existing harness; it's verified in the preview in Step 6.)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(sidebar): desktop-scoped collapse persistence + Show sidebar label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7 (preview verification — do this if a dev server is available):**

Start/refresh the dev server and, at desktop width:
1. Click the collapse control (`PanelLeftClose`) in the sidebar header → the sidebar hides and main content goes full-width; a "Show sidebar" button appears in the top Header.
2. Click "Show sidebar" → the sidebar returns.
3. Collapse, then reload the page → the sidebar stays collapsed (persisted).
4. Expand, reload → stays open.
5. `preview_resize` to mobile (375px): the drawer still opens/closes and auto-closes on a module click; closing on mobile does NOT persist — after resizing back to desktop and reloading, the desktop state reflects the last desktop choice, not the mobile close.

---

## Self-Review

**Spec coverage:**
- Desktop collapse control, `PanelLeftClose`, always-visible, "Collapse sidebar" (spec §1) → Task 1. ✅
- Reopen control relabel "Show sidebar" (spec §2) → Task 2, Step 4. ✅
- localStorage init + collapse/open handlers with `>=1024` guard; mobile auto-close stays transient (spec §3) → Task 2, Steps 1–3. ✅
- try/catch around all storage access (spec §3) → Task 2, Steps 1–2. ✅
- Component test for the collapse button (spec Testing) → Task 1. ✅
- Persistence verified via preview (spec Testing) → Task 2, Step 7. ✅
- Out of scope (icon-rail, layout, mobile mechanics) → nothing in the plan touches them. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". All code blocks are complete and show exact before/after. ✅

**Type consistency:** `onClose` / `onOpenSidebar` remain `() => void`; `handleCloseSidebar` / `handleOpenSidebar` are `() => void` and match those prop types. The `sidebar-collapsed` key and the `window.innerWidth >= 1024` guard are identical across init, both handlers, and the spec. The `PanelLeftClose` import replaces `X` (removed), so no unused-import lint error. ✅
