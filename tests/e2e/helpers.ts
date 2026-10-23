import { expect, type Page } from '@playwright/test';
import { createInitialState } from '../../src/logic/state';
import { type GameState } from '../../src/logic/types';
import { type SavedGame, DEFAULT_SETTINGS, STORAGE_KEY } from '../../src/storage/localStorage';

export async function ready(page: Page, timeout = 5000) {
  await expect(page.locator('body'), 'GAME_SCRIPT_NOT_READY').toHaveAttribute('data-game-ready', 'true', { timeout });
  expect(await page.evaluate(() => Boolean(window.blockBlast))).toBe(true);
}
export async function readState(page: Page): Promise<GameState> {
  return page.evaluate(() => {
    if (!window.blockBlast) throw new Error('Game script has not booted');
    return window.blockBlast.getState();
  });
}
export async function fixture(page: Page, override: Partial<GameState> = {}) {
  const state = { ...createInitialState(999, 17), status: 'playing' as const, ...override };
  const saved: SavedGame = { schemaVersion: 1, ruleVersion: 1, catalogueVersion: 1,
    savedAt: Date.now(), settings: DEFAULT_SETTINGS, state };
  // Install before the first app boot. Injecting just before reload would be
  // overwritten by the *old* page's legitimate pagehide autosave.
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem('e2e-fixture-installed')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('e2e-fixture-installed', 'true');
    }
  }, { key: STORAGE_KEY, value: JSON.stringify(saved) });
  await page.goto('./'); await ready(page);
  expect((await readState(page)).shapes).toEqual(state.shapes);
  if (state.status !== 'gameover') await page.getByTestId('continue').click();
  return state;
}
export async function coordinates(page: Page, slot: number, row: number, col: number, touch: boolean) {
  return page.evaluate(({ slot, row, col, touch }) => {
    const game = window.blockBlast; if (!game) throw new Error('Game unavailable');
    const shape = game.getState().shapes[slot]; if (!shape) throw new Error('Slot is empty');
    const config = game.getLayout();
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    const rows = Math.max(...shape.cells.map(([r]) => r)) + 1;
    const cols = Math.max(...shape.cells.map(([, c]) => c)) + 1;
    const tray = config.slots[slot];
    return { startX: rect.left + tray.x + tray.width / 2, startY: rect.top + tray.y + tray.height / 2,
      endX: rect.left + config.gridOffsetX + (col + cols / 2) * config.cellSize,
      endY: rect.top + config.gridOffsetY + (touch ? row + rows + 1.15 : row + rows / 2) * config.cellSize };
  }, { slot, row, col, touch });
}
export async function drag(page: Page, slot: number, row: number, col: number, touch: boolean, cancel = false) {
  const p = await coordinates(page, slot, row, col, touch);
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.startX, y: p.startY }] });
    for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: p.startX + (p.endX - p.startX) * i / 6, y: p.startY + (p.endY - p.startY) * i / 6 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(p.startX, p.startY); await page.mouse.down(); await page.mouse.move(p.endX, p.endY, { steps: 6 });
    if (cancel) await page.locator('canvas').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
    await page.mouse.up();
  }
}
