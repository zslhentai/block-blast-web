import { test, expect } from '@playwright/test';
import { fixture, readState, coordinates, drag } from './helpers';
import type { Shape } from '../../src/logic/types';

const referenceHand: Shape[] = [
  { id: 'red-five', color: 1, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 'blue-three', color: 2, cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'yellow-three', color: 5, cells: [[0, 0], [0, 1], [0, 2]] },
];

for (const [width, height] of [[320, 568], [393, 852], [412, 915]]) {
  test(`visual V1: ${width}×${height} fits, displays and accepts touch at the drawn cells`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await fixture(page, { highScore: 0, shapes: referenceHand });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect(), config = window.blockBlast!.getLayout();
      const score = document.querySelector('#score')!.getBoundingClientRect();
      const footer = document.querySelector('footer')!.getBoundingClientRect();
      const grid = { x: rect.left + config.gridOffsetX, y: rect.top + config.gridOffsetY, side: config.cellSize * 8 };
      const pieces = window.blockBlast!.getState().shapes.map((shape, i) => {
        if (!shape) throw new Error('Missing piece');
        const rows = Math.max(...shape.cells.map(([r]) => r)) + 1, cols = Math.max(...shape.cells.map(([, c]) => c)) + 1;
        const slot = config.slots[i];
        return { width: cols * config.trayCell, height: rows * config.trayCell,
          left: rect.left + slot.x + (slot.width - cols * config.trayCell) / 2,
          right: rect.left + slot.x + (slot.width + cols * config.trayCell) / 2,
          top: rect.top + slot.y + (slot.height - rows * config.trayCell) / 2,
          bottom: rect.top + slot.y + (slot.height + rows * config.trayCell) / 2 };
      });
      return { viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio, grid, pieces,
        scoreCenter: score.left + score.width / 2, scoreBottom: score.bottom, footerTop: footer.top,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        verticalOverflow: document.documentElement.scrollHeight > innerHeight,
        backingWidth: canvas.width, expectedBackingWidth: Math.round(rect.width * devicePixelRatio) };
    });
    expect(metrics.horizontalOverflow).toBe(false); expect(metrics.verticalOverflow).toBe(false);
    expect(metrics.grid.x).toBeGreaterThan(4); expect(metrics.grid.x + metrics.grid.side).toBeLessThan(width - 4);
    expect(metrics.scoreBottom).toBeLessThan(metrics.grid.y - 4);
    expect(metrics.scoreCenter).toBeCloseTo(width / 2, 0);
    expect(metrics.backingWidth).toBe(metrics.expectedBackingWidth);
    for (const piece of metrics.pieces) {
      expect(piece.left).toBeGreaterThan(0); expect(piece.right).toBeLessThan(width);
      expect(piece.top).toBeGreaterThan(metrics.grid.y + metrics.grid.side + 8);
      expect(piece.bottom).toBeLessThan(metrics.footerTop - 8);
    }
    expect(metrics.pieces[0].width / metrics.pieces[0].height).toBeCloseTo(5);
    await info.attach('layout', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`empty-${width}x${height}.png`) });
    await drag(page, 1, 3, 2, true);
    const after = await readState(page);
    expect(after.board[3]).toEqual([0, 0, 2, 2, 2, 0, 0, 0]);
    expect(after.board.flat().filter(Boolean)).toHaveLength(3); expect(after.score).toBe(3);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const pixel = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
      const c = window.blockBlast!.getLayout();
      return [...ctx.getImageData(Math.floor((c.gridOffsetX + 2.5 * c.cellSize) * devicePixelRatio),
        Math.floor((c.gridOffsetY + 3.5 * c.cellSize) * devicePixelRatio), 1, 1).data];
    });
    expect(pixel[2]).toBeGreaterThan(pixel[0] * 2); expect(pixel[3]).toBe(255);
    await page.screenshot({ path: info.outputPath(`placed-${width}x${height}.png`) });
    await page.getByTestId('settings-open').click();
    expect((await readState(page)).status).toBe('paused');
    await page.getByTestId('sound').check(); await page.getByTestId('reduced-motion').check();
    await page.getByTestId('license-details').click();
    await page.getByTestId('settings').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; });
    await expect(page.getByTestId('settings-close')).toBeInViewport();
    const dialogWidth = await page.getByTestId('settings').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(dialogWidth).toBeLessThanOrEqual(1);
    await page.getByTestId('license-details').click();
    await page.getByTestId('settings').evaluate(dialog => { dialog.scrollTop = 0; });
    await page.screenshot({ path: info.outputPath(`settings-${width}x${height}.png`) });
    await page.getByTestId('settings-close').click();
    expect((await readState(page)).status).toBe('playing');
    expect((await readState(page)).board).toEqual(after.board);
  });
}

test('visual V1: shared material on a mixed board, tray and captured touch drag', async ({ page }, info) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const board = Array.from({ length: 8 }, () => Array<number>(8).fill(0));
  for (let r = 3; r < 8; r++) board[r][1] = 2;
  board[5][0] = 5;
  for (let r = 4; r < 6; r++) { board[r][2] = 5; board[r][3] = 5; }
  for (let r = 6; r < 8; r++) for (let c = 2; c < 5; c++) board[r][c] = 1;
  for (let c = 5; c < 8; c++) { board[6][c] = 7; board[7][c] = 6; }
  await fixture(page, { board, score: 83, highScore: 83, shapes: [
    { id: 'orange-two', color: 7, cells: [[0, 0], [1, 0]] },
    { id: 'purple-four', color: 6, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { id: 'cyan-two', color: 3, cells: [[0, 0], [1, 0]] },
  ] });
  await page.screenshot({ path: info.outputPath('mixed-393x852.png') });
  const before = await readState(page), p = await coordinates(page, 0, 3, 5, true);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.startX, y: p.startY }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.endX, y: p.endY }] });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath('drag-393x852.png') });
  expect(await readState(page)).toEqual(before);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
  const after = await readState(page);
  expect(after.board[3][5]).toBe(7); expect(after.board[4][5]).toBe(7); expect(after.score).toBe(85);
});
