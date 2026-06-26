import { describe, it, expect } from 'vitest';
import { CELL_CROSSWALK, MATRIX_CELL_IDS } from './evidenceExport';

describe('CELL_CROSSWALK', () => {
  it('has an entry for every matrix cell', () => {
    for (const cellId of MATRIX_CELL_IDS) {
      expect(CELL_CROSSWALK[cellId], `missing crosswalk for cell ${cellId}`).toBeDefined();
    }
  });

  it('every entry has at least one claim in each framework', () => {
    for (const cellId of MATRIX_CELL_IDS) {
      const c = CELL_CROSSWALK[cellId];
      expect(c.dol.length, `cell ${cellId} missing DOL claims`).toBeGreaterThan(0);
      expect(c.euAiAct.length, `cell ${cellId} missing EU AI Act claims`).toBeGreaterThan(0);
      expect(c.m2521.length, `cell ${cellId} missing M-25-21 claims`).toBeGreaterThan(0);
    }
  });

  it('has exactly 28 matrix cells', () => {
    expect(MATRIX_CELL_IDS).toHaveLength(28);
  });
});
