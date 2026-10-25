import { test, expect } from 'bun:test';
import { generateAdaptiveHand, randomHand, DEALER_LIMITS, type HandDealer } from './adaptive-dealer';
import { createShapes, shapeKey } from './shapes';
import { createRandom } from './rng';
import { createEmptyBoard, createInitialState } from './state';
import { canPlace, placeShapeOnBoard } from './placement';
import { checkAndClearLines } from './lineClear';
import { gameReducer } from './reducer';
import { searchHand } from './board-search';
import { parseDealerMemory } from './dealer-memory';
import { GameStorage, parseSavedGame, DEFAULT_SETTINGS, STORAGE_KEY } from '../storage/localStorage';
import type { DealerMemory, DealerMode } from './types';

test('frozen v2 control consumes exactly the old RNG stream; adaptive candidates are deterministic and pure', () => {
  const board = createEmptyBoard(); for (const row of board) Object.freeze(row); Object.freeze(board);
  const rng = createRandom(42), shapes = createShapes(3, rng.next, 5, 'r5-42');
  expect(randomHand(board, 42, 5)).toEqual({ shapes, rngState: rng.state() });
  const memory: DealerMemory = { version: 1, mode: 'random', assistStreak: 0, challengeStreak: 0, recentFamilies: [1, 3, 4] };
  const context = { combo: 3, dryMoves: 0, memory, highScore: 10 };
  const before = JSON.stringify(context), first = generateAdaptiveHand(board, 42, 10, context);
  const differentRecord = { ...context, highScore: 999999 };
  expect(first).toEqual(generateAdaptiveHand(board, 42, 10, differentRecord));
  expect(JSON.stringify(context)).toBe(before);
  const expected = createRandom(42); for (let i = 0; i < 13; i++) expected.next();
  expect(first.deal.rngState).toBe(expected.state()); expect(first.work).toBeLessThanOrEqual(8000);
});
test('normal randomness survives; assistance and challenges have bounded streaks and replayable witnesses', () => {
  let memory: DealerMemory | undefined, seed = 20261025;
  const counts: Record<DealerMode, number> = { random: 0, assisted: 0, challenge: 0 };
  for (let round = 1; round <= 300; round++) {
    const report = generateAdaptiveHand(createEmptyBoard(), seed, round, { combo: 3, memory });
    counts[report.used]++; seed = report.deal.rngState; memory = report.deal.dealer;
    expect(memory!.assistStreak).toBeLessThanOrEqual(2); expect(memory!.challengeStreak).toBeLessThanOrEqual(1);
    expect(report.work).toBeLessThanOrEqual(DEALER_LIMITS.candidates * DEALER_LIMITS.candidateWork);
    if (report.used === 'random') expect(report.selected).toBe(0);
    else {
      const selected = report.candidates[report.selected]; expect(selected.search.status).toBe('solved');
      let board = createEmptyBoard();
      for (const move of selected.search.moves) {
        const shape = report.deal.shapes[move.slot]; expect(canPlace(board, shape, move.row, move.col)).toBe(true);
        board = checkAndClearLines(placeShapeOnBoard(board, shape, move.row, move.col)).board;
      }
    }
  }
  expect(counts.random).toBeGreaterThan(0); expect(counts.assisted).toBeGreaterThan(0); expect(counts.challenge).toBeGreaterThan(0);
});
test('congested boards may still lose: no guaranteed repair, no deliberate proven-unsolvable selection', () => {
  const board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r + c) % 2));
  let ordinaryLosses = 0, fallbacks = 0, unknown = 0;
  for (let seed = 0; seed < 256; seed++) {
    const report = generateAdaptiveHand(board, seed, 20, { combo: 4, dryMoves: 2 });
    if (report.used !== 'random') expect(searchHand(board, report.deal.shapes).status).toBe('solved');
    else if (report.candidates[0].fitNow === 0) ordinaryLosses++;
    if (report.reason === 'no-proven-candidate-keep-original') { fallbacks++; expect(report.selected).toBe(0); }
    unknown += report.candidates.filter(c => c.search.status === 'unknown').length;
  }
  expect(ordinaryLosses).toBeGreaterThan(0); expect(fallbacks).toBeGreaterThan(0); expect(unknown).toBeGreaterThan(0);
});
test('diversity is a preference, never a ban on repeated geometries or duplicate slot identities', () => {
  let repeats = 0;
  for (let seed = 0; seed < 512; seed++) {
    const shapes = generateAdaptiveHand(createEmptyBoard(), seed, 4).deal.shapes;
    expect(new Set(shapes.map(s => s.id)).size).toBe(3);
    if (new Set(shapes.map(s => shapeKey(s.cells))).size < 3) repeats++;
  }
  expect(repeats).toBeGreaterThan(0);
});
test('old saves and unknown optional history preserve the hand, RNG and score; new history round-trips', () => {
  const state = { ...createInitialState(999, 17), status: 'paused' as const };
  const values = new Map<string, string>(); const storage = new GameStorage({ getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } });
  expect(storage.save(state, DEFAULT_SETTINGS)).toBe(true); expect(storage.load()?.state).toEqual(state);
  const legacy = JSON.parse(values.get(STORAGE_KEY)!); delete legacy.state.dealer;
  expect(parseSavedGame(JSON.stringify(legacy))!.state).toEqual({ ...state, dealer: undefined });
  legacy.state.dealer = { version: 99, recentFamilies: Array(100).fill(0) };
  const recovered = parseSavedGame(JSON.stringify(legacy))!.state;
  expect(recovered.shapes).toEqual(state.shapes); expect(recovered.rngState).toBe(state.rngState); expect(recovered.score).toBe(state.score); expect(recovered.dealer).toBeUndefined();
  expect(parseDealerMemory({ version: 1, mode: 'random', assistStreak: 2, challengeStreak: 0, recentFamilies: [] })).toBeUndefined();
  expect(parseDealerMemory({ version: 1, mode: ['random'], assistStreak: 0, challengeStreak: 0, recentFamilies: [] })).toBeUndefined();
  expect(parseDealerMemory({ version: 1, mode: 'challenge', assistStreak: 0, challengeStreak: 0, recentFamilies: [] })).toBeUndefined();
});
test('refill sees the cleared board and updated combo, and the reducer keeps normal atomic scoring', () => {
  const state = { ...createInitialState(0, 17), status: 'playing' as const, combo: 1, shapes: [{ id: 'last', cells: [[0, 0] as [number, number]], color: 7 }, null, null] };
  state.board[6] = [0, 1, 1, 1, 1, 1, 1, 1]; let calls = 0;
  const dealer: HandDealer = (board, seed, round, context) => {
    calls++; expect(board.flat().filter(Boolean)).toHaveLength(0); expect(context?.combo).toBe(2); expect(context?.dryMoves).toBe(0);
    return randomHand(board, seed, round);
  };
  const action = { type: 'PLACE_SHAPE' as const, slot: 0, shapeId: 'last', revision: state.revision, row: 6, col: 0 };
  const after = gameReducer(state, action, dealer); expect(calls).toBe(1); expect(after.score).toBe(101); expect(after.moves).toBe(1); expect(after.round).toBe(2);
  expect(gameReducer(after, action, dealer)).toBe(after); expect(calls).toBe(1);
});
