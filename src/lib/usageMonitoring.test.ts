import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getSupabaseClient } from './supabaseClient';
import { createSupabaseMock } from '../test/supabaseMock';
import {
  buildUsageByUser,
  DEFAULT_THRESHOLD_TOKENS,
  fetchUsageByUser,
  type UsageRow,
} from './usageMonitoring';

vi.mock('./supabaseClient');

const NAMES = [
  { id: 'u-1', full_name: 'Ada Lovelace', email: 'ada@navapbc.com' },
  { id: 'u-2', full_name: null, email: 'grace@navapbc.com' },
];

function row(overrides: Partial<UsageRow> & { user_id: string }): UsageRow {
  return {
    source: 'chat',
    model: 'claude-haiku',
    input_tokens: 0,
    output_tokens: 0,
    created_at: '2026-07-02T00:00:00Z',
    ...overrides,
  };
}

describe('buildUsageByUser', () => {
  test('aggregates per user, sorts desc by total, flags only the over-threshold user', () => {
    const rows: UsageRow[] = [
      row({ user_id: 'u-1', input_tokens: 100, output_tokens: 50 }),
      row({ user_id: 'u-1', input_tokens: 200, output_tokens: 100 }),
      row({ user_id: 'u-2', input_tokens: 1000, output_tokens: 500 }),
    ];

    const result = buildUsageByUser(rows, NAMES, { thresholdTokens: 1000 });

    expect(result).toHaveLength(2);
    // u-2 (1500 total) sorts before u-1 (450 total).
    expect(result[0].userId).toBe('u-2');
    expect(result[1].userId).toBe('u-1');

    const u2 = result[0];
    expect(u2.callCount).toBe(1);
    expect(u2.inputTokens).toBe(1000);
    expect(u2.outputTokens).toBe(500);
    expect(u2.totalTokens).toBe(1500);
    expect(u2.overThreshold).toBe(true);
    // full_name null → falls back to email.
    expect(u2.name).toBe('grace@navapbc.com');

    const u1 = result[1];
    expect(u1.callCount).toBe(2);
    expect(u1.inputTokens).toBe(300);
    expect(u1.outputTokens).toBe(150);
    expect(u1.totalTokens).toBe(450);
    expect(u1.overThreshold).toBe(false);
    expect(u1.name).toBe('Ada Lovelace');
  });

  test('empty rows → empty result', () => {
    expect(buildUsageByUser([], NAMES)).toEqual([]);
  });

  test('a user with only input tokens has outputTokens 0', () => {
    const rows: UsageRow[] = [row({ user_id: 'u-1', input_tokens: 500, output_tokens: 0 })];
    const [u1] = buildUsageByUser(rows, NAMES);
    expect(u1.inputTokens).toBe(500);
    expect(u1.outputTokens).toBe(0);
    expect(u1.totalTokens).toBe(500);
  });

  test('numeric-as-string token values are coerced', () => {
    const rows: UsageRow[] = [
      row({ user_id: 'u-1', input_tokens: '1200', output_tokens: '800' }),
    ];
    const [u1] = buildUsageByUser(rows, NAMES);
    expect(u1.inputTokens).toBe(1200);
    expect(u1.outputTokens).toBe(800);
    expect(u1.totalTokens).toBe(2000);
  });

  test('null tokens coerce to 0', () => {
    const rows: UsageRow[] = [row({ user_id: 'u-1', input_tokens: null, output_tokens: null })];
    const [u1] = buildUsageByUser(rows, NAMES);
    expect(u1.totalTokens).toBe(0);
  });

  test('missing profile falls back to a short id label', () => {
    const rows: UsageRow[] = [row({ user_id: 'unknown-user-id-1234', input_tokens: 10 })];
    const [u] = buildUsageByUser(rows, []);
    expect(u.name).toBe('User unknown-');
  });

  test('uses DEFAULT_THRESHOLD_TOKENS when none supplied', () => {
    const rows: UsageRow[] = [
      row({ user_id: 'u-1', input_tokens: DEFAULT_THRESHOLD_TOKENS, output_tokens: 1 }),
    ];
    const [u1] = buildUsageByUser(rows, NAMES);
    expect(u1.overThreshold).toBe(true);
  });
});

// PostgREST caps every response at db.max_rows (1000), so a single unbounded
// select silently returns only the first page and understates every total. These
// cover the explicit pagination that replaced it.
describe('fetchUsageByUser pagination', () => {
  const PAGE_SIZE = 1000;
  const mock = createSupabaseMock();

  beforeEach(() => {
    mock.reset();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
  });

  const rangeCalls = () => mock.ops.filter((o) => o.method === 'range').map((o) => o.args);

  test('a short first page stops after one usage query', async () => {
    mock.queueResults(
      { data: [row({ user_id: 'u-1', input_tokens: 10, output_tokens: 5 })], error: null },
      { data: NAMES, error: null },
    );

    const out = await fetchUsageByUser('2026-07-01T00:00:00Z');

    expect(rangeCalls()).toEqual([[0, PAGE_SIZE - 1]]);
    expect(out).toHaveLength(1);
    expect(out[0].totalTokens).toBe(15);
  });

  test('a full first page keeps paging and totals every page', async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, () =>
      row({ user_id: 'u-1', input_tokens: 1, output_tokens: 0 }),
    );
    mock.queueResults(
      { data: fullPage, error: null },
      { data: [row({ user_id: 'u-1', input_tokens: 7, output_tokens: 0 })], error: null },
      { data: NAMES, error: null },
    );

    const out = await fetchUsageByUser('2026-07-01T00:00:00Z');

    expect(rangeCalls()).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
    ]);
    // Pre-fix this returned 1000 (the first page only).
    expect(out[0].callCount).toBe(PAGE_SIZE + 1);
    expect(out[0].totalTokens).toBe(PAGE_SIZE + 7);
  });

  test('orders by (created_at, id) so ties cannot straddle a page boundary', async () => {
    mock.queueResults({ data: [], error: null });
    await fetchUsageByUser('2026-07-01T00:00:00Z');
    expect(mock.ops.filter((o) => o.method === 'order').map((o) => o.args[0])).toEqual([
      'created_at',
      'id',
    ]);
  });

  test('no rows in the window → empty result, no profile lookup', async () => {
    mock.queueResults({ data: [], error: null });
    await expect(fetchUsageByUser('2026-07-01T00:00:00Z')).resolves.toEqual([]);
    expect(mock.fromCalls).toEqual(['claude_usage']);
  });

  test('a failed page propagates the error', async () => {
    mock.queueResults({ data: null, error: new Error('rls denied') });
    await expect(fetchUsageByUser('2026-07-01T00:00:00Z')).rejects.toThrow('rls denied');
  });
});
