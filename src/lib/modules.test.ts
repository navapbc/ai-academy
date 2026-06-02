import { describe, test, expect } from 'vitest';
import { mapRowToModule } from './modules';

// mapRowToModule is pure (no Supabase call), so it tests without a live stack.
const baseRow = {
  cell_id: '1.3',
  stage: '1a',
  title: 'Recognizing when AI is appropriate',
  type: 'sorter',
  dimension: ['Delegation'],
  evidence_type: 'performance-task',
  self_report_validity: 'medium',
  body_md: '# Lesson',
  mastery_anchor: null,
  emergent_anchor: null,
  quiz_json: null,
  lab_config_json: null,
};

describe('mapRowToModule — sorter config', () => {
  test('maps sorter_config_json to sorterConfig', () => {
    const cfg = {
      kind: 'scenario-sort',
      scenarios: [{ id: 's1', text: 't', correct: 'delegate', rationale: 'r' }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapRowToModule({ ...baseRow, sorter_config_json: cfg } as any);
    expect(m.type).toBe('sorter');
    expect(m.sorterConfig).toEqual(cfg);
  });

  test('maps a null sorter_config_json to undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapRowToModule({ ...baseRow, sorter_config_json: null } as any);
    expect(m.sorterConfig).toBeUndefined();
  });
});
