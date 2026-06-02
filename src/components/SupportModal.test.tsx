// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SupportModal from './SupportModal';

// A11Y-02: the modal exposes dialog semantics, moves focus inside on open, and
// closes on Escape.
describe('SupportModal accessibility', () => {
  test('exposes a labelled dialog and a labelled close control', () => {
    render(<SupportModal isOpen onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Report an Issue' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  test('moves focus into the dialog when opened', () => {
    render(<SupportModal isOpen onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<SupportModal isOpen onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
