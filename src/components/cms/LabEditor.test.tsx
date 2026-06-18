// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LabEditor from './LabEditor';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import type { LabConfig, SorterConfig } from '../../types';

// Stub the network seam; keep the real labValidation (pure inline validators).
const h = vi.hoisted(() => ({ saveDraft: vi.fn(), publishLesson: vi.fn() }));
vi.mock('../../lib/adminContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/adminContent')>();
  return { ...actual, saveDraft: h.saveDraft, publishLesson: h.publishLesson };
});

const reflection: LabConfig = { kind: 'reflection', prompt: 'Reflect on X.', guidance: 'Be specific.', minWords: 50 };
const critique: LabConfig = {
  kind: 'critique',
  brief: { instruction: 'Critique the output.' },
  artifact: { label: 'Draft', bodyMd: '# Draft\n\nbody' },
  rubric: { anchors: [{ id: 'a1', label: 'Accuracy', description: 'Catches errors.' }] },
};

function lesson(overrides: Partial<CmsLessonDetailData> = {}): CmsLessonDetailData {
  return {
    cellId: '2.2',
    title: 'Critique an AI output',
    type: 'lab',
    origin: 'matrix',
    status: 'published',
    stage: '2',
    hasPendingDraft: false,
    archived: false,
    version: 2,
    updatedAt: '2026-06-18T00:00:00Z',
    dimension: ['Discernment'],
    evidenceType: 'work-sample',
    selfReportValidity: 'low',
    bodyMd: 'Live body',
    videoUrl: null,
    tutorReference: null,
    quiz: null,
    labConfig: null,
    sorterConfig: null,
    draft: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.saveDraft.mockReset().mockResolvedValue({ ok: true, action: 'save-draft' });
  h.publishLesson.mockReset().mockResolvedValue({ ok: true, action: 'publish', version: 3 });
});

describe('LabEditor — structured form (scalar kinds)', () => {
  test('seeds the form from an existing reflection config and saves the assembled config', async () => {
    render(<LabEditor lesson={lesson({ labConfig: reflection })} onBack={() => {}} onSaved={() => {}} />);

    // The form fields are seeded (not the JSON fallback).
    expect(screen.getByLabelText('Prompt')).toHaveValue('Reflect on X.');
    expect(screen.queryByLabelText(/lab configuration \(json\)/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(h.saveDraft).toHaveBeenCalledWith('2.2', {
      lab_config_json: { kind: 'reflection', prompt: 'Reflect on X.', guidance: 'Be specific.', minWords: 50 },
    });
  });

  test('Save is blocked + a named error shows when a required field is empty', async () => {
    render(<LabEditor lesson={lesson({ labConfig: reflection })} onBack={() => {}} onSaved={() => {}} />);

    await userEvent.clear(screen.getByLabelText('Prompt'));
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/prompt/i);
  });

  test('Publish saves then promotes draft → live', async () => {
    render(<LabEditor lesson={lesson({ labConfig: reflection })} onBack={() => {}} onSaved={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    expect(h.saveDraft).toHaveBeenCalledTimes(1);
    expect(h.publishLesson).toHaveBeenCalledWith('2.2');
  });

  test('Save merges over an existing draft so a pending body edit survives', async () => {
    render(
      <LabEditor
        lesson={lesson({ labConfig: reflection, draft: { body_md: 'pending body' } })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(h.saveDraft).toHaveBeenCalledWith('2.2', {
      body_md: 'pending body',
      lab_config_json: expect.objectContaining({ kind: 'reflection' }),
    });
  });
});

describe('LabEditor — JSON fallback (complex kinds)', () => {
  test('seeds the JSON editor from an existing critique config and saves valid JSON', async () => {
    render(<LabEditor lesson={lesson({ labConfig: critique })} onBack={() => {}} onSaved={() => {}} />);

    const json = screen.getByLabelText(/lab configuration \(json\)/i);
    expect(json).toHaveValue(JSON.stringify(critique, null, 2));
    expect(screen.getByRole('button', { name: /save draft/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(h.saveDraft).toHaveBeenCalledWith('2.2', { lab_config_json: critique });
  });

  test('malformed JSON blocks Save with a parse error', async () => {
    render(<LabEditor lesson={lesson({ labConfig: critique })} onBack={() => {}} onSaved={() => {}} />);
    const json = screen.getByLabelText(/lab configuration \(json\)/i);

    fireEvent.change(json, { target: { value: '{ not json' } });
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid json/i);
  });

  test('schema-violating JSON blocks Save with a named field error', async () => {
    render(<LabEditor lesson={lesson({ labConfig: critique })} onBack={() => {}} onSaved={() => {}} />);
    const json = screen.getByLabelText(/lab configuration \(json\)/i);

    // Valid JSON, right kind, but an empty rubric → schema violation.
    fireEvent.change(json, {
      target: {
        value: JSON.stringify({
          kind: 'critique',
          brief: { instruction: 'x' },
          artifact: { label: 'L', bodyMd: '' },
          rubric: { anchors: [] },
        }),
      },
    });
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/anchors/i);
  });
});

describe('LabEditor — scenario sorter (sorter_config_json column)', () => {
  const sorter: SorterConfig = {
    kind: 'scenario-sort',
    scenarios: [{ id: 's1', text: 'Draft a memo', correct: 'delegate', rationale: 'low stakes' }],
  };

  test('a cell with only a sorter opens on the sorter and saves sorter_config_json', async () => {
    render(
      <LabEditor
        lesson={lesson({ cellId: '1.3', title: 'Sort the work', labConfig: null, sorterConfig: sorter })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );

    // Opens on the scenario-sorter, seeded as JSON, valid → Save enabled.
    const json = screen.getByLabelText(/lab configuration \(json\)/i);
    expect(json).toHaveValue(JSON.stringify(sorter, null, 2));
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    // Writes the separate sorter_config_json column, not lab_config_json.
    expect(h.saveDraft).toHaveBeenCalledWith('1.3', { sorter_config_json: sorter });
  });

  test('a malformed sorter category blocks Save with a named error', async () => {
    render(
      <LabEditor
        lesson={lesson({ cellId: '1.3', labConfig: null, sorterConfig: sorter })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    const json = screen.getByLabelText(/lab configuration \(json\)/i);
    fireEvent.change(json, {
      target: { value: JSON.stringify({ kind: 'scenario-sort', scenarios: [{ id: 's1', text: 't', correct: 'nope', rationale: 'r' }] }) },
    });
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/correct must be one of/i);
  });
});

describe('LabEditor — kind switch', () => {
  test('switching kind clears stale fields and requires the new kind’s shape', async () => {
    render(<LabEditor lesson={lesson({ labConfig: reflection })} onBack={() => {}} onSaved={() => {}} />);

    // Start on the reflection form (valid → Save enabled).
    expect(screen.getByRole('button', { name: /save draft/i })).toBeEnabled();

    // Switch to a JSON kind: the form is replaced by a skeleton that is missing
    // required fields, so Save is blocked (the reflection fields can't leak through).
    await userEvent.selectOptions(screen.getByLabelText(/lab kind/i), 'critique');
    expect(screen.getByLabelText(/lab configuration \(json\)/i)).toHaveValue('{\n  "kind": "critique"\n}');
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
  });
});
