import { describe, test, expect } from 'vitest';
import {
  parseCohortAction,
  isUuid,
  isAllowlistedAdmin,
  emailDomainAllowed,
  buildCorsHeaders,
  deleteCohortBlockedReason,
  fixedWindowAllow,
  roleAfterAssign,
  roleAfterUnassign,
  type RateLimitState,
} from './admin-cohorts-core.ts';

const UID = '00000000-0000-0000-0000-000000000001';
const CID = '00000000-0000-0000-0000-0000000000c0';

describe('isUuid', () => {
  test('accepts a uuid, rejects junk', () => {
    expect(isUuid(UID)).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe('parseCohortAction', () => {
  test('create_cohort trims and bounds the name', () => {
    expect(parseCohortAction({ action: 'create_cohort', name: '  Fall 2026  ' })).toEqual({
      ok: true,
      value: { action: 'create_cohort', name: 'Fall 2026' },
    });
    expect(parseCohortAction({ action: 'create_cohort', name: '   ' }).ok).toBe(false);
    expect(parseCohortAction({ action: 'create_cohort', name: 'x'.repeat(121) }).ok).toBe(false);
  });

  test('rename_cohort requires a uuid + name', () => {
    expect(parseCohortAction({ action: 'rename_cohort', cohortId: CID, name: 'New' })).toEqual({
      ok: true,
      value: { action: 'rename_cohort', cohortId: CID, name: 'New' },
    });
    expect(parseCohortAction({ action: 'rename_cohort', cohortId: 'bad', name: 'New' }).ok).toBe(false);
    expect(parseCohortAction({ action: 'rename_cohort', cohortId: CID, name: '' }).ok).toBe(false);
  });

  test('delete_cohort and archive_cohort require a uuid', () => {
    expect(parseCohortAction({ action: 'delete_cohort', cohortId: CID })).toEqual({
      ok: true,
      value: { action: 'delete_cohort', cohortId: CID },
    });
    expect(parseCohortAction({ action: 'delete_cohort' }).ok).toBe(false);
    expect(parseCohortAction({ action: 'archive_cohort', cohortId: CID })).toEqual({
      ok: true,
      value: { action: 'archive_cohort', cohortId: CID },
    });
    expect(parseCohortAction({ action: 'archive_cohort' }).ok).toBe(false);
    expect(parseCohortAction({ action: 'archive_cohort', cohortId: 'bad' }).ok).toBe(false);
  });

  test('enroll_learner requires cohortId + userId', () => {
    expect(parseCohortAction({ action: 'enroll_learner', cohortId: CID, userId: UID })).toEqual({
      ok: true,
      value: { action: 'enroll_learner', cohortId: CID, userId: UID },
    });
    expect(parseCohortAction({ action: 'enroll_learner', cohortId: CID }).ok).toBe(false);
    expect(parseCohortAction({ action: 'enroll_learner', userId: UID }).ok).toBe(false);
  });

  test('unenroll_learner requires cohortId + userId (multi-enrollment: which cohort?)', () => {
    expect(parseCohortAction({ action: 'unenroll_learner', cohortId: CID, userId: UID })).toEqual({
      ok: true,
      value: { action: 'unenroll_learner', cohortId: CID, userId: UID },
    });
    // A bare userId is ambiguous under one-enrollment-per-cohort — rejected.
    expect(parseCohortAction({ action: 'unenroll_learner', userId: UID }).ok).toBe(false);
    expect(parseCohortAction({ action: 'unenroll_learner', cohortId: CID }).ok).toBe(false);
    expect(parseCohortAction({ action: 'unenroll_learner', cohortId: CID, userId: 'bad' }).ok).toBe(false);
  });

  test('assign/unassign champion require cohortId + userId', () => {
    expect(parseCohortAction({ action: 'assign_champion', cohortId: CID, userId: UID }).ok).toBe(true);
    expect(parseCohortAction({ action: 'unassign_champion', cohortId: CID, userId: UID }).ok).toBe(true);
    expect(parseCohortAction({ action: 'assign_champion', cohortId: CID }).ok).toBe(false);
  });

  test('rejects unknown action / non-object body', () => {
    expect(parseCohortAction({ action: 'nuke_everything' }).ok).toBe(false);
    expect(parseCohortAction(null).ok).toBe(false);
    expect(parseCohortAction('x').ok).toBe(false);
  });
});

describe('deleteCohortBlockedReason (U5 lifecycle guard)', () => {
  test('allows deletion only at zero enrollments', () => {
    expect(deleteCohortBlockedReason(0)).toBeNull();
    expect(deleteCohortBlockedReason(-1)).toBeNull(); // defensive: never blocks on a bogus count
  });

  test('blocks deletion with the enrollment count and points at archive', () => {
    expect(deleteCohortBlockedReason(1)).toMatch(/1 enrollment\b/);
    expect(deleteCohortBlockedReason(3)).toMatch(/3 enrollments/);
    expect(deleteCohortBlockedReason(3)).toMatch(/archive/i);
  });
});

describe('role transitions on champion (un)assignment', () => {
  test('assign promotes a learner to champion; leaves champion/admin alone', () => {
    expect(roleAfterAssign('learner')).toBe('champion');
    expect(roleAfterAssign('champion')).toBeNull();
    expect(roleAfterAssign('admin')).toBeNull();
    expect(roleAfterAssign(null)).toBeNull();
  });

  test('unassign demotes a champion only on their LAST cohort; never an admin', () => {
    expect(roleAfterUnassign('champion', 0)).toBe('learner'); // last cohort → demote
    expect(roleAfterUnassign('champion', 2)).toBeNull(); // still leads others → keep
    expect(roleAfterUnassign('admin', 0)).toBeNull(); // never demote an admin
    expect(roleAfterUnassign('learner', 0)).toBeNull(); // not a champion → no-op
  });
});

describe('shared helpers (mirror admin-core)', () => {
  test('isAllowlistedAdmin matches case-insensitively', () => {
    expect(isAllowlistedAdmin('A@navapbc.com', 'a@navapbc.com, b@navapbc.com')).toBe(true);
    expect(isAllowlistedAdmin('c@navapbc.com', 'a@navapbc.com')).toBe(false);
    expect(isAllowlistedAdmin(null, 'a@navapbc.com')).toBe(false);
  });

  test('emailDomainAllowed enforces the domain', () => {
    expect(emailDomainAllowed('x@navapbc.com', 'navapbc.com')).toBe(true);
    expect(emailDomainAllowed('x@evil.com', 'navapbc.com')).toBe(false);
  });

  test('buildCorsHeaders echoes only allow-listed origins', () => {
    const allowed = ['http://localhost:5173'];
    expect(buildCorsHeaders('http://localhost:5173', allowed)['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(buildCorsHeaders('http://evil.com', allowed)['access-control-allow-origin']).toBeUndefined();
  });

  test('fixedWindowAllow enforces the per-window cap', () => {
    const store = new Map<string, RateLimitState>();
    for (let i = 0; i < 3; i++) expect(fixedWindowAllow(store, 'u', 1000, 3, 60_000)).toBe(true);
    expect(fixedWindowAllow(store, 'u', 1000, 3, 60_000)).toBe(false); // 4th in-window
    expect(fixedWindowAllow(store, 'u', 70_000, 3, 60_000)).toBe(true); // new window
  });
});
