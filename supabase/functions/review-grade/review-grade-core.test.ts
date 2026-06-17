import { describe, test, expect } from 'vitest';
import {
  parseReviewAction,
  isAllowlistedAdmin,
  emailDomainAllowed,
  buildCorsHeaders,
  fixedWindowAllow,
  type RateLimitState,
} from './review-grade-core.ts';

const SID = '00000000-0000-0000-0000-0000000000a1';

describe('parseReviewAction', () => {
  test('accepts a valid approve (reviewed) with no note', () => {
    expect(parseReviewAction({ submissionId: SID, decision: 'reviewed' })).toEqual({
      ok: true,
      value: { submissionId: SID, decision: 'reviewed', note: null },
    });
  });

  test('accepts a return (returned) with a trimmed note', () => {
    expect(parseReviewAction({ submissionId: SID, decision: 'returned', note: '  fix the cite  ' })).toEqual({
      ok: true,
      value: { submissionId: SID, decision: 'returned', note: 'fix the cite' },
    });
  });

  test('blank note normalizes to null', () => {
    const r = parseReviewAction({ submissionId: SID, decision: 'reviewed', note: '   ' });
    expect(r.ok && r.value.note).toBe(null);
  });

  test('rejects a bad uuid, unknown decision, oversized/non-string note, non-object', () => {
    expect(parseReviewAction({ submissionId: 'bad', decision: 'reviewed' }).ok).toBe(false);
    expect(parseReviewAction({ submissionId: SID, decision: 'approved' }).ok).toBe(false);
    expect(parseReviewAction({ submissionId: SID, decision: 'returned', note: 'x'.repeat(2001) }).ok).toBe(false);
    expect(parseReviewAction({ submissionId: SID, decision: 'reviewed', note: 5 }).ok).toBe(false);
    expect(parseReviewAction(null).ok).toBe(false);
  });
});

describe('shared helpers (mirror admin-cohorts-core)', () => {
  test('isAllowlistedAdmin + emailDomainAllowed', () => {
    expect(isAllowlistedAdmin('A@navapbc.com', 'a@navapbc.com')).toBe(true);
    expect(isAllowlistedAdmin('x@navapbc.com', '')).toBe(false);
    expect(emailDomainAllowed('x@navapbc.com', 'navapbc.com')).toBe(true);
    expect(emailDomainAllowed('x@evil.com', 'navapbc.com')).toBe(false);
  });

  test('buildCorsHeaders echoes only allow-listed origins', () => {
    expect(buildCorsHeaders('http://localhost:5173', ['http://localhost:5173'])['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(buildCorsHeaders('http://evil.com', ['http://localhost:5173'])['access-control-allow-origin']).toBeUndefined();
  });

  test('fixedWindowAllow caps per window', () => {
    const store = new Map<string, RateLimitState>();
    expect(fixedWindowAllow(store, 'u', 1000, 1, 60_000)).toBe(true);
    expect(fixedWindowAllow(store, 'u', 1000, 1, 60_000)).toBe(false);
  });
});
