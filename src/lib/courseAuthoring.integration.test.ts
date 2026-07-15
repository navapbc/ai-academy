import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION tests for the cohort-restructure U3 course-authoring write path —
// against the LOCAL Supabase stack. Triple-gated like
// courseStructure.integration.test.ts: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY (structure writes are service_role-only by design).
// Missing any => SKIP.
// Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the U3 boundary at the DATA layer: the service_role write path the
// admin-courses Edge Function uses (create week → assign a published module)
// produces structure rows that the client's RLS'd structure reads then see, and
// the new course_changes audit table is locked down (service_role-only, no
// client read OR write). Client write-block on the three structure tables is
// already asserted in courseStructure.integration.test.ts (U1).
//
// The Edge Function's referential DECISIONS (assign-draft/-archived/-assigned
// rejected 400 naming the offender; archive-while-assigned rejected 400 naming
// the week; delete-populated-week 409) are pure functions unit-tested in
// supabase/functions/admin-courses/admin-courses-core.test.ts and
// supabase/functions/admin-content/admin-content-core.test.ts; exercising them
// over HTTP needs `supabase functions serve` and is orchestrator/CI
// verification, not part of this suite.

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
const PASSWORD = 'integration-pass-123';

async function detectLiveStack(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const res = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: ANON },
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

const hasLiveStack = await detectLiveStack();
const RUN = process.env.RUN_DB_TESTS === '1' && hasLiveStack && !!SERVICE;

if (!RUN) {
  console.info(
    '[courseAuthoring.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
      'running local stack (`npx supabase start`), and SUPABASE_SERVICE_ROLE_KEY ' +
      'set (`npx supabase status -o env | grep SERVICE_ROLE_KEY`).',
  );
}

function anonClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}
function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
}
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@navapbc.com`;
// unique(cell_id) is forever (no DELETE path outside reset), so every run mints
// fresh ids to stay re-runnable without a db reset.
const uniqueId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email: uniqueEmail('authoring'), password: PASSWORD });
  expect(error).toBeNull();
  return { client, uid: data.user!.id };
}

/** A stage-less course-origin module row (minimal valid shape). */
function courseModuleRow(cellId: string, status: 'published' | 'draft') {
  return {
    cell_id: cellId,
    origin: 'course',
    stage: null,
    status,
    visibility: 'program',
    title: `Authoring module ${cellId}`,
    type: 'content',
    dimension: [],
    evidence_type: 'reflection',
    self_report_validity: 'na',
    body_md: '# test',
    sort_order: 9100,
  };
}

describe.skipIf(!RUN)('course authoring write path (U3 — service_role, as admin-courses runs)', () => {
  test('create week → assign published module → visible in structure reads, in order', async () => {
    const svc = serviceClient();

    // Fixture course + two published modules (fresh ids per run).
    const cellA = uniqueId('auth-a');
    const cellB = uniqueId('auth-b');
    const mods = await svc
      .from('modules')
      .insert([courseModuleRow(cellA, 'published'), courseModuleRow(cellB, 'published')]);
    expect(mods.error).toBeNull();
    const { data: course, error: cErr } = await svc
      .from('courses')
      .insert({ slug: uniqueId('auth-course'), title: 'Authoring Course', sort_order: 910 })
      .select('id')
      .single();
    expect(cErr).toBeNull();
    const courseId = course!.id as string;

    // 1) create_week (as applyAction does: sort_order after existing weeks).
    const { data: week, error: wErr } = await svc
      .from('course_weeks')
      .insert({ course_id: courseId, title: 'Week 5', subtitle: 'Ship It', sort_order: 0 })
      .select('id')
      .single();
    expect(wErr).toBeNull();
    const weekId = week!.id as string;

    // 2) assign_module twice (ordered membership rows).
    const mem = await svc.from('course_week_modules').insert([
      { week_id: weekId, cell_id: cellA, sort_order: 0 },
      { week_id: weekId, cell_id: cellB, sort_order: 1 },
    ]);
    expect(mem.error).toBeNull();

    // 3) The structure READS the learner client uses see the authored week —
    //    via an enrolled learner (has_program_access).
    const { client, uid } = await newUser();
    const { data: cohort } = await svc
      .from('cohorts')
      .insert({ name: `U3 Authoring Cohort ${Date.now()}` })
      .select('id')
      .single();
    const enr = await svc.from('enrollments').insert({ cohort_id: cohort!.id, user_id: uid });
    expect(enr.error).toBeNull();

    const weeks = await client.from('course_weeks').select('id, title, subtitle').eq('id', weekId);
    expect(weeks.error).toBeNull();
    expect(weeks.data).toHaveLength(1);
    expect(weeks.data![0].subtitle).toBe('Ship It');

    const members = await client
      .from('course_week_modules')
      .select('cell_id, sort_order')
      .eq('week_id', weekId)
      .order('sort_order');
    expect(members.error).toBeNull();
    expect(members.data?.map((r) => r.cell_id)).toEqual([cellA, cellB]);

    // 4) reorder_week_modules (permute sort_order only) round-trips.
    for (const [i, id] of [cellB, cellA].entries()) {
      const up = await svc
        .from('course_week_modules')
        .update({ sort_order: i })
        .eq('week_id', weekId)
        .eq('cell_id', id);
      expect(up.error).toBeNull();
    }
    const reordered = await client
      .from('course_week_modules')
      .select('cell_id')
      .eq('week_id', weekId)
      .order('sort_order');
    expect(reordered.data?.map((r) => r.cell_id)).toEqual([cellB, cellA]);
  });

  test('unique(cell_id): the same module cannot be assigned to a second week', async () => {
    const svc = serviceClient();
    const cell = uniqueId('auth-dup');
    const mod = await svc.from('modules').insert(courseModuleRow(cell, 'published'));
    expect(mod.error).toBeNull();
    const { data: course } = await svc
      .from('courses')
      .insert({ slug: uniqueId('auth-dup-course'), title: 'Dup Course', sort_order: 911 })
      .select('id')
      .single();
    const { data: weeks, error: wErr } = await svc
      .from('course_weeks')
      .insert([
        { course_id: course!.id, title: 'Week X', sort_order: 0 },
        { course_id: course!.id, title: 'Week Y', sort_order: 1 },
      ])
      .select('id, title');
    expect(wErr).toBeNull();
    const weekX = weeks!.find((w) => w.title === 'Week X')!.id as string;
    const weekY = weeks!.find((w) => w.title === 'Week Y')!.id as string;

    const first = await svc.from('course_week_modules').insert({ week_id: weekX, cell_id: cell, sort_order: 0 });
    expect(first.error).toBeNull();
    const second = await svc.from('course_week_modules').insert({ week_id: weekY, cell_id: cell, sort_order: 0 });
    expect(second.error).toBeTruthy();
    expect(second.error!.message).toMatch(/duplicate key|unique/i);
  });
});

describe.skipIf(!RUN)('course_changes audit table (U3 — locked down like cohort_changes)', () => {
  test('service_role can insert; authenticated clients can neither read nor write', async () => {
    const svc = serviceClient();
    const marker = uniqueId('audit-marker');

    // The Edge Function's audit write (service_role) succeeds.
    const ins = await svc.from('course_changes').insert({
      actor_id: null,
      actor_email: 'integration@navapbc.com',
      action: 'create_week',
      cell_id: marker,
      detail: { title: 'Week 5' },
    });
    expect(ins.error).toBeNull();

    // A signed-in user reads ZERO rows (no SELECT policy) and cannot write.
    const { client } = await newUser();
    const read = await client.from('course_changes').select('*').eq('cell_id', marker);
    expect(read.error).toBeNull(); // RLS filters to zero rows, no error
    expect(read.data ?? []).toHaveLength(0);

    const write = await client.from('course_changes').insert({
      action: 'create_week',
      cell_id: uniqueId('audit-hax'),
    });
    expect(write.error).toBeTruthy();

    // Anon gets nothing either.
    const anonRead = await anonClient().from('course_changes').select('*');
    expect(anonRead.data ?? []).toHaveLength(0);
  });
});
