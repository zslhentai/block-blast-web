import { test, expect } from '@playwright/test';
import { fixture, ready, readState, drag, coordinates } from './helpers';
import { canPlace } from '../../src/logic/placement';
import { STORAGE_KEY, BEST_KEY } from '../../src/storage/localStorage';
import type { Shape } from '../../src/logic/types';

const mono = (id: string): Shape => ({ id, cells: [[0, 0]], color: 1 });
test('production script boots, starts a real game, and has no runtime errors', async ({ page }) => {
  if (process.env.E2E_BLOCK_SCRIPT === '1') await page.route('**/assets/*.js', route => route.abort());
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./'); await ready(page);
  await page.getByTestId('continue').click();
  expect((await readState(page)).status).toBe('playing');
  expect((await readState(page)).shapes.filter(Boolean)).toHaveLength(3);
  await expect(page.getByTestId('score')).toHaveText('0'); expect(errors).toEqual([]);
});
test('boot assertion rejects an unloaded game script (regression for false-positive E2E)', async ({ page }) => {
  await page.route('**/assets/*.js', route => route.abort());
  await page.goto('./');
  await expect(ready(page, 400)).rejects.toThrow();
  await expect(page.getByTestId('new-game')).toBeDisabled();
  expect(await page.evaluate(() => Boolean(window.blockBlast))).toBe(false);
});
test('place, clear, score, preserve the used slot and restore the entire game', async ({ page, isMobile }) => {
  const board = Array.from({ length: 8 }, () => Array(8).fill(0)); board[0] = [1, 1, 1, 1, 1, 1, 1, 0];
  await fixture(page, { board, shapes: [mono('first'), mono('second'), mono('third')] });
  await drag(page, 1, 0, 7, isMobile);
  await expect(page.getByTestId('score')).toHaveText('81');
  const next = await readState(page);
  expect(next.board.flat().filter(Boolean)).toHaveLength(0); expect(next.linesCleared).toBe(1);
  expect(next.shapes.map(s => s?.id ?? null)).toEqual(['first', null, 'third']);
  await page.reload(); await ready(page);
  const restored = await readState(page);
  expect({ ...restored, status: 'playing' }).toEqual(next);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('best-score')).toHaveText('999');
});
test('system touch cancellation never places, consumes a piece or scores', async ({ page }) => {
  await fixture(page, { shapes: [mono('first'), mono('second'), mono('third')] });
  const before = await readState(page); await drag(page, 0, 0, 0, true, true);
  expect(await readState(page)).toEqual(before);
});
test('invalid off-board release is cancelled', async ({ page, isMobile }) => {
  await fixture(page, { shapes: [mono('first'), mono('second'), mono('third')] });
  const before = await readState(page); await drag(page, 0, 0, -1, isMobile);
  expect(await readState(page)).toEqual(before);
});
test('six real placements consume two hands without moving the remaining slots', async ({ page, isMobile }) => {
  await fixture(page);
  for (let step = 0; step < 6; step++) {
    const before = await readState(page);
    let move: { slot: number; row: number; col: number } | undefined;
    for (let slot = 0; slot < 3 && !move; slot++) {
      const shape = before.shapes[slot]; if (!shape) continue;
      for (let row = 0; row < 8 && !move; row++) for (let col = 0; col < 8 && !move; col++) {
        if (canPlace(before.board, shape, row, col)) move = { slot, row, col };
      }
    }
    expect(move).toBeDefined(); if (!move) throw new Error('Fixture lost all moves');
    await drag(page, move.slot, move.row, move.col, isMobile);
    await expect.poll(async () => (await readState(page)).moves).toBe(step + 1);
    expect((await readState(page)).score).toBeGreaterThan(before.score);
  }
  expect((await readState(page)).round).toBe(3);
});
test('last fitting move triggers a real game-over dialog and restart preserves best', async ({ page, isMobile }) => {
  const board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r + c) % 2));
  await fixture(page, { board, shapes: [mono('one'), { id: 'domino', color: 2, cells: [[0, 0], [0, 1]] }, null] });
  await drag(page, 0, 0, 0, isMobile);
  await expect(page.getByTestId('gameover')).toBeVisible();
  expect((await readState(page)).status).toBe('gameover');
  await expect(page.getByTestId('final-score')).toHaveText('1');
  await page.getByTestId('play-again').click();
  expect((await readState(page)).status).toBe('playing'); await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.getByTestId('best-score')).toHaveText('999');
});
test('settings and high score survive reload and a new game', async ({ page }) => {
  await fixture(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sound').check(); await page.getByTestId('reduced-motion').check();
  await page.getByTestId('settings-close').click();
  await page.reload(); await ready(page); await page.getByTestId('continue').click();
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('sound')).toBeChecked(); await expect(page.getByTestId('reduced-motion')).toBeChecked();
  await page.getByTestId('settings-close').click(); await page.getByTestId('new-game').click();
  await expect(page.getByTestId('best-score')).toHaveText('999');
});
test('corrupt game data does not lose the independent best score or crash', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await page.addInitScript(({ key, best }) => {
    localStorage.setItem(key, '{broken'); localStorage.setItem(`${key}:backup`, '{also-broken'); localStorage.setItem(best, '1234');
  }, { key: STORAGE_KEY, best: BEST_KEY });
  await page.reload(); await ready(page); await page.getByTestId('continue').click();
  await expect(page.getByTestId('best-score')).toHaveText('1234');
  expect((await readState(page)).board.flat().filter(Boolean)).toHaveLength(0);
});
test('resize cancels the active drag and rebuilds backing pixels without losing progress', async ({ page }) => {
  await fixture(page, { shapes: [mono('first'), mono('second'), mono('third')] });
  const before = await readState(page); const p = await coordinates(page, 0, 0, 0, false);
  await page.mouse.move(p.startX, p.startY); await page.mouse.down(); await page.mouse.move(p.endX, p.endY);
  await page.setViewportSize({ width: 360, height: 640 }); await page.mouse.up();
  expect(await readState(page)).toEqual(before);
  await expect.poll(async () => page.evaluate(() => {
    const canvas = document.querySelector('canvas')!; const rect = canvas.getBoundingClientRect();
    return Math.abs(canvas.width - Math.round(rect.width * devicePixelRatio));
  })).toBe(0);
});
test('short and tall phones fit the square board and all three touch slots', async ({ page }) => {
  await fixture(page);
  for (const [width, height] of [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(async () => page.evaluate(() => {
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      const config = window.blockBlast!.getLayout();
      return Math.abs(config.width - rect.width) + Math.abs(config.height - rect.height);
    })).toBeLessThan(1);
    const bounds = await page.evaluate(() => {
      const c = document.querySelector('canvas')!.getBoundingClientRect(); const layout = window.blockBlast!.getLayout();
      return { overflow: document.documentElement.scrollWidth > innerWidth,
        bottom: Math.max(...layout.slots.map(s => s.y + s.height)), height: c.height,
        boardSize: layout.cellSize * 8, width: c.width };
    });
    expect(bounds.overflow).toBe(false); expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
    expect(bounds.boardSize).toBeLessThanOrEqual(bounds.width);
  }
});
