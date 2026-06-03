export interface CalibrationInput {
  offMs: number;
  onMs: number;
  estimatePct: number;
}

export interface CalibrationResult {
  actualSpeedupPct: number; // positive = AI faster; negative = AI slower
  gapPct: number; // |estimate - actual|, the calibration number
}

/** Pure calibration math — actual measured speedup and the perception gap. */
export function computePairedCalibration({ offMs, onMs, estimatePct }: CalibrationInput): CalibrationResult {
  const actualSpeedupPct = offMs > 0 ? Math.round(((offMs - onMs) / offMs) * 100) : 0;
  return { actualSpeedupPct, gapPct: Math.abs(estimatePct - actualSpeedupPct) };
}
