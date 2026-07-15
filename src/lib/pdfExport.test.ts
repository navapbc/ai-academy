import { describe, it, expect } from 'vitest';
import {
  buildEvidencePdfModel,
  buildPdfFilename,
  renderEvidencePdf,
  toPdfSafeText,
} from './pdfExport';
import type { EvidenceRow } from './evidenceExport';

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

describe('toPdfSafeText', () => {
  it('replaces the section sign with "Section "', () => {
    expect(toPdfSafeText('M-25-21 §4: X')).toBe('M-25-21 Section 4: X');
  });

  it('collapses a space after the section sign', () => {
    expect(toPdfSafeText('§ 4')).toBe('Section 4');
  });

  it('replaces em and en dashes with a hyphen', () => {
    expect(toPdfSafeText('Literacy — Foundation – Skills')).toBe(
      'Literacy - Foundation - Skills',
    );
  });

  it('replaces smart quotes and ellipsis', () => {
    expect(toPdfSafeText('“hi” ‘x’ …')).toBe('"hi" \'x\' ...');
  });

  it('leaves plain ASCII unchanged', () => {
    expect(toPdfSafeText('DOL: AI Literacy 90%')).toBe('DOL: AI Literacy 90%');
  });

  it('preserves accented Latin (cp1252 renders it correctly)', () => {
    expect(toPdfSafeText('Aldo Pérez')).toBe('Aldo Pérez');
    expect(toPdfSafeText('Müller Núñez')).toBe('Müller Núñez');
  });

  it('replaces characters outside cp1252 (CJK, Cyrillic) with "?"', () => {
    expect(toPdfSafeText('徐伟 Xu')).toBe('?? Xu');
    expect(toPdfSafeText('Владимир')).toBe('????????');
  });
});

describe('buildEvidencePdfModel', () => {
  it('returns an empty model with no sections for no rows', () => {
    const model = buildEvidencePdfModel([], { generatedAt: '2026-06-26T12:00:00Z' });
    expect(model.sections).toEqual([]);
    expect(model.learnerCount).toBe(0);
    expect(model.rowCount).toBe(0);
    expect(model.cohortLabel).toBe('All cohorts');
    expect(model.generatedAt).toBe('2026-06-26');
  });

  it('groups rows into one section per learner, preserving order', () => {
    const rows = [
      makeRow({ learnerId: 'a', learnerName: 'Alice', cellId: '1.1' }),
      makeRow({ learnerId: 'a', learnerName: 'Alice', cellId: '1.2' }),
      makeRow({ learnerId: 'b', learnerName: 'Bob', cellId: '1.1' }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections).toHaveLength(2);
    expect(model.sections[0].learnerName).toBe('Alice');
    expect(model.sections[0].rows).toHaveLength(2);
    expect(model.sections[0].rows.map((r) => r.cellId)).toEqual(['1.1', '1.2']);
    expect(model.sections[1].learnerName).toBe('Bob');
    expect(model.learnerCount).toBe(2);
    expect(model.rowCount).toBe(3);
  });

  it('renders a dual-enrolled learner (deduped upstream, U5) as one section with the joined cohort label', () => {
    // fetchCohortEvidence dedups learner×cohort rows in all-cohorts mode, so a
    // dual-enrolled learner arrives as one row per module with a joined label.
    const rows = [
      makeRow({ learnerId: 'a', cellId: '1.1', cohortId: 'c1 | c2', cohortName: 'Cohort A | Cohort B' }),
      makeRow({ learnerId: 'a', cellId: '1.2', cohortId: 'c1 | c2', cohortName: 'Cohort A | Cohort B' }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].rows.map((r) => r.cellId)).toEqual(['1.1', '1.2']); // no per-cohort duplication
    expect(model.sections[0].cohortName).toBe('Cohort A | Cohort B');
  });

  it('counts completed modules per learner', () => {
    const rows = [
      makeRow({ learnerId: 'a', cellId: '1.1', completed: true }),
      makeRow({ learnerId: 'a', cellId: '1.2', completed: false }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections[0].completedCount).toBe(1);
    expect(model.sections[0].moduleCount).toBe(2);
  });

  it('formats quiz score as a percent, or a hyphen when null', () => {
    const rows = [
      makeRow({ learnerId: 'a', cellId: '1.1', quizScore: 0.9 }),
      makeRow({ learnerId: 'a', cellId: '1.2', quizScore: null }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections[0].rows[0].quiz).toBe('90%');
    expect(model.sections[0].rows[1].quiz).toBe('-');
  });

  it('renders Done as Yes/No', () => {
    const rows = [
      makeRow({ learnerId: 'a', cellId: '1.1', completed: true }),
      makeRow({ learnerId: 'a', cellId: '1.2', completed: false }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections[0].rows[0].completed).toBe('Yes');
    expect(model.sections[0].rows[1].completed).toBe('No');
  });

  it('formats lab status and score, with hyphens when absent', () => {
    const rows = [
      makeRow({
        learnerId: 'a',
        cellId: '2.1',
        labStatus: 'reviewed',
        labOverallScore: 0.75,
      }),
      makeRow({ learnerId: 'a', cellId: '2.2', labStatus: null, labOverallScore: null }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections[0].rows[0].labStatus).toBe('reviewed');
    expect(model.sections[0].rows[0].labScore).toBe('75%');
    expect(model.sections[0].rows[1].labStatus).toBe('-');
    expect(model.sections[0].rows[1].labScore).toBe('-');
  });

  it('combines and sanitizes the three crosswalk claim sets', () => {
    const rows = [
      makeRow({
        learnerId: 'a',
        dolClaims: ['DOL: Foundation'],
        euAiActClaims: ['EU AI Act Art. 4: General'],
        m2521Claims: ['M-25-21 §4: Foundation — Skills'],
      }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    const claims = model.sections[0].rows[0].claims;
    // No raw § or em dash survives into the PDF model.
    expect(claims).not.toMatch(/[§—–]/);
    expect(claims).toContain('DOL: Foundation');
    expect(claims).toContain('M-25-21 Section 4: Foundation - Skills');
  });

  it('renders a hyphen when a row has no crosswalk claims', () => {
    const rows = [
      makeRow({ learnerId: 'a', dolClaims: [], euAiActClaims: [], m2521Claims: [] }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections[0].rows[0].claims).toBe('-');
  });

  it('uses the cohort name as the label when provided', () => {
    const model = buildEvidencePdfModel([], { cohortName: 'Cohort A' });
    expect(model.cohortLabel).toBe('Cohort A');
  });

  it('falls back to a hyphen email and "No cohort" label per section', () => {
    const rows = [
      makeRow({ learnerId: 'a', learnerEmail: null, cohortName: null }),
    ];
    const model = buildEvidencePdfModel(rows, {});
    expect(model.sections[0].learnerEmail).toBe('-');
    expect(model.sections[0].cohortName).toBe('No cohort');
  });
});

describe('buildPdfFilename', () => {
  it('slugs the cohort name and appends the date with a .pdf extension', () => {
    expect(buildPdfFilename('Cohort A', '2026-06-26T12:00:00Z')).toBe(
      'cohort-evidence-cohort-a-2026-06-26.pdf',
    );
  });

  it('falls back to all-cohorts when no cohort name is given', () => {
    expect(buildPdfFilename(undefined, '2026-06-26T00:00:00Z')).toBe(
      'cohort-evidence-all-cohorts-2026-06-26.pdf',
    );
  });

  it('collapses special characters in the slug', () => {
    expect(buildPdfFilename('Q3 / 2026 — Pilot!', '2026-06-26T00:00:00Z')).toBe(
      'cohort-evidence-q3-2026-pilot-2026-06-26.pdf',
    );
  });
});

describe('renderEvidencePdf', () => {
  // jsPDF is pure JS and runs under the node test environment; we inspect the
  // generated PDF bytes (latin1) to prove the rendering boundary is render-safe.
  function pdfText(rows: EvidenceRow[]): string {
    const model = buildEvidencePdfModel(rows, { generatedAt: '2026-06-26T00:00:00Z' });
    const doc = renderEvidencePdf(model);
    const buf = doc.output('arraybuffer');
    return new TextDecoder('latin1').decode(buf);
  }

  it('produces a valid PDF for an empty model', () => {
    const text = pdfText([]);
    expect(text.startsWith('%PDF')).toBe(true);
  });

  it('emits no raw § or em/en dash and renders the sanitized crosswalk text', () => {
    const text = pdfText([
      makeRow({ m2521Claims: ['M-25-21 §4: Foundation — Skills'] }),
    ]);
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text).toContain('Section 4');
    expect(text).not.toMatch(/[§—–]/);
  });

  it('does not emit raw multibyte bytes for a non-cp1252 learner name', () => {
    const text = pdfText([makeRow({ learnerName: '徐伟' })]);
    expect(text.startsWith('%PDF')).toBe(true);
    // The CJK code points must not survive into the PDF byte stream.
    expect(text).not.toContain('徐');
    expect(text).not.toContain('伟');
  });
});
