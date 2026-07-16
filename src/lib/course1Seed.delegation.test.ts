import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guards content coherence the generic lab validator intentionally does not check:
// every delegation-sort item's `suggested` must reference a real categories[].id
// (otherwise the reveal shows a raw id instead of a label).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const seed = JSON.parse(
  readFileSync(join(ROOT, 'supabase', 'seed-data', 'course1-content.json'), 'utf8'),
);

describe('course1 delegation-sort seed', () => {
  test('every item.suggested references a real category id', () => {
    const modules = seed.modules.filter(
      (m: { lab_config_json?: { kind?: string } }) => m.lab_config_json?.kind === 'delegation-sort',
    );
    expect(modules.length).toBeGreaterThan(0);
    for (const m of modules) {
      const cfg = m.lab_config_json;
      const ids = new Set(cfg.categories.map((c: { id: string }) => c.id));
      for (const it of cfg.items) {
        expect(ids.has(it.suggested)).toBe(true);
      }
    }
  });
});
