import { describe, test, expect } from 'bun:test';
import { calculateScore } from './scoring';

describe('project scoring v1', () => {
  test('one point per placed cell, no clear bonus on a dry move', () => {
    expect(calculateScore(4, 0, 0, 5).points).toBe(4);
  });
  test.each([[1, 1, 8, 81], [1, 2, 15, 181], [9, 6, 39, 609]])(
    'placing %i with %i lines and %i unique cells gives %i', (n, lines, cells, points) => {
      expect(calculateScore(n, lines, cells, 1).points).toBe(points);
    });
  test('second clear in a chain adds twenty', () => {
    expect(calculateScore(1, 1, 8, 2).points).toBe(101);
  });
  test('multi-line bonuses never fall back at five or six lines', () => {
    const scores = [1, 2, 3, 4, 5, 6].map(lines => calculateScore(1, lines, lines * 8, 1).points);
    scores.slice(1).forEach((score, i) => expect(score).toBeGreaterThan(scores[i]));
  });
});
