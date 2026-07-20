# Design — Collapsible sidebar (desktop)

- **Date:** 2026-07-17
- **Branch:** `feat/collapsible-sidebar` (off `feat/cohort-program-restructure`)
- **Scope:** Let a desktop user collapse the side navigation and reopen it, with the
  choice persisted across reloads. Extends the existing show/hide; no icon-rail, no new
  layout system, no data-layer changes.

## Problem

The sidebar is already a full show/hide: `App.tsx` holds `isSidebarOpen` (default
`true`), the sidebar animates `width` 0↔320 and unmounts when closed
(`Sidebar.tsx`), and `Header.tsx` renders a `Menu` "open" button whenever
`!isSidebarOpen`. But the **collapse (close) control is mobile-only** — the sidebar's
`X` button is `lg:hidden`. So on desktop there is no way to collapse the sidebar: it is
always open, and the Header's open button only appears once it is already closed.

Additionally, the open/closed state is not persisted, and the only thing that closes the
sidebar today (the mobile auto-close in `handleModuleSelect`) is a transient mobile
drawer behavior that must not become a persisted desktop preference.

## Approach (decided in brainstorming): extend the existing show/hide

Full hide + reopen (not an icon-rail), with desktop-scoped persistence. Three small,
isolated edits — no new component, no layout refactor.

## Architecture

### 1. Desktop collapse control — `src/components/layout/Sidebar.tsx`

The close button in the sidebar header (currently `<X>` with `className="lg:hidden …"`,
`onClick={onClose}`) becomes always-visible and reads as a collapse affordance:

- Remove `lg:hidden` so it shows at all breakpoints.
- Swap the icon from `X` to `PanelLeftClose` (lucide-react).
- `aria-label="Collapse sidebar"`.
- Keep `onClick={onClose}` unchanged.

On mobile this still closes the drawer (same `onClose`); on desktop it now collapses the
sidebar. `PanelLeftClose` must be added to the existing `lucide-react` import; the `X`
import is removed if no longer used elsewhere in the file (verify before deleting).

### 2. Reopen control — `src/components/layout/Header.tsx`

Already functional and not `lg:hidden`: the `Menu` button renders when `!isSidebarOpen`
and calls `onOpenSidebar`. Only polish: change its `aria-label` from `"Open menu"` to
`"Show sidebar"` for clarity. No structural/behavioral change. (Icon stays `Menu`.)

### 3. Desktop-scoped persistence — `src/App.tsx`

State stays a single `isSidebarOpen` boolean. A localStorage key records the explicit
desktop preference; mobile transitions never write it.

- **Key:** `sidebar-collapsed` — value `'1'` means collapsed. Absent/anything-else means
  open (open is the default).
- **Init (lazy):**
  ```ts
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') !== '1'; } catch { return true; }
  });
  ```
- **Collapse handler** (passed to `Sidebar` as `onClose`):
  ```ts
  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    if (window.innerWidth >= 1024) {
      try { localStorage.setItem('sidebar-collapsed', '1'); } catch { /* ignore */ }
    }
  };
  ```
- **Open handler** (passed to `Header` as `onOpenSidebar`):
  ```ts
  const handleOpenSidebar = () => {
    setIsSidebarOpen(true);
    if (window.innerWidth >= 1024) {
      try { localStorage.removeItem('sidebar-collapsed'); } catch { /* ignore */ }
    }
  };
  ```
- **Mobile auto-close unchanged:** `handleModuleSelect` keeps its transient
  `if (window.innerWidth < 1024) setIsSidebarOpen(false);` — it does **not** write
  localStorage, so a mobile drawer close never becomes a desktop preference.

The `window.innerWidth >= 1024` guard is the crux: only an explicit desktop toggle
persists. All `localStorage` access is wrapped in try/catch (private-mode / disabled
storage must not crash the app), matching the codebase's defensive-storage pattern.

### Rationale for the width guard over simpler options

A naive `useEffect` that persists `isSidebarOpen` on every change would also persist the
mobile auto-close (writing `'1'`), so a user who last browsed on mobile would find the
desktop sidebar collapsed. Guarding the two explicit handlers by breakpoint keeps the
persisted value strictly a desktop intent.

## Testing

- **Component test** — `src/components/layout/Sidebar.test.tsx` (jsdom): when `isOpen`,
  the collapse control renders with `aria-label="Collapse sidebar"` and clicking it calls
  `onClose`. (Follows the existing component-test conventions; render with minimal props /
  the supabase mock as needed.)
- **Persistence** — verified in the preview rather than unit-tested at the App level (the
  logic lives in App.tsx handlers, which have no existing unit harness): collapse on
  desktop → reload → still collapsed; open → reload → still open. If a lightweight seam is
  wanted, the read/write can be extracted to a tiny pure helper (`src/lib/sidebarPref.ts`)
  with its own unit test; treated as optional in the plan.
- **Manual E2E (preview):** desktop — collapse hides the sidebar and main goes
  full-width; the Header "Show sidebar" button restores it; the state survives reload.
  Mobile (`preview_resize`) — the drawer still opens/closes and auto-closes on nav, and a
  mobile close does NOT persist to desktop.
- `npm run lint` / `npm test` (Node 22).

## Out of scope

- Icon-rail / mini-collapsed sidebar (labels hidden, icons shown) — rejected in favor of
  full hide/show.
- Any change to the sidebar's contents, the course tree, mobile drawer mechanics, or the
  overall app layout.
- Animating anything beyond the existing width/opacity transition already in
  `Sidebar.tsx`.
