import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION tests for the cohort-restructure U1 course/week structure schema
// (courses / course_weeks / course_week_modules), its FINAL RLS policies, the
// is_staff() / has_program_access() helpers, and the modules visibility/origin
// constraints — against the LOCAL Supabase stack. Triple-gated like
// cohorts.integration.test.ts: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY (structure writes are service_role-only by design,
// and the tests must enroll users / set staff roles). Missing any => SKIP.
// Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the U1 boundary: an unenrolled authenticated user reads structure rows
// ONLY where a public module makes them visible (the R8 Week-0 exemption);
// enrolled learners and staff read everything; anon reads nothing; clients
// cannot write; unique(cell_id) rejects a second week membership; and
// origin='course' rows must be stage-less (modules_origin_stage_check).

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
    '[courseStructure.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
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
// fresh module ids to stay re-runnable without a db reset.
const uniqueCellId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email: uniqueEmail('course'), password: PASSWORD });
  expect(error).toBeNull();
  return { client, uid: data.user!.id };
}

/** A stage-less course-origin module row (minimal valid shape). */
function courseModuleRow(cellId: string, visibility: 'public' | 'program') {
  return {
    cell_id: cellId,
    origin: 'course',
    stage: null,
    status: 'published',
    visibility,
    title: `Integration module ${cellId}`,
    type: 'content',
    dimension: [],
    evidence_type: 'reflection',
    self_report_validity: 'na',
    body_md: '# test',
    sort_order: 9000,
  };
}

/**
 * One shared fixture: a test course with two weeks — week A holds a PUBLIC
 * module, week B holds a PROGRAM module — built once via service_role.
 */
async function buildFixture() {
  const svc = serviceClient();
  const pubCell = uniqueCellId('itest-pub');
  const progCell = uniqueCellId('itest-prog');

  const mod = await svc
    .from('modules')
    .insert([courseModuleRow(pubCell, 'public'), courseModuleRow(progCell, 'program')]);
  expect(mod.error).toBeNull();

  const { data: course, error: cErr } = await svc
    .from('courses')
    .insert({ slug: uniqueCellId('itest-course'), title: 'Integration Course', sort_order: 900 })
    .select('id')
    .single();
  expect(cErr).toBeNull();
  const courseId = course!.id as string;

  const { data: weeks, error: wErr } = await svc
    .from('course_weeks')
    .insert([
      { course_id: courseId, title: 'Week A', subtitle: 'public member', sort_order: 0 },
      { course_id: courseId, title: 'Week B', subtitle: 'program member', sort_order: 1 },
    ])
    .select('id, title');
  expect(wErr).toBeNull();
  const weekA = weeks!.find((w) => w.title === 'Week A')!.id as string;
  const weekB = weeks!.find((w) => w.title === 'Week B')!.id as string;

  const mem = await svc.from('course_week_modules').insert([
    { week_id: weekA, cell_id: pubCell, sort_order: 0 },
    { week_id: weekB, cell_id: progCell, sort_order: 0 },
  ]);
  expect(mem.error).toBeNull();

  return { svc, pubCell, progCell, courseId, weekA, weekB };
}

describe.skipIf(!RUN)('course structure schema + seed (U1)', () => {
  test('Course 1 is seeded with its seven week groups, in order, with empty membership', async () => {
    const svc = serviceClient();
    const { data: course, error } = await svc
      .from('courses')
      .select('id, title, sort_order')
      .eq('slug', 'course-1')
      .single();
    expect(error).toBeNull();
    expect(course!.title).toBe('Understanding & Deciding When to Use AI');

    const { data: weeks } = await svc
      .from('course_weeks')
      .select('id, title, subtitle, sort_order')
      .eq('course_id', course!.id)
      .order('sort_order');
    expect(weeks?.map((w) => w.title)).toEqual([
      'Week 0',
      'Week 1',
      'Week 2',
      'Weeks 3–4',
      'Week 5',
      'Weeks 6–7',
      'Week 8',
    ]);
    expect(weeks?.[0].subtitle).toBe('Claude Set-up');
    // Later weeks are authored via the CMS (R1) — empty shells for now.
    expect(weeks?.[4].subtitle).toBeNull();

    // Membership ships EMPTY: no seeded module is assigned to a week in U1 (U8
    // assigns real Course 1 content).
    const { data: members } = await svc
      .from('course_week_modules')
      .select('cell_id')
      .in('week_id', weeks!.map((w) => w.id));
    expect(members ?? []).toHaveLength(0);
  });

  test("every pre-existing module defaulted to visibility='public' (no behavior change)", async () => {
    const svc = serviceClient();
    const { data, error } = await svc.from('modules').select('cell_id, visibility').eq('cell_id', '1.4');
    expect(error).toBeNull();
    expect(data?.[0]?.visibility).toBe('public');
  });

  test("origin='course' with a non-null stage violates modules_origin_stage_check", async () => {
    const svc = serviceClient();
    const { error } = await svc
      .from('modules')
      .insert({ ...courseModuleRow(uniqueCellId('itest-bad'), 'program'), stage: '2' });
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/modules_origin_stage_check/);
  });

  test('a second membership row for the same cell_id is rejected (unique(cell_id))', async () => {
    const { svc, pubCell, weekB } = await buildFixture();
    const dup = await svc
      .from('course_week_modules')
      .insert({ week_id: weekB, cell_id: pubCell, sort_order: 5 });
    expect(dup.error).toBeTruthy();
    expect(dup.error!.message).toMatch(/duplicate key|unique/i);
  });
});

describe.skipIf(!RUN)('course structure RLS (U1 — final policies)', () => {
  test('anon reads nothing from any structure table', async () => {
    await buildFixture(); // rows exist, so empty reads prove the policy, not emptiness
    const anon = anonClient();
    for (const table of ['courses', 'course_weeks', 'course_week_modules']) {
      const { data, error } = await anon.from(table).select('*');
      expect(error, table).toBeNull(); // RLS filters to zero rows, no error
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  test('an unenrolled learner reads structure rows ONLY where a public module makes them visible', async () => {
    const { pubCell, progCell, courseId, weekA, weekB } = await buildFixture();
    const { client } = await newUser(); // authenticated, unenrolled, role=learner

    // Membership: the public-module row is visible; the program one is not.
    const mem = await client.from('course_week_modules').select('cell_id').in('cell_id', [pubCell, progCell]);
    expect(mem.error).toBeNull();
    expect(mem.data?.map((r) => r.cell_id)).toEqual([pubCell]);

    // Weeks: only the week containing the public member.
    const weeks = await client.from('course_weeks').select('id').in('id', [weekA, weekB]);
    expect(weeks.error).toBeNull();
    expect(weeks.data?.map((r) => r.id)).toEqual([weekA]);

    // Courses: visible because it contains ≥1 public member (the R8 mechanism
    // that renders Week 0 inside Course 1 for unenrolled users once U8 assigns it).
    const course = await client.from('courses').select('id').eq('id', courseId);
    expect(course.error).toBeNull();
    expect(course.data).toHaveLength(1);

    // Seeded Course 1 has EMPTY membership in U1, so it is invisible to an
    // unenrolled non-staff user until a public module is assigned (U8).
    const course1 = await client.from('courses').select('slug').eq('slug', 'course-1');
    expect(course1.error).toBeNull();
    expect(course1.data ?? []).toHaveLength(0);
  });

  test('an enrolled learner reads all structure rows (has_program_access)', async () => {
    const { svc, pubCell, progCell, courseId, weekA, weekB } = await buildFixture();
    const { client, uid } = await newUser();
    const { data: cohort } = await svc.from('cohorts').insert({ name: 'U1 Structure Cohort' }).select('id').single();
    const enr = await svc.from('enrollments').insert({ cohort_id: cohort!.id, user_id: uid });
    expect(enr.error).toBeNull();

    const mem = await client.from('course_week_modules').select('cell_id').in('cell_id', [pubCell, progCell]);
    expect(mem.data?.map((r) => r.cell_id).sort()).toEqual([progCell, pubCell].sort());

    const weeks = await client.from('course_weeks').select('id').in('id', [weekA, weekB]);
    expect(weeks.data).toHaveLength(2);

    const course = await client.from('courses').select('id').eq('id', courseId);
    expect(course.data).toHaveLength(1);

    // Seeded Course 1 + all 7 weeks are visible to any enrolled learner.
    const course1 = await client.from('courses').select('id').eq('slug', 'course-1').single();
    expect(course1.error).toBeNull();
    const c1weeks = await client.from('course_weeks').select('id').eq('course_id', course1.data!.id);
    expect(c1weeks.data).toHaveLength(7);
  });

  test('unenrolled staff (champion and admin) read all structure rows (is_staff)', async () => {
    const { svc, progCell } = await buildFixture();
    for (const role of ['champion', 'admin'] as const) {
      const { client, uid } = await newUser();
      const up = await svc.from('profiles').update({ role }).eq('id', uid);
      expect(up.error, role).toBeNull();

      const mem = await client.from('course_week_modules').select('cell_id').eq('cell_id', progCell);
      expect(mem.error, role).toBeNull();
      expect(mem.data, role).toHaveLength(1);

      const course1 = await client.from('courses').select('id').eq('slug', 'course-1');
      expect(course1.data, role).toHaveLength(1); // empty membership doesn't hide it from staff
    }
  });

  test('authenticated clients cannot write any structure table (service_role only)', async () => {
    const { courseId, weekA } = await buildFixture();
    const { client } = await newUser();

    const insCourse = await client.from('courses').insert({ slug: uniqueCellId('hax'), title: 'hax' });
    expect(insCourse.error).toBeTruthy();

    const insWeek = await client.from('course_weeks').insert({ course_id: courseId, title: 'hax week' });
    expect(insWeek.error).toBeTruthy();

    const insMem = await client
      .from('course_week_modules')
      .insert({ week_id: weekA, cell_id: uniqueCellId('hax-cell') });
    expect(insMem.error).toBeTruthy();
  });
});
