import { test, expect } from 'bun:test';
import { dealHand, findSequence } from './dealer';
import { createEmptyBoard } from './state';
import { checkGameOver } from './gameover';
import { canPlace, placeShapeOnBoard } from './placement';
import { checkAndClearLines } from './lineClear';
import { shapeKey } from './shapes';

test('every solved deal includes a legal replayable witness', () => {
  for (let seed = 0; seed < 100; seed++) {
    let board = createEmptyBoard(); const deal = dealHand(board, seed, 1);
    expect(deal.search.status).toBe('solved');
    expect(new Set(deal.shapes.map(s => shapeKey(s.cells))).size).toBe(3);
    for (const { slot, row, col } of deal.search.moves) {
      expect(canPlace(board, deal.shapes[slot], row, col)).toBe(true);
      board = checkAndClearLines(placeShapeOnBoard(board, deal.shapes[slot], row, col)).board;
    }
    expect(deal.search.moves).toHaveLength(3);
  }
});
test('search budget exhaustion is unknown, never a fake solved result', () => {
  const shapes = dealHand(createEmptyBoard(), 2, 1).shapes;
  expect(findSequence(createEmptyBoard(), shapes, { remaining: 0 }).status).toBe('unknown');
});
test('a checkerboard with no adjacent empty cells gets a playable fallback hand', () => {
  const board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r + c) % 2));
  const deal = dealHand(board, 8, 99);
  expect(checkGameOver(board, deal.shapes)).toBe(false);
  expect(new Set(deal.shapes.map(s => shapeKey(s.cells))).size).toBe(3);
  expect(deal.search.status).toBe('unknown');
});
test('the same state and seed deal identically', () => {
  expect(dealHand(createEmptyBoard(), 12, 1)).toEqual(dealHand(createEmptyBoard(), 12, 1));
});
