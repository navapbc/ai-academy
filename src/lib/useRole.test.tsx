// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useRole } from './useRole';

// useRole resolves the signed-in user's profiles.role (owner-read RLS). It is
// fail-closed (null role / no elevated access on error or while loading) and is
// never cached, so it can't leak an elevated role across a user switch (D-01).
const { single, useAuthMock } = vi.hoisted(() => ({
  single: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}));

vi.mock('./auth', () => ({ useAuth: useAuthMock }));

function Probe() {
  const { role, loading, error, isAdmin, isChampion, isStaff } = useRole();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <div data-testid="role">{role ?? 'none'}</div>
      <div data-testid="error">{error ?? 'none'}</div>
      <div data-testid="flags">{`${isAdmin}|${isChampion}|${isStaff}`}</div>
    </div>
  );
}

beforeEach(() => {
  single.mockReset();
  useAuthMock.mockReset();
});

describe('useRole', () => {
  test('resolves an admin profile and sets the admin/staff flags', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u-admin' } });
    single.mockResolvedValue({ data: { role: 'admin' }, error: null });

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
    expect(screen.getByTestId('flags')).toHaveTextContent('true|false|true');
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  test('resolves a champion as staff but not admin', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u-champ' } });
    single.mockResolvedValue({ data: { role: 'champion' }, error: null });

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('champion'));
    expect(screen.getByTestId('flags')).toHaveTextContent('false|true|true');
  });

  test('a learner is not staff', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u-learner' } });
    single.mockResolvedValue({ data: { role: 'learner' }, error: null });

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('learner'));
    expect(screen.getByTestId('flags')).toHaveTextContent('false|false|false');
  });

  test('fails closed when the profile read errors', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    single.mockResolvedValue({ data: null, error: { message: 'denied' } });

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('none'));
    expect(screen.getByTestId('error')).toHaveTextContent(/access role/i);
    expect(screen.getByTestId('flags')).toHaveTextContent('false|false|false');
  });

  test('does not query and grants no role when signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('none'));
    expect(single).not.toHaveBeenCalled();
  });

  // The privilege-boundary case the hook's header calls out: on a user switch the
  // previous role must be dropped BEFORE the new one resolves. The `key={user.id}`
  // remount is a caller convention, not a guarantee, so the hook fails closed on
  // its own. This probe (unlike Probe above) renders the role DURING loading.
  test('drops the previous user’s role while the next one resolves', async () => {
    function LoadingProbe() {
      const { role, loading } = useRole();
      return (
        <div>
          <div data-testid="role">{role ?? 'none'}</div>
          <div data-testid="loading">{String(loading)}</div>
        </div>
      );
    }

    useAuthMock.mockReturnValue({ user: { id: 'u-admin' } });
    single.mockResolvedValue({ data: { role: 'admin' }, error: null });

    const { rerender } = render(<LoadingProbe />);
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));

    // Switch users; the new profile read never settles during this assertion.
    useAuthMock.mockReturnValue({ user: { id: 'u-learner' } });
    single.mockReturnValue(new Promise(() => {}));
    rerender(<LoadingProbe />);

    // Pre-fix this still read 'admin' for the whole fetch window.
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('true'));
    expect(screen.getByTestId('role')).toHaveTextContent('none');
  });
});
