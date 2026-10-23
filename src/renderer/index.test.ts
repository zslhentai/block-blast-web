import { test, expect } from 'bun:test';
import { calculateLayout } from './canvas';
import { projectDrag, toLocal } from './input';
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
  expect(projectDrag(base, config).row).toBe(0); expect(projectDrag(base, config).col).toBe(0);
  const touch = { ...base, pointerType: 'touch', currentY: config.gridOffsetY + 2.15 * config.cellSize };
  expect(projectDrag(touch, config).row).toBe(0);
  expect(projectDrag({ ...base, currentX: -400 }, config).col).toBeLessThan(0);
});
