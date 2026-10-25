import { test, expect } from '@playwright/test';
import { fixture, drag, readState } from './helpers';
import { STORAGE_KEY } from '../../src/storage/localStorage';

test('a legacy hand refills through the new dealer once, saves history and resumes without changing input or feedback', async ({ page }, info) => {
  const state = await fixture(page, { shapes: [0, 1, 2].map(i => ({ id: `legacy-${i}`, color: i + 1, cells: [[0, 0]] })), dealer: undefined });
  for (let slot = 0; slot < 3; slot++) await drag(page, slot, 0, slot, true);
  const after = await readState(page);
  expect(after.round).toBe(state.round + 1); expect(after.moves).toBe(3); expect(after.score).toBe(3);
  expect(after.board[0].slice(0, 3)).toEqual([1, 2, 3]); expect(after.dealer?.version).toBe(1);
  expect(new Set(after.shapes.map(s => s!.id)).size).toBe(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('block-blast-web:run:v1')!).state)).toEqual(after);
  await page.reload(); await expect(page.getByTestId('menu')).toBeVisible(); await page.getByTestId('continue').click();
  expect(await readState(page)).toEqual(after);
  await page.screenshot({ path: info.outputPath('algorithm-refill.png') });
  expect(await page.evaluate(() => window.blockBlastAlgorithms)).toBeUndefined();
});
test('production debug query cannot expose developer diagnostics or alter saved gameplay', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('./?algorithmDebug=1'); await expect(page.getByTestId('menu')).toBeVisible(); await page.getByTestId('continue').click();
  expect(await page.evaluate(() => window.blockBlastAlgorithms)).toBeUndefined();
  expect(await readState(page)).toEqual(state);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).schemaVersion, STORAGE_KEY)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
