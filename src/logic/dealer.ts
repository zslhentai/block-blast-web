import { type Board, type Shape, BOARD_SIZE } from './types';
import { canPlace } from './placement';
import { searchHand } from './board-search';
import { ADAPTIVE_POLICY, generateAdaptiveHand, randomHand, type HandDealer, type DealReport } from './adaptive-dealer';

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
export { randomHand as dealRandomHand };
export type { HandDealer };
export const DEALER_POLICY = ADAPTIVE_POLICY;
let observer: ((report: DealReport & { elapsedMs: number }) => void) | undefined;
export function observeDeals(next: typeof observer): () => void { observer = next; return () => { if (observer === next) observer = undefined; }; }
export const dealHand: HandDealer = (board, seed, round, context) => {
  const start = observer ? performance.now() : 0;
  const report = generateAdaptiveHand(board, seed, round, context);
  observer?.({ ...report, elapsedMs: performance.now() - start });
  return report.deal;
};
