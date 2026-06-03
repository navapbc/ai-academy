import { describe, test, expect } from 'vitest';
import { computePairedCalibration } from './pairedCalibration.compute';

describe('computePairedCalibration', () => {
  test('AI faster: actual speedup and gap (lesson example)', () => {
    // off 1000ms, on 850ms → 15% actual; guessed 40% → 25-point gap.
    expect(computePairedCalibration({ offMs: 1000, onMs: 850, estimatePct: 40 })).toEqual({
      actualSpeedupPct: 15,
      gapPct: 25,
    });
  });

  test('AI slower: negative actual speedup, gap is absolute', () => {
    // off 1000ms, on 1300ms → -30% (AI slower); guessed 20% → gap 50.
    expect(computePairedCalibration({ offMs: 1000, onMs: 1300, estimatePct: 20 })).toEqual({
      actualSpeedupPct: -30,
      gapPct: 50,
    });
  });

  test('rounds actual speedup to a whole percent', () => {
    // (1000-856)/1000 = 14.4% → 14.
    expect(computePairedCalibration({ offMs: 1000, onMs: 856, estimatePct: 0 }).actualSpeedupPct).toBe(14);
  });

  test('guards offMs <= 0 (no divide-by-zero)', () => {
    expect(computePairedCalibration({ offMs: 0, onMs: 500, estimatePct: 30 })).toEqual({
      actualSpeedupPct: 0,
      gapPct: 30,
    });
  });
});
