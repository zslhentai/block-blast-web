import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/logic/state';
import { canPlace } from '../src/logic/placement';
import { STORAGE_KEY, DEFAULT_SETTINGS } from '../src/storage/localStorage';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const html = await Bun.file('artifacts/block-blast-mvp.html').text();
const server = Bun.serve({ hostname: '127.0.0.1', port: 0,
  fetch: () => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const requests: string[] = [], errors: string[] = [];
  page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ key, state, settings }) => {
    if (!sessionStorage.getItem('portable-seeded')) {
      localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, ruleVersion: 1, catalogueVersion: 1, savedAt: Date.now(), state, settings }));
      sessionStorage.setItem('portable-seeded', 'true');
    }
  }, { key: STORAGE_KEY, state: { ...createInitialState(0, 17), status: 'playing' }, settings: DEFAULT_SETTINGS });
  // The managed browser prohibits file: URLs. Serve our own generated HTML
  // normally, then disconnect; never disable the browser's file-access policy.
  const origin = `http://127.0.0.1:${server.port}`;
  await page.goto(origin);
  await page.getByTestId('continue').click();
  await context.setOffline(true);
  for (let step = 0; step < 6; step++) {
    const state = await page.evaluate(() => window.blockBlast!.getState());
    let move: { slot: number; row: number; col: number } | undefined;
    for (let slot = 0; slot < 3 && !move; slot++) {
      const shape = state.shapes[slot]; if (!shape) continue;
      for (let row = 0; row < 8 && !move; row++) for (let col = 0; col < 8 && !move; col++) {
        if (canPlace(state.board, shape, row, col)) move = { slot, row, col };
      }
    }
    assert(move, 'No legal move in the deterministic portable fixture');
    const p = await page.evaluate(({ slot, row, col }) => {
      const game = window.blockBlast!; const config = game.getLayout(); const shape = game.getState().shapes[slot]!;
      const rect = document.querySelector('canvas')!.getBoundingClientRect(); const tray = config.slots[slot];
      const rows = Math.max(...shape.cells.map(([r]) => r)) + 1, cols = Math.max(...shape.cells.map(([, c]) => c)) + 1;
      return { x1: rect.left + tray.x + tray.width / 2, y1: rect.top + tray.y + tray.height / 2,
        x2: rect.left + config.gridOffsetX + (col + cols / 2) * config.cellSize,
        y2: rect.top + config.gridOffsetY + (row + rows / 2) * config.cellSize };
    }, move);
    await page.mouse.move(p.x1, p.y1); await page.mouse.down(); await page.mouse.move(p.x2, p.y2, { steps: 6 }); await page.mouse.up();
    assert.equal((await page.evaluate(() => window.blockBlast!.getState())).moves, step + 1);
  }
  const before = await page.evaluate(() => window.blockBlast!.getState());
  await context.setOffline(false); // Hosted offline reload is a later SW milestone.
  await page.reload(); await page.getByTestId('continue').click();
  assert.deepEqual(await page.evaluate(() => window.blockBlast!.getState()), before);
  await page.screenshot({ path: 'artifacts/mvp-mobile.png' });
  assert.equal(requests.filter(url => !url.startsWith(origin)).length, 0); assert.deepEqual(errors, []);
  await Bun.write('artifacts/portable-validation.json', JSON.stringify({
    passed: true, browser: browser.version(), viewport: { width: 390, height: 844 }, loadedThenDisconnected: true,
    actualOfflinePlacements: 6, score: before.score, restoredEntireStateWithOnlineReload: true,
    externalRequests: 0, runtimeErrors: errors,
    directFileUrl: 'Not verified: managed browser policy returned ERR_BLOCKED_BY_ADMINISTRATOR',
  }, null, 2) + '\n');
  console.log('Portable HTML passed: six placements after disconnect, online reload restores state, no external requests or runtime errors.');
} finally { server.stop(true); await browser.close(); }
