// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { buildGroundingContext } from './LocalTutorFAB';
import type { Module, Phase } from '../types';

// Unit test for the tutor grounding corpus (R7, P5.4-1): grounding is filtered to
// PUBLISHED content and appends each published cell's tutorReference. A draft /
// in_review cell — and its reference — must NOT leak into what the tutor quotes.

const mod = (over: Partial<Module>): Module =>
  ({
    id: 'x',
    cellId: 'x',
    title: 'T',
    type: 'content',
    content: '',
    phaseId: 'stage-1a',
    origin: 'matrix',
    visibility: 'public',
    stage: '1a',
    status: 'published',
    dimension: [],
    evidenceType: 'quiz',
    selfReportValidity: 'na',
    ...over,
  }) as Module;

const phases: Phase[] = [
  {
    id: 'stage-1a',
    title: 'Stage 1a',
    description: '',
    week: '',
    modules: [
      mod({ id: '1.4', title: 'Privacy', content: 'PUBLISHED BODY', tutorReference: 'PUBLISHED REF', status: 'published' }),
      mod({ id: '1.5', title: 'Draft cell', content: 'DRAFT BODY', tutorReference: 'DRAFT REF', status: 'draft' }),
      mod({ id: '1.6', title: 'Review cell', content: 'REVIEW BODY', status: 'in_review' }),
    ],
  },
];

describe('buildGroundingContext', () => {
  test('includes published body + tutorReference', () => {
    const corpus = buildGroundingContext(phases);
    expect(corpus).toContain('Cell 1.4 — Privacy');
    expect(corpus).toContain('PUBLISHED BODY');
    expect(corpus).toContain('PUBLISHED REF');
  });

  test('excludes draft and in_review content and references (R7)', () => {
    const corpus = buildGroundingContext(phases);
    expect(corpus).not.toContain('DRAFT BODY');
    expect(corpus).not.toContain('DRAFT REF');
    expect(corpus).not.toContain('REVIEW BODY');
    expect(corpus).not.toContain('Cell 1.5');
    expect(corpus).not.toContain('Cell 1.6');
  });
});
