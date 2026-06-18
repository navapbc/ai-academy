import { describe, test, expect } from 'vitest';
import {
  buildCmsLessonList,
  filterLessons,
  buildCmsLessonDetail,
  toLessonSummary,
  type CmsLessonRow,
} from './cmsContent';

// A minimal valid row; tests override the fields they care about.
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

describe('buildCmsLessonList', () => {
  test('orders matrix cells by sort_order, custom lessons last', () => {
    const rows = [
      row({ cell_id: 'custom-intro', origin: 'custom', stage: null, sort_order: 5 }),
      row({ cell_id: '2.1', stage: '2', sort_order: 3 }),
      row({ cell_id: '1.1', stage: '1a', sort_order: 1 }),
    ];
    expect(buildCmsLessonList(rows).map((l) => l.cellId)).toEqual(['1.1', '2.1', 'custom-intro']);
  });

  test('tags each lesson with status, hasPendingDraft, and archived', () => {
    const rows = [
      row({ cell_id: '1.1', status: 'published', draft: null, archived_at: null }),
      row({ cell_id: '1.2', status: 'draft', draft: { title: 'New' }, archived_at: null }),
      row({ cell_id: '1.3', status: 'in_review', draft: null, archived_at: '2026-06-01T00:00:00Z' }),
    ];
    const list = buildCmsLessonList(rows);
    expect(list.find((l) => l.cellId === '1.1')).toMatchObject({
      status: 'published',
      hasPendingDraft: false,
      archived: false,
    });
    expect(list.find((l) => l.cellId === '1.2')).toMatchObject({
      status: 'draft',
      hasPendingDraft: true,
      archived: false,
    });
    expect(list.find((l) => l.cellId === '1.3')).toMatchObject({
      status: 'in_review',
      hasPendingDraft: false,
      archived: true,
    });
  });
});

describe('filterLessons', () => {
  const list = buildCmsLessonList([
    row({ cell_id: '1.1', archived_at: null }),
    row({ cell_id: '1.2', archived_at: '2026-06-01T00:00:00Z' }),
  ]);

  test('excludes archived by default', () => {
    expect(filterLessons(list, false).map((l) => l.cellId)).toEqual(['1.1']);
  });

  test('includes archived when the filter is on', () => {
    expect(filterLessons(list, true).map((l) => l.cellId)).toEqual(['1.1', '1.2']);
  });
});

describe('buildCmsLessonDetail', () => {
  test('surfaces live content and the staged draft', () => {
    const detail = buildCmsLessonDetail(
      row({
        cell_id: '1.4',
        title: 'Live title',
        body_md: '# Live',
        video_url: 'https://v',
        tutor_reference_md: 'ref',
        version: 3,
        draft: { title: 'Draft title', body_md: '# Draft' },
        quiz_json: [
          { question: 'Q?', options: ['a', 'b'], correctIndex: 0, explanation: 'because' },
        ],
      }),
    );
    expect(detail).toMatchObject({
      cellId: '1.4',
      title: 'Live title',
      bodyMd: '# Live',
      videoUrl: 'https://v',
      tutorReference: 'ref',
      version: 3,
      hasPendingDraft: true,
    });
    expect(detail.draft).toEqual({ title: 'Draft title', body_md: '# Draft' });
    expect(detail.quiz).toHaveLength(1);
  });

  test('toLessonSummary treats a null draft as no pending edits', () => {
    expect(toLessonSummary(row({ draft: null })).hasPendingDraft).toBe(false);
  });
});
