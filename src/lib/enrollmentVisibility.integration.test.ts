import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION tests for the cohort-restructure U4 enrollment-visibility flip:
// the modules SELECT policy (`visibility='public' OR has_program_access() OR
// is_staff()`), the Week-0 rendering shape it composes with the U1 structure
// policies, and the viewer-independent staff denominator
// (published_modules_total() + the re-created learner_progress_summary) —
// against the LOCAL Supabase stack. Triple-gated like
// courseStructure.integration.test.ts: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP.
// Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the U4 boundary: a visibility='program' row never reaches an
// unenrolled learner's wire while public rows still do; enrolled learners and
// (unenrolled) staff receive program rows; anon receives nothing; a week
// holding a program + a public module (the Week-0 shape U8 will seed) shows an
// unenrolled learner the week row and ONLY the public membership row; and the
// staff-dashboard denominator is identical for every viewer and matches the
// actual published count.
//
// Unlike courseStructure.integration.test.ts, this file CLEANS UP its fixture
// rows in afterAll (modules cascade their membership rows; deleting the auth
// users cascades profiles/progress), so repeated gated runs don't accrete
// visibility fixtures.

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
    '[enrollmentVisibility.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
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
const uniqueCellId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A stage-less course-origin module row (minimal valid shape), mirroring courseStructure. */
function courseModuleRow(cellId: string, visibility: 'public' | 'program') {
  return {
    cell_id: cellId,
    origin: 'course',
    stage: null,
    status: 'published',
    visibility,
    title: `U4 visibility module ${cellId}`,
    type: 'content',
    dimension: [],
    evidence_type: 'reflection',
    self_report_validity: 'na',
    body_md: '# test',
    sort_order: 9100,
  };
}

describe.skipIf(!RUN)('enrollment-based modules visibility (U4)', () => {
  // Shared fixture (built once in beforeAll): one course with ONE week holding
  // BOTH a public and a program module — the exact shape seeded Week 0 takes
  // once U8 assigns real content. The migration-seeded Course-1 Week 0 itself
  // is deliberately NOT mutated here: courseStructure.integration.test.ts
  // asserts Course 1 ships with EMPTY membership, and vitest runs gated files
  // in parallel, so inserting members into the real Week 0 would race it. The
  // RLS predicates under test are identical either way; the literal seeded
  // Week 0 gets its members (and its e2e spec) in U8.
  let svc: SupabaseClient;
  let pubCell: string;
  let progCell: string;
  let courseId: string;
  let weekId: string;

  // Everything created here or inside tests, torn down in afterAll.
  const createdCellIds: string[] = [];
  const createdCourseIds: string[] = [];
  const createdCohortIds: string[] = [];
  const createdUserIds: string[] = [];

  async function newUser(prefix: string): Promise<{ client: SupabaseClient; uid: string }> {
    const client = anonClient();
    const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
    expect(error).toBeNull();
    createdUserIds.push(data.user!.id);
    return { client, uid: data.user!.id };
  }

  async function newCohort(name: string): Promise<string> {
    const { data, error } = await svc.from('cohorts').insert({ name }).select('id').single();
    expect(error).toBeNull();
    const id = data!.id as string;
    createdCohortIds.push(id);
    return id;
  }

  beforeAll(async () => {
    svc = serviceClient();
    pubCell = uniqueCellId('u4-pub');
    progCell = uniqueCellId('u4-prog');
    createdCellIds.push(pubCell, progCell);

    const mod = await svc
      .from('modules')
      .insert([courseModuleRow(pubCell, 'public'), courseModuleRow(progCell, 'program')]);
    expect(mod.error).toBeNull();

    const { data: course, error: cErr } = await svc
      .from('courses')
      .insert({ slug: uniqueCellId('u4-course'), title: 'U4 Visibility Course', sort_order: 910 })
      .select('id')
      .single();
    expect(cErr).toBeNull();
    courseId = course!.id as string;
    createdCourseIds.push(courseId);

    const { data: week, error: wErr } = await svc
      .from('course_weeks')
      .insert({ course_id: courseId, title: 'Week 0 (shape)', subtitle: 'mixed visibility', sort_order: 0 })
      .select('id')
      .single();
    expect(wErr).toBeNull();
    weekId = week!.id as string;

    const mem = await svc.from('course_week_modules').insert([
      { week_id: weekId, cell_id: pubCell, sort_order: 0 },
      { week_id: weekId, cell_id: progCell, sort_order: 1 },
    ]);
    expect(mem.error).toBeNull();
  });

  afterAll(async () => {
    // Modules first: FK cascades remove their course_week_modules (and any
    // content_versions) rows. Then courses (cascades weeks), cohorts (cascades
    // enrollments + cohort_champions), and finally the auth users (cascades
    // profiles / module_progress / quiz_attempts / lab_submissions).
    if (createdCellIds.length > 0) {
      expect((await svc.from('modules').delete().in('cell_id', createdCellIds)).error).toBeNull();
    }
    if (createdCourseIds.length > 0) {
      expect((await svc.from('courses').delete().in('id', createdCourseIds)).error).toBeNull();
    }
    if (createdCohortIds.length > 0) {
      expect((await svc.from('cohorts').delete().in('id', createdCohortIds)).error).toBeNull();
    }
    for (const uid of createdUserIds) {
      const { error } = await svc.auth.admin.deleteUser(uid);
      expect(error).toBeNull();
    }
  });

  test('an unenrolled learner receives only public rows — the program row never reaches the wire', async () => {
    const { client } = await newUser('u4-unenrolled');

    const both = await client.from('modules').select('cell_id').in('cell_id', [pubCell, progCell]);
    expect(both.error).toBeNull();
    expect(both.data?.map((r) => r.cell_id)).toEqual([pubCell]);

    // Public content stays open after the policy swap (R8): a seeded matrix
    // cell (visibility='public' via the U1 default) still reads normally.
    const seeded = await client.from('modules').select('cell_id, visibility').eq('cell_id', '1.4');
    expect(seeded.error).toBeNull();
    expect(seeded.data).toHaveLength(1);
    expect(seeded.data?.[0]?.visibility).toBe('public');
  });

  test('an enrolled learner receives program rows (has_program_access)', async () => {
    const { client, uid } = await newUser('u4-enrolled');
    const cohortId = await newCohort('U4 Visibility Cohort');
    expect((await svc.from('enrollments').insert({ cohort_id: cohortId, user_id: uid })).error).toBeNull();

    const res = await client.from('modules').select('cell_id').in('cell_id', [pubCell, progCell]);
    expect(res.error).toBeNull();
    expect(res.data?.map((r) => r.cell_id).sort()).toEqual([progCell, pubCell].sort());
  });

  test('an unenrolled champion receives program rows (is_staff)', async () => {
    const { client, uid } = await newUser('u4-champ');
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', uid)).error).toBeNull();

    const res = await client.from('modules').select('cell_id').eq('cell_id', progCell);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  });

  test('an admin receives program rows (is_staff)', async () => {
    const { client, uid } = await newUser('u4-admin');
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', uid)).error).toBeNull();

    const res = await client.from('modules').select('cell_id').eq('cell_id', progCell);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  });

  test('anon sees no modules at all (policy is TO authenticated)', async () => {
    const anon = anonClient();
    const res = await anon.from('modules').select('cell_id');
    expect(res.error).toBeNull(); // RLS filters to zero rows, no error
    expect(res.data ?? []).toHaveLength(0);
  });

  test('Week-0 shape: an unenrolled learner sees the week row + ONLY the public membership row', async () => {
    const { client } = await newUser('u4-week0');

    // Membership: the U1 public-module exemption shows the public row; the
    // program membership row is filtered with it.
    const mem = await client.from('course_week_modules').select('cell_id').eq('week_id', weekId);
    expect(mem.error).toBeNull();
    expect(mem.data?.map((r) => r.cell_id)).toEqual([pubCell]);

    // The week and course rows are visible because they contain ≥1 public
    // member — this is what renders Week 0 inside Course 1 for exactly the
    // unenrolled population (R8).
    const week = await client.from('course_weeks').select('id').eq('id', weekId);
    expect(week.error).toBeNull();
    expect(week.data).toHaveLength(1);

    const course = await client.from('courses').select('id').eq('id', courseId);
    expect(course.error).toBeNull();
    expect(course.data).toHaveLength(1);
  });

  test('published_modules_total() is viewer-independent and matches the actual published count', async () => {
    const champ = await newUser('u4-denom-champ');
    const admin = await newUser('u4-denom-admin');
    const learner = await newUser('u4-denom-learner'); // unenrolled, non-staff
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champ.uid)).error).toBeNull();
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.uid)).error).toBeNull();

    // The actual published count, read via service_role (RLS-free).
    const { count: actual, error: cntErr } = await svc
      .from('modules')
      .select('cell_id', { count: 'exact', head: true })
      .eq('status', 'published');
    expect(cntErr).toBeNull();

    const champTotal = await champ.client.rpc('published_modules_total');
    expect(champTotal.error).toBeNull();
    const adminTotal = await admin.client.rpc('published_modules_total');
    expect(adminTotal.error).toBeNull();
    expect(champTotal.data).toBe(adminTotal.data);
    expect(champTotal.data).toBe(actual);

    // The sharpest definer proof: an unenrolled LEARNER — who cannot read the
    // program row at all — still gets the same total (the count includes rows
    // the caller's RLS hides).
    const learnerTotal = await learner.client.rpc('published_modules_total');
    expect(learnerTotal.error).toBeNull();
    expect(learnerTotal.data).toBe(actual);
  });

  test('learner_progress_summary returns consistent totals for admin vs unenrolled champion', async () => {
    const learner = await newUser('u4-lps-learner');
    const champ = await newUser('u4-lps-champ'); // champions the cohort, NOT enrolled
    const admin = await newUser('u4-lps-admin');
    const cohortId = await newCohort('U4 LPS Cohort');
    expect((await svc.from('enrollments').insert({ cohort_id: cohortId, user_id: learner.uid })).error).toBeNull();
    expect(
      (await svc.from('cohort_champions').insert({ cohort_id: cohortId, user_id: champ.uid })).error,
    ).toBeNull();
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champ.uid)).error).toBeNull();
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.uid)).error).toBeNull();

    // The learner's one completion is on the PROGRAM module: both staff
    // viewers must count it in the numerator (is_staff reads program rows).
    expect(
      (
        await svc.from('module_progress').insert({
          user_id: learner.uid,
          module_id: progCell,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
      ).error,
    ).toBeNull();

    const readRow = (client: SupabaseClient) =>
      client
        .from('learner_progress_summary')
        .select('user_id, modules_completed, modules_total, completion_pct')
        .eq('user_id', learner.uid)
        // .single() is safe: enrollments unique(user_id) => one row (pre-U5).
        .single();

    const champRow = await readRow(champ.client);
    expect(champRow.error).toBeNull();
    const adminRow = await readRow(admin.client);
    expect(adminRow.error).toBeNull();

    expect(champRow.data!.modules_total).toBe(adminRow.data!.modules_total);
    expect(champRow.data!.modules_completed).toBe(adminRow.data!.modules_completed);
    expect(champRow.data!.modules_completed).toBe(1);
    expect(Number(champRow.data!.completion_pct)).toBeCloseTo(Number(adminRow.data!.completion_pct), 10);

    // And the denominator IS the definer count — viewer-independent by
    // construction, not by coincidence of both viewers being staff.
    const rpcTotal = await admin.client.rpc('published_modules_total');
    expect(rpcTotal.error).toBeNull();
    expect(champRow.data!.modules_total).toBe(rpcTotal.data);
  });
});
