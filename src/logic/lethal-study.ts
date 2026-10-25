// Independent research-only classifier. Not imported by the game/dealer.
import type { Board, Shape } from './types';
import { packBoard, piecePlacements, fits, searchHand } from './board-search';

export function classifyResearchHand(board: Board, shapes: readonly Shape[], maxWork = 100000) {
  const packed = packBoard(board), fitsNow = shapes.map(shape => piecePlacements(shape).some(piece => fits(packed, piece)));
  const search = searchHand(packed, shapes, { maxWork });
  return { fitsNow, search, classification: search.status === 'unknown' ? 'unknown' : search.status === 'solved' ? 'solvable'
    : fitsNow.filter(Boolean).length === 2 && shapes.length === 3 ? 'two-fit-one-blocked-unsolvable' : 'other-unsolvable' };
}
