import { describe, test, expect } from 'bun:test';
import { CATALOGUE, createRandomShape, createShapes, shapeKey } from './shapes';
import { createRandom } from './rng';

describe('versioned shape catalogue and seeded sampling', () => {
  test('37 normalized unique orientations, no duplicate cells', () => {
    expect(CATALOGUE.length).toBe(37);
    expect(new Set(CATALOGUE.map(e => e.key)).size).toBe(37);
    for (const { cells } of CATALOGUE) {
      expect(new Set(cells.map(c => c.join(','))).size).toBe(cells.length);
      expect(Math.min(...cells.map(([r]) => r))).toBe(0);
      expect(Math.min(...cells.map(([, c]) => c))).toBe(0);
    }
  });
  test('createRandomShape generates a valid colored shape', () => {
    const shape = createRandomShape(createRandom(1).next, 'test');
    expect(shape.cells.length).toBeGreaterThan(0);
    expect(shape.color).toBeGreaterThan(0); expect(shape.color).toBeLessThanOrEqual(7);
  });
  test('three different orientations in every sampled hand', () => {
    const rng = createRandom(7);
    for (let i = 1; i <= 1000; i++) {
      const shapes = createShapes(3, rng.next, i);
      expect(shapes.length).toBe(3);
      expect(new Set(shapes.map(s => shapeKey(s.cells))).size).toBe(3);
    }
  });
  test('RNG state can be restored exactly, including zero', () => {
    const first = createRandom(0); first.next();
    const second = createRandom(first.state());
    expect(first.next()).toBe(second.next());
  });
});
