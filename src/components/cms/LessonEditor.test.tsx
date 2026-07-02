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
    // Empty change-note → passed as '' to the creator, which omits it server-side (X.2).
    expect(h.publishLesson).toHaveBeenCalledWith('2.9', '');
    expect(await screen.findByRole('status')).toHaveTextContent(/published/i);
  });

  test('Publish threads the optional change-note through to publishLesson (X.2)', async () => {
    render(<LessonEditor lesson={lesson()} onBack={() => {}} onSaved={() => {}} />);
    await userEvent.type(screen.getByLabelText(/what changed/i), 'Fixed the reflection prompt');
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));

    expect(h.publishLesson).toHaveBeenCalledWith('2.9', 'Fixed the reflection prompt');
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
