// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CmsHome from './CmsHome';
import type { CmsLessonRow } from '../../lib/cmsContent';

const h = vi.hoisted(() => ({ fetchCmsLessons: vi.fn() }));
vi.mock('../../lib/cmsContent', async (importOriginal) => {
  // Keep the real pure shaping fns; only stub the network fetch.
  const actual = await importOriginal<typeof import('../../lib/cmsContent')>();
  return { ...actual, fetchCmsLessons: h.fetchCmsLessons };
});

// Stub the admin-content write creators (P5.4-6); keep the rest real so the
// reused editors (which import saveDraft/publishLesson/isValidVideoUrl) work.
const a = vi.hoisted(() => ({
  createCustomLesson: vi.fn(),
  archiveLesson: vi.fn(),
  restoreLesson: vi.fn(),
}));
vi.mock('../../lib/adminContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/adminContent')>();
  return {
    ...actual,
    createCustomLesson: a.createCustomLesson,
    archiveLesson: a.archiveLesson,
    restoreLesson: a.restoreLesson,
  };
});

function row(overrides: Partial<CmsLessonRow>): CmsLessonRow {
  return {
    cell_id: '1.1',
    stage: '1a',
    status: 'published',
    origin: 'matrix',
    title: 'Lesson',
    type: 'content',
    dimension: ['Delegation'],
    evidence_type: 'quiz',
    self_report_validity: 'low',
    body_md: '# Body',
    video_url: null,
    tutor_reference_md: null,
    archived_at: null,
    version: 1,
    sort_order: 0,
    updated_at: '2026-06-18T00:00:00Z',
    draft: null,
    quiz_json: null,
    lab_config_json: null,
    sorter_config_json: null,
    ...overrides,
  };
}

const ROWS: CmsLessonRow[] = [
  row({ cell_id: '1.1', title: 'Rules of the road', status: 'published', sort_order: 1 }),
  row({ cell_id: '1.2', title: 'Pending edits', status: 'draft', draft: { title: 'X' }, sort_order: 2 }),
  row({
    cell_id: '1.3',
    title: 'Old lesson',
    status: 'in_review',
    archived_at: '2026-06-01T00:00:00Z',
    sort_order: 3,
  }),
];

beforeEach(() => {
  h.fetchCmsLessons.mockReset();
  h.fetchCmsLessons.mockResolvedValue(ROWS);
  a.createCustomLesson.mockReset();
  a.archiveLesson.mockReset();
  a.restoreLesson.mockReset();
  a.archiveLesson.mockResolvedValue({ ok: true, action: 'archive' });
  a.restoreLesson.mockResolvedValue({ ok: true, action: 'restore' });
});

describe('CmsHome (P5.4-2)', () => {
  test('lists non-archived lessons with status after load', async () => {
    render(<CmsHome onBack={() => {}} />);
    expect(await screen.findByText('Rules of the road')).toBeInTheDocument();
    expect(screen.getByText('Pending edits')).toBeInTheDocument();
    // Archived lesson is hidden until the filter is on.
    expect(screen.queryByText('Old lesson')).not.toBeInTheDocument();
    // Pending-draft indicator shows on the draft row.
    expect(screen.getByText(/draft pending/i)).toBeInTheDocument();
  });

  test('archived filter reveals archived lessons', async () => {
    render(<CmsHome onBack={() => {}} />);
    await screen.findByText('Rules of the road');

    await userEvent.click(screen.getByRole('checkbox', { name: /show archived/i }));
    expect(screen.getByText('Old lesson')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  test('clicking a lesson opens a read-only detail with no editable inputs', async () => {
    render(<CmsHome onBack={() => {}} />);
    await userEvent.click(await screen.findByText('Rules of the road'));

    // Detail header + a "Back to lessons" affordance.
    expect(screen.getByRole('button', { name: /back to lessons/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rules of the road' })).toBeInTheDocument();
    // No editable inputs are rendered in this chunk.
    expect(document.querySelector('input, textarea')).toBeNull();
  });

  test('Edit from the detail opens the lesson editor (P5.4-3)', async () => {
    render(<CmsHome onBack={() => {}} />);
    await userEvent.click(await screen.findByText('Rules of the road'));
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    // The editor exposes the body textarea (the read-only detail never does).
    expect(screen.getByLabelText(/lesson body/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument();
  });

  test('Edit quiz from the detail opens the quiz editor (P5.4-4)', async () => {
    render(<CmsHome onBack={() => {}} />);
    await userEvent.click(await screen.findByText('Rules of the road'));
    await userEvent.click(screen.getByRole('button', { name: /edit quiz/i }));

    // The quiz editor exposes the add-question control + a question text field.
    expect(screen.getByRole('button', { name: /add question/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/question text/i)).toBeInTheDocument();
  });

  test('Edit lab from the detail opens the lab editor (P5.4-5)', async () => {
    render(<CmsHome onBack={() => {}} />);
    await userEvent.click(await screen.findByText('Rules of the road'));
    await userEvent.click(screen.getByRole('button', { name: /edit lab/i }));

    // The lab editor exposes the kind picker.
    expect(screen.getByLabelText(/lab kind/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument();
  });

  test('renders an error state with retry when the fetch fails', async () => {
    h.fetchCmsLessons.mockRejectedValueOnce(new Error('boom'));
    render(<CmsHome onBack={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load lessons/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  // --- P5.4-6: create + archive/restore free-form lessons --------------------

  test('"New lesson" opens the create modal', async () => {
    render(<CmsHome onBack={() => {}} />);
    await screen.findByText('Rules of the road');

    await userEvent.click(screen.getByRole('button', { name: /new lesson/i }));
    expect(screen.getByRole('dialog', { name: /new lesson/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  test('creating a custom lesson posts create-custom and opens its detail', async () => {
    const newRow = row({
      cell_id: 'custom-my-lesson',
      title: 'My lesson',
      origin: 'custom',
      stage: null,
      status: 'draft',
      sort_order: 100,
    });
    h.fetchCmsLessons.mockReset();
    // First load = base rows; after create the refetch includes the new row.
    h.fetchCmsLessons.mockResolvedValueOnce(ROWS).mockResolvedValue([...ROWS, newRow]);
    a.createCustomLesson.mockResolvedValue({ ok: true, action: 'create-custom', cellId: 'custom-my-lesson' });

    render(<CmsHome onBack={() => {}} />);
    await screen.findByText('Rules of the road');
    await userEvent.click(screen.getByRole('button', { name: /new lesson/i }));
    await userEvent.type(screen.getByLabelText(/title/i), 'My lesson');
    await userEvent.click(screen.getByRole('button', { name: /create lesson/i }));

    expect(a.createCustomLesson).toHaveBeenCalledWith('My lesson', 'content');
    // Lands on the new lesson's read-only detail.
    expect(await screen.findByRole('heading', { name: 'My lesson' })).toBeInTheDocument();
  });

  test('blocks creating a lesson with no title', async () => {
    render(<CmsHome onBack={() => {}} />);
    await screen.findByText('Rules of the road');
    await userEvent.click(screen.getByRole('button', { name: /new lesson/i }));
    await userEvent.click(screen.getByRole('button', { name: /create lesson/i }));

    expect(a.createCustomLesson).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a title/i);
  });

  test('archiving a lesson from the detail posts archive', async () => {
    render(<CmsHome onBack={() => {}} />);
    await userEvent.click(await screen.findByText('Rules of the road'));
    await userEvent.click(screen.getByRole('button', { name: /^archive$/i }));

    expect(a.archiveLesson).toHaveBeenCalledWith('1.1');
  });

  test('restoring an archived lesson from the detail posts restore', async () => {
    render(<CmsHome onBack={() => {}} />);
    await screen.findByText('Rules of the road');
    await userEvent.click(screen.getByRole('checkbox', { name: /show archived/i }));
    await userEvent.click(screen.getByText('Old lesson'));
    await userEvent.click(screen.getByRole('button', { name: /restore/i }));

    expect(a.restoreLesson).toHaveBeenCalledWith('1.3');
  });
});
