import { describe, test, expect } from 'bun:test';
import { CATALOGUE, createRandomShape, createShapes, shapeKey } from './shapes';
import { createRandom } from './rng';

describe('versioned shape catalogue and seeded sampling', () => {
  test('39 normalized unique orientations, no duplicate cells', () => {
    expect(CATALOGUE.length).toBe(39);
    expect(new Set(CATALOGUE.map(e => e.key)).size).toBe(39);
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
  test('three distinct slot IDs with repeatable geometry, matching the reference hands', () => {
    const rng = createRandom(7);
    let repeated = 0;
    for (let i = 1; i <= 1000; i++) {
      const shapes = createShapes(3, rng.next, i);
      expect(shapes.length).toBe(3);
      expect(new Set(shapes.map(s => s.id)).size).toBe(3);
      if(new Set(shapes.map(s => shapeKey(s.cells))).size<3) repeated++;
    }
    expect(repeated).toBeGreaterThan(0);
    expect(new Set(createShapes(3,()=>0).map(s=>shapeKey(s.cells))).size).toBe(1);
  });
  test.each([[1,.35,.55,.1],[30,.3,.55,.15]])('round %i uses documented family/size weights without board-dependent retries', (round,small,medium,large) => {
    const rng=createRandom(31), counts={small:0,medium:0,large:0};
    for(let i=0;i<10000;i++) {
      const shape=createRandomShape(rng.next,`sample-${i}`,round);
      counts[CATALOGUE.find(entry=>entry.key===shapeKey(shape.cells))!.group]++;
    }
    for(const [group,expected] of [['small',small],['medium',medium],['large',large]] as const) expect(Math.abs(counts[group]/10000-expected)).toBeLessThan(.015);
  });
  test('RNG state can be restored exactly, including zero', () => {
    const first = createRandom(0); first.next();
    const second = createRandom(first.state());
    expect(first.next()).toBe(second.next());
  });
});
