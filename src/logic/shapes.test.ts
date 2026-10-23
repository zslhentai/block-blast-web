import { describe, test, expect } from 'bun:test';
import { createRandomShape, createShapes } from './shapes';

describe('shapes', () => {
  test('createRandomShape generates valid shape', () => {
    const shape = createRandomShape();
    expect(shape.id).toBeDefined();
    expect(shape.cells.length).toBeGreaterThan(0);
    expect(shape.color).toBeGreaterThan(0);
    expect(shape.color).toBeLessThanOrEqual(7);
  });

  test('createShapes generates correct count', () => {
    const shapes = createShapes(3);
    expect(shapes.length).toBe(3);
  });
});
