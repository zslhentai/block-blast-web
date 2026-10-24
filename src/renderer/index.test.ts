import { test, expect } from 'bun:test';
import { calculateLayout } from './canvas';
import { projectDrag, toLocal } from './input';
import { pieceOrigin, shapeBounds } from './draw';
import { CATALOGUE } from '../logic/shapes';
import type { DragState } from './input';

test.each([[320, 360], [360, 420], [390, 640], [844, 220], [520, 800]])(
  'responsive board and three trays fit %i×%i CSS pixels', (width, height) => {
    const config = calculateLayout(width, height);
    expect(config.gridOffsetX).toBeGreaterThanOrEqual(0);
    expect(config.gridOffsetX + config.cellSize * 8).toBeLessThanOrEqual(width);
    for (const slot of config.slots) {
      expect(slot.y + slot.height).toBeLessThanOrEqual(height + 0.01);
      expect(slot.x + slot.width).toBeLessThanOrEqual(width);
    }
    expect(config.trayCell * 5).toBeLessThanOrEqual(width / 3);
  });
test('CSS resize mapping uses logical coordinates rather than multiplying by DPR', () => {
  const config = calculateLayout(390, 640);
  expect(toLocal(200, 340, { left: 5, top: 20, width: 780, height: 1280 }, config)).toEqual({ x: 97.5, y: 160 });
});
test('touch lift and mouse projection agree with the ghost origin, without remote snapping', () => {
  const config = calculateLayout(390, 640);
  const base: DragState = { shape: { id: 'one', cells: [[0, 0]], color: 1 }, slot: 0, revision: 0,
    pointerId: 1, pointerType: 'mouse', currentX: config.gridOffsetX + config.cellSize / 2,
    currentY: config.gridOffsetY + config.cellSize / 2 };
  // Fractional CSS geometry may round the first cell to -0, the same index.
  expect(projectDrag(base, config).row).toBeCloseTo(0, 10); expect(projectDrag(base, config).col).toBeCloseTo(0, 10);
  const touch = { ...base, pointerType: 'touch', currentY: config.gridOffsetY + 2.15 * config.cellSize };
  expect(projectDrag(touch, config).row).toBeCloseTo(0, 10);
  expect(projectDrag({ ...base, currentX: -400 }, config).col).toBeLessThan(0);
});

test.each([[304, 355], [377, 590], [396, 640], [828, 220]])(
  'all catalogue shapes and their shadows fit the three slots at %i×%i', (width, height) => {
    const config = calculateLayout(width, height);
    const boardBottom = config.gridOffsetY + config.cellSize * 8;
    for (const slot of config.slots) {
      expect(slot.y).toBeGreaterThan(boardBottom + 8);
      for (const entry of CATALOGUE) {
        const shape = { id: entry.key, color: 1, cells: entry.cells };
        const origin = pieceOrigin(shape, slot, config.trayCell);
        const bounds = shapeBounds(shape);
        expect(origin.x).toBeGreaterThanOrEqual(slot.x);
        expect(origin.y).toBeGreaterThanOrEqual(slot.y);
        expect(origin.x + (bounds.cols + 0.075) * config.trayCell).toBeLessThanOrEqual(slot.x + slot.width);
        expect(origin.y + (bounds.rows + 0.075) * config.trayCell).toBeLessThanOrEqual(slot.y + slot.height);
      }
    }
  });
