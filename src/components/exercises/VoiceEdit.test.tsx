// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import VoiceEdit from './VoiceEdit';
import type { VoiceEditConfig } from '../../types';

// The voice-edit exercise (P4.4b): read a dense source + a writing brief,
// generate an AI FIRST DRAFT live (streamChat), then revise it "AI off" in your
// own voice — restoring specifics the draft dropped/generalized and fixing
// reading level + tone. The revision is graded in place by the P4.2 LLM-judge
// against three sections (Source + AI first draft + the revision). Like the other
// graded-practice exercises it records a lab_submissions row but is NOT the
// completion gate (the inline quiz is) — structurally enforced by the absence of
// an onComplete prop. These tests mock the data/grading/streaming layers and
// confirm: phase-1 generate streams a draft and prefills the revision, the
// min-words gate, save → three-section grade → result card, and the quiet
// grading-failure path.
const { recordLabSubmission, saveGrade, requestLlmGrade, streamChat } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  saveGrade: vi.fn(async () => {}),
  requestLlmGrade: vi.fn(async () => ({
    grader: 'llm' as const,
    perAnchor: [{ id: 'a', label: 'Keep every specific', score: 2, max: 2, rationale: 'Kept them.' }],
    overall: 2,
    maxOverall: 2,
  })),
  // Mirrors src/lib/llm.ts streamChat(messages, options, onChunk): emit a canned
  // (flat, specifics-dropping) draft via the chunk callback, then resolve.
  streamChat: vi.fn(async (_messages: unknown, _options: unknown, onChunk: (t: string) => void) => {
    onChunk('Your child care benefits are up for review. Please send your documents soon to keep your help.');
  }),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission, saveGrade }));
vi.mock('../../lib/grading', () => ({ requestLlmGrade }));
vi.mock('../../lib/llm', () => ({ streamChat }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  saveGrade.mockClear();
  requestLlmGrade.mockClear();
  streamChat.mockClear();
});

const config: VoiceEditConfig = {
  kind: 'voice-edit',
  title: 'Voice-edit the notice',
  brief: {
    instruction: 'Turn this internal case note into a plain-language notice for the parent.',
    constraints: ['About 150 words or fewer.', 'Sixth-grade reading level.', 'End with one clear next step.'],
  },
  source: {
    label: 'Internal case note — Child Care Subsidy redetermination',
    bodyMd:
      'Submit Form CCS-9 and two most recent pay stubs by August 15, 2026. Monthly copay rises from $45 to $72 on September 1, 2026. If not received, the subsidy ends August 31, 2026.',
  },
  rubric: {
    anchors: [{ id: 'a', label: 'Keep every specific', description: 'Keeps the form, the stubs, the dates, the copay.' }],
  },
};

const goodRevision =
  'Your child care help is up for its yearly review. To keep it, send us two things by August 15, ' +
  '2026: a completed Form CCS-9 and your two most recent pay stubs. If you still qualify, your ' +
  'monthly payment changes from $45 to $72 starting September 1, 2026. If we do not get your form ' +
  'by August 15, your help ends on August 31, 2026. Next step: return Form CCS-9 and your two pay ' +
  'stubs by August 15, 2026.';

async function generateDraft() {
  fireEvent.click(screen.getByRole('button', { name: /Generate AI first draft/i }));
  // After the stream completes, the revision textarea is prefilled with the draft.
  await waitFor(() =>
    expect((screen.getByLabelText(/Your revision/i) as HTMLTextAreaElement).value).toContain(
      'send your documents soon',
    ),
  );
}

describe('VoiceEdit', () => {
  test('phase 1: renders the source, brief, and constraints', () => {
    render(<VoiceEdit config={config} labId="2.6" />);
    expect(screen.getByText('Internal case note — Child Care Subsidy redetermination')).toBeInTheDocument();
    expect(screen.getByText(/Turn this internal case note/)).toBeInTheDocument();
    expect(screen.getByText(/Sixth-grade reading level/)).toBeInTheDocument();
    // No revision textarea until a draft has been generated.
    expect(screen.queryByLabelText(/Your revision/i)).not.toBeInTheDocument();
  });

  test('generate streams an AI draft and prefills the revision', async () => {
    render(<VoiceEdit config={config} labId="2.6" />);
    await generateDraft();
    expect(streamChat).toHaveBeenCalledTimes(1);
    // The streamed draft also shows read-only as the "AI first draft".
    expect(screen.getAllByText(/send your documents soon/i).length).toBeGreaterThan(0);
  });

  test('Save is disabled below the word floor and enabled above it', async () => {
    render(<VoiceEdit config={config} labId="2.6" />);
    await generateDraft();
    const textarea = screen.getByLabelText(/Your revision/i);
    const save = () => screen.getByRole('button', { name: /Save revision/i });

    fireEvent.change(textarea, { target: { value: 'too short' } });
    expect(save()).toBeDisabled();

    fireEvent.change(textarea, { target: { value: goodRevision } });
    expect(save()).toBeEnabled();
  });

  test('on Save: records a voice-edit submission, grades the revision against three sections, shows the card', async () => {
    render(<VoiceEdit config={config} labId="2.6" />);
    await generateDraft();
    fireEvent.change(screen.getByLabelText(/Your revision/i), { target: { value: goodRevision } });
    fireEvent.click(screen.getByRole('button', { name: /Save revision/i }));

    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());

    expect(recordLabSubmission).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        labId: '2.6',
        status: 'submitted',
        transcript: expect.objectContaining({
          kind: 'voice-edit',
          draft: expect.stringContaining('send your documents soon'),
          revision: expect.stringContaining('Form CCS-9'),
        }),
      }),
    );
    expect(requestLlmGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        rubric: config.rubric,
        submission: expect.objectContaining({
          brief: config.brief.instruction,
          sections: expect.arrayContaining([
            expect.objectContaining({ label: 'Source' }),
            expect.objectContaining({ label: 'AI first draft' }),
            expect.objectContaining({ label: "The learner's revision" }),
          ]),
        }),
      }),
    );
    // The judge reads exactly the three labelled sections (no more, no fewer).
    const gradeCalls = requestLlmGrade.mock.calls as unknown as Array<
      [{ submission: { sections: unknown[] } }]
    >;
    expect(gradeCalls[0][0].submission.sections).toHaveLength(3);
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.anything(), 'reviewable');
  });

  test('shows a quiet, non-blocking note when grading fails (revision still saved)', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<VoiceEdit config={config} labId="2.6" />);
    await generateDraft();
    fireEvent.change(screen.getByLabelText(/Your revision/i), { target: { value: goodRevision } });
    fireEvent.click(screen.getByRole('button', { name: /Save revision/i }));

    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());
    expect(recordLabSubmission).toHaveBeenCalled();
    expect(screen.queryByText('Anchor-scored feedback')).not.toBeInTheDocument();
  });
});
