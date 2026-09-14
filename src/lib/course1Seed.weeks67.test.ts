import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guards Weeks 6–7 content coherence the generic lab validators do NOT check.
// validateLabConfigJson already pins the failure-shape-id SHAPE (shape ids
// unique, `correct` and every `options[].shapeId` resolve, one option per
// shape); what it cannot know is whether the seeded copy still hangs together:
//
//   - the two Find-the-Failure routes must offer the SAME four shapes, because
//     Meeting 1 teaches one reference table for both;
//   - each route must exercise every shape exactly once (the source doc's
//     design — four scenarios, one per shape, so a pod meets all four);
//   - Meeting 1's body names the two lab lessons verbatim as navigation
//     instructions ("go to the matching lesson in the left navigation bar"), so
//     a retitle that skips the body silently sends learners looking for a lesson
//     that no longer exists. Same failure mode as the Weeks 3–4 "Walk the
//     Workflow" cross-references.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const seed = JSON.parse(
  readFileSync(join(ROOT, 'supabase', 'seed-data', 'course1-content.json'), 'utf8'),
);

type Obj = Record<string, unknown>;
interface FailureShapeCfg {
  kind: string;
  shapes: { id: string; label: string; desc: string }[];
  scenarios: { id: string; correct: string; options: { shapeId: string }[] }[];
}

const w67 = (seed.modules as Obj[]).filter((m) => (m.week as string) === 'weeks67');
const byId = (id: string) => w67.find((m) => m.cell_id === id);
const ROUTES = ['c1-w67-find-the-failure-delivery', 'c1-w67-find-the-failure-nondelivery'];

describe('course1 Weeks 6–7 seed', () => {
  test('the four Weeks 6–7 modules are seeded, in meeting order', () => {
    const ordered = [...w67].sort(
      (a, b) => (a.week_sort_order as number) - (b.week_sort_order as number),
    );
    expect(ordered.map((m) => m.cell_id)).toEqual([
      'c1-w67-pod-meeting-1',
      'c1-w67-find-the-failure-delivery',
      'c1-w67-find-the-failure-nondelivery',
      'c1-w67-pod-meeting-2',
    ]);
  });

  test('both Find-the-Failure routes offer the same four failure shapes', () => {
    const shapeSets = ROUTES.map((id) => {
      const cfg = byId(id)!.lab_config_json as unknown as FailureShapeCfg;
      expect(cfg.kind).toBe('failure-shape-id');
      return cfg.shapes;
    });
    expect(shapeSets[0]).toHaveLength(4);
    expect(shapeSets[1]).toEqual(shapeSets[0]);
  });

  test('each route exercises every failure shape exactly once', () => {
    for (const id of ROUTES) {
      const cfg = byId(id)!.lab_config_json as unknown as FailureShapeCfg;
      const shapeIds = cfg.shapes.map((s) => s.id);
      const answered = cfg.scenarios.map((s) => s.correct).sort();
      expect(answered, id).toEqual([...shapeIds].sort());
    }
  });

  test('Meeting 1 names both Find-the-Failure lessons verbatim', () => {
    const body = byId('c1-w67-pod-meeting-1')!.body_md as string;
    for (const id of ROUTES) {
      expect(body, id).toContain(byId(id)!.title as string);
    }
  });

  test('Meeting 1 carries the Week 5 "not published policy" caveat with the tool tiers', () => {
    // The tier table is reproduced from Week 5, where c1-w5-classify-route is
    // explicit that the data-class guidance is still being developed. Repeating
    // the table without the caveat would read as firmer policy than Week 5 states.
    const body = byId('c1-w67-pod-meeting-1')!.body_md as string;
    expect(body).toContain('Tier 1');
    expect(body).toContain('still being developed');
  });
});
