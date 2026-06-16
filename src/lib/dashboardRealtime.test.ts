import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Unit tests for the P5.2d realtime wiring. The Supabase realtime client is
// faked: we assert the channel is shaped correctly (a listener per base table),
// that an incoming event drives the debounced callback, and that the disposer
// tears everything down — without any live websocket (the harness has none).

const { getSupabaseClient, isSupabaseConfiguredRef } = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  isSupabaseConfiguredRef: { value: true },
}));

vi.mock('./supabaseClient', () => ({
  getSupabaseClient,
  get isSupabaseConfigured() {
    return isSupabaseConfiguredRef.value;
  },
}));

import { debounce, subscribeToDashboardChanges } from './dashboardRealtime';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('coalesces a burst into a single trailing call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('cancel() prevents a pending call from firing', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

interface FakeListener {
  table: string;
  event: string;
  handler: () => void;
}

function makeFakeClient() {
  const listeners: FakeListener[] = [];
  let subscribed = false;
  const removeChannel = vi.fn();
  const channel = {
    on(_type: string, cfg: { event: string; schema: string; table: string }, handler: () => void) {
      listeners.push({ table: cfg.table, event: cfg.event, handler });
      return channel;
    },
    subscribe() {
      subscribed = true;
      return channel;
    },
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel,
  };
  return {
    client,
    listeners,
    removeChannel,
    isSubscribed: () => subscribed,
    /** Simulate a postgres_changes event arriving for a table. */
    emit(table: string) {
      for (const l of listeners.filter((x) => x.table === table)) l.handler();
    },
  };
}

describe('subscribeToDashboardChanges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    isSupabaseConfiguredRef.value = true;
    getSupabaseClient.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  test('registers a listener for each dashboard base table', () => {
    const fake = makeFakeClient();
    getSupabaseClient.mockReturnValue(fake.client);

    subscribeToDashboardChanges(() => {});

    const tables = fake.listeners.map((l) => l.table).sort();
    expect(tables).toEqual(
      ['enrollments', 'lab_submissions', 'module_progress', 'quiz_attempts'],
    );
    expect(fake.listeners.every((l) => l.event === '*')).toBe(true);
    expect(fake.isSubscribed()).toBe(true);
  });

  test('an incoming event drives the debounced callback once per burst', () => {
    const fake = makeFakeClient();
    getSupabaseClient.mockReturnValue(fake.client);
    const onChange = vi.fn();

    subscribeToDashboardChanges(onChange);
    fake.emit('module_progress');
    fake.emit('quiz_attempts');
    fake.emit('lab_submissions');
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('the disposer cancels the pending refresh and removes the channel', () => {
    const fake = makeFakeClient();
    getSupabaseClient.mockReturnValue(fake.client);
    const onChange = vi.fn();

    const dispose = subscribeToDashboardChanges(onChange);
    fake.emit('module_progress');
    dispose();

    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  test('is an inert no-op when Supabase is not configured', () => {
    isSupabaseConfiguredRef.value = false;
    const onChange = vi.fn();

    const dispose = subscribeToDashboardChanges(onChange);
    dispose();

    expect(getSupabaseClient).not.toHaveBeenCalled();
  });
});
