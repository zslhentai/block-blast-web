import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type LabWindow = Window & { blockBlastAudioLab: { snapshot: () => { active: number; timers: number; state: string; volume: number; message: string } } };
const lab = 'audio-lab/index.html';
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as LabWindow).blockBlastAudioLab.snapshot());

test('isolated audition supports repeated touch, baseline comparison, volume, sequence and stop without touching saves', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('audio-lab-save-sentinel', 'unchanged'));
  await page.goto(lab);
  expect(await snapshot(page)).toMatchObject({ state: 'uninitialized', active: 0, timers: 0 });
  for (const cue of ['place', 'single', 'multi', 'combo']) {
    await page.getByTestId(`play-${cue}`).click();
    await expect(page.getByTestId('audio-status')).toContainText('原创候选');
    await expect.poll(async () => (await snapshot(page)).state).toBe('running');
    expect((await snapshot(page)).active).toBeLessThanOrEqual(1);
    await page.getByTestId(`current-${cue}`).click();
    await expect(page.getByTestId('audio-status')).toContainText('正式版当前音效');
  }
  await page.getByTestId('level').selectOption('3');
  await page.getByTestId('play-combo').click();
  await expect(page.getByTestId('audio-status')).toContainText('Combo 3');
  await page.getByTestId('volume').fill('20');
  expect((await snapshot(page)).volume).toBe(0.2);
  await page.getByTestId('sequence').click();
  await expect(page.getByTestId('audio-status')).toContainText('连续试听 1/4');
  await expect(page.getByTestId('audio-status')).toContainText('连续试听 2/4', { timeout: 3000 });
  await page.getByTestId('stop').click();
  await expect.poll(async () => (await snapshot(page)).state).toBe('suspended');
  expect(await snapshot(page)).toMatchObject({ active: 0, timers: 0, message: '已停止' });
  // Rapid replacements and a stop while resume is pending cannot leave scheduled sound.
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) document.querySelector<HTMLButtonElement>('[data-cue="combo"]')!.click();
    document.querySelector<HTMLButtonElement>('#stop')!.click();
  });
  await expect.poll(async () => (await snapshot(page)).active).toBe(0);
  expect((await snapshot(page)).timers).toBe(0);
  const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(storage).toEqual({ 'audio-lab-save-sentinel': 'unchanged' });
  expect(await page.evaluate(() => !!document.querySelector('canvas'))).toBe(false);
  await page.getByTestId('study-summary').click();
  expect((await page.request.get('audio-lab/report.md')).status()).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('all four sequence cues finish and a zero-volume candidate stays muted', async ({ page }) => {
  await page.goto(lab); await page.getByTestId('sequence').click();
  await expect(page.getByTestId('audio-status')).toContainText('连续试听 1/4');
  await expect(page.getByTestId('audio-status')).toContainText('连续试听 2/4', { timeout: 2500 });
  await expect(page.getByTestId('audio-status')).toContainText('连续试听 3/4', { timeout: 2500 });
  await expect(page.getByTestId('audio-status')).toContainText('连续试听 4/4', { timeout: 2500 });
  await expect(page.getByTestId('audio-status')).toHaveText('连续试听完成');
  expect(await snapshot(page)).toMatchObject({ active: 0, timers: 0 });
  await page.getByTestId('volume').fill('0');
  await page.getByTestId('play-combo').click();
  expect((await snapshot(page)).volume).toBe(0);
  await page.getByTestId('stop').click();
});

test('backgrounding cancels playback and does not automatically restart on return', async ({ page }) => {
  await page.goto(lab); await page.getByTestId('sequence').click();
  await expect(page.getByTestId('audio-status')).toContainText('连续试听');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await snapshot(page)).state).toBe('suspended');
  expect(await snapshot(page)).toMatchObject({ active: 0, timers: 0 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await snapshot(page)).active).toBe(0);
  await page.getByTestId('play-place').click();
  await expect(page.getByTestId('audio-status')).toContainText('原创候选');
  await page.screenshot({ path: test.info().outputPath('audio-lab-mobile.png'), fullPage: true });
});

test('unsupported audio reports a useful message without breaking the audition page', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('unsupported'); } } }); });
  await page.goto(lab); await page.getByTestId('play-single').click();
  await expect(page.getByTestId('audio-status')).toContainText('浏览器未能开启声音');
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('audio-status')).toHaveText('已停止');
});

for (const [cue, sampleRate] of [['place', 44100], ['single', 48000], ['multi', 44100], ['combo', 48000]] as const) {
  test(`real Web Audio renders ${cue} at ${sampleRate} Hz with finite signal, bounded peak and silent tail`, async ({ page }) => {
    await page.addInitScript(({ rate }) => {
      // Render the actual delivered page's nodes into a real browser OfflineAudioContext.
      // Only the realtime lifecycle is adapted; synthesis, envelopes and samples are unchanged.
      Object.defineProperty(window, 'AudioContext', { value: function () {
        const offline = new OfflineAudioContext(1, rate * 2, rate);
        Object.defineProperty(window, 'testOfflineAudio', { configurable: true, value: offline });
        return new Proxy(offline, { get(target, key) {
          if (key === 'state') return 'running';
          if (key === 'resume' || key === 'suspend') return () => Promise.resolve();
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      } });
    }, { rate: sampleRate });
    await page.goto(lab);
    await page.getByTestId(`play-${cue}`).click();
    await expect(page.getByTestId('audio-status')).toContainText('原创候选');
    const result = await page.evaluate(async () => {
      const context = (window as unknown as Window & { testOfflineAudio: OfflineAudioContext }).testOfflineAudio;
      const buffer = await context.startRendering(); const data = buffer.getChannelData(0);
      let peak = 0, energy = 0, dc = 0, tail = 0;
      for (let i = 0; i < data.length; i++) {
        if (!Number.isFinite(data[i])) throw new Error('Non-finite audio sample');
        peak = Math.max(peak, Math.abs(data[i])); energy += data[i] ** 2; dc += data[i];
        if (i > buffer.sampleRate * 1.2) tail = Math.max(tail, Math.abs(data[i]));
      }
      return { peak, rms: Math.sqrt(energy / data.length), dc: dc / data.length, tail, sampleRate: buffer.sampleRate };
    });
    expect(result.sampleRate).toBe(sampleRate);
    expect(result.peak).toBeGreaterThan(0.01); expect(result.peak).toBeLessThan(0.25);
    expect(result.rms).toBeGreaterThan(0.001); expect(Math.abs(result.dc)).toBeLessThan(0.001);
    expect(result.tail).toBe(0);
    await test.info().attach(`rendered-${cue}.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  });
}
