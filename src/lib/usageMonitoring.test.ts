import { describe, test, expect } from 'vitest';
import { buildUsageByUser, DEFAULT_THRESHOLD_TOKENS, type UsageRow } from './usageMonitoring';

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
