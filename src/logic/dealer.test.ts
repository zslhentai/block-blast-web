import { test, expect } from 'bun:test';
import { dealHand, dealRandomHand, findSequence } from './dealer';
import { createEmptyBoard } from './state';
import { checkGameOver } from './gameover';
import { canPlace, placeShapeOnBoard } from './placement';
import { checkAndClearLines } from './lineClear';

test('an independent hand on an empty board can be audited with a legal replayable witness', () => {
  for (let seed = 0; seed < 100; seed++) {
    let board = createEmptyBoard(); const deal = dealHand(board, seed, 1);
    const search = findSequence(board, deal.shapes, { remaining: 8000 });
    expect(search.status).toBe('solved');
    expect(new Set(deal.shapes.map(s => s.id)).size).toBe(3);
    for (const { slot, row, col } of search.moves) {
      expect(canPlace(board, deal.shapes[slot], row, col)).toBe(true);
      board = checkAndClearLines(placeShapeOnBoard(board, deal.shapes[slot], row, col)).board;
    }
    expect(search.moves).toHaveLength(3);
  }
});
test('search budget exhaustion is unknown, never a fake solved result', () => {
  const shapes = dealHand(createEmptyBoard(), 2, 1).shapes;
  expect(findSequence(createEmptyBoard(), shapes, { remaining: 0 }).status).toBe('unknown');
});
test('the frozen random baseline ignores crowding and still permits an unplayable refill', () => {
  const board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r + c) % 2));
  let blocked = 0, fitting = 0;
  for (let seed=0;seed<128;seed++) {
    const deal = dealRandomHand(board, seed, 99);
    expect(deal).toEqual(dealRandomHand(createEmptyBoard(), seed, 99));
    expect(new Set(deal.shapes.map(s => s.id)).size).toBe(3);
    if (checkGameOver(board, deal.shapes)) blocked++; else fitting++;
  }
  expect(blocked).toBeGreaterThan(0); expect(fitting).toBeGreaterThan(0);
});
test('the same state and seed deal identically', () => {
  expect(dealHand(createEmptyBoard(), 12, 1)).toEqual(dealHand(createEmptyBoard(), 12, 1));
});
