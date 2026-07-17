import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guards Week 5 content coherence the generic lab validators do NOT check: a
// data-classifier item's `dataClass`/`tool` are validated as non-empty strings
// but not for membership in the config's own `classes`/`tools`. (failure-spotter's
// correctIndex range is already enforced by the shared checkMcOptions.)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const seed = JSON.parse(
  readFileSync(join(ROOT, 'supabase', 'seed-data', 'course1-content.json'), 'utf8'),
);

type Obj = Record<string, unknown>;
const w5 = (seed.modules as Obj[]).filter((m) => (m.week as string) === 'week5');

describe('course1 Week 5 seed', () => {
  test('both Week 5 modules are present', () => {
    const ids = w5.map((m) => m.cell_id).sort();
    expect(ids).toEqual(['c1-w5-classify-route', 'c1-w5-pattern-spotting']);
  });

  test('data-classifier: every item dataClass ∈ classes and tool ∈ tool ids', () => {
    const m = w5.find((m) => (m.lab_config_json as Obj)?.kind === 'data-classifier');
    expect(m).toBeTruthy();
    const cfg = m!.lab_config_json as {
      classes: string[];
      tools: { id: string }[];
      items: { dataClass: string; tool: string }[];
    };
    const classSet = new Set(cfg.classes);
    const toolSet = new Set(cfg.tools.map((t) => t.id));
    expect(cfg.items.length).toBeGreaterThan(0);
    for (const it of cfg.items) {
      expect(classSet.has(it.dataClass)).toBe(true);
      expect(toolSet.has(it.tool)).toBe(true);
    }
  });
});
