import { describe, test, expect } from 'vitest';
import {
  parsePairedCalibration,
  parseConfidenceCalibration,
  parseFailureLog,
  parseUseCasePortfolio,
  buildLearnerPortfolio,
  type PortfolioRow,
} from './learnerPortfolio';

const TS = '2026-06-01T00:00:00Z';

describe('parsePairedCalibration', () => {
  test('parses the derived numbers and defects', () => {
    const a = parsePairedCalibration(
      { gapPct: 12, actualSpeedupPct: 30, estimatePct: 42, offMs: 1000, onMs: 700, offDefects: 2, onDefects: 1 },
      TS,
    );
    expect(a).toEqual({
      gapPct: 12,
      estimatePct: 42,
      actualSpeedupPct: 30,
      offMs: 1000,
      onMs: 700,
      offDefects: 2,
      onDefects: 1,
      createdAt: TS,
    });
  });

  test('null on missing core numbers or non-object', () => {
    expect(parsePairedCalibration({ gapPct: 1, actualSpeedupPct: 2 }, TS)).toBeNull(); // no estimatePct
    expect(parsePairedCalibration('nope', TS)).toBeNull();
    expect(parsePairedCalibration(null, TS)).toBeNull();
  });

  test('defects default to 0 when absent', () => {
    const a = parsePairedCalibration({ gapPct: 0, actualSpeedupPct: 0, estimatePct: 0 }, TS);
    expect(a?.offDefects).toBe(0);
    expect(a?.onDefects).toBe(0);
  });
});

describe('parseConfidenceCalibration', () => {
  test('parses summary + score', () => {
    const a = parseConfidenceCalibration(
      { kind: 'calibration', score: 4, maxScore: 6, summary: { calibrated: 4, over: 1, under: 1, unanswered: 0 } },
      TS,
    );
    expect(a).toMatchObject({ calibrated: 4, over: 1, under: 1, unanswered: 0, score: 4, maxScore: 6 });
  });

  test('null on wrong kind or missing summary/score', () => {
    expect(parseConfidenceCalibration({ kind: 'other', summary: {}, score: 1, maxScore: 1 }, TS)).toBeNull();
    expect(parseConfidenceCalibration({ kind: 'calibration', score: 1, maxScore: 1 }, TS)).toBeNull();
    expect(parseConfidenceCalibration({ kind: 'calibration', summary: {} }, TS)).toBeNull();
  });
});

describe('parseFailureLog', () => {
  test('maps entries and keeps entryCount', () => {
    const a = parseFailureLog(
      {
        kind: 'failure-log',
        entryCount: 2,
        entries: [
          { date: '2026-05-01', task: 'draft', error: 'made up a cite', caught: 'checked source', tell: 'too confident' },
          { date: '2026-05-02', task: 'summary', error: 'dropped a caveat', caught: 'reread', tell: 'smoothed tone' },
        ],
      },
      TS,
    );
    expect(a?.entries).toHaveLength(2);
    expect(a?.entries[0].error).toBe('made up a cite');
    expect(a?.entryCount).toBe(2);
  });

  test('tolerates malformed entries (coerces fields, skips non-objects)', () => {
    const a = parseFailureLog({ kind: 'failure-log', entries: [{ task: 'x' }, 'junk', null] }, TS);
    expect(a?.entries).toHaveLength(1); // only the object entry survives the isObj filter
    expect(a?.entries[0]).toEqual({ date: '', task: 'x', error: '', caught: '', tell: '' });
    expect(a?.entryCount).toBe(1); // falls back to entries.length when entryCount absent
  });

  test('null on wrong kind or non-array entries', () => {
    expect(parseFailureLog({ kind: 'nope', entries: [] }, TS)).toBeNull();
    expect(parseFailureLog({ kind: 'failure-log', entries: 'x' }, TS)).toBeNull();
  });
});

describe('parseUseCasePortfolio', () => {
  test('parses entries, statement, and counts', () => {
    const a = parseUseCasePortfolio(
      {
        kind: 'use-case-portfolio',
        entries: [
          { verdict: 'helps', task: 'a', approach: 'b', watch: 'c' },
          { verdict: 'doesnt', task: 'd', approach: 'e', watch: 'f' },
        ],
        statement: { delegation: 'one', description: 'two', discernment: 'three', diligence: 'four' },
        helpsCount: 1,
        doesntCount: 1,
        wordCount: 4,
      },
      TS,
    );
    expect(a?.entries).toHaveLength(2);
    expect(a?.entries[1].verdict).toBe('doesnt');
    expect(a?.statement.delegation).toBe('one');
    expect(a?.helpsCount).toBe(1);
    expect(a?.doesntCount).toBe(1);
  });

  test('derives counts when absent and defaults unknown verdict to helps', () => {
    const a = parseUseCasePortfolio(
      { kind: 'use-case-portfolio', entries: [{ verdict: 'weird', task: 't', approach: 'a', watch: 'w' }] },
      TS,
    );
    expect(a?.entries[0].verdict).toBe('helps');
    expect(a?.helpsCount).toBe(1);
    expect(a?.doesntCount).toBe(0);
    expect(a?.statement).toEqual({});
  });

  test('drops incomplete/blank entries (e.g. a trailing empty row)', () => {
    const a = parseUseCasePortfolio(
      {
        kind: 'use-case-portfolio',
        entries: [
          { verdict: 'helps', task: 'real', approach: 'a', watch: 'w' },
          { verdict: 'helps', task: '', approach: '', watch: '' }, // trailing blank
          { verdict: 'doesnt', task: 'partial', approach: '', watch: '' }, // incomplete
        ],
        statement: {},
      },
      TS,
    );
    expect(a?.entries).toHaveLength(1);
    expect(a?.entries[0].task).toBe('real');
    expect(a?.helpsCount).toBe(1); // derived over complete entries only
    expect(a?.doesntCount).toBe(0);
  });

  test('null on wrong kind or non-array entries', () => {
    expect(parseUseCasePortfolio({ kind: 'nope' }, TS)).toBeNull();
    expect(parseUseCasePortfolio({ kind: 'use-case-portfolio', entries: {} }, TS)).toBeNull();
  });
});

describe('buildLearnerPortfolio', () => {
  test('routes each lab id and picks the latest submission per lab', () => {
    const rows: PortfolioRow[] = [
      { lab_id: '2.15', transcript: { gapPct: 5, actualSpeedupPct: 10, estimatePct: 15 }, created_at: '2026-05-01T00:00:00Z' },
      // newer 2.15 submission should win
      { lab_id: '2.15', transcript: { gapPct: 2, actualSpeedupPct: 20, estimatePct: 22 }, created_at: '2026-05-09T00:00:00Z' },
      { lab_id: '2.8', transcript: { kind: 'calibration', score: 3, maxScore: 6, summary: { calibrated: 3, over: 2, under: 1, unanswered: 0 } }, created_at: TS },
      { lab_id: '2.9', transcript: { kind: 'failure-log', entries: [{ task: 't', date: 'd', error: 'e', caught: 'c', tell: 'x' }] }, created_at: TS },
      { lab_id: '2.11', transcript: { kind: 'use-case-portfolio', entries: [], statement: {} }, created_at: TS },
    ];
    const p = buildLearnerPortfolio(rows);
    expect(p.pairedCalibration?.gapPct).toBe(2); // latest
    expect(p.confidenceCalibration?.score).toBe(3);
    expect(p.failureLog?.entries).toHaveLength(1);
    expect(p.useCasePortfolio).not.toBeNull();
  });

  test('absent or unparseable rows → null artifacts', () => {
    const p = buildLearnerPortfolio([
      { lab_id: '2.15', transcript: { junk: true }, created_at: TS }, // unparseable
    ]);
    expect(p.pairedCalibration).toBeNull();
    expect(p.confidenceCalibration).toBeNull();
    expect(p.failureLog).toBeNull();
    expect(p.useCasePortfolio).toBeNull();
  });
});
