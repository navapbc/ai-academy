// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Login from './Login';
import { ALLOWED_EMAIL_DOMAIN } from '../lib/auth';

// Login surfaces the @navapbc.com domain restriction and prefers the auth
// guard's rejection message over a local form error. We mock useAuth so no
// Supabase client is constructed.
const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../lib/auth', async (orig) => {
  const actual = await orig<typeof import('../lib/auth')>();
  return { ...actual, useAuth: useAuthMock };
});

function setAuth(over: Record<string, unknown> = {}) {
  useAuthMock.mockReturnValue({
    signInWithGoogle: vi.fn(),
    signIn: vi.fn(),
    authError: null,
    ...over,
  });
}

describe('Login', () => {
  test('shows the @navapbc.com domain restriction message', () => {
    setAuth();
    render(<Login />);
    expect(
      screen.getByText(new RegExp(`Sign in with your @${ALLOWED_EMAIL_DOMAIN} Google account`, 'i')),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();
  });

  test('renders the auth guard rejection message when a non-nava account was rejected', () => {
    setAuth({ authError: 'Please sign in with your @navapbc.com Google account.' });
    render(<Login />);
    expect(screen.getByText(/Please sign in with your @navapbc\.com Google account\./i)).toBeInTheDocument();
  });
});
