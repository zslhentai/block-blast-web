// Initial tuning values, not timings measured from the original static images.
export const MOTION = {
  touchLiftCells: 1.15,
  placementMs: 145,
  placementOvershoot: 0.055,
  clearHoldMs: 70,
  clearMs: 330,
  particleMs: 420,
  comboMs: 700,
  comboAttackMs: 140,
  scoreMs: 560,
  feedbackTextMs: 1100,
  invalidMs: 180,
  maxMoves: 3,
  particlesPerMove: 24,
  maxParticles: 48,
} as const;

// Ordinary / enhanced / reward. All are local, short and non-blocking.
export const FEEDBACK_STRENGTH = [
  { particles: 8, flash: 0.18, glow: 4, drift: 0.85 },
  { particles: 14, flash: 0.24, glow: 6, drift: 1.05 },
  { particles: 20, flash: 0.29, glow: 8, drift: 1.2 },
] as const;
export const easeOutCubic = (t: number): number => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
export function placementScale(age: number): number {
  const t = Math.max(0, Math.min(1, age / MOTION.placementMs));
  return 1 + MOTION.placementOvershoot * (t < .28 ? easeOutCubic(t / .28) : 1 - easeOutCubic((t - .28) / .72));
}
