import { describe, test, expect } from 'vitest';
import { evaluatePortfolioReadiness, type PortfolioState } from './useCasePortfolio.ready';
import type { UseCasePortfolioConfig } from '../../types';

// Pure submit-gate for the 2.11 use-case portfolio (P4.8). The gate encodes the
// lesson: enough complete entries, at least one honest "Doesn't help" entry, a
// fully written 4D Diligence Statement, and a word floor.
const config: UseCasePortfolioConfig = {
  kind: 'use-case-portfolio',
  library: {
    title: 'Your use-case library',
    helper: '',
    minEntries: 3,
    taskPlaceholder: '',
    approachPlaceholder: '',
    watchPlaceholder: '',
  },
  diligence: {
    title: 'Diligence Statement',
    helper: '',
    dimensions: [
      { id: 'delegation', label: 'Delegation', prompt: '' },
      { id: 'description', label: 'Description', prompt: '' },
      { id: 'discernment', label: 'Discernment', prompt: '' },
      { id: 'diligence', label: 'Diligence', prompt: '' },
    ],
    targetWords: 250,
    minWords: 60,
  },
};

const entry = (verdict: 'helps' | 'doesnt', n: number) => ({
  verdict,
  task: `task ${n}`,
  approach: `approach ${n}`,
  watch: `watch ${n}`,
});

// A statement that clears the 60-word floor (15 words x 4 = 60).
const fullStatement = (): Record<string, string> => {
  const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
  return { delegation: words, description: words, discernment: words, diligence: words };
};

function state(over: Partial<PortfolioState> = {}): PortfolioState {
  return {
    entries: [entry('helps', 1), entry('helps', 2), entry('doesnt', 3)],
    statement: fullStatement(),
    ...over,
  };
}

describe('evaluatePortfolioReadiness', () => {
  test('a complete portfolio (3 entries incl. a "Doesn\'t help", full 4D statement, ≥ floor) is ready', () => {
    const r = evaluatePortfolioReadiness(state(), config);
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.completeEntries).toBe(3);
    expect(r.doesntCount).toBe(1);
  });

  test('below minEntries is not ready and says how many more are needed', () => {
    const r = evaluatePortfolioReadiness(state({ entries: [entry('doesnt', 1)] }), config);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => /Add 2 more complete use-case entries/.test(x))).toBe(true);
  });

  test('incomplete entries (a blank field) do not count toward minEntries', () => {
    const entries = [entry('helps', 1), entry('helps', 2), { verdict: 'doesnt' as const, task: 't', approach: '', watch: 'w' }];
    const r = evaluatePortfolioReadiness(state({ entries }), config);
    expect(r.completeEntries).toBe(2);
    expect(r.ready).toBe(false);
  });

  test('minEntries met but all "Helps" → blocked, needs a "Doesn\'t help" entry', () => {
    const entries = [entry('helps', 1), entry('helps', 2), entry('helps', 3)];
    const r = evaluatePortfolioReadiness(state({ entries }), config);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => /Doesn’t help/.test(x))).toBe(true);
  });

  test('a blank 4D dimension blocks submission and names the missing dimension', () => {
    const r = evaluatePortfolioReadiness(
      state({ statement: { ...fullStatement(), discernment: '' } }),
      config,
    );
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => /Discernment/.test(x))).toBe(true);
  });

  test('a statement under the word floor blocks submission', () => {
    const thin = { delegation: 'a', description: 'b', discernment: 'c', diligence: 'd' };
    const r = evaluatePortfolioReadiness(state({ statement: thin }), config);
    expect(r.statementWords).toBe(4);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => /at least 60 words/.test(x))).toBe(true);
  });
});
