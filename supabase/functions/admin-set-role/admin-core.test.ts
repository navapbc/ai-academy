import { describe, test, expect } from 'vitest';
import {
  parseSetRoleRequest,
  isAllowlistedAdmin,
  isSelfDemotion,
  isRole,
  emailDomainAllowed,
  buildCorsHeaders,
} from './admin-core.ts';

describe('parseSetRoleRequest', () => {
  test('accepts a valid body and normalizes the email', () => {
    const r = parseSetRoleRequest({ targetEmail: '  Casey@NavaPBC.com ', role: 'champion' });
    expect(r).toEqual({ ok: true, value: { targetEmail: 'casey@navapbc.com', role: 'champion' } });
  });
  test('rejects a missing or blank email', () => {
    expect(parseSetRoleRequest({ role: 'admin' }).ok).toBe(false);
    expect(parseSetRoleRequest({ targetEmail: '   ', role: 'admin' }).ok).toBe(false);
  });
  test('rejects an invalid role', () => {
    expect(parseSetRoleRequest({ targetEmail: 'a@navapbc.com', role: 'superadmin' }).ok).toBe(false);
  });
  test('rejects a non-object body', () => {
    expect(parseSetRoleRequest(null).ok).toBe(false);
    expect(parseSetRoleRequest('x').ok).toBe(false);
  });
});

describe('isRole', () => {
  test('only the three enum values are roles', () => {
    expect(isRole('learner')).toBe(true);
    expect(isRole('champion')).toBe(true);
    expect(isRole('admin')).toBe(true);
    expect(isRole('owner')).toBe(false);
    expect(isRole(2)).toBe(false);
  });
});

describe('isAllowlistedAdmin', () => {
  test('matches case-insensitively and ignores blanks/spaces', () => {
    expect(isAllowlistedAdmin('Boss@navapbc.com', ' boss@navapbc.com , other@navapbc.com ')).toBe(true);
    expect(isAllowlistedAdmin('nope@navapbc.com', 'boss@navapbc.com')).toBe(false);
  });
  test('requires an exact match, not a prefix', () => {
    expect(isAllowlistedAdmin('boss@navapbc.co', 'boss@navapbc.com')).toBe(false);
  });
  test('empty/undefined allowlist or email is never admin', () => {
    expect(isAllowlistedAdmin('a@navapbc.com', '')).toBe(false);
    expect(isAllowlistedAdmin('a@navapbc.com', undefined)).toBe(false);
    expect(isAllowlistedAdmin(null, 'a@navapbc.com')).toBe(false);
  });
});

describe('isSelfDemotion', () => {
  test('blocks self-change away from admin; allows self-promotion and other targets', () => {
    expect(isSelfDemotion('u1', 'u1', 'learner')).toBe(true);
    expect(isSelfDemotion('u1', 'u1', 'champion')).toBe(true);
    expect(isSelfDemotion('u1', 'u1', 'admin')).toBe(false); // self-promotion / idempotent — allowed
    expect(isSelfDemotion('u1', 'u2', 'learner')).toBe(false); // different target — allowed
  });
});

describe('emailDomainAllowed', () => {
  test('matches the domain case-insensitively', () => {
    expect(emailDomainAllowed('a@navapbc.com', 'navapbc.com')).toBe(true);
    expect(emailDomainAllowed('A@NavaPBC.com', 'navapbc.com')).toBe(true);
    expect(emailDomainAllowed('a@gmail.com', 'navapbc.com')).toBe(false);
    expect(emailDomainAllowed(undefined, 'navapbc.com')).toBe(false);
  });
});

describe('buildCorsHeaders', () => {
  test('echoes an allow-listed origin only', () => {
    const allowed = ['http://localhost:3000'];
    expect(buildCorsHeaders('http://localhost:3000', allowed)['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(buildCorsHeaders('http://evil.com', allowed)['access-control-allow-origin']).toBeUndefined();
  });
});
