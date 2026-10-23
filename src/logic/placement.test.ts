import { describe, test, expect } from 'bun:test';
import { canPlace, placeShapeOnBoard } from './placement';
import { createEmptyBoard } from './state';

describe('placement', () => {
  test('canPlace returns true for valid placement', () => {
    const board = createEmptyBoard();
    const shape = { id: 'test', cells: [[0, 0]] as [number, number][], color: 1 };
    expect(canPlace(board, shape, 0, 0)).toBe(true);
  });

  test('canPlace returns false for occupied cell', () => {
    const board = createEmptyBoard();
    board[0][0] = 1;
    const shape = { id: 'test', cells: [[0, 0]] as [number, number][], color: 1 };
    expect(canPlace(board, shape, 0, 0)).toBe(false);
  });

  test('canPlace returns false for out of bounds', () => {
    const board = createEmptyBoard();
    const shape = { id: 'test', cells: [[0, 0]] as [number, number][], color: 1 };
    expect(canPlace(board, shape, -1, 0)).toBe(false);
    expect(canPlace(board, shape, 0, -1)).toBe(false);
    expect(canPlace(board, shape, 7, 7)).toBe(true);
  });

  test('placeShapeOnBoard correctly places shape', () => {
    const board = createEmptyBoard();
    const shape = { id: 'test', cells: [[0, 0], [0, 1]] as [number, number][], color: 3 };
    const newBoard = placeShapeOnBoard(board, shape, 0, 0);
    expect(newBoard[0][0]).toBe(3);
    expect(newBoard[0][1]).toBe(3);
  });
});
