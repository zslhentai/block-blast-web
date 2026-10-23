import { describe, test, expect } from 'bun:test';
import { gameReducer } from './reducer';
import { createInitialState } from './state';
import { type GameState, type GameAction, type Shape } from './types';
import { canPlace } from './placement';
import { checkGameOver } from './gameover';
import { checkAndClearLines } from './lineClear';

const mono = (id = 'mono'): Shape => ({ id, color: 1, cells: [[0, 0]] });
function fixture(): GameState {
  return { ...createInitialState(), status: 'playing', shapes: [mono(), mono('other'), mono('third')] };
}
function place(state: GameState, row: number, col: number, slot = 0): GameAction {
  return { type: 'PLACE_SHAPE', shapeId: state.shapes[slot]!.id, slot, row, col, revision: state.revision };
}
describe('authoritative reducer', () => {
  test('START_GAME preserves the dealt hand, pause/resume preserves board', () => {
    const idle = createInitialState(); const playing = gameReducer(idle, { type: 'START_GAME' });
    expect(playing.status).toBe('playing'); expect(playing.shapes).toEqual(idle.shapes);
    const paused = gameReducer(playing, { type: 'PAUSE' });
    expect(gameReducer(paused, { type: 'RESUME' }).board).toEqual(playing.board);
  });
  test('placement preserves three slots and changes only the consumed slot', () => {
    const state = fixture(); const next = gameReducer(state, place(state, 0, 0, 1));
    expect(next.score).toBe(1); expect(next.board[0][0]).toBe(1);
    expect(next.shapes.map(s => s?.id ?? null)).toEqual(['mono', null, 'third']);
    expect(state.board[0][0]).toBe(0);
  });
  test('invalid, foreign, stale, duplicate and non-playing actions do nothing', () => {
    const state = fixture(); const action = place(state, 0, 0);
    for (const invalid of [{ ...action, shapeId: 'foreign' }, { ...action, revision: -1 },
      { ...action, row: -1 }, { ...action, slot: 3 }]) expect(gameReducer(state, invalid)).toBe(state);
    for (const status of ['idle', 'paused', 'gameover'] as const) {
      const stopped = { ...state, status }; expect(gameReducer(stopped, action)).toBe(stopped);
    }
    const next = gameReducer(state, action); expect(gameReducer(next, action)).toBe(next);
  });
  test('single-row clear is committed and scored before any animation', () => {
    const state = fixture(); state.board[0] = [1, 1, 1, 1, 1, 1, 1, 0];
    const next = gameReducer(state, place(state, 0, 7));
    expect(next.linesCleared).toBe(1); expect(next.score).toBe(81);
    expect(next.board[0]).toEqual(Array(8).fill(0));
  });
  test('cross clear removes fifteen cells and scores 181', () => {
    const state = fixture();
    for (let i = 1; i < 8; i++) { state.board[0][i] = 1; state.board[i][0] = 1; }
    const next = gameReducer(state, place(state, 0, 0));
    expect(next.score).toBe(181); expect(next.linesCleared).toBe(2);
    expect(next.board.flat().filter(Boolean)).toHaveLength(0);
  });
  test('refill only after the third piece, after clearing the old board', () => {
    const state = fixture(); state.shapes = [mono(), null, null];
    state.board[0] = [1, 1, 1, 1, 1, 1, 1, 0];
    const next = gameReducer(state, place(state, 0, 7));
    expect(next.round).toBe(2); expect(next.shapes.filter(Boolean)).toHaveLength(3);
    expect(next.board[0].every(c => !c)).toBe(true); expect(next.status).toBe('playing');
  });
  test('two blocked remaining pieces end the game, one fitting piece keeps it alive', () => {
    const state = fixture();
    state.board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r + c) % 2));
    state.shapes = [{ id: 'domino', cells: [[0, 0], [0, 1]], color: 2 }, mono(), null];
    expect(checkGameOver(state.board, state.shapes)).toBe(false);
    const next = gameReducer(state, place(state, 0, 0, 1));
    expect(next.status).toBe('gameover');
  });
  test('a chain survives two dry placements, the third breaks it', () => {
    let state = { ...fixture(), combo: 2 };
    state = gameReducer(state, place(state, 0, 0)); expect(state.combo).toBe(2);
    state = gameReducer(state, place(state, 1, 1, 1)); expect(state.combo).toBe(2);
    state = gameReducer(state, place(state, 2, 2, 2)); expect(state.combo).toBe(0);
  });
  test('clear after two dry moves keeps the chain; restart preserves best', () => {
    const state = { ...fixture(), combo: 2, dryMoves: 2, highScore: 999 };
    state.board[0] = [1, 1, 1, 1, 1, 1, 1, 0];
    const next = gameReducer(state, place(state, 0, 7));
    expect(next.combo).toBe(3); expect(next.dryMoves).toBe(0); expect(next.score).toBe(121);
    const reset = gameReducer(next, { type: 'RESTART', seed: 9 });
    expect(reset.score).toBe(0); expect(reset.highScore).toBe(999); expect(reset.status).toBe('playing');
  });
  test('seeded legal games conserve cells and replay exactly', () => {
    for (let seed = 0; seed < 30; seed++) {
      let a = { ...createInitialState(0, seed), status: 'playing' as GameState['status'] };
      let b = structuredClone(a);
      for (let step = 0; step < 100 && a.status === 'playing'; step++) {
        let action: GameAction | undefined;
        for (let slot = 0; slot < 3 && !action; slot++) {
          const shape = a.shapes[slot]; if (!shape) continue;
          for (let r = 0; r < 8 && !action; r++) for (let c = 0; c < 8 && !action; c++) {
            if (canPlace(a.board, shape, r, c)) action = place(a, r, c, slot);
          }
        }
        expect(action).toBeDefined(); if (!action || action.type !== 'PLACE_SHAPE') break;
        const filled = a.board.flat().filter(Boolean).length;
        const n = a.shapes[action.slot]!.cells.length;
        const placed = a.board.map(row => [...row]);
        for (const [dr, dc] of a.shapes[action.slot]!.cells) placed[action.row + dr][action.col + dc] = 1;
        const union = new Set<string>();
        for (let r = 0; r < 8; r++) if (placed[r].every(Boolean)) for (let c = 0; c < 8; c++) union.add(`${r},${c}`);
        for (let c = 0; c < 8; c++) if (placed.every(row => row[c])) for (let r = 0; r < 8; r++) union.add(`${r},${c}`);
        const next = gameReducer(a, action);
        const after = next.board.flat().filter(Boolean).length;
        expect(next.score).toBeGreaterThan(a.score);
        expect(after).toBe(filled + n - union.size);
        expect(checkAndClearLines(next.board).linesCleared).toBe(0);
        b = gameReducer(b, action); expect(b).toEqual(next); a = next;
      }
    }
  });
});
