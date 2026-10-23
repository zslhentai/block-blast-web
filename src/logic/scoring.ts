export interface ScoreResult { points: number; isCombo: boolean }

// Project rules v1, not the proprietary game's unverified formula.
export function calculateScore(
  blocksPlaced: number, linesCleared: number, uniqueClearedCells = 0, combo = 0,
): ScoreResult {
  const multi = linesCleared >= 2 ? 5 * linesCleared * (linesCleared + 1) : 0;
  const chain = linesCleared > 0 ? 20 * Math.max(0, combo - 1) : 0;
  return {
    points: blocksPlaced + 10 * uniqueClearedCells + multi + chain,
    isCombo: linesCleared > 1 || (linesCleared > 0 && combo > 1),
  };
}
