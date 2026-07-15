// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LessonEditor from './LessonEditor';
import type { CmsLessonDetailData } from '../../lib/cmsContent';

// Stub the network seam; keep the real isValidVideoUrl (pure inline validator).
const h = vi.hoisted(() => ({ saveDraft: vi.fn(), publishLesson: vi.fn() }));
vi.mock('../../lib/adminContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/adminContent')>();
  return { ...actual, saveDraft: h.saveDraft, publishLesson: h.publishLesson };
});

function lesson(overrides: Partial<CmsLessonDetailData> = {}): CmsLessonDetailData {
  return {
    cellId: '2.9',
    title: 'Spotting failure',
    type: 'content',
    origin: 'matrix',
    status: 'published',
    stage: '2',
    hasPendingDraft: false,
    archived: false,
    version: 3,
    updatedAt: '2026-06-18T00:00:00Z',
    dimension: ['Discernment'],
    evidenceType: 'quiz',
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
  h.publishLesson.mockReset().mockResolvedValue({ ok: true, action: 'publish', version: 4 });
});

describe('LessonEditor (P5.4-3)', () => {
  test('typing markdown updates the live preview via the shared learner renderer', async () => {
    render(<LessonEditor lesson={lesson({ bodyMd: '' })} onBack={() => {}} onSaved={() => {}} />);
    const body = screen.getByLabelText(/lesson body/i);
    await userEvent.type(body, '## Heading text');

    // LessonMarkdown (the learner renderer) turns the markdown into a real heading.
    const preview = screen.getByLabelText('Live preview');
    expect(within(preview).getByRole('heading', { name: 'Heading text' })).toBeInTheDocument();
  });

  test('seeds the working copy from a staged draft over the live content', () => {
    render(
      <LessonEditor
        lesson={lesson({ bodyMd: 'Live body', draft: { body_md: 'Draft body' } })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByLabelText(/lesson body/i)).toHaveValue('Draft body');
  });

  test('Save posts a save-draft with the edited fields and notifies the parent', async () => {
    const onSaved = vi.fn();
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={onSaved} />);

    await userEvent.clear(screen.getByLabelText(/lesson body/i));
    await userEvent.type(screen.getByLabelText(/lesson body/i), 'Edited body');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(h.saveDraft).toHaveBeenCalledWith('2.9', {
      body_md: 'Edited body',
      video_url: null,
      tutor_reference_md: null,
    });
    expect(h.publishLesson).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(/draft saved/i);
  });

  test('a text-only save preserves other pending draft fields (quiz/lab)', async () => {
    const quizDraft = [{ question: 'Q', options: ['a', 'b'], correctIndex: 0, explanation: '' }];
    render(
      <LessonEditor
        lesson={lesson({ draft: { quiz_json: quizDraft } })}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText(/lesson body/i), ' extra');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    // The save merges over the existing draft — the pending quiz_json survives.
    expect(h.saveDraft).toHaveBeenCalledWith('2.9', {
      quiz_json: quizDraft,
      body_md: 'Live body extra',
      video_url: null,
      tutor_reference_md: null,
    });
  });

  test('Publish saves the working copy then promotes it live (no note by default)', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));

    expect(h.saveDraft).toHaveBeenCalledTimes(1);
    // Empty change-note → passed as '' to the creator, which omits it server-side
    // (X.2); reset unchecked → false (U10).
    expect(h.publishLesson).toHaveBeenCalledWith('2.9', '', false);
    expect(await screen.findByRole('status')).toHaveTextContent(/published/i);
  });

  test('Publish threads the optional change-note through to publishLesson (X.2)', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.type(screen.getByLabelText(/what changed/i), 'Fixed the reflection prompt');
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));

    expect(h.publishLesson).toHaveBeenCalledWith('2.9', 'Fixed the reflection prompt', false);
  });

  test('clears the change-note field after a successful publish (X.2)', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    const noteField = screen.getByLabelText(/what changed/i);
    await userEvent.type(noteField, 'Fixed the reflection prompt');
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));

    // On success the editor resets the note (setNote('')), so the field is empty.
    expect(await screen.findByRole('status')).toHaveTextContent(/published/i);
    expect(noteField).toHaveValue('');
  });

  test('an over-long change-note blocks Publish with an inline hint (X.2)', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.type(screen.getByLabelText(/what changed/i), 'x'.repeat(501));

    expect(screen.getByText(/characters or fewer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
    expect(h.publishLesson).not.toHaveBeenCalled();
  });

  test('a failed save surfaces an error and does not drop the edits', async () => {
    h.saveDraft.mockRejectedValueOnce(new Error('Only an admin may edit content.'));
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);

    await userEvent.type(screen.getByLabelText(/lesson body/i), '!!');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only an admin/i);
    // The edited text is still in the editor (not silently dropped).
    expect(screen.getByLabelText(/lesson body/i)).toHaveValue('Live body!!');
  });

  test('an invalid video URL blocks Save/Publish with an inline message', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.type(screen.getByLabelText(/video link/i), 'not-a-url');

    expect(screen.getByText(/valid http\(s\) url/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
  });

  test('an empty body is savable but flagged', async () => {
    render(<LessonEditor lesson={lesson({ bodyMd: '' })} onBack={() => {}} onSaved={() => {}} />);
    expect(screen.getByText(/body is empty/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save draft/i })).toBeEnabled();
  });
});

// U10: publish-time progress reset — checkbox (default off) + explicit confirm
// step. The reset is destructive, so nothing reaches publishLesson until the
// admin confirms; cancelling backs out with no call.
describe('LessonEditor — reset learner progress (U10)', () => {
  test('the reset checkbox renders unchecked by default and a plain publish sends resetProgress: false', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    const checkbox = screen.getByRole('checkbox', { name: /reset learner progress/i });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(h.publishLesson).toHaveBeenCalledWith('2.9', '', false);
  });

  test('a reset-flagged publish shows the confirm step FIRST — no network call yet', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /reset learner progress/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(screen.getByRole('alertdialog', { name: /confirm progress reset/i })).toBeInTheDocument();
    expect(h.saveDraft).not.toHaveBeenCalled();
    expect(h.publishLesson).not.toHaveBeenCalled();
  });

  test('confirming publishes with resetProgress: true and reports the reset', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /reset learner progress/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await userEvent.click(screen.getByRole('button', { name: /publish and reset progress/i }));

    expect(h.saveDraft).toHaveBeenCalledTimes(1);
    expect(h.publishLesson).toHaveBeenCalledWith('2.9', '', true);
    expect(await screen.findByRole('status')).toHaveTextContent(/progress .* was reset/i);
    // The destructive flag does not linger armed for the next publish.
    expect(screen.getByRole('checkbox', { name: /reset learner progress/i })).not.toBeChecked();
  });

  test('cancelling the confirm step backs out without publishing', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /reset learner progress/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(h.publishLesson).not.toHaveBeenCalled();
    // The checkbox stays checked — the admin can re-attempt deliberately.
    expect(screen.getByRole('checkbox', { name: /reset learner progress/i })).toBeChecked();
  });

  test('unchecking the box dismisses a pending confirm step', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    const checkbox = screen.getByRole('checkbox', { name: /reset learner progress/i });
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await userEvent.click(checkbox);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
