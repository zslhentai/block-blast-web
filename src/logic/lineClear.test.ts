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

test('cross metadata is deduplicated and the input board is unchanged', () => {
  const board = createEmptyBoard(); board[2].fill(1);
  for (let r = 0; r < 8; r++) board[r][4] = 2;
  const result = checkAndClearLines(board);
  expect(result.rows).toEqual([2]); expect(result.cols).toEqual([4]);
  expect(result.cells).toHaveLength(15); expect(board[2][4]).toBe(2);
});
test('three rows and three columns clear 39 unique cells simultaneously', () => {
  const board = createEmptyBoard();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (r < 3 || c < 3) board[r][c] = 1;
  const result = checkAndClearLines(board);
  expect(result.linesCleared).toBe(6); expect(result.cells).toHaveLength(39);
  expect(result.board.flat().filter(Boolean)).toHaveLength(0);
});
