import { describe, test, expect } from 'bun:test';
import { createEmptyBoard, createInitialState } from './state';

describe('state', () => {
  test('createEmptyBoard creates 8x8 grid', () => {
    const board = createEmptyBoard();
    expect(board.length).toBe(8);
    expect(board[0].length).toBe(8);
    expect(board[0][0]).toBe(0);
  });

  test('createInitialState creates valid state', () => {
    const state = createInitialState();
    expect(state.board.length).toBe(8);
    expect(state.shapes.length).toBe(3);
    expect(state.score).toBe(0);
    expect(state.status).toBe('idle');
  });
});
