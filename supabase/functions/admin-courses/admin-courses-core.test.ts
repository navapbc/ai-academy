import { describe, test, expect } from 'vitest';
import {
  parseCourseAction,
  isUuid,
  assignmentBlockedReason,
  deleteWeekBlockedReason,
  reorderMismatchReason,
  isAllowlistedAdmin,
  emailDomainAllowed,
  buildCorsHeaders,
  fixedWindowAllow,
  type RateLimitState,
} from './admin-courses-core.ts';

const CID = '00000000-0000-0000-0000-0000000000c1'; // course id
const WID = '00000000-0000-0000-0000-0000000000e1'; // week id
const WID2 = '00000000-0000-0000-0000-0000000000e2';

describe('isUuid', () => {
  test('accepts a uuid, rejects junk', () => {
    expect(isUuid(WID)).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe('parseCourseAction — create_week', () => {
  test('valid payload trims title/subtitle', () => {
    expect(
      parseCourseAction({
        action: 'create_week',
        courseId: CID,
        title: '  Week 5  ',
        subtitle: '  Ship It  ',
      }),
    ).toEqual({
      ok: true,
      value: { action: 'create_week', courseId: CID, title: 'Week 5', subtitle: 'Ship It' },
    });
  });

  test('subtitle is optional (absent / null / blank → null)', () => {
    expect(parseCourseAction({ action: 'create_week', courseId: CID, title: 'W' })).toEqual({
      ok: true,
      value: { action: 'create_week', courseId: CID, title: 'W', subtitle: null },
    });
    expect(
      parseCourseAction({ action: 'create_week', courseId: CID, title: 'W', subtitle: null }).ok,
    ).toBe(true);
    const blank = parseCourseAction({
      action: 'create_week',
      courseId: CID,
      title: 'W',
      subtitle: '   ',
    });
    expect(blank.ok && blank.value.action === 'create_week' && blank.value.subtitle).toBe(null);
  });

  test('missing / bad courseId rejected', () => {
    expect(parseCourseAction({ action: 'create_week', title: 'W' }).ok).toBe(false);
    expect(parseCourseAction({ action: 'create_week', courseId: 'bad', title: 'W' }).ok).toBe(false);
  });

  test('empty / whitespace / over-long title rejected', () => {
    expect(parseCourseAction({ action: 'create_week', courseId: CID, title: '' }).ok).toBe(false);
    expect(parseCourseAction({ action: 'create_week', courseId: CID, title: '   ' }).ok).toBe(false);
    expect(
      parseCourseAction({ action: 'create_week', courseId: CID, title: 'x'.repeat(201) }).ok,
    ).toBe(false);
  });

  test('non-string / over-long subtitle rejected', () => {
    expect(
      parseCourseAction({ action: 'create_week', courseId: CID, title: 'W', subtitle: 5 }).ok,
    ).toBe(false);
    expect(
      parseCourseAction({
        action: 'create_week',
        courseId: CID,
        title: 'W',
        subtitle: 'x'.repeat(201),
      }).ok,
    ).toBe(false);
  });
});

describe('parseCourseAction — update_week', () => {
  test('valid payload requires a uuid weekId + title; subtitle optional', () => {
    expect(
      parseCourseAction({ action: 'update_week', weekId: WID, title: 'Week 5', subtitle: 'New' }),
    ).toEqual({
      ok: true,
      value: { action: 'update_week', weekId: WID, title: 'Week 5', subtitle: 'New' },
    });
    // Clearing the subtitle: absent → null (a rename can drop it).
    expect(parseCourseAction({ action: 'update_week', weekId: WID, title: 'Week 5' })).toEqual({
      ok: true,
      value: { action: 'update_week', weekId: WID, title: 'Week 5', subtitle: null },
    });
  });

  test('missing / bad weekId or empty title rejected', () => {
    expect(parseCourseAction({ action: 'update_week', title: 'W' }).ok).toBe(false);
    expect(parseCourseAction({ action: 'update_week', weekId: 'bad', title: 'W' }).ok).toBe(false);
    expect(parseCourseAction({ action: 'update_week', weekId: WID, title: '' }).ok).toBe(false);
  });
});

describe('parseCourseAction — reorder_weeks', () => {
  test('valid payload: courseId + ordered uuid list', () => {
    expect(
      parseCourseAction({ action: 'reorder_weeks', courseId: CID, weekIds: [WID2, WID] }),
    ).toEqual({
      ok: true,
      value: { action: 'reorder_weeks', courseId: CID, weekIds: [WID2, WID] },
    });
  });

  test('rejects non-array, non-uuid entries, and duplicates', () => {
    expect(parseCourseAction({ action: 'reorder_weeks', courseId: CID, weekIds: 'x' }).ok).toBe(false);
    expect(
      parseCourseAction({ action: 'reorder_weeks', courseId: CID, weekIds: ['bad'] }).ok,
    ).toBe(false);
    expect(
      parseCourseAction({ action: 'reorder_weeks', courseId: CID, weekIds: [WID, WID] }).ok,
    ).toBe(false);
  });

  test('empty list is allowed (trivially matches an empty course)', () => {
    expect(parseCourseAction({ action: 'reorder_weeks', courseId: CID, weekIds: [] }).ok).toBe(true);
  });
});

describe('parseCourseAction — delete_week', () => {
  test('requires a uuid weekId', () => {
    expect(parseCourseAction({ action: 'delete_week', weekId: WID })).toEqual({
      ok: true,
      value: { action: 'delete_week', weekId: WID },
    });
    expect(parseCourseAction({ action: 'delete_week' }).ok).toBe(false);
    expect(parseCourseAction({ action: 'delete_week', weekId: 'bad' }).ok).toBe(false);
  });
});

describe('parseCourseAction — assign_module / unassign_module', () => {
  test('assign requires weekId + cellId (trimmed)', () => {
    expect(parseCourseAction({ action: 'assign_module', weekId: WID, cellId: ' 2.6 ' })).toEqual({
      ok: true,
      value: { action: 'assign_module', weekId: WID, cellId: '2.6' },
    });
    expect(parseCourseAction({ action: 'assign_module', cellId: '2.6' }).ok).toBe(false);
    expect(parseCourseAction({ action: 'assign_module', weekId: WID, cellId: '' }).ok).toBe(false);
    expect(parseCourseAction({ action: 'assign_module', weekId: WID, cellId: 7 }).ok).toBe(false);
    expect(
      parseCourseAction({ action: 'assign_module', weekId: WID, cellId: 'x'.repeat(101) }).ok,
    ).toBe(false);
  });

  test('unassign requires only cellId (unique(cell_id): at most one week)', () => {
    expect(parseCourseAction({ action: 'unassign_module', cellId: 'course-intro' })).toEqual({
      ok: true,
      value: { action: 'unassign_module', cellId: 'course-intro' },
    });
    expect(parseCourseAction({ action: 'unassign_module' }).ok).toBe(false);
  });
});

describe('parseCourseAction — reorder_week_modules', () => {
  test('valid payload: weekId + ordered cell id list', () => {
    expect(
      parseCourseAction({ action: 'reorder_week_modules', weekId: WID, cellIds: ['b', 'a'] }),
    ).toEqual({
      ok: true,
      value: { action: 'reorder_week_modules', weekId: WID, cellIds: ['b', 'a'] },
    });
  });

  test('rejects duplicates, empty strings, non-strings, over-long lists', () => {
    expect(
      parseCourseAction({ action: 'reorder_week_modules', weekId: WID, cellIds: ['a', 'a'] }).ok,
    ).toBe(false);
    expect(
      parseCourseAction({ action: 'reorder_week_modules', weekId: WID, cellIds: [''] }).ok,
    ).toBe(false);
    expect(
      parseCourseAction({ action: 'reorder_week_modules', weekId: WID, cellIds: [3] }).ok,
    ).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => `c${i}`);
    expect(
      parseCourseAction({ action: 'reorder_week_modules', weekId: WID, cellIds: many }).ok,
    ).toBe(false);
  });
});

describe('parseCourseAction — rejects unknown action / non-object body', () => {
  test('unknown action', () => {
    expect(parseCourseAction({ action: 'drop_all_weeks' }).ok).toBe(false);
  });
  test('non-object body', () => {
    expect(parseCourseAction(null).ok).toBe(false);
    expect(parseCourseAction('x').ok).toBe(false);
    expect(parseCourseAction(42).ok).toBe(false);
  });
});

describe('assignmentBlockedReason (mirrors findUnpublishedSteps named-offender contract)', () => {
  test('unknown module → named 400 (existence not leaked separately from published)', () => {
    expect(assignmentBlockedReason('9.9', null)).toMatch(/`9\.9` does not reference an existing published module/);
  });

  test('draft module → same named message', () => {
    expect(
      assignmentBlockedReason('9.9', { status: 'draft', archivedAt: null, assignedWeekTitle: null }),
    ).toMatch(/does not reference an existing published module/);
  });

  test('archived module → same named message (published but soft-deleted)', () => {
    expect(
      assignmentBlockedReason('2.1', {
        status: 'published',
        archivedAt: '2026-07-01T00:00:00Z',
        assignedWeekTitle: null,
      }),
    ).toMatch(/does not reference an existing published module/);
  });

  test('already-assigned module names its week (unique(cell_id))', () => {
    expect(
      assignmentBlockedReason('c1-w1-break-claude', {
        status: 'published',
        archivedAt: null,
        assignedWeekTitle: 'Week 1',
      }),
    ).toMatch(/already assigned to Week 1/);
  });

  test('published, non-archived, unassigned module passes', () => {
    expect(
      assignmentBlockedReason('2.1', { status: 'published', archivedAt: null, assignedWeekTitle: null }),
    ).toBeNull();
  });
});

describe('deleteWeekBlockedReason', () => {
  test('empty week is deletable', () => {
    expect(deleteWeekBlockedReason(0)).toBeNull();
  });
  test('populated week blocks with the count (singular/plural)', () => {
    expect(deleteWeekBlockedReason(1)).toMatch(/1 assigned module\./);
    expect(deleteWeekBlockedReason(3)).toMatch(/3 assigned modules\./);
  });
});

describe('reorderMismatchReason', () => {
  test('a permutation of the current set passes', () => {
    expect(reorderMismatchReason('the set', ['a', 'b', 'c'], ['c', 'a', 'b'])).toBeNull();
    expect(reorderMismatchReason('the set', [], [])).toBeNull();
  });
  test('missing, extra, or swapped-in ids are rejected', () => {
    expect(reorderMismatchReason("the week's current modules", ['a', 'b'], ['a'])).toMatch(
      /must contain exactly the week's current modules/,
    );
    expect(reorderMismatchReason('the set', ['a'], ['a', 'b'])).toBeTruthy();
    expect(reorderMismatchReason('the set', ['a', 'b'], ['a', 'z'])).toBeTruthy();
  });
});

describe('shared helpers (mirror admin-cohorts)', () => {
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
