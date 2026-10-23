export interface ScoreResult {
  points: number;
  isCombo: boolean;
}

const POINTS_PER_BLOCK = 10;
const POINTS_PER_LINE = 100;

const COMBO_MULTIPLIER: Record<number, number> = {
  2: 1.5,
  3: 2.0,
  4: 2.5,
};

export function calculateScore(blocksPlaced: number, linesCleared: number, isCombo: boolean = false): ScoreResult {
  let points = blocksPlaced * POINTS_PER_BLOCK;
  
  if (linesCleared > 0) {
    const baseLinePoints = linesCleared * POINTS_PER_LINE;
    const multiplier = COMBO_MULTIPLIER[linesCleared] || 1;
    points += Math.floor(baseLinePoints * multiplier);
  }

  return { points, isCombo: linesCleared > 1 || isCombo };
}
