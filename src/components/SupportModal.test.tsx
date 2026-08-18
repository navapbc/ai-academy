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

  test('the GitHub action is a real disabled button until the description is valid (A11Y-11)', async () => {
    render(<SupportModal isOpen onClose={() => {}} />);
    // Invalid (empty) → a disabled <button>, not a focusable dead link.
    const githubButton = screen.getByRole('button', { name: /GitHub Issue/i });
    expect(githubButton).toBeDisabled();
    // The description field is properly labelled.
    expect(screen.getByLabelText('Description')).toBeInTheDocument();

    // Once valid, it becomes an enabled link.
    await userEvent.type(screen.getByLabelText('Description'), 'This is a real bug report.');
    expect(screen.getByRole('link', { name: /GitHub Issue/i })).toBeInTheDocument();
  });

  test('closes and clears the description after submitting to GitHub', async () => {
    const onClose = vi.fn();
    render(<SupportModal isOpen onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Description'), 'This is a real bug report.');
    await userEvent.click(screen.getByRole('link', { name: /GitHub Issue/i }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });
});
