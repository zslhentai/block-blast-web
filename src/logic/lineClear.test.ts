import { describe, test, expect } from 'bun:test';
import { checkAndClearLines } from './lineClear';
import { createEmptyBoard } from './state';

describe('lineClear', () => {
  test('clear full row', () => {
    const board = createEmptyBoard();
    board[0] = [1, 1, 1, 1, 1, 1, 1, 1];
    const result = checkAndClearLines(board);
    expect(result.linesCleared).toBe(1);
    expect(result.board[0].every(c => c === 0)).toBe(true);
  });

  test('clear full column', () => {
    const board = createEmptyBoard();
    for (let row = 0; row < 8; row++) board[row][0] = 1;
    const result = checkAndClearLines(board);
    expect(result.linesCleared).toBe(1);
    expect(result.board[0][0]).toBe(0);
  });

  test('clear multiple lines', () => {
    const board = createEmptyBoard();
    board[0] = [1, 1, 1, 1, 1, 1, 1, 1];
    for (let row = 0; row < 8; row++) board[row][0] = 1;
    const result = checkAndClearLines(board);
    expect(result.linesCleared).toBe(2);
  });

  test('no lines to clear', () => {
    const board = createEmptyBoard();
    const result = checkAndClearLines(board);
    expect(result.linesCleared).toBe(0);
  });
});
