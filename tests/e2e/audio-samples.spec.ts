import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
type SamplesWindow = Window & { blockBlastSamples: { snapshot: () => { paused: boolean; currentTime: number; pending: number; src: string; state: number } }; samplePlayed: string[] };
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as SamplesWindow).blockBlastSamples.snapshot());
async function ready(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Prove the new library does not need synthesis or AudioContext at all.
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('No synthesis in sample library'); } } });
    const played: string[] = []; Object.defineProperty(window, 'samplePlayed', { value: played });
    document.addEventListener('playing', event => { if (event.target instanceof HTMLAudioElement) played.push(event.target.currentSrc); }, true);
    localStorage.setItem('sample-save-sentinel','preserved');
  });
  await page.goto('audio-lab/samples.html');
  await expect(page.getByTestId('catalog-status')).toContainText('12 个现成素材初筛');
}
async function played(page: Page, suffix: string): Promise<void> {
  await expect.poll(() => page.evaluate(suffix => (window as unknown as SamplesWindow).samplePlayed.some(url => url.endsWith(suffix)), suffix)).toBe(true);
}

test('all twelve original excerpts and edits decode and play from touch, with provenance and no save mutation', async ({ page, isMobile }) => {
  const errors: string[] = []; page.on('pageerror',e => errors.push(e.message));
  await ready(page); expect((await snapshot(page)).src).toBe('');
  const cases = [ ['place',['P1','P2','P3'],['place-glass','place-wood','place-tick']], ['single',['S1','S2','S3'],['single-bell','single-chime','single-tree']], ['multi',['M1','M2','M3'],['multi-glass','multi-tree','multi-chimes']], ['combo',['C1','C2','C3'],['combo-pizzi','combo-steel','combo-chimes']] ] as const;
  for (const [group,codes,ids] of cases) {
    await page.getByTestId(`group-${group}`).click();
    for (let i = 0; i < codes.length; i++) for (const version of ['A','B']) {
      const button = page.getByTestId(`${codes[i]}-${version}`);
      if (isMobile) await button.tap(); else await button.click();
      await played(page, `/${version === 'A' ? 'preview' : 'edited'}/${ids[i]}.wav`);
      expect((await snapshot(page)).state).toBeGreaterThanOrEqual(2);
    }
  }
  await page.getByTestId('group-place').click(); await page.getByTestId('P1-details').click();
  expect(await page.getByTestId('P1-source').getAttribute('href')).toBe('https://kenney.nl/assets/impact-sounds');
  const license = await page.request.get(await page.getByTestId('P1-license').getAttribute('href') ?? '');
  expect(await license.text()).toContain('CC0 1.0 Universal');
  await page.getByTestId('P1-original').click(); await played(page,'/original/place-glass.ogg');
  await page.getByTestId('sample-stop').click(); expect(await snapshot(page)).toMatchObject({ paused: true, pending: 0, src: '' });
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual({ 'sample-save-sentinel':'preserved' });
  expect(await page.locator('canvas').count()).toBe(0); expect(errors).toEqual([]);
});

test('A/B and reverse order complete; replacement, stop and background discard pending playback', async ({ page }) => {
  await ready(page);
  await page.getByTestId('P1-AB').click(); await played(page,'/edited/place-glass.wav');
  await expect(page.getByTestId('sample-status')).toContainText('试听完成');
  await page.getByTestId('P1-BA').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as SamplesWindow).samplePlayed.slice(-2).map(url => url.includes('/edited/') ? 'B' : 'A').join(''))).toBe('BA');
  await page.getByTestId('group-single').click(); await page.getByTestId('S2-AB').click();
  await played(page,'/preview/single-chime.wav'); expect((await snapshot(page)).pending).toBe(1);
  await page.getByTestId('sample-stop').click(); expect((await snapshot(page)).pending).toBe(0);
  await page.getByTestId('S2-AB').click();
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await snapshot(page)).toMatchObject({ paused:true,pending:0,src:'' });
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:false}); document.dispatchEvent(new Event('visibilitychange')); });
  expect((await snapshot(page)).src).toBe('');
  await page.getByTestId('S2-B').click(); await played(page,'/edited/single-chime.wav');
  await page.evaluate(() => {
    for (let i=0;i<12;i++) document.querySelector<HTMLButtonElement>('[data-testid="S2-AB"]')!.click();
    document.querySelector<HTMLButtonElement>('#sample-stop')!.click();
  });
  expect(await snapshot(page)).toMatchObject({ paused:true,pending:0,src:'' });
});

test('missing audio can be retried and malformed catalog fails without starting playback', async ({ page }) => {
  await ready(page); await page.route('**/edited/place-glass.wav',route=>route.fulfill({status:404,body:'missing'}));
  await page.getByTestId('P1-B').click(); await expect(page.getByTestId('sample-status')).toContainText('未能');
  await page.unrouteAll({behavior:'wait'}); await page.getByTestId('P1-B').click(); await played(page,'/edited/place-glass.wav');
  await page.route('**/catalog.json',route=>route.fulfill({json:{version:1,items:[{id:'bad'}]}}));
  await page.reload(); await expect(page.getByTestId('catalog-status')).toContainText('目录未能加载');
  expect((await snapshot(page)).src).toBe(''); expect(await page.locator('article').count()).toBe(0);
});

test('phone layouts keep categories, source details and sticky stop usable; earlier labs remain linked', async ({ page }) => {
  await ready(page);
  for (const [width,height] of [[320,568],[390,844],[412,915]]) {
    await page.setViewportSize({width,height}); await page.getByTestId('group-single').click();
    const details = page.getByTestId('S3-details');
    if (!(await page.getByTestId('card-S3').locator('details').getAttribute('open')) && !(await page.getByTestId('card-S3').locator('details').evaluate(e=>(e as HTMLDetailsElement).open))) await details.click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>scrollTo(0,0));
    const box = await page.getByTestId('sample-stop').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y+box!.height).toBeLessThanOrEqual(height);
    await page.screenshot({path:test.info().outputPath(`samples-${width}x${height}.png`),fullPage:true});
  }
  expect((await page.request.get('audio-lab/samples-report.md')).status()).toBe(200);
  expect(await page.getByTestId('samples-v1').getAttribute('href')).toBe('./index.html');
  expect(await page.getByTestId('samples-v2').getAttribute('href')).toBe('./v2.html');
});
