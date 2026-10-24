import { test, expect } from 'bun:test';
import { CATALOGUE, createShapes, shapeKey, normalize, rotateShape } from './shapes';
import { createRandom } from './rng';
import { createEmptyBoard, createInitialState } from './state';
import { canPlace, placeShapeOnBoard } from './placement';
import { gameReducer } from './reducer';
import { dealHand, findSequence } from './dealer';
import { checkAndClearLines } from './lineClear';
import { checkGameOver } from './gameover';
import type { Shape, GameState } from './types';
import { DEFAULT_SETTINGS, GameStorage, parseSavedGame } from '../storage/localStorage';

const diagonals: Shape[] = [
  { id: 'diagonal-down', color: 7, cells: [[0, 0], [1, 1]] },
  { id: 'diagonal-up', color: 7, cells: [[0, 1], [1, 0]] },
];
const keys = diagonals.map(s => shapeKey(s.cells));
const mono: Shape = { id: 'mono', color: 2, cells: [[0, 0]] };
const single = (shape: Shape, board = createEmptyBoard()): GameState => ({
  ...createInitialState(999, 17), status: 'playing', board, shapes: [shape, mono, null],
});
const place = (state: GameState, row: number, col: number) => gameReducer(state, {
  type: 'PLACE_SHAPE', slot: 0, shapeId: state.shapes[0]!.id, revision: state.revision, row, col,
});

test('only the two confirmed diagonal directions extend the previous 37 orientations', () => {
  const pairs = CATALOGUE.filter(e => keys.includes(e.key));
  expect(pairs.map(e => e.key).sort()).toEqual([...keys].sort());
  expect(new Set(pairs.map(e => e.family)).size).toBe(1);
  expect(pairs.every(e => e.group === 'small' && e.orientations === 2)).toBe(true);
  expect(CATALOGUE.filter(e => !keys.includes(e.key))).toHaveLength(37);
  expect(new Set(Array.from({ length: 4 }, (_, r) => shapeKey(normalize(rotateShape(diagonals[0].cells, r))))))
    .toEqual(new Set(keys));
});

test('seeded generation and ordinary dealing can emit both diagonal directions', () => {
  const generated = new Set<string>(), dealt = new Set<string>();
  const random = createRandom(7);
  for (let i = 0; i < 1000; i++) for (const shape of createShapes(3, random.next)) {
    const key = shapeKey(shape.cells); if (keys.includes(key)) generated.add(key);
  }
  for (let seed = 0; seed < 256 && dealt.size < 2; seed++) {
    const hand = dealHand(createEmptyBoard(), seed, 1);
    for (const shape of hand.shapes) { const key = shapeKey(shape.cells); if (keys.includes(key)) dealt.add(key); }
  }
  expect(generated).toEqual(new Set(keys)); expect(dealt).toEqual(new Set(keys));
});

for (const shape of diagonals) {
  test(`${shape.id}: bounding-box gaps do not collide or get overwritten`, () => {
    const board = createEmptyBoard(), row = 2, col = 3;
    for (const [r, c] of diagonals.find(s => s !== shape)!.cells) board[row + r][col + c] = 5;
    const before = structuredClone(board);
    expect(canPlace(board, shape, row, col)).toBe(true);
    const placed = placeShapeOnBoard(board, shape, row, col);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      expect(placed[r][c]).toBe(shape.cells.some(([dr, dc]) => r === row + dr && c === col + dc) ? shape.color : before[r][c]);
    }
    expect(board).toEqual(before);
    const next = place(single(shape, board), row, col);
    expect(next.board).toEqual(placed); expect(next.score).toBe(2);
  });

  test(`${shape.id}: either occupied cell rejects the entire move without consuming or scoring`, () => {
    for (const [r, c] of shape.cells) {
      const board = createEmptyBoard(); board[2 + r][3 + c] = 1;
      expect(canPlace(board, shape, 2, 3)).toBe(false);
      const state = single(shape, board); expect(place(state, 2, 3)).toBe(state);
    }
  });

  test(`${shape.id}: all board-edge anchors respect actual occupied cells`, () => {
    const board = createEmptyBoard();
    for (let row = -1; row <= 8; row++) for (let col = -1; col <= 8; col++) {
      expect(canPlace(board, shape, row, col)).toBe(row >= 0 && col >= 0 && row <= 6 && col <= 6);
    }
    expect(canPlace(board, shape, 0.5, 0)).toBe(false);
    expect(canPlace(board, shape, 0, 0.5)).toBe(false);
  });

  test(`${shape.id}: existing score/clear rules handle one row, two rows and a crossing row/column`, () => {
    const topCol = shape.cells[0][1], bottomCol = shape.cells[1][1];
    const one = createEmptyBoard(); one[0].fill(1); one[0][topCol] = 0;
    const oneResult = place(single(shape, one), 0, 0);
    expect(oneResult.linesCleared).toBe(1); expect(oneResult.score).toBe(82);
    expect(oneResult.board[1][bottomCol]).toBe(shape.color);
    const two = structuredClone(one); two[1].fill(2); two[1][bottomCol] = 0;
    const twoResult = place(single(shape, two), 0, 0);
    expect(twoResult.linesCleared).toBe(2); expect(twoResult.score).toBe(192);
    expect(twoResult.board.flat().filter(Boolean)).toHaveLength(0);
    const cross = structuredClone(one);
    for (let r = 2; r < 8; r++) cross[r][bottomCol] = 2;
    const crossResult = place(single(shape, cross), 0, 0);
    expect(crossResult.linesCleared).toBe(2); expect(crossResult.score).toBe(182);
    expect(crossResult.board.flat().filter(Boolean)).toHaveLength(0);
  });

  test(`${shape.id}: search and game-over enumeration find a fit with only diagonal holes`, () => {
    const board = Array.from({ length: 8 }, () => Array<number>(8).fill(1));
    for (const [r, c] of shape.cells) board[2 + r][3 + c] = 0;
    expect(checkGameOver(board, [shape, null, null])).toBe(false);
    const witness = findSequence(board, [shape, null, null], { remaining: 8000 });
    expect(witness.status).toBe('solved'); expect(witness.moves).toEqual([{ slot: 0, row: 2, col: 3 }]);
    const result = checkAndClearLines(placeShapeOnBoard(board, shape, 2, 3));
    expect(result.linesCleared).toBe(16); expect(result.cells).toHaveLength(64);
  });

  test(`${shape.id}: the unchanged save schema accepts and restores the new piece`, () => {
    const values = new Map<string, string>();
    const storage = new GameStorage({ getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } });
    const state = single(shape); storage.save(state, DEFAULT_SETTINGS);
    expect(storage.load()!.state).toEqual(state);
  });
}

test('pre-extension version-1 saves retain their old hand, score, chain and RNG', () => {
  const state: GameState = { ...createInitialState(999, 17), status: 'playing', score: 83, combo: 2, dryMoves: 1, shapes: [
    { id: 'old-line', color: 1, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { id: 'old-square', color: 5, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { id: 'old-corner', color: 7, cells: [[0, 0], [1, 0], [1, 1]] },
  ] };
  const raw = JSON.stringify({ schemaVersion: 1, ruleVersion: 1, catalogueVersion: 1,
    savedAt: 1, state, settings: DEFAULT_SETTINGS });
  expect(parseSavedGame(raw)!.state).toEqual(state);
});
