import { describe, test, expect } from 'vitest';
import {
  parseWorkshopAction,
  isUuid,
  isAllowlistedAdmin,
  emailDomainAllowed,
  buildCorsHeaders,
  fixedWindowAllow,
  type RateLimitState,
} from './admin-workshops-core.ts';

const WID = '00000000-0000-0000-0000-0000000000a0';

describe('isUuid', () => {
  test('accepts a uuid, rejects junk', () => {
    expect(isUuid(WID)).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe('parseWorkshopAction — create', () => {
  test('valid payload trims title/intro and normalizes steps', () => {
    expect(
      parseWorkshopAction({
        action: 'create',
        title: '  AI for Writing  ',
        intro: '  Learn the path.  ',
        stepCellIds: [' 2.6 ', '2.7', '2.10'],
      }),
    ).toEqual({
      ok: true,
      value: {
        action: 'create',
        title: 'AI for Writing',
        intro: 'Learn the path.',
        stepCellIds: ['2.6', '2.7', '2.10'],
      },
    });
  });

  test('intro is optional (absent / null / blank → null)', () => {
    expect(parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: [] })).toEqual({
      ok: true,
      value: { action: 'create', title: 'T', intro: null, stepCellIds: [] },
    });
    expect(parseWorkshopAction({ action: 'create', title: 'T', intro: null, stepCellIds: [] }).ok).toBe(
      true,
    );
    const blank = parseWorkshopAction({ action: 'create', title: 'T', intro: '   ', stepCellIds: [] });
    expect(blank.ok && blank.value.action === 'create' && blank.value.intro).toBe(null);
  });

  test('empty step list is allowed', () => {
    expect(parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: [] }).ok).toBe(true);
  });

  test('empty / whitespace title rejected', () => {
    expect(parseWorkshopAction({ action: 'create', title: '', stepCellIds: [] }).ok).toBe(false);
    expect(parseWorkshopAction({ action: 'create', title: '   ', stepCellIds: [] }).ok).toBe(false);
  });

  test('title over 200 chars rejected', () => {
    expect(
      parseWorkshopAction({ action: 'create', title: 'x'.repeat(201), stepCellIds: [] }).ok,
    ).toBe(false);
  });

  test('intro over 2000 chars rejected', () => {
    expect(
      parseWorkshopAction({
        action: 'create',
        title: 'T',
        intro: 'x'.repeat(2001),
        stepCellIds: [],
      }).ok,
    ).toBe(false);
  });

  test('non-string intro rejected', () => {
    expect(parseWorkshopAction({ action: 'create', title: 'T', intro: 5, stepCellIds: [] }).ok).toBe(
      false,
    );
  });

  test('stepCellIds must be an array', () => {
    expect(parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: 'nope' }).ok).toBe(false);
  });

  test('duplicate step ids rejected', () => {
    expect(
      parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: ['2.6', '2.6'] }).ok,
    ).toBe(false);
  });

  test('empty-string / non-string step ids rejected', () => {
    expect(parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: [''] }).ok).toBe(false);
    expect(parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: ['  '] }).ok).toBe(false);
    expect(parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: [3] }).ok).toBe(false);
  });

  test('too many steps (>50) rejected', () => {
    const many = Array.from({ length: 51 }, (_, i) => `c${i}`);
    expect(parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: many }).ok).toBe(false);
  });

  test('over-long step id rejected', () => {
    expect(
      parseWorkshopAction({ action: 'create', title: 'T', stepCellIds: ['x'.repeat(101)] }).ok,
    ).toBe(false);
  });
});

describe('parseWorkshopAction — update', () => {
  test('valid payload requires a uuid id + title + steps', () => {
    expect(
      parseWorkshopAction({
        action: 'update',
        id: WID,
        title: 'Renamed',
        stepCellIds: ['2.7', '2.6'],
      }),
    ).toEqual({
      ok: true,
      value: { action: 'update', id: WID, title: 'Renamed', intro: null, stepCellIds: ['2.7', '2.6'] },
    });
  });

  test('reorder is just an update with a new array order', () => {
    const r = parseWorkshopAction({
      action: 'update',
      id: WID,
      title: 'T',
      stepCellIds: ['2.10', '2.6', '2.7'],
    });
    expect(r.ok && r.value.action === 'update' && r.value.stepCellIds).toEqual(['2.10', '2.6', '2.7']);
  });

  test('missing / bad id rejected', () => {
    expect(parseWorkshopAction({ action: 'update', title: 'T', stepCellIds: [] }).ok).toBe(false);
    expect(parseWorkshopAction({ action: 'update', id: 'bad', title: 'T', stepCellIds: [] }).ok).toBe(
      false,
    );
  });

  test('empty title rejected on update', () => {
    expect(parseWorkshopAction({ action: 'update', id: WID, title: '', stepCellIds: [] }).ok).toBe(
      false,
    );
  });

  test('duplicate steps rejected on update', () => {
    expect(
      parseWorkshopAction({ action: 'update', id: WID, title: 'T', stepCellIds: ['a', 'a'] }).ok,
    ).toBe(false);
  });
});

describe('parseWorkshopAction — delete', () => {
  test('requires a uuid id', () => {
    expect(parseWorkshopAction({ action: 'delete', id: WID })).toEqual({
      ok: true,
      value: { action: 'delete', id: WID },
    });
    expect(parseWorkshopAction({ action: 'delete' }).ok).toBe(false);
    expect(parseWorkshopAction({ action: 'delete', id: 'bad' }).ok).toBe(false);
  });
});

describe('parseWorkshopAction — rejects unknown action / non-object body', () => {
  test('unknown action', () => {
    expect(parseWorkshopAction({ action: 'nuke_everything' }).ok).toBe(false);
  });
  test('non-object body', () => {
    expect(parseWorkshopAction(null).ok).toBe(false);
    expect(parseWorkshopAction('x').ok).toBe(false);
    expect(parseWorkshopAction(42).ok).toBe(false);
  });
});

describe('shared helpers (mirror admin-cohorts-core)', () => {
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
