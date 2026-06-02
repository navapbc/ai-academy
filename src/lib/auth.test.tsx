// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';

// The client-side @navapbc.com guard in AuthProvider. Google's `hd` is only a
// hint, so a resolved session whose user is outside the allowed domain must be
// signed out and rejected with a clear message; an allowed-domain session is
// kept. (The DB trigger is the real backstop — tested at the integration layer.)
const { getSession, signOut, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(async () => {}),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: { getSession, signOut, onAuthStateChange } }),
}));

function Probe() {
  const { user, authError, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <div data-testid="user">{user?.email ?? 'none'}</div>
      <div data-testid="error">{authError ?? 'none'}</div>
    </div>
  );
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

beforeEach(() => {
  getSession.mockReset();
  signOut.mockClear();
});

describe('AuthProvider domain guard', () => {
  test('keeps an @navapbc.com session and sets no error', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { email: 'dev@navapbc.com' } } } });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('dev@navapbc.com'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(signOut).not.toHaveBeenCalled();
  });

  test('rejects a non-navapbc.com session: signs out, no user, shows the rejection message', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { email: 'outsider@gmail.com' } } } });
    renderAuth();
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('error')).toHaveTextContent(/@navapbc\.com/i);
  });

  test('a case-different domain is still allowed (case-insensitive check)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { email: 'Dev@NavaPBC.com' } } } });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Dev@NavaPBC.com'));
    expect(signOut).not.toHaveBeenCalled();
  });
});
