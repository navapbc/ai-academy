import { useEffect, useRef } from 'react';

// Accessible-dialog plumbing (A11Y-02). Returns a ref to attach to the dialog
// panel. While open it: moves focus into the dialog, traps Tab within it, closes
// on Escape, and restores focus to the previously-focused element on close.
// Pair it with role="dialog" aria-modal="true" + aria-labelledby on the panel.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);

  // Keep the latest onClose without making it an effect dependency. Callers
  // typically pass an inline arrow (`() => setIsOpen(false)`), which is a new
  // reference every render; depending on it would re-run this effect on every
  // keystroke and re-steal focus to the first focusable (the close button).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    // Move focus into the dialog (first focusable, else the panel itself).
    (focusables()[0] ?? node)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && node) {
        const f = focusables();
        if (f.length === 0) {
          e.preventDefault();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever opened the dialog.
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  return ref;
}
