// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ContentVersionEntry } from './contentVersions';

// useContentVersions loads a cell's content_versions on mount (admin RLS-scoped,
// read-only) and re-fetches on reload(). We mock the data layer (fetchContentVersions)
// to drive the loading -> success and loading -> error paths, plus the reload seam.

const { fetchContentVersions } = vi.hoisted(() => ({ fetchContentVersions: vi.fn() }));
vi.mock('./contentVersions', () => ({ fetchContentVersions }));

import { useContentVersions } from './useContentVersions';

const entry = (version: number): ContentVersionEntry => ({
  id: `v-${version}`,
  version,
  note: null,
  authorName: 'Ada',
  createdAt: '2026-06-18T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useContentVersions', () => {
  test('starts in the loading state, then success populates versions', async () => {
    fetchContentVersions.mockResolvedValue([entry(3), entry(2)]);
    const { result } = renderHook(() => useContentVersions('2.9'));

    // Synchronously on first render, before the mount effect settles.
    expect(result.current.loading).toBe(true);
    expect(result.current.versions).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.versions).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(fetchContentVersions).toHaveBeenCalledWith('2.9');
  });

  test('the catch path sets the error string and stops loading', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchContentVersions.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useContentVersions('2.9'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Could not load the version history.');
    expect(result.current.versions).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('reload() re-invokes fetchContentVersions', async () => {
    fetchContentVersions.mockResolvedValue([entry(3)]);
    const { result } = renderHook(() => useContentVersions('2.9'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchContentVersions).toHaveBeenCalledTimes(1);

    fetchContentVersions.mockResolvedValue([entry(4), entry(3)]);
    await act(async () => {
      result.current.reload();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.versions).toHaveLength(2));
    expect(fetchContentVersions).toHaveBeenCalledTimes(2);
  });
});
