// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoleGuard from './RoleGuard';
import { isAllowed } from '../lib/useRole';

// The client-side route guard (P5.1d). Fails closed: only an allowed, resolved
// role renders the protected children; loading shows a spinner and any other
// role gets a notice. The data boundary is RLS (P5.1c) — this is just nav.
describe('RoleGuard', () => {
  test('renders children for an allowed role', () => {
    render(
      <RoleGuard role="champion" loading={false} allow={['admin', 'champion']}>
        <p>secret staff content</p>
      </RoleGuard>,
    );
    expect(screen.getByText('secret staff content')).toBeInTheDocument();
  });

  test('renders the not-authorized notice for a disallowed role', () => {
    render(
      <RoleGuard role="learner" loading={false} allow={['admin', 'champion']}>
        <p>secret staff content</p>
      </RoleGuard>,
    );
    expect(screen.queryByText('secret staff content')).not.toBeInTheDocument();
    expect(screen.getByText(/Staff access only/i)).toBeInTheDocument();
  });

  test('fails closed while the role is still loading (spinner, no content)', () => {
    render(
      <RoleGuard role={null} loading allow={['admin', 'champion']}>
        <p>secret staff content</p>
      </RoleGuard>,
    );
    expect(screen.queryByText('secret staff content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('fails closed for a null (unresolved) role', () => {
    render(
      <RoleGuard role={null} loading={false} allow={['admin', 'champion']}>
        <p>secret staff content</p>
      </RoleGuard>,
    );
    expect(screen.queryByText('secret staff content')).not.toBeInTheDocument();
  });

  test('renders a custom fallback when provided', () => {
    render(
      <RoleGuard role="learner" loading={false} allow={['admin']} fallback={<p>nope</p>}>
        <p>secret staff content</p>
      </RoleGuard>,
    );
    expect(screen.getByText('nope')).toBeInTheDocument();
    expect(screen.queryByText('secret staff content')).not.toBeInTheDocument();
  });
});

// The pure allow-check the guard delegates to.
describe('isAllowed', () => {
  test('a role in the allow list passes', () => {
    expect(isAllowed('admin', ['admin', 'champion'])).toBe(true);
    expect(isAllowed('champion', ['admin', 'champion'])).toBe(true);
  });

  test('a role outside the allow list does not pass', () => {
    expect(isAllowed('learner', ['admin', 'champion'])).toBe(false);
    expect(isAllowed('champion', ['admin'])).toBe(false);
  });

  test('a null role never passes (fail closed)', () => {
    expect(isAllowed(null, ['admin', 'champion'])).toBe(false);
    expect(isAllowed(null, [])).toBe(false);
  });
});
