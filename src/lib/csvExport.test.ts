import { describe, it, expect } from 'vitest';
import { serializeEvidenceCsv, buildCsvFilename } from './csvExport';
import type { EvidenceRow } from './evidenceExport';

const BOM = '﻿';

function makeRow(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    learnerId: 'uid-1',
    learnerName: 'Alice Smith',
    learnerEmail: 'alice@navapbc.com',
    cohortId: 'coh-1',
    cohortName: 'Cohort A',
    cellId: '1.1',
    cellTitle: 'AI Foundations',
    stage: '1a',
    dimensions: ['Foundation'],
    evidenceType: 'quiz',
    completed: true,
    completedAt: '2026-06-01T00:00:00Z',
    quizScore: 0.9,
    quizPassed: true,
    quizAttemptCount: 2,
    bestQuizAttemptedAt: '2026-06-01T00:00:00Z',
    labStatus: null,
    labSubmittedAt: null,
    labReviewedAt: null,
    labReviewerEmail: null,
    labOverallScore: null,
    labAnchorScores: null,
    dolClaims: ['DOL: AI Literacy Foundation Competencies'],
    euAiActClaims: ['EU AI Act Art. 4: General AI Literacy'],
    m2521Claims: ['M-25-21 §4: AI Literacy — Foundation Skills'],
    ...overrides,
  };
}

describe('serializeEvidenceCsv', () => {
  it('empty rows → BOM + header only', () => {
    const csv = serializeEvidenceCsv([]);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(BOM.length).split('\r\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"Learner ID"');
    expect(lines[0]).toContain('"Cell Title"');
  });

  it('single row with all nullable fields null → empty quoted cells', () => {
    const row = makeRow({
      learnerEmail: null,
      cohortId: null,
      cohortName: null,
      stage: null,
      completedAt: null,
      quizScore: null,
      quizPassed: null,
      quizAttemptCount: 0,
      bestQuizAttemptedAt: null,
      labStatus: null,
      labSubmittedAt: null,
      labReviewedAt: null,
      labReviewerEmail: null,
      labOverallScore: null,
    });
    const csv = serializeEvidenceCsv([row]);
    const lines = csv.slice(BOM.length).split('\r\n');
    expect(lines).toHaveLength(2);
    // null fields render as ""
    expect(lines[1]).toContain('""');
  });

  it('field with a comma → wrapped in quotes', () => {
    const row = makeRow({ learnerName: 'Smith, Alice' });
    const csv = serializeEvidenceCsv([row]);
    const dataLine = csv.slice(BOM.length).split('\r\n')[1];
    expect(dataLine).toContain('"Smith, Alice"');
  });

  it('field with a double-quote → doubled inside the quoted cell', () => {
    const row = makeRow({ cellTitle: 'Say "Hello"' });
    const csv = serializeEvidenceCsv([row]);
    const dataLine = csv.slice(BOM.length).split('\r\n')[1];
    expect(dataLine).toContain('"Say ""Hello"""');
  });

  it('field starting with = → prefixed with single-quote (formula injection guard)', () => {
    const row = makeRow({ learnerName: '=SUM(A1)' });
    const csv = serializeEvidenceCsv([row]);
    const dataLine = csv.slice(BOM.length).split('\r\n')[1];
    expect(dataLine).toContain("\"'=SUM(A1)\"");
  });

  it('array fields → joined with " | "', () => {
    const row = makeRow({ dimensions: ['Delegation', 'Discernment'] });
    const csv = serializeEvidenceCsv([row]);
    const dataLine = csv.slice(BOM.length).split('\r\n')[1];
    expect(dataLine).toContain('"Delegation | Discernment"');
  });

  it('quizScore and labOverallScore render as percent strings', () => {
    const row = makeRow({ quizScore: 0.857, labOverallScore: 0.5 });
    const csv = serializeEvidenceCsv([row]);
    const dataLine = csv.slice(BOM.length).split('\r\n')[1];
    expect(dataLine).toContain('"86%"');
    expect(dataLine).toContain('"50%"');
  });
});

describe('buildCsvFilename', () => {
  it('uses cohort name slug and date', () => {
    const name = buildCsvFilename('Cohort Alpha', '2026-06-26T00:00:00Z');
    expect(name).toBe('cohort-evidence-cohort-alpha-2026-06-26.csv');
  });

  it('falls back to all-cohorts when no name given', () => {
    const name = buildCsvFilename(undefined, '2026-06-26T00:00:00Z');
    expect(name).toBe('cohort-evidence-all-cohorts-2026-06-26.csv');
  });

  it('strips special characters from cohort name', () => {
    const name = buildCsvFilename('Q1 / 2026 (Pilot)', '2026-06-26T00:00:00Z');
    expect(name).toBe('cohort-evidence-q1-2026-pilot-2026-06-26.csv');
  });
});
