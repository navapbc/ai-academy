// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import type { Phase } from './types';

// FE-02: an empty curriculum (no modules in any stage) must render the friendly
// error/empty state, NOT crash. groupIntoPhases always returns 3 stages, so the
// old `!phases` guard could not catch this — the fix checks for zero modules.
const { useCurriculum, useAuth } = vi.hoisted(() => ({
  useCurriculum: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock('./lib/useCurriculum', () => ({ useCurriculum }));
vi.mock('./lib/auth', () => ({ useAuth, AuthProvider: ({ children }: { children: unknown }) => children }));

const emptyStages: Phase[] = [
  { id: 'stage-1a', title: '', description: '', week: '', modules: [] },
  { id: 'stage-1b', title: '', description: '', week: '', modules: [] },
  { id: 'stage-2', title: '', description: '', week: '', modules: [] },
];

function signedIn() {
  useAuth.mockReturnValue({ loading: false, session: { user: { id: 'u1' } }, signOut: vi.fn() });
}

describe('App — curriculum gating', () => {
  test('shows the empty-state message (no crash) when the curriculum has no modules', () => {
    signedIn();
    useCurriculum.mockReturnValue({ phases: emptyStages, loading: false, error: null });
    render(<App />);
    expect(screen.getByText(/No curriculum content is available yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  test('shows the fetch-error message when useCurriculum errors', () => {
    signedIn();
    useCurriculum.mockReturnValue({ phases: null, loading: false, error: 'Could not load the curriculum.' });
    render(<App />);
    expect(screen.getByText('Could not load the curriculum.')).toBeInTheDocument();
  });

  test('shows a spinner while the curriculum is loading', () => {
    signedIn();
    useCurriculum.mockReturnValue({ phases: null, loading: true, error: null });
    const { container } = render(<App />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
