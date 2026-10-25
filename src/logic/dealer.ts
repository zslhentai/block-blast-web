import { type Board, type Shape, BOARD_SIZE } from './types';
import { createShapes } from './shapes';
import { createRandom } from './rng';
import { canPlace } from './placement';
import { searchHand } from './board-search';

export interface WitnessMove { slot: number; row: number; col: number }
export interface SearchResult { status: 'solved' | 'unsolvable' | 'unknown'; moves: WitnessMove[] }
export function findSequence(board: Board, shapes: (Shape | null)[], budget: { remaining: number }): SearchResult {
  const result = searchHand(board, shapes, { maxWork: Math.max(0, Math.floor(budget.remaining)) });
  budget.remaining = Math.max(0, budget.remaining - result.work);
  return { status: result.status, moves: result.moves };
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
