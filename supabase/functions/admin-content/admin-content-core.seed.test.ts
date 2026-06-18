import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validateLabConfigJson,
  validateQuizJson,
  validateSorterConfigJson,
  LAB_KINDS,
} from './admin-content-core.ts';

// Guard: every lab_config_json / sorter_config_json / quiz_json the migrations
// seed must pass the P5.4-5 (and P5.4-4) write-time validators. The CMS revalidates
// on every edit, so a validator stricter than the real seeded content would reject
// a valid lesson the moment an admin opened it (the "all 88 seed questions are
// 4-option" check, generalized to labs). Extracts the dollar-quoted `$json$…$json$`
// blocks straight from the SQL — no DB needed — and classifies each by shape.

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** Pull every `$json$ … $json$` block out of the migration SQL. */
function extractJsonBlocks(): { file: string; json: unknown }[] {
  const out: { file: string; json: unknown }[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const re = /\$json\$([\s\S]*?)\$json\$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const raw = m[1].trim();
      try {
        out.push({ file, json: JSON.parse(raw) });
      } catch {
        // Not every $json$ block is a single JSON literal (some are arrays of
        // questions interpolated differently); skip anything non-parseable.
      }
    }
  }
  return out;
}

const blocks = extractJsonBlocks();

describe('seeded content validates against the CMS write validators', () => {
  test('migrations contain extractable JSON blocks', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  const labConfigs = blocks.filter(
    (b) =>
      b.json && typeof b.json === 'object' && !Array.isArray(b.json) &&
      typeof (b.json as { kind?: unknown }).kind === 'string' &&
      (LAB_KINDS as readonly string[]).includes((b.json as { kind: string }).kind),
  );
  const sorterConfigs = blocks.filter(
    (b) =>
      b.json && typeof b.json === 'object' && !Array.isArray(b.json) &&
      (b.json as { kind?: unknown }).kind === 'scenario-sort',
  );
  const quizArrays = blocks.filter(
    (b) =>
      Array.isArray(b.json) &&
      b.json.length > 0 &&
      typeof (b.json[0] as { question?: unknown })?.question === 'string',
  );

  test('every seeded lab_config_json validates', () => {
    expect(labConfigs.length).toBeGreaterThan(0);
    for (const { file, json } of labConfigs) {
      const r = validateLabConfigJson(json);
      expect(r.ok, `${file}: ${(json as { kind: string }).kind} — ${r.ok ? '' : r.error}`).toBe(
        true,
      );
    }
  });

  test('every seeded sorter_config_json validates', () => {
    for (const { file, json } of sorterConfigs) {
      const r = validateSorterConfigJson(json);
      expect(r.ok, `${file}: ${r.ok ? '' : r.error}`).toBe(true);
    }
  });

  test('every seeded quiz_json validates', () => {
    for (const { file, json } of quizArrays) {
      const r = validateQuizJson(json);
      expect(r.ok, `${file}: ${r.ok ? '' : r.error}`).toBe(true);
    }
  });
});
