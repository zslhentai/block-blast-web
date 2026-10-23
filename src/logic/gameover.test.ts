import { describe, test, expect } from 'bun:test';
import { checkGameOver } from './gameover';
import { createEmptyBoard } from './state';

describe('gameover', () => {
  test('not game over when shape can be placed', () => {
    const board = createEmptyBoard();
    const shapes = [{ id: 'test', cells: [[0, 0]] as [number, number][], color: 1 }];
    expect(checkGameOver(board, shapes)).toBe(false);
  });

  test('game over when no shapes available', () => {
    const board = createEmptyBoard();
    expect(checkGameOver(board, [])).toBe(false);
  });

  test('game over when board is full', () => {
    const board = Array.from({ length: 8 }, () => Array(8).fill(1));
    const shapes = [{ id: 'test', cells: [[0, 0]] as [number, number][], color: 1 }];
    expect(checkGameOver(board, shapes)).toBe(true);
  });
});
