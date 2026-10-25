import { test, expect } from 'bun:test';
import { searchHand, packBoard, piecePlacements, fits, placeAndClear, occupancyRows, boardFeatures } from './board-search';
import { classifyResearchHand } from './lethal-study';
import { CATALOGUE } from './shapes';
import { canPlace, placeShapeOnBoard } from './placement';
import { checkAndClearLines } from './lineClear';
import { createRandom } from './rng';
import type { Board, Shape } from './types';

const empty = (): Board => Array.from({ length: 8 }, () => Array<number>(8).fill(0));
const mono = (id: string): Shape => ({ id, color: 1, cells: [[0, 0]] });
const square: Shape = { id: 'square', color: 2, cells: Array.from({ length: 9 }, (_, i) => [Math.floor(i / 3), i % 3]) };
function replay(board: Board, shapes: Shape[], moves: { slot: number; row: number; col: number }[]) {
  const slots = new Set<number>();
  for (const move of moves) {
    expect(slots.has(move.slot)).toBe(false); slots.add(move.slot);
    expect(canPlace(board, shapes[move.slot], move.row, move.col)).toBe(true);
    board = checkAndClearLines(placeShapeOnBoard(board, shapes[move.slot], move.row, move.col)).board;
  }
  return board;
}
test('occupancy transitions agree with production collision and simultaneous line clearing for every shape', () => {
  const rng = createRandom(20261025);
  for (let sample = 0; sample < 32; sample++) {
    const board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => rng.next() < sample / 40 ? 1 : 0));
    const packed = packBoard(board);
    for (const [id, entry] of CATALOGUE.entries()) {
      const shape: Shape = { id: String(id), color: 3, cells: entry.cells };
      for (const piece of piecePlacements(shape)) {
        const legal = fits(packed, piece);
        expect(legal).toBe(canPlace(board, shape, piece.row, piece.col));
        if (!legal) continue;
        const actual = checkAndClearLines(placeShapeOnBoard(board, shape, piece.row, piece.col));
        const predicted = placeAndClear(packed, piece);
        expect(predicted.board).toEqual(packBoard(actual.board)); expect(predicted.lines).toBe(actual.linesCleared);
      }
    }
  }
});
test('unsigned upper/lower words and crossing clear handle all 64 cells, colors and diagonal holes', () => {
  const board = empty(); board[7] = [1, 2, 3, 0, 4, 5, 6, 7]; for (let r = 0; r < 7; r++) board[r][3] = 2;
  const piece = piecePlacements(mono('cross')).find(p => p.row === 7 && p.col === 3)!;
  expect(placeAndClear(packBoard(board), piece)).toEqual({ board: { low: 0, high: 0 }, lines: 2 });
  board[7][7] = 0; board[6][7] = 1;
  const diagonal: Shape = { id: 'diagonal', color: 7, cells: [[0, 0], [1, 1]] };
  expect(fits(packBoard(board), piecePlacements(diagonal).find(p => p.row === 6 && p.col === 6)!)).toBe(true);
  expect(occupancyRows(packBoard(board))[7]).toBe(119);
});
test('enumerates every slot order and reproduces the empty-board geometric count independently', () => {
  const hand: Shape[] = [{ id: 'v', color: 1, cells: [[0, 0], [1, 0]] }, { id: 'h', color: 1, cells: [[0, 0], [0, 1]] }, square];
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    const result = searchHand(empty(), hand, { order, maxWork: 2000000, maxSolutions: Infinity });
    expect(result.status).toBe('solved'); expect(result.exhaustive).toBe(true); expect(result.solutions).toBe(67680);
    expect(result.moves.map(m => m.slot)).toEqual(order); replay(empty(), hand, result.moves);
  }
  const all = searchHand(empty(), hand, { maxWork: 4000000, maxSolutions: Infinity });
  expect(all.exhaustive).toBe(true); expect(all.solutions).toBe(406080); expect(all.cacheHits).toBeGreaterThan(0);
});
test('searches recursive cleared boards, including a third piece that only fits after two clears', () => {
  const board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r + c) % 2));
  board[0] = [0, 1, 1, 1, 1, 1, 1, 1]; board[1] = [1, 1, 1, 1, 1, 1, 1, 0]; board[2].fill(0);
  const hand = [mono('first'), mono('second'), square];
  expect(canPlace(board, square, 0, 0)).toBe(false);
  expect(piecePlacements(square).some(p => fits(packBoard(board), p))).toBe(false);
  expect(searchHand(board, hand, { order: [2, 0, 1] }).status).toBe('unsolvable');
  const result = searchHand(board, hand, { maxWork: 200000 });
  expect(result.status).toBe('solved'); expect(result.moves.at(-1)?.slot).toBe(2); expect(result.maxClearedLines).toBeGreaterThanOrEqual(2);
  replay(board, hand, result.moves);
});
test('proves dead combinations without mutation; partial search stays unknown or a lower bound', () => {
  const board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r + c) % 2));
  const hand = [mono('first'), mono('second'), square];
  const before = JSON.stringify({ board, hand });
  for (const row of board) Object.freeze(row); Object.freeze(board);
  for (const shape of hand) { for (const cell of shape.cells) Object.freeze(cell); Object.freeze(shape.cells); Object.freeze(shape); } Object.freeze(hand);
  expect(classifyResearchHand(board, hand).classification).toBe('two-fit-one-blocked-unsolvable');
  expect(searchHand(board, hand, { maxWork: 2 }).status).toBe('unknown');
  const capped = searchHand(empty(), hand, { maxSolutions: 8, maxWork: 10000 });
  expect(capped.status).toBe('solved'); expect(capped.exhaustive).toBe(false); expect(capped.solutions).toBe(8); expect(capped.work).toBeLessThanOrEqual(10000);
  expect(JSON.stringify({ board, hand })).toBe(before);
  expect(searchHand(Array.from({ length: 8 }, () => Array<number>(8).fill(1)), hand).status).toBe('unsolvable');
});
test('null slots and duplicate geometry preserve distinct labeled identities and validate search input', () => {
  const one = searchHand(empty(), [null, mono('only'), null], { maxSolutions: Infinity });
  expect(one.solutions).toBe(64); expect(one.moves[0].slot).toBe(1); expect(one.exhaustive).toBe(true);
  expect(searchHand(empty(), [null, null, null], { maxWork: 0 })).toMatchObject({ status: 'solved', solutions: 1, exhaustive: true });
  expect(searchHand(empty(), [mono('a'), mono('b')]).moves.map(m => m.slot)).toEqual([0, 1]);
  expect(() => searchHand(empty(), [mono('a')], { order: [0, 0] })).toThrow();
  expect(() => searchHand(empty(), [mono('a')], { maxSolutions: 0 })).toThrow();
  expect(() => searchHand([[]], [mono('a')])).toThrow();
  expect(() => piecePlacements({ ...mono('bad'), cells: [[-1, 0]] })).toThrow();
  expect(() => piecePlacements({ ...mono('bad'), cells: [[0, 0], [0, 0]] })).toThrow();
  expect(boardFeatures(packBoard(empty()))).toEqual({ empty: 64, isolated: 0, adjacencies: 112 });
});
