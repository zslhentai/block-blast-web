import { describe, test, expect } from 'bun:test';
import { calculateScore } from './scoring';

describe('scoring', () => {
  test('base points for placing blocks', () => {
    const result = calculateScore(4, 0);
    expect(result.points).toBe(40);
  });

  test('points for clearing lines', () => {
    const result = calculateScore(0, 1);
    expect(result.points).toBe(100);
  });

  test('combo multiplier for 2 lines', () => {
    const result = calculateScore(0, 2);
    expect(result.points).toBe(300);
  });

  test('combo multiplier for 3 lines', () => {
    const result = calculateScore(0, 3);
    expect(result.points).toBe(600);
  });

  test('combo multiplier for 4+ lines', () => {
    const result = calculateScore(0, 4);
    expect(result.points).toBe(1000);
  });
});
