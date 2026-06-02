import { describe, test, expect } from 'vitest';
import { labHeader } from './labHeader';
import type { PromptConstructionConfig } from '../types';

const base: PromptConstructionConfig = {
  kind: 'prompt-construction',
  brief: { task: 't', constraints: ['c'] },
  scaffoldHints: [],
};

describe('labHeader', () => {
  test('uses config title/subtitle when present', () => {
    expect(labHeader({ ...base, title: 'Prompt Construction', subtitle: 'Sub' })).toEqual({
      title: 'Prompt Construction',
      subtitle: 'Sub',
    });
  });

  test('falls back to generic defaults when absent', () => {
    expect(labHeader(base)).toEqual({
      title: 'Lab',
      subtitle: 'Compose a prompt and run it against Claude.',
    });
  });
});
