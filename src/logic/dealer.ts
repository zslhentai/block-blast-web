import { type Board, type Shape, BOARD_SIZE } from './types';
import { CATALOGUE, createRandomShape, createShapes, shapeKey } from './shapes';
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
export function dealHand(board: Board, seed: number, round: number) {
  const random = createRandom(seed);
  const budget = { remaining: 8000 };
  let shapes: Shape[] = [];
  let search: SearchResult = { status: 'unknown', moves: [] };
  for (let attempt = 0; attempt < 12 && budget.remaining > 0; attempt++) {
    shapes = createShapes(3, random.next, round, `r${round}-${seed}`);
    search = findSequence(board, shapes, budget);
    if (search.status === 'solved') return { shapes, rngState: random.state(), search };
  }
  // Bounded fallback: repair a newly dealt hand, never a hand already shown.
  const fit = CATALOGUE.filter(e => fitsAnywhere(board, { id: 'probe', color: 1, cells: e.cells }));
  if (fit.length) {
    search = { status: 'unknown', moves: [] }; // A repaired hand has no full-sequence proof.
    const first = createRandomShape(random.next, `r${round}-${seed}-0`, round, fit);
    const used = new Set([shapeKey(first.cells)]);
    shapes = [first];
    for (let i = 1; i < 3; i++) {
      const shape = createRandomShape(random.next, `r${round}-${seed}-${i}`, round, CATALOGUE.filter(e => !used.has(e.key)));
      used.add(shapeKey(shape.cells)); shapes.push(shape);
    }
  }
  return { shapes, rngState: random.state(), search };
}
