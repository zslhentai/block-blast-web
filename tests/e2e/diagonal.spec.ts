import { test, expect } from '@playwright/test';
import { fixture, ready, readState, drag } from './helpers';
import type { Shape } from '../../src/logic/types';

const diagonals: Shape[] = [
  { id: 'diagonal-down', color: 7, cells: [[0, 0], [1, 1]] },
  { id: 'diagonal-up', color: 7, cells: [[0, 1], [1, 0]] },
];
const mono: Shape = { id: 'mono', color: 2, cells: [[0, 0]] };

for (const [index, shape] of diagonals.entries()) {
  test(`${shape.id}: touch ignores occupied gaps, rejects collisions/edges, and restores both directions`, async ({ page }, info) => {
    await page.setViewportSize({ width: 393, height: 852 });
    const other = { ...diagonals[1 - index], color: 6 };
    const board = Array.from({ length: 8 }, () => Array<number>(8).fill(0));
    for (const [r, c] of other.cells) board[2 + r][2 + c] = 2;
    await fixture(page, { board, shapes: [shape, other, mono] });
    const before = await readState(page);
    await drag(page, 0, 2, 2, true, true); expect(await readState(page)).toEqual(before);
    for (const [row, col] of [[2, 3], [7, 0], [0, 7], [-1, 0], [0, -1]]) {
      await drag(page, 0, row, col, true); expect(await readState(page)).toEqual(before);
    }
    await drag(page, 0, 2, 2, true);
    const placed = await readState(page);
    expect(placed.score).toBe(2); expect(placed.moves).toBe(1); expect(placed.shapes[0]).toBeNull();
    for (const [r, c] of shape.cells) expect(placed.board[2 + r][2 + c]).toBe(7);
    for (const [r, c] of other.cells) expect(placed.board[2 + r][2 + c]).toBe(2);
    expect(placed.board.flat().filter(Boolean)).toHaveLength(4);
    await page.screenshot({ path: info.outputPath(`${shape.id}-placed.png`) });
    await page.reload(); await ready(page);
    const restored = await readState(page);
    expect({ ...restored, status: 'playing' }).toEqual(placed);
    expect(restored.shapes[1]?.cells).toEqual(other.cells);
    await page.getByTestId('continue').click();
    await drag(page, 1, 6, 6, true);
    const corner = await readState(page);
    for (const [r, c] of other.cells) expect(corner.board[6 + r][6 + c]).toBe(6);
    expect(corner.score).toBe(4); expect(corner.moves).toBe(2);
  });

  test(`${shape.id}: a touch fills two diagonal holes and clears both rows with existing V2 feedback`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    const board = Array.from({ length: 8 }, () => Array<number>(8).fill(0));
    board[3].fill(2); board[4].fill(5);
    for (const [r, c] of shape.cells) board[3 + r][2 + c] = 0;
    await fixture(page, { board, shapes: [shape, mono, null] });
    await drag(page, 0, 3, 2, true);
    const state = await readState(page);
    expect(state.board.flat().filter(Boolean)).toHaveLength(0);
    expect(state.linesCleared).toBe(2); expect(state.score).toBe(192);
    await expect(page.getByTestId('score')).toHaveText('192');
    const fx = await page.evaluate(() => window.blockBlast!.getFeedback());
    expect(fx.moves.at(-1)?.clearedCells).toBe(16);
    expect(fx.moves.at(-1)?.rows).toEqual([3, 4]); expect(fx.moves.at(-1)?.tier).toBe(0);
  });
}
