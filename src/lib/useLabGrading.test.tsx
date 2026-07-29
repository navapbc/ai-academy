// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLabGrading } from './useLabGrading';
import type { GradingRubric } from '../types';

// The shared grading hook for the five judge-graded labs. It runs the judge,
// attaches the grade to the saved submission, and — the point of audit D-17 —
// lets a failed grade be RETRIED against the same saved submission (no re-run,
// no second submission). These tests mock the judge + save layers and confirm:
// the happy path, the failure note, retry-after-recovery, and reset.
const { requestLlmGrade, saveGrade } = vi.hoisted(() => ({
  requestLlmGrade: vi.fn(async () => ({
    grader: 'llm' as const,
    perAnchor: [{ id: 'a', label: 'Anchor', score: 2, max: 2, rationale: 'Met.' }],
    overall: 2,
    maxOverall: 2,
  })),
  saveGrade: vi.fn(async () => {}),
}));
vi.mock('./grading', () => ({ requestLlmGrade }));
vi.mock('./progress', () => ({ saveGrade }));

beforeEach(() => {
  requestLlmGrade.mockClear();
  saveGrade.mockClear();
});

const rubric: GradingRubric = { anchors: [{ id: 'a', label: 'Anchor', description: 'Met it.' }] };
const req = {
  submissionId: 'sub-1',
  rubric,
  submission: { brief: 'Brief.', sections: [{ label: 'Work', text: 'the work' }] },
  failureNote: 'Grading is unavailable right now — your work is saved.',
};

describe('useLabGrading', () => {
  test('grade: judges, saves the grade to the submission as reviewable, exposes the result', async () => {
    const { result } = renderHook(() => useLabGrading());
    await act(async () => {
      await result.current.grade(req);
    });
    expect(requestLlmGrade).toHaveBeenCalledWith({ rubric, submission: req.submission });
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.objectContaining({ grader: 'llm' }), 'reviewable');
    expect(result.current.gradeResult?.overall).toBe(2);
    expect(result.current.gradeError).toBeNull();
    expect(result.current.grading).toBe(false);
  });

  test('grade: a failing judge sets the failure note and saves nothing', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('judge down'));
    const { result } = renderHook(() => useLabGrading());
    await act(async () => {
      await result.current.grade(req);
    });
    expect(result.current.gradeError).toBe(req.failureNote);
    expect(result.current.gradeResult).toBeNull();
    expect(saveGrade).not.toHaveBeenCalled();
  });

  test('retry: re-grades the SAME saved submission and, on recovery, clears the note and shows the result', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('transient blip'));
    const { result } = renderHook(() => useLabGrading());
    await act(async () => {
      await result.current.grade(req);
    });
    expect(result.current.gradeError).toBe(req.failureNote);

    // The judge recovers; retry re-runs against the same submission id.
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.gradeResult?.overall).toBe(2));
    expect(result.current.gradeError).toBeNull();
    // Same submission, no new row — only the judge call repeated.
    expect(requestLlmGrade).toHaveBeenCalledTimes(2);
    expect(saveGrade).toHaveBeenCalledTimes(1);
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.anything(), 'reviewable');
  });

  test('retry: is a no-op before any grade attempt (nothing to re-grade)', async () => {
    const { result } = renderHook(() => useLabGrading());
    act(() => {
      result.current.retry();
    });
    expect(requestLlmGrade).not.toHaveBeenCalled();
  });

  test('reset: clears the result/error and disarms retry', async () => {
    const { result } = renderHook(() => useLabGrading());
    await act(async () => {
      await result.current.grade(req);
    });
    expect(result.current.gradeResult).not.toBeNull();

    act(() => {
      result.current.reset();
    });
    expect(result.current.gradeResult).toBeNull();
    expect(result.current.gradeError).toBeNull();

    // After reset, retry has nothing to re-grade.
    act(() => {
      result.current.retry();
    });
    expect(requestLlmGrade).toHaveBeenCalledTimes(1); // only the original grade
  });

  // "Try grading again" (GradeError) is an always-enabled button, so two judge
  // calls can overlap. An EARLIER call settling LAST must not win: it would write
  // its stale verdict over the newer one in both React state and the
  // lab_submissions row, and clear the spinner while the newer call is in flight.
  test('a slow earlier grade settling last does not overwrite the newer verdict', async () => {
    let releaseFirst!: () => void;
    requestLlmGrade.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({
              grader: 'llm' as const,
              perAnchor: [{ id: 'a', label: 'Anchor', score: 0, max: 2, rationale: 'Stale.' }],
              overall: 0,
              maxOverall: 2,
            });
        }),
    );

    const { result } = renderHook(() => useLabGrading());
    act(() => {
      void result.current.grade(req); // slow first call, still pending
    });
    // Second call (the retry) resolves from the default mock: overall 2.
    await act(async () => {
      await result.current.grade(req);
    });
    expect(result.current.gradeResult?.overall).toBe(2);

    // Now the stale first call finally lands.
    await act(async () => {
      releaseFirst();
      await Promise.resolve();
    });

    expect(result.current.gradeResult?.overall).toBe(2); // newer verdict survives
    expect(result.current.grading).toBe(false);
    // The stale verdict was never written to the submission row.
    expect(saveGrade).toHaveBeenCalledTimes(1);
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.objectContaining({ overall: 2 }), 'reviewable');
  });

  // Lab/VoiceEdit call reset() when a re-run invalidates the previous grade
  // (D-13). A grade still in flight for the OLD output must not repopulate the
  // card the reset just cleared.
  test('reset discards a verdict from a grade that was still in flight', async () => {
    let releasePending!: () => void;
    requestLlmGrade.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePending = () =>
            resolve({
              grader: 'llm' as const,
              perAnchor: [{ id: 'a', label: 'Anchor', score: 2, max: 2, rationale: 'Old output.' }],
              overall: 2,
              maxOverall: 2,
            });
        }),
    );

    const { result } = renderHook(() => useLabGrading());
    act(() => {
      void result.current.grade(req);
    });
    expect(result.current.grading).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.grading).toBe(false);

    await act(async () => {
      releasePending();
      await Promise.resolve();
    });

    expect(result.current.gradeResult).toBeNull();
    expect(result.current.gradeError).toBeNull();
    expect(saveGrade).not.toHaveBeenCalled();
  });
});
