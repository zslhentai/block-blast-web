// Initial tuning values, not timings measured from the original static images.
export const MOTION = {
  touchLiftCells: 1.15,
  placementMs: 160,
  placementOvershoot: 0.075,
  clearHoldMs: 90,
  clearMs: 360,
  particleMs: 460,
  comboMs: 760,
  comboAttackMs: 180,
  scoreMs: 560,
  feedbackTextMs: 1100,
  invalidMs: 180,
  maxMoves: 3,
  particlesPerMove: 24,
  maxParticles: 48,
} as const;
