// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizEditor from './QuizEditor';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import type { QuizQuestionDraft } from '../../lib/adminContent';

// Stub the network seam; keep the real validateQuizQuestions (pure inline validator).
const h = vi.hoisted(() => ({ saveDraft: vi.fn(), publishLesson: vi.fn() }));
vi.mock('../../lib/adminContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/adminContent')>();
  return { ...actual, saveDraft: h.saveDraft, publishLesson: h.publishLesson };
});

const q = (overrides: Partial<QuizQuestionDraft> = {}): QuizQuestionDraft => ({
  question: 'What is 2 + 2?',
  options: ['3', '4', '5', '6'],
  correctIndex: 1,
  explanation: 'It is 4.',
  ...overrides,
});

function lesson(overrides: Partial<CmsLessonDetailData> = {}): CmsLessonDetailData {
  return {
    cellId: '1.1',
    title: 'Rules of the road',
    type: 'content',
    origin: 'matrix',
    status: 'published',
    stage: '1a',
    hasPendingDraft: false,
    archived: false,
    version: 3,
    updatedAt: '2026-06-18T00:00:00Z',
    dimension: ['Delegation'],
    evidenceType: 'quiz',
    selfReportValidity: 'low',
    bodyMd: 'Live body',
    videoUrl: null,
    tutorReference: null,
    quiz: [q()],
    labConfig: null,
    sorterConfig: null,
    draft: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.saveDraft.mockReset().mockResolvedValue({ ok: true, action: 'save-draft' });
  h.publishLesson.mockReset().mockResolvedValue({ ok: true, action: 'publish', version: 4 });
});

describe('QuizEditor (P5.4-4)', () => {
  test('seeds from the staged draft quiz over the live quiz', () => {
    render(
      <QuizEditor
        lesson={lesson({ quiz: [q({ question: 'Live Q' })], draft: { quiz_json: [q({ question: 'Draft Q' })] } })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByLabelText(/question text/i)).toHaveValue('Draft Q');
  });

  test('a single-question quiz is valid and Save posts the assembled quiz_json', async () => {
    const onSaved = vi.fn();
    render(<QuizEditor lesson={lesson()} onBack={() => {}} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(h.saveDraft).toHaveBeenCalledWith('1.1', { quiz_json: [q()] });
    expect(h.publishLesson).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(/quiz draft saved/i);
  });

  test('editing the correct option is reflected in the saved quiz', async () => {
    render(<QuizEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);

    // Live correct answer is option 2 (index 1); mark option 3 (index 2) instead.
    await userEvent.click(screen.getByLabelText(/mark question 1 option 3 correct/i));
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(h.saveDraft).toHaveBeenCalledWith('1.1', { quiz_json: [q({ correctIndex: 2 })] });
  });

  test('adding then filling a question saves both questions', async () => {
    render(<QuizEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /add question/i }));
    // The new (second) question is blank → the quiz is invalid until filled.
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();

    // "Question text" repeats per question; scope to the 2nd fieldset (role=group).
    const q2 = screen.getAllByRole('group')[1];
    await userEvent.type(within(q2).getByLabelText(/question text/i), 'Capital of France?');
    await userEvent.type(screen.getByLabelText('Question 2 option 1'), 'Paris');
    await userEvent.type(screen.getByLabelText('Question 2 option 2'), 'Lyon');
    await userEvent.type(screen.getByLabelText('Question 2 option 3'), 'Nice');
    await userEvent.type(screen.getByLabelText('Question 2 option 4'), 'Metz');

    const saveBtn = screen.getByRole('button', { name: /save draft/i });
    expect(saveBtn).toBeEnabled();
    await userEvent.click(saveBtn);

    expect(h.saveDraft).toHaveBeenCalledWith('1.1', {
      quiz_json: [
        q(),
        { question: 'Capital of France?', options: ['Paris', 'Lyon', 'Nice', 'Metz'], correctIndex: 0, explanation: '' },
      ],
    });
  });

  test('removing a question drops it from the saved quiz', async () => {
    render(
      <QuizEditor
        lesson={lesson({ quiz: [q({ question: 'Keep me' }), q({ question: 'Remove me' })] })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove question 2/i }));
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(h.saveDraft).toHaveBeenCalledWith('1.1', { quiz_json: [q({ question: 'Keep me' })] });
  });

  test('an invalid quiz blocks Save/Publish with an inline message', async () => {
    render(<QuizEditor lesson={lesson({ quiz: null })} onBack={() => {}} onSaved={() => {}} />);

    // No live/draft quiz → one blank question seeded; its text is empty → invalid.
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
    expect(screen.getByText(/enter the question text/i)).toBeInTheDocument();
  });

  test('reordering preserves each question’s correctIndex association', async () => {
    render(
      <QuizEditor
        lesson={lesson({
          quiz: [
            q({ question: 'First', correctIndex: 0 }),
            q({ question: 'Second', correctIndex: 3 }),
          ],
        })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    // Move the first question down — order swaps, correctIndex travels with each.
    await userEvent.click(screen.getByRole('button', { name: /move question 1 down/i }));
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(h.saveDraft).toHaveBeenCalledWith('1.1', {
      quiz_json: [q({ question: 'Second', correctIndex: 3 }), q({ question: 'First', correctIndex: 0 })],
    });
  });

  test('Save merges the quiz over an existing draft (preserves a pending body edit)', async () => {
    render(
      <QuizEditor
        lesson={lesson({ draft: { body_md: 'Pending body' } })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(h.saveDraft).toHaveBeenCalledWith('1.1', { body_md: 'Pending body', quiz_json: [q()] });
  });

  test('Publish saves the working copy then promotes it live', async () => {
    render(<QuizEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));

    expect(h.saveDraft).toHaveBeenCalledTimes(1);
    expect(h.publishLesson).toHaveBeenCalledWith('1.1');
    expect(await screen.findByRole('status')).toHaveTextContent(/published/i);
  });

  test('a failed save surfaces an error and keeps the edits', async () => {
    h.saveDraft.mockRejectedValueOnce(new Error('Only an admin may edit content.'));
    render(<QuizEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only an admin/i);
    // The question text is still in the editor (not silently dropped).
    expect(screen.getByLabelText(/question text/i)).toHaveValue('What is 2 + 2?');
  });
});
