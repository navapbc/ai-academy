import { describe, test, expect } from 'vitest';
import {
  buildVersionHistory,
  type ContentVersionRow,
  type ProfileNameRow,
} from './contentVersions';

function row(overrides: Partial<ContentVersionRow>): ContentVersionRow {
  return {
    id: 'v1',
    version: 1,
    note: 'a note',
    author_id: 'author-1',
    created_at: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

const AUTHORS: ProfileNameRow[] = [
  { id: 'author-1', full_name: 'Ada Lovelace', email: 'ada@navapbc.com' },
  { id: 'author-2', full_name: null, email: 'grace@navapbc.com' },
  { id: 'author-3', full_name: '   ', email: null },
];

describe('buildVersionHistory', () => {
  test('orders newest-first by created_at', () => {
    const rows = [
      row({ id: 'a', version: 1, created_at: '2026-07-01T10:00:00Z' }),
      row({ id: 'c', version: 3, created_at: '2026-07-03T10:00:00Z' }),
      row({ id: 'b', version: 2, created_at: '2026-07-02T10:00:00Z' }),
    ];
    const out = buildVersionHistory(rows, AUTHORS);
    expect(out.map((v) => v.id)).toEqual(['c', 'b', 'a']);
  });

  test('breaks a created_at tie by version descending', () => {
    const ts = '2026-07-01T10:00:00Z';
    const rows = [
      row({ id: 'lo', version: 2, created_at: ts }),
      row({ id: 'hi', version: 5, created_at: ts }),
    ];
    const out = buildVersionHistory(rows, AUTHORS);
    expect(out.map((v) => v.id)).toEqual(['hi', 'lo']);
  });

  test('renders a null note as null (UI shows "—")', () => {
    const out = buildVersionHistory([row({ note: null })], AUTHORS);
    expect(out[0].note).toBeNull();
  });

  test('treats a blank/whitespace note as null', () => {
    const out = buildVersionHistory([row({ note: '   ' })], AUTHORS);
    expect(out[0].note).toBeNull();
  });

  test('keeps a real note verbatim', () => {
    const out = buildVersionHistory([row({ note: 'Fixed wording' })], AUTHORS);
    expect(out[0].note).toBe('Fixed wording');
  });

  test('resolves author full_name', () => {
    const out = buildVersionHistory([row({ author_id: 'author-1' })], AUTHORS);
    expect(out[0].authorName).toBe('Ada Lovelace');
  });

  test('falls back to email when full_name is missing', () => {
    const out = buildVersionHistory([row({ author_id: 'author-2' })], AUTHORS);
    expect(out[0].authorName).toBe('grace@navapbc.com');
  });

  test('falls back to a short id when name and email are blank', () => {
    const out = buildVersionHistory([row({ author_id: 'author-3' })], AUTHORS);
    expect(out[0].authorName).toBe('User author-3');
  });

  test('falls back to a short id when the author is unresolved', () => {
    const out = buildVersionHistory([row({ author_id: 'ffffffff-0000' })], AUTHORS);
    expect(out[0].authorName).toBe('User ffffffff');
  });

  test('shows "Unknown" when author_id is null', () => {
    const out = buildVersionHistory([row({ author_id: null })], []);
    expect(out[0].authorName).toBe('Unknown');
  });

  test('coerces a string version to a number', () => {
    const out = buildVersionHistory([row({ version: '7' })], AUTHORS);
    expect(out[0].version).toBe(7);
    expect(typeof out[0].version).toBe('number');
  });

  test('coerces a non-numeric version to 0', () => {
    const out = buildVersionHistory([row({ version: 'not-a-number' as unknown as number })], AUTHORS);
    expect(out[0].version).toBe(0);
  });

  test('empty input yields an empty list', () => {
    expect(buildVersionHistory([], AUTHORS)).toEqual([]);
  });
});
