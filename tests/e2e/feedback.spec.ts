import { test, expect } from '@playwright/test';
import { fixture, readState, drag, coordinates, ready } from './helpers';
import type { Board, Shape } from '../../src/logic/types';
import { MOTION } from '../../src/renderer/motion';

const empty = (): Board => Array.from({ length: 8 }, () => Array<number>(8).fill(0));
const mono = (id: string, color = 7): Shape => ({ id, color, cells: [[0, 0]] });
const feedback = (page: import('@playwright/test').Page) => page.evaluate(() => window.blockBlast!.getFeedback());

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-24T12:00:01Z'));
});

for (const kind of ['single-row', 'two-rows', 'two-columns', 'cross']) {
  test(`V2 ${kind}: commit first, highlight, dissipate, then stop rendering`, async ({ page }, info) => {
    const board = empty(); let shape = mono('first'), row = 6, col = 0;
    if (kind === 'single-row') board[6] = [0, 2, 2, 5, 5, 1, 6, 7];
    if (kind === 'two-rows') {
      board[5] = [0, 2, 2, 5, 5, 1, 6, 7]; board[6] = [...board[5]];
      shape = { id: 'first', color: 7, cells: [[0, 0], [1, 0]] }; row = 5;
    }
    if (kind === 'two-columns') {
      for (let r = 1; r < 8; r++) { board[r][5] = 2; board[r][6] = 5; }
      shape = { id: 'first', color: 7, cells: [[0, 0], [0, 1]] }; row = 0; col = 5;
    }
    if (kind === 'cross') {
      board[6] = [1, 2, 2, 0, 5, 1, 6, 7]; for (let r = 0; r < 8; r++) if (r !== 6) board[r][3] = 2;
      col = 3;
    }
    await fixture(page, { board, shapes: [shape, mono('second', 2), mono('third', 5)] });
    await page.clock.runFor(32); await drag(page, 0, row, col, true);
    const state = await readState(page), fx = await feedback(page);
    expect(state.board.flat().filter(Boolean)).toHaveLength(0);
    const score = kind === 'single-row' ? 81 : kind === 'cross' ? 181 : 192;
    expect(state.score).toBe(score); await expect(page.getByTestId('score')).toHaveText(String(score));
    expect(fx.activeMoves).toBe(1); expect(fx.moves[0].tier).toBe(0);
    expect(fx.moves[0].clearedCells).toBe(kind === 'single-row' ? 8 : kind === 'cross' ? 15 : 16);
    expect(fx.moves[0].rows).toEqual(kind === 'two-columns' ? [] : kind === 'two-rows' ? [5, 6] : [6]);
    expect(fx.moves[0].cols).toEqual(kind === 'two-columns' ? [5, 6] : kind === 'cross' ? [3] : []);
    await info.attach('committed-before-animation', { body: JSON.stringify({ score: state.score, cleared: state.linesCleared, feedback: fx }), contentType: 'application/json' });
    await page.clock.runFor(45); await page.screenshot({ path: info.outputPath(`${kind}-045ms.png`) });
    await page.clock.runFor(165); await page.screenshot({ path: info.outputPath(`${kind}-210ms.png`) });
    await page.clock.runFor(1000);
    expect((await feedback(page)).activeMoves).toBe(0); expect((await feedback(page)).framePending).toBe(false);
    expect(await readState(page)).toEqual(state);
    await page.screenshot({ path: info.outputPath(`${kind}-settled.png`) });
  });
}

for (const [chain, tier] of [[1, 1], [2, 2], [4, 3]]) {
  test(`V2 Combo tier ${tier} is a committed chain clear, never an ordinary placement`, async ({ page }, info) => {
    const board = empty(); board[6] = [0, 2, 2, 5, 5, 1, 6, 7];
    await fixture(page, { board, combo: chain, shapes: [mono('first'), mono('second'), mono('third')] });
    await page.clock.runFor(32); await drag(page, 0, 6, 0, true);
    expect((await feedback(page)).moves[0].tier).toBe(tier);
    expect((await readState(page)).score).toBe(81 + chain * 20);
    for (const [advance, label] of [[80, '080'], [160, '240'], [360, '600']] as const) {
      await page.clock.runFor(advance); await page.screenshot({ path: info.outputPath(`combo-tier-${tier}-${label}ms.png`) });
    }
    await page.clock.runFor(MOTION.comboMs);
    await drag(page, 1, 2, 2, true);
    expect((await feedback(page)).moves.at(-1)?.tier).toBe(0);
    expect((await readState(page)).combo).toBe(chain + 1);
  });
}

test('V2 rapid clear/replacement is immediate, does not replay, and old snapshots cannot cover new blocks', async ({ page }, info) => {
  const board = empty(); board[6] = [0, 2, 2, 5, 5, 1, 6, 7];
  await fixture(page, { board, shapes: [mono('first'), mono('second', 2), mono('third', 5)] });
  await page.clock.runFor(32);
  await drag(page, 0, 6, 0, true); await drag(page, 1, 6, 0, true);
  const state = await readState(page);
  expect(state.score).toBe(82); expect(state.moves).toBe(2); expect(state.board[6][0]).toBe(2);
  expect((await feedback(page)).activeMoves).toBe(2);
  // CDP rejects an unmatched touchEnd before it can reach application code.
  await page.locator('canvas').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  expect(await readState(page)).toEqual(state);
  await page.clock.runFor(32);
  const pixel = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!, c = window.blockBlast!.getLayout();
    return [...canvas.getContext('2d')!.getImageData(Math.floor((c.gridOffsetX + c.cellSize * 0.5) * devicePixelRatio),
      Math.floor((c.gridOffsetY + c.cellSize * 6.5) * devicePixelRatio), 1, 1).data];
  });
  expect(pixel[2]).toBeGreaterThan(pixel[0] * 2);
  await page.screenshot({ path: info.outputPath('rapid-replacement-032ms.png') });
  await drag(page, 2, 2, 2, true, true); expect(await readState(page)).toEqual(state);
  await page.clock.runFor(1200); expect((await feedback(page)).framePending).toBe(false);
});

test('V2 compensated preview, invalid release and system cancellation keep release coordinates authoritative', async ({ page }, info) => {
  const board = empty(); board[0][0] = 1;
  await fixture(page, { board, shapes: [mono('first'), mono('second'), mono('third')] });
  await page.clock.runFor(32); const before = await readState(page);
  const session = await page.context().newCDPSession(page);
  for (const valid of [false, true]) {
    const p = await coordinates(page, 0, valid ? 3 : 0, valid ? 4 : 0, true);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.startX, y: p.startY }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.endX, y: p.endY }] });
    await page.clock.runFor(32);
    const fx = await feedback(page); expect(fx.preview?.valid).toBe(valid);
    expect(fx.preview?.row).toBeCloseTo(valid ? 3 : 0, 10); expect(fx.preview?.col).toBeCloseTo(valid ? 4 : 0, 10);
    await page.screenshot({ path: info.outputPath(valid ? 'preview-valid.png' : 'preview-invalid.png') });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(await readState(page)).toEqual(before); expect((await feedback(page)).preview).toBeNull();
  }
  await session.detach();
  await drag(page, 0, 0, 0, true);
  expect(await readState(page)).toEqual(before); expect((await feedback(page)).invalid).toBe(true);
  await expect(page.getByTestId('feedback')).toHaveText('这里放不下，换个位置试试');
  await page.clock.runFor(200); expect((await feedback(page)).invalid).toBe(false);
});

test('V2 pause, visibility changes and actual navigation discard transient effects without losing committed progress', async ({ page }) => {
  await fixture(page, { shapes: [mono('first'), mono('second'), mono('third')] });
  await drag(page, 0, 0, 0, true); const placed = await readState(page);
  await page.getByTestId('pause').click();
  expect((await feedback(page)).activeMoves).toBe(0);
  await expect(page.getByTestId('feedback')).toBeEmpty();
  await page.getByTestId('continue').click(); await drag(page, 1, 0, 1, true);
  const beforeResize = await readState(page); expect(beforeResize.moves).toBe(placed.moves + 1);
  await page.setViewportSize({ width: 360, height: 800 }); await page.clock.runFor(32);
  expect((await feedback(page)).activeMoves).toBe(0); expect(await readState(page)).toEqual(beforeResize);
  await drag(page, 2, 0, 2, true);
  const committed = await readState(page); expect(committed.moves).toBe(placed.moves + 2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await feedback(page); expect(hidden.activeMoves).toBe(0); expect(hidden.framePending).toBe(false);
  expect((await readState(page)).status).toBe('paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.goto('about:blank'); await page.goBack(); await ready(page);
  expect({ ...await readState(page), status: 'playing' }).toEqual(committed);
  expect((await feedback(page)).activeMoves).toBe(0);
});

test('V2 system reduced motion wins over a saved unchecked setting and reacts while effects are active', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const board = empty(); board[6] = [0, 2, 2, 5, 5, 1, 6, 7];
  await fixture(page, { board, shapes: [mono('first'), mono('second'), mono('third')] });
  expect((await feedback(page)).reducedMotion).toBe(true);
  await drag(page, 0, 6, 0, true);
  expect((await readState(page)).score).toBe(81); expect((await feedback(page)).activeMoves).toBe(0);
  await expect(page.getByTestId('feedback')).toHaveText('消除！+81');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => { await page.clock.runFor(16); return (await feedback(page)).reducedMotion; }).toBe(false);
  await drag(page, 1, 2, 2, true); expect((await feedback(page)).activeMoves).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => { await page.clock.runFor(16); return (await feedback(page)).reducedMotion; }).toBe(true);
  expect((await feedback(page)).activeMoves).toBe(0);
});
