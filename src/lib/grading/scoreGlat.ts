import type { GlatConfig } from '../../types';

// Pure GLAT scorer (P4.10). No LLM, no I/O. Scores Sections B+C only; Section A
// is diagnostic and never read here. Unanswered scored items count as incorrect.

export interface GlatResponses {
  /** itemId -> 1..5 (diagnostic; may be partial or empty). */
  sectionA: Record<string, number>;
  /** itemId -> selected 0-based option index. */
  sectionBC: Record<string, number>;
}

export interface GlatPerItem {
  id: string;
  selected: number | null;
  correctIndex: number;
  isCorrect: boolean;
}

export interface GlatResult {
  correct: number;
  total: number;
  pct: number;
  passed: boolean;
  perItem: GlatPerItem[];
}

export function scoreGlat(config: GlatConfig, responses: GlatResponses): GlatResult {
  const perItem: GlatPerItem[] = config.sectionBC.map((item) => {
    const selected = item.id in responses.sectionBC ? responses.sectionBC[item.id] : null;
    return {
      id: item.id,
      selected,
      correctIndex: item.correctIndex,
      isCorrect: selected === item.correctIndex,
    };
  });
  const correct = perItem.filter((i) => i.isCorrect).length;
  const total = config.sectionBC.length;
  const pct = total === 0 ? 0 : correct / total;
  return { correct, total, pct, passed: pct >= config.passThreshold, perItem };
}
