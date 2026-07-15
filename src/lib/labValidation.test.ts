import { describe, test, expect } from 'vitest';
import {
  validateLabConfig,
  parseAndValidateLabConfig,
  validateSorterConfig,
  parseAndValidateSorterConfig,
  LAB_KINDS,
  FORM_LAB_KINDS,
  LAB_KIND_LABELS,
} from './labValidation';

// Pins the client mirror to representative cases. The Deno core
// (admin-content-core.ts) is authoritative and proven against all seeded content
// by admin-content-core.seed.test.ts; this guards that the client mirror agrees.

describe('validateLabConfig — structural', () => {
  test('rejects non-objects and unknown kinds', () => {
    expect(validateLabConfig(null).ok).toBe(false);
    expect(validateLabConfig([]).ok).toBe(false);
    expect(validateLabConfig({ kind: 'nope' }).ok).toBe(false);
    expect(validateLabConfig({}).ok).toBe(false);
  });
});

describe('validateLabConfig — per kind', () => {
  test('reflection', () => {
    expect(validateLabConfig({ kind: 'reflection', prompt: 'p', guidance: 'g', minWords: 50 }).ok).toBe(true);
    expect(validateLabConfig({ kind: 'reflection', prompt: 'p', guidance: 'g', minWords: -1 }).ok).toBe(false);
    expect(validateLabConfig({ kind: 'reflection', guidance: 'g', minWords: 0 }).ok).toBe(false);
  });

  test('failure-log', () => {
    const good = { kind: 'failure-log', title: 't', helper: 'h', minEntries: 3, targetEntries: 6 };
    expect(validateLabConfig(good).ok).toBe(true);
    expect(validateLabConfig({ ...good, minEntries: 0 }).ok).toBe(false);
  });

  test('paired-calibration', () => {
    const good = { kind: 'paired-calibration', offTask: { label: 'A', brief: 'b' }, onTask: { label: 'B', brief: 'b' } };
    expect(validateLabConfig(good).ok).toBe(true);
    expect(validateLabConfig({ ...good, offTask: { label: 'A' } }).ok).toBe(false);
  });

  test('scenario family requires exactly-4 options + takeaway', () => {
    const item = { prompt: 'p', options: ['a', 'b', 'c', 'd'], correctIndex: 1, why: 'w' };
    const good = { kind: 'regulatory-check', items: [item], takeaway: { title: 't', intro: 'i' } };
    expect(validateLabConfig(good).ok).toBe(true);
    expect(validateLabConfig({ ...good, items: [{ ...item, options: ['a', 'b', 'c'] }] }).ok).toBe(false);
  });

  test('critique requires brief/artifact/rubric', () => {
    const good = {
      kind: 'critique',
      brief: { instruction: 'do' },
      artifact: { label: 'L', bodyMd: 'm' },
      rubric: { anchors: [{ id: 'a', label: 'L', description: 'd' }] },
    };
    expect(validateLabConfig(good).ok).toBe(true);
    expect(validateLabConfig({ ...good, rubric: { anchors: [] } }).ok).toBe(false);
  });

  test('chat-compare requires 1–4 panes of optional string fields', () => {
    const good = {
      kind: 'chat-compare',
      panes: [
        { label: 'Plain Claude' },
        { label: 'Rigged', systemPromptMd: 'Answer confidently.' },
        { label: 'Grounded', sourceMd: '# Policy' },
      ],
      suggestedPrompts: ['What does the policy say?'],
    };
    expect(validateLabConfig(good).ok).toBe(true);
    expect(validateLabConfig({ kind: 'chat-compare', panes: [{}] }).ok).toBe(true);
    expect(validateLabConfig({ kind: 'chat-compare', panes: [] }).ok).toBe(false);
    expect(validateLabConfig({ kind: 'chat-compare', panes: [{}, {}, {}, {}, {}] }).ok).toBe(false);
    expect(validateLabConfig({ kind: 'chat-compare', panes: [{ label: 1 }] }).ok).toBe(false);
    expect(validateLabConfig({ ...good, suggestedPrompts: 'nope' }).ok).toBe(false);
  });

  test('glat threshold + sections', () => {
    const good = {
      kind: 'glat',
      passThreshold: 0.8,
      sectionA: [{ id: 'A1', prompt: 'p' }],
      sectionBC: [{ id: 'B1', question: 'q', options: ['T', 'F'], correctIndex: 0, rationale: 'r' }],
    };
    expect(validateLabConfig(good).ok).toBe(true);
    expect(validateLabConfig({ ...good, passThreshold: 2 }).ok).toBe(false);
  });
});

describe('parseAndValidateLabConfig', () => {
  test('reports a parse error on malformed JSON', () => {
    const r = parseAndValidateLabConfig('{ not json', 'reflection');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Invalid JSON/);
  });

  test('rejects a kind that differs from the expected kind', () => {
    const r = parseAndValidateLabConfig(
      JSON.stringify({ kind: 'critique', prompt: 'p', guidance: 'g', minWords: 1 }),
      'reflection',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must stay "reflection"/);
  });

  test('accepts valid JSON of the expected kind', () => {
    const r = parseAndValidateLabConfig(
      JSON.stringify({ kind: 'reflection', prompt: 'p', guidance: 'g', minWords: 25 }),
      'reflection',
    );
    expect(r.ok).toBe(true);
  });

  test('surfaces a schema violation as a named error', () => {
    const r = parseAndValidateLabConfig(
      JSON.stringify({ kind: 'reflection', prompt: 'p', guidance: 'g' }),
      'reflection',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/minWords/);
  });
});

describe('validateSorterConfig (scenario-sorter, separate column)', () => {
  const good = {
    kind: 'scenario-sort',
    scenarios: [{ id: 's1', text: 'Draft a memo', correct: 'delegate', rationale: 'low stakes' }],
  };

  test('accepts a well-formed sorter', () => {
    expect(validateSorterConfig(good).ok).toBe(true);
  });

  test('rejects wrong kind, empty scenarios, and a bad category', () => {
    expect(validateSorterConfig({ ...good, kind: 'reflection' }).ok).toBe(false);
    expect(validateSorterConfig({ kind: 'scenario-sort', scenarios: [] }).ok).toBe(false);
    expect(
      validateSorterConfig({ kind: 'scenario-sort', scenarios: [{ id: 's1', text: 't', correct: 'maybe', rationale: 'r' }] }).ok,
    ).toBe(false);
  });

  test('parseAndValidateSorterConfig reports parse errors and validates', () => {
    expect(parseAndValidateSorterConfig('{ bad').ok).toBe(false);
    expect(parseAndValidateSorterConfig(JSON.stringify(good)).ok).toBe(true);
  });
});

describe('metadata', () => {
  test('every kind has a label and the form set is a subset', () => {
    for (const k of LAB_KINDS) expect(LAB_KIND_LABELS[k]).toBeTruthy();
    for (const k of FORM_LAB_KINDS) expect(LAB_KINDS).toContain(k);
  });
});
