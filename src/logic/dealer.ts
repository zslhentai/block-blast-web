import { type Board, type Shape, BOARD_SIZE } from './types';
import { createShapes } from './shapes';
import { createRandom } from './rng';
import { canPlace, placeShapeOnBoard } from './placement';
import { checkAndClearLines } from './lineClear';

export interface WitnessMove { slot: number; row: number; col: number }
export interface SearchResult { status: 'solved' | 'unsolvable' | 'unknown'; moves: WitnessMove[] }
export function findSequence(board: Board, shapes: (Shape | null)[], budget: { remaining: number }): SearchResult {
  if (shapes.every(shape => !shape)) return { status: 'solved', moves: [] };
  for (let slot = 0; slot < shapes.length; slot++) {
    const shape = shapes[slot];
    if (!shape) continue;
    for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
      if (budget.remaining-- <= 0) { budget.remaining = 0; return { status: 'unknown', moves: [] }; }
      if (!canPlace(board, shape, row, col)) continue;
      const next = checkAndClearLines(placeShapeOnBoard(board, shape, row, col)).board;
      const rest = shapes.map((s, i) => i === slot ? null : s);
      const result = findSequence(next, rest, budget);
      if (result.status === 'unknown') return result;
      if (result.status === 'solved') return { status: 'solved', moves: [{ slot, row, col }, ...result.moves] };
    }
  }
  return { status: 'unsolvable', moves: [] };
}
export function fitsAnywhere(board: Board, shape: Shape): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
    if (canPlace(board, shape, r, c)) return true;
  }
  return false;
}
// Transparent replacement policy, not a claim about the original hidden dealer.
// The board does not re-roll or repair the next hand. A legal game can end on refill.
export const DEALER_POLICY = 'independent-weighted-v2';
export function dealHand(_board: Board, seed: number, round: number) {
  const random = createRandom(seed);
  const shapes = createShapes(3, random.next, round, `r${round}-${seed}`);
  return { shapes, rngState: random.state() };
}
