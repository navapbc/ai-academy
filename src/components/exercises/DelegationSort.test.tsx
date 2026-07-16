// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import DelegationSort from './DelegationSort';
import type { DelegationSortConfig } from '../../types';

const { recordLabSubmission, useAuth } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  useAuth: vi.fn((): { user: { id: string } | null } => ({ user: { id: 'u1' } })),
}));
vi.mock('../../lib/auth', () => ({ useAuth }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  useAuth.mockReturnValue({ user: { id: 'u1' } });
});

const config: DelegationSortConfig = {
  kind: 'delegation-sort',
  introMd: 'Sort each task.',
  categories: [
    { id: 'full-ai', label: 'Full-AI', desc: 'end to end' },
    { id: 'assisted', label: 'AI-assisted', desc: 'person checks' },
    { id: 'human-only', label: 'Human-only', desc: 'person owns it' },
  ],
  items: [
    { id: 'a', scenario: 'Reformat a table.', suggested: 'full-ai', rationale: 'Mechanical.' },
    { id: 'b', scenario: "Write a teammate's PIP.", suggested: 'human-only', rationale: 'Accountability.' },
  ],
  takeaway: { title: 'Who owns the call?', body: 'Ask first.' },
};

// Places every item into its first category (choice is irrelevant — nothing is scored).
function placeAll() {
  for (const item of config.items) {
    const group = screen.getByRole('radiogroup', { name: item.scenario });
    fireEvent.click(within(group).getAllByRole('radio')[0]);
  }
}

describe('DelegationSort', () => {
  test('renders each scenario and all category labels as radios', () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    expect(screen.getByText('Reformat a table.')).toBeTruthy();
    expect(screen.getByText("Write a teammate's PIP.")).toBeTruthy();
    // 3 categories × 2 items → each label appears as a radio twice
    expect(screen.getAllByRole('radio', { name: 'Full-AI' }).length).toBe(2);
    expect(screen.getAllByRole('radio', { name: 'Human-only' }).length).toBe(2);
  });

  test('submit is disabled until every scenario is placed', () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    const submit = screen.getByRole('button', { name: /submit/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    placeAll();
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  test('on submit: reveals the suggested call + rationale + takeaway and records once', async () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: 'c1-w2-delegation-sort',
      status: 'submitted',
    }));
    // Two reveals; the first item (full-ai) shows its label + rationale.
    const reveals = screen.getAllByText(/A defensible call:/i);
    expect(reveals).toHaveLength(2);
    const firstReveal = reveals[0].closest('p');
    expect(firstReveal?.textContent).toContain('Full-AI');
    expect(firstReveal?.textContent).toContain('Mechanical.');
    expect(screen.getByText('Who owns the call?')).toBeTruthy();
  });

  test('try again resets placements and hides the reveal', async () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getByText('Who owns the call?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.queryByText('Who owns the call?')).toBeNull();
    expect((screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('signed-out: shows the sign-in prompt and does not record', async () => {
    useAuth.mockReturnValue({ user: null });
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(recordLabSubmission).not.toHaveBeenCalled();
  });
});
