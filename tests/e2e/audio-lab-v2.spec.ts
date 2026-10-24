import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
type Lab = Window & { blockBlastPcmLab: { snapshot: () => { active: number; queued: number; fading: number; state: string; cached: number; message: string } } };
const url = 'audio-lab/v2.html';
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as Lab).blockBlastPcmLab.snapshot());

test('V2 eight candidates, reversible A/B, repeat modes and volume work without touching the game or V1', async ({ page, isMobile }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('lab-v2-sentinel', 'preserved'));
  await page.goto(url);
  expect(await snapshot(page)).toMatchObject({ state: 'uninitialized', cached: 0 });
  for (const kind of ['place', 'single', 'multi', 'combo']) for (const direction of ['A', 'B']) {
    if (isMobile) await page.getByTestId(`v2-${kind}-${direction}`).tap();
    else await page.getByTestId(`v2-${kind}-${direction}`).click();
    await expect(page.getByTestId('v2-status')).toContainText(`· ${direction}`);
    expect((await snapshot(page)).active).toBeLessThanOrEqual(1);
    expect((await snapshot(page)).cached).toBe(8);
    const wav = await page.request.get(await page.getByTestId(`wav-${kind}-${direction}`).getAttribute('href') ?? '');
    expect(wav.status()).toBe(200); expect((await wav.body()).subarray(0, 4).toString()).toBe('RIFF');
  }
  await page.getByTestId('v2-level').selectOption('3');
  await page.getByTestId('v2-combo-B').click();
  await expect(page.getByTestId('v2-status')).toContainText('等级 3');
  for (const order of ['AB', 'BA']) {
    await page.getByTestId(`compare-single-${order}`).click();
    await expect(page.getByTestId('v2-status')).toContainText(order === 'AB' ? 'A → B' : 'B → A');
    expect((await snapshot(page)).queued).toBe(1);
  }
  for (const direction of ['A', 'B']) for (const mode of ['place', 'clears']) {
    await page.getByTestId(`stress-${mode}-${direction}`).click();
    await expect(page.getByTestId('v2-status')).toContainText('连续试听');
    expect((await snapshot(page)).queued).toBeGreaterThan(0);
    expect((await snapshot(page)).queued).toBeLessThanOrEqual(7);
  }
  await page.getByTestId('v2-volume').fill('20');
  await page.getByTestId('v2-stop').click();
  await expect.poll(async () => (await snapshot(page)).state).toBe('suspended');
  expect(await snapshot(page)).toMatchObject({ active: 0, queued: 0, fading: 0 });
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual({ 'lab-v2-sentinel': 'preserved' });
  expect(await page.locator('canvas').count()).toBe(0);
  await page.getByTestId('v2-notes').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.request.get('audio-lab/v2-report.md')).status()).toBe(200);
  await page.screenshot({ path: test.info().outputPath('audio-lab-v2.png'), fullPage: true });
  await page.getByTestId('v1-link').click();
  await page.getByTestId('play-place').click(); await expect(page.getByTestId('audio-status')).toContainText('原创候选');
  expect(errors).toEqual([]);
});

test('pending decode can be stopped; background stops the entire queued phrase and return needs a tap', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/place-A.wav', async route => { await gate; await route.continue(); });
  await page.goto(url); await page.getByTestId('compare-single-AB').click();
  await expect(page.getByTestId('v2-status')).toContainText('正在准备');
  await page.getByTestId('v2-stop').click(); release();
  await expect.poll(async () => (await snapshot(page)).cached).toBe(8);
  expect(await snapshot(page)).toMatchObject({ active: 0, queued: 0, state: 'suspended' });
  await page.getByTestId('stress-clears-B').click();
  await expect(page.getByTestId('v2-status')).toContainText('连续试听');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await snapshot(page)).state).toBe('suspended');
  expect(await snapshot(page)).toMatchObject({ active: 0, queued: 0, fading: 0 });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  expect((await snapshot(page)).active).toBe(0);
  await page.getByTestId('v2-place-A').click(); await expect(page.getByTestId('v2-status')).toContainText('播放');
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) document.querySelector<HTMLButtonElement>('[data-testid="v2-combo-B"]')!.click();
    document.querySelector<HTMLButtonElement>('#stop')!.click();
  });
  await expect.poll(async () => (await snapshot(page)).active).toBe(0);
  expect((await snapshot(page)).queued).toBe(0);
});

test('missing sample reports failure, retry recovers, and unsupported audio stays usable', async ({ page }) => {
  await page.route('**/*.wav', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto(url); await page.getByTestId('v2-single-A').click();
  await expect(page.getByTestId('v2-status')).toContainText('音效未能加载或开启');
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByTestId('v2-single-A').click(); await expect(page.getByTestId('v2-status')).toContainText('播放');
  await page.addInitScript(() => Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('unavailable'); } } }));
  await page.reload(); await page.getByTestId('v2-place-A').click();
  await expect(page.getByTestId('v2-status')).toContainText('音效未能加载或开启');
  await page.getByTestId('v2-stop').click(); await expect(page.getByTestId('v2-status')).toHaveText('已停止');
});

const cases = [
  ...['place', 'single', 'multi', 'combo'].flatMap(kind => ['A', 'B'].map(direction => ({ id: `v2-${kind}-${direction}`, rate: direction === 'A' ? 44100 : 48000, muted: false }))),
  ...['place', 'clears'].flatMap(mode => ['A', 'B'].map(direction => ({ id: `stress-${mode}-${direction}`, rate: 48000, muted: false }))),
  { id: 'v2-combo-B', rate: 48000, muted: true },
];
for (const scenario of cases) test(`actual PCM + room + mixer renders ${scenario.id}${scenario.muted ? ' muted' : ''}`, async ({ page }) => {
  await page.addInitScript(({ rate }) => {
    Object.defineProperty(window, 'AudioContext', { value: function () {
      const context = new OfflineAudioContext(2, rate * 4, rate);
      Object.defineProperty(window, 'testPcmContext', { configurable: true, value: context });
      return new Proxy(context, { get(target, key) {
        if (key === 'state') return 'running';
        if (key === 'resume' || key === 'suspend') return () => Promise.resolve();
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    } });
  }, { rate: scenario.rate });
  await page.goto(url);
  await page.getByTestId('v2-volume').fill(scenario.muted ? '0' : '70');
  await page.getByTestId(scenario.id).click();
  await expect(page.getByTestId('v2-status')).toContainText(scenario.id.startsWith('stress') ? '连续试听' : '播放');
  const metrics = await page.evaluate(async () => {
    const context = (window as unknown as Window & { testPcmContext: OfflineAudioContext }).testPcmContext;
    const buffer = await context.startRendering();
    let peak = 0, energy = 0, tail = 0, stereoDifference = 0, onset = 0;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        if (!Number.isFinite(data[i])) throw new Error('Non-finite output');
        peak = Math.max(peak, Math.abs(data[i])); energy += data[i] ** 2;
        if (i < buffer.sampleRate * 0.12) onset += data[i] ** 2;
        if (i > buffer.sampleRate * 3) tail = Math.max(tail, Math.abs(data[i]));
        if (channel === 1) stereoDifference += (data[i] - buffer.getChannelData(0)[i]) ** 2;
      }
    }
    return { sampleRate: buffer.sampleRate, peak, rms: Math.sqrt(energy / (buffer.length * 2)), tail, stereoDifference, onset };
  });
  if (scenario.muted) { expect(metrics.peak).toBe(0); expect(metrics.rms).toBe(0); }
  else {
    expect(metrics.peak).toBeGreaterThan(0.005); expect(metrics.peak).toBeLessThan(0.58);
    expect(metrics.rms).toBeGreaterThan(0.0005); expect(metrics.onset).toBeGreaterThan(0.001);
    expect(metrics.stereoDifference).toBeGreaterThan(0);
  }
  expect(metrics.tail).toBeLessThan(0.00001);
  await test.info().attach(`${scenario.id}-${scenario.muted ? 'muted' : 'max-volume'}.json`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
});
