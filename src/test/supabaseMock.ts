import { vi } from 'vitest';

// A tiny stand-in for the Supabase client used by the data-layer UNIT tests
// (progress.ts, etc.) so they run with no network and no live stack. The real
// PostgREST builder is a thenable: callers chain `.from().select().eq().order()`
// and `await` the tail. This mock mirrors that — every chain method returns the
// same builder, and the builder resolves to a configurable `{ data, error }`.
// It also records every call so a test can assert the table touched and the
// exact payload passed to insert/upsert/update.

export interface QueryResult {
  data?: unknown;
  error?: unknown;
}

export interface RecordedOp {
  method: string;
  args: unknown[];
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'upsert',
  'update',
  'delete',
  'eq',
  'neq',
  'in',
  'match',
  'order',
  'limit',
  'range',
  'single',
  'maybeSingle',
];

export function createSupabaseMock() {
  const state = {
    result: { data: null, error: null } as QueryResult,
    fromCalls: [] as string[],
    ops: [] as RecordedOp[],
    getSessionResult: { data: { session: null }, error: null } as unknown,
  };

  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    for (const method of CHAIN_METHODS) {
      builder[method] = vi.fn((...args: unknown[]) => {
        state.ops.push({ method, args });
        return builder;
      });
    }
    // PostgREST builders are thenables — awaiting the tail resolves the query.
    (builder as { then: unknown }).then = (
      resolve: (v: QueryResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(state.result).then(resolve, reject);
    return builder;
  };

  const client = {
    from: vi.fn((table: string) => {
      state.fromCalls.push(table);
      return makeBuilder();
    }),
    auth: {
      getSession: vi.fn(async () => state.getSessionResult),
    },
  };

  return {
    client: client as unknown as import('@supabase/supabase-js').SupabaseClient,
    /** Configure what the next awaited query resolves to. */
    setResult(result: QueryResult) {
      state.result = result;
    },
    /** Configure what auth.getSession resolves to. */
    setSession(result: unknown) {
      state.getSessionResult = result;
    },
    /** Table names passed to from(), in call order. */
    get fromCalls() {
      return state.fromCalls;
    },
    /** Every chain method call with its args, in order. */
    get ops() {
      return state.ops;
    },
    /** Args of the first call to the named chain method (e.g. 'insert'). */
    argsFor(method: string): unknown[] | undefined {
      return state.ops.find((o) => o.method === method)?.args;
    },
    reset() {
      state.result = { data: null, error: null };
      state.fromCalls = [];
      state.ops = [];
      state.getSessionResult = { data: { session: null }, error: null };
    },
  };
}
