// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CmsLessonDetail from './CmsLessonDetail';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import type { ContentVersionsState } from '../../lib/useContentVersions';
import type { ContentVersionEntry } from '../../lib/contentVersions';

// Stub the version-history hook (network seam) and the admin write creators so the
// detail renders without a live stack.
const h = vi.hoisted(() => ({ useContentVersions: vi.fn<() => ContentVersionsState>() }));
vi.mock('../../lib/useContentVersions', () => ({ useContentVersions: h.useContentVersions }));
vi.mock('../../lib/adminContent', () => ({ archiveLesson: vi.fn(), restoreLesson: vi.fn() }));

function state(overrides: Partial<ContentVersionsState> = {}): ContentVersionsState {
  return { versions: [], loading: false, error: null, reload: vi.fn(), ...overrides };
}

function version(overrides: Partial<ContentVersionEntry> = {}): ContentVersionEntry {
  return {
    id: 'v1',
    version: 3,
    note: 'Fixed wording',
    authorName: 'Ada Lovelace',
    createdAt: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

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

function renderDetail() {
  render(
    <CmsLessonDetail
      lesson={lesson()}
      onBack={() => {}}
      onEdit={() => {}}
      onEditQuiz={() => {}}
      onEditLab={() => {}}
      onSaved={() => {}}
    />,
  );
}

beforeEach(() => {
  h.useContentVersions.mockReset().mockReturnValue(state());
});

describe('CmsLessonDetail version history (X.2)', () => {
  test('renders versions newest-first with note, author and version #', () => {
    h.useContentVersions.mockReturnValue(
      state({
        versions: [
          version({ id: 'a', version: 4, note: 'Second edit', authorName: 'Grace Hopper' }),
          version({ id: 'b', version: 3, note: 'First edit', authorName: 'Ada Lovelace' }),
        ],
      }),
    );
    renderDetail();

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('v4');
    expect(items[0]).toHaveTextContent('Second edit');
    expect(items[0]).toHaveTextContent('Grace Hopper');
    expect(items[1]).toHaveTextContent('v3');
    expect(within(items[1]).getByText('First edit')).toBeInTheDocument();
  });

  test('renders a null note as an em dash', () => {
    h.useContentVersions.mockReturnValue(state({ versions: [version({ note: null })] }));
    renderDetail();
    expect(screen.getByRole('listitem')).toHaveTextContent('—');
  });

  test('shows an empty state when there are no versions', () => {
    h.useContentVersions.mockReturnValue(state({ versions: [] }));
    renderDetail();
    expect(screen.getByText(/no published versions yet/i)).toBeInTheDocument();
  });

  test('shows a loading state', () => {
    h.useContentVersions.mockReturnValue(state({ loading: true }));
    renderDetail();
    expect(screen.getByText(/loading version history/i)).toBeInTheDocument();
  });

  test('shows an error state', () => {
    h.useContentVersions.mockReturnValue(
      state({ error: 'Could not load the version history.' }),
    );
    renderDetail();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load the version history/i);
  });
});
