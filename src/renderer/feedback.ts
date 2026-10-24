import type { GameAction, GameState, Point } from '../logic/types';
import { placeShapeOnBoard } from '../logic/placement';
import { checkAndClearLines } from '../logic/lineClear';
import { MOTION } from './motion';

export interface ColoredCell extends Point { color: number }
export interface MoveFeedback {
  revision: number;
  placed: ColoredCell[];
  cleared: ColoredCell[];
  rows: number[];
  cols: number[];
  points: number;
  combo: number;
  tier: 0 | 1 | 2 | 3;
}
export interface Particle extends Point { vx: number; vy: number; color: number }
export interface FeedbackFrame { move: MoveFeedback; start: number; particles: Particle[] }

// Read only an accepted, already committed transition. Never change game state,
// run timers that dispatch actions, or consume the gameplay RNG for effects.
export function moveFeedback(before: GameState, after: GameState, action: GameAction): MoveFeedback | null {
  if (action.type !== 'PLACE_SHAPE' || after.revision !== before.revision + 1) return null;
  const shape = before.shapes[action.slot];
  if (!shape || shape.id !== action.shapeId || action.revision !== before.revision) return null;
  const placed = shape.cells.map(([r, c]) => ({ row: r + action.row, col: c + action.col, color: shape.color }));
  const full = placeShapeOnBoard(before.board, shape, action.row, action.col);
  const clear = checkAndClearLines(full);
  const tier = !clear.linesCleared || after.combo < 2 ? 0 : after.combo < 3 ? 1 : after.combo < 5 ? 2 : 3;
  return { revision: after.revision, placed, cleared: clear.cells.map(p => ({ ...p, color: full[p.row][p.col] })),
    rows: clear.rows, cols: clear.cols, points: after.score - before.score, combo: after.combo, tier };
}

export function feedbackDuration(move: MoveFeedback): number {
  return Math.max(MOTION.placementMs, move.cleared.length ? MOTION.particleMs : 0,
    move.tier ? MOTION.comboMs : MOTION.scoreMs);
}

export class FeedbackTimeline {
  private frames: FeedbackFrame[] = [];
  private rejected: { slot: number; start: number } | null = null;
  add(move: MoveFeedback, now: number): void {
    this.prune(now);
    if (this.frames.some(f => f.move.revision === move.revision)) return;
    const particles = Array.from({ length: Math.min(MOTION.particlesPerMove, move.cleared.length * 2) }, (_, i) => {
      const cell = move.cleared[i % move.cleared.length];
      const phase = (move.revision * 97 + i * 137) % 360 * Math.PI / 180;
      return { row: cell.row, col: cell.col, color: cell.color, vx: Math.cos(phase) * 1.6, vy: -0.6 + Math.sin(phase) * 1.4 };
    });
    this.frames = [...this.frames, { move, start: now, particles }].slice(-MOTION.maxMoves);
    // Prefer recent particles when several moves arrive within one animation.
    let remaining = MOTION.maxParticles;
    for (const frame of [...this.frames].reverse()) {
      frame.particles = frame.particles.slice(0, remaining); remaining -= frame.particles.length;
    }
  }
  reject(slot: number, now: number): void { this.rejected = { slot, start: now }; }
  reset(): void { this.frames = []; this.rejected = null; }
  sample(now: number) {
    this.prune(now);
    return { frames: this.frames, rejected: this.rejected };
  }
  private prune(now: number): void {
    this.frames = this.frames.filter(f => now - f.start < feedbackDuration(f.move));
    if (this.rejected && now - this.rejected.start >= MOTION.invalidMs) this.rejected = null;
  }
}
