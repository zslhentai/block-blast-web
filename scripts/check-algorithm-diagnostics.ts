import { chromium, devices } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRandom } from '../src/logic/rng';
import { canPlace } from '../src/logic/placement';

const vite = new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname;
const server = Bun.spawn([process.execPath, vite, '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdout: 'ignore', stderr: 'pipe' });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const address = 'http://127.0.0.1:4175/'; let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${await new Response(server.stderr).text()}`);
    try { ready = (await fetch(address)).ok; } catch { /* local startup */ }
    if (ready) break; await Bun.sleep(100);
  }
  assert(ready, 'Development server did not start');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
  const reports: unknown[] = [];
  for (const device of ['Desktop Chrome', 'iPhone 14', 'Pixel 7']) {
    const { defaultBrowserType: _browserType, ...descriptor } = devices[device];
    const context = await browser.newContext(descriptor);
    const page = await context.newPage(); await page.goto(address); await page.waitForFunction(() => Boolean(window.blockBlast));
    assert.equal(await page.evaluate(() => window.blockBlastAlgorithms), undefined);
    await page.goto(`${address}?algorithmDebug=1`); await page.waitForFunction(() => Boolean(window.blockBlastAlgorithms));
    await page.getByTestId('continue').click();
    const before = await page.evaluate(() => window.blockBlast!.getState());
    const result = await page.evaluate(() => ({ inspect: window.blockBlastAlgorithms!.inspect(), preview: window.blockBlastAlgorithms!.previewNextHand(), state: window.blockBlast!.getState() }));
    assert.deepEqual(result.state, before); assert.equal(result.inspect.policy, 'bounded-classic-v3'); assert(result.preview.work <= 8000);
    for (let n = 0; n < 3; n++) {
      const state = await page.evaluate(() => window.blockBlast!.getState()); let target: { slot: number; row: number; col: number } | undefined;
      for (let slot = 0; slot < 3 && !target; slot++) {
        const shape = state.shapes[slot]; if (!shape) continue;
        for (let r = 0; r < 8 && !target; r++) for (let c = 0; c < 8; c++) if (canPlace(state.board, shape, r, c)) { target = { slot, row: r, col: c }; break; }
      }
      assert(target);
      const p = await page.evaluate(({ slot, row, col }) => {
        const layout = window.blockBlast!.getLayout(), shape = window.blockBlast!.getState().shapes[slot]!, tray = layout.slots[slot], rect = document.querySelector('canvas')!.getBoundingClientRect();
        const rows = Math.max(...shape.cells.map(p => p[0])) + 1, cols = Math.max(...shape.cells.map(p => p[1])) + 1;
        return { x1: rect.left + tray.x + tray.width / 2, y1: rect.top + tray.y + tray.height / 2,
          x2: rect.left + layout.gridOffsetX + (col + cols / 2) * layout.cellSize, y2: rect.top + layout.gridOffsetY + (row + rows + 1.15) * layout.cellSize };
      }, target);
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x1, y: p.y1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x2, y: p.y2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
    }
    const observed = await page.evaluate(() => window.blockBlastAlgorithms!.inspect());
    assert.equal(observed.state.moves, 3); assert(observed.lastDeal); assert(observed.lastDeal.work <= 8000);
    const rng = createRandom(20261025), boards = Array.from({ length: 80 }, (_, i) => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => Number(rng.next() < (i % 8) / 10))));
    const session = await context.newCDPSession(page); await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const perf = await page.evaluate(boards => boards.map(board => {
      const report = window.blockBlastAlgorithms!.previewNextHand(board); return { ms: report.elapsedMs, work: report.work, mode: report.used };
    }), boards);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await session.detach();
    const times = perf.map(p => p.ms).sort((a, b) => a - b);
    assert.deepEqual(await page.evaluate(() => window.blockBlast!.getState()), observed.state);
    assert(perf.every(p => p.work <= 8000)); assert(times.at(-1)! < 120, 'Unacceptable bounded-deal latency on this runner');
    reports.push({ device, browser: browser.version(), samples: perf.length, throttle: 4, medianMs: times[39], p95Ms: times[75], maxMs: times.at(-1), samplesDetail: perf, limits: 'Linux Chromium CPU throttling and emulated viewport, not actual device/Safari timing.' });
    await context.close();
  }
  mkdirSync('artifacts', { recursive: true }); writeFileSync('artifacts/algorithm-browser-performance.json', JSON.stringify(reports, null, 2) + '\n');
  console.log('Algorithm diagnostics passed: explicit development gate, pure hypothetical preview, real touch refill, three emulated viewports, bounded 4× CPU probes.');
} finally { await browser?.close(); server.kill(); await server.exited; }
