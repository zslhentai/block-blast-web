import { test, expect } from 'bun:test';
import { isCatalog, processingSummary, GROUPS } from './catalog';
const data: unknown = await Bun.file('public/audio-samples/catalog.json').json();
if (!isCatalog(data)) throw new Error('Invalid checked-in sample catalog');
const catalog = data;
test('catalog provides traceable pre-existing licensed samples without generated oscillators or fabricated review', () => {
  expect(catalog.items.length).toBe(13);
  for (const group of Object.keys(GROUPS)) expect(catalog.items.filter(s => s.group === group).length).toBe(group === 'single' ? 4 : 3);
  expect(catalog.items.filter(s => s.status !== 'rejected').map(s => s.code).sort()).toEqual(['P2','R1']);
  expect(isCatalog({ ...catalog, items: [{ ...catalog.items[0], status: 'approved' }] })).toBe(false);
  expect(isCatalog({ ...catalog, items: [...catalog.items, catalog.items[0]] })).toBe(false);
  expect(isCatalog({ ...catalog, items: [{ ...catalog.items[0], files: { A: '../escape.wav' } }] })).toBe(false);
  expect(isCatalog({ ...catalog, items: [{ ...catalog.items[0], editedRange: [0, 999] }] })).toBe(false);
  expect(isCatalog({ ...catalog, items: [{ ...catalog.items[0], license: 'unknown' }] })).toBe(false);
});
for (const item of catalog.items) test(`${item.code}: original bytes, CC0 evidence, paired WAV signal and processing metadata stay consistent`, async () => {
  const original = new Uint8Array(await Bun.file(`public/audio-samples/${item.files.original}`).arrayBuffer());
  expect(new Bun.CryptoHasher('sha256').update(original).digest('hex')).toBe(item.sha256.original);
  expect(new Bun.CryptoHasher('sha1').update(new TextEncoder().encode(`blob ${original.length}\0`)).update(original).digest('hex')).toBe(item.gitBlob);
  expect(await Bun.file(`public/audio-samples/${item.licenseFile}`).text()).toContain('CC0 1.0 Universal');
  expect(item.repo).toMatch(/^(Boyquotes|sgossner|YagmurCemGul)\//); expect(item.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(processingSummary(item)).toContain('无变调、无新合成、无叠层');
  expect(item.previewRange[0]).toBe(item.editedRange[0]);
  for (const version of ['A','B'] as const) {
    const bytes = new Uint8Array(await Bun.file(`public/audio-samples/${item.files[version]}`).arrayBuffer());
    expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(item.sha256[version]);
    const view = new DataView(bytes.buffer); expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('RIFF');
    expect(view.getUint32(24,true)).toBe(48000); expect(view.getUint16(22,true)).toBe(2); expect(view.getUint16(34,true)).toBe(16);
    let peak = 0, energy = 0;
    for (let i = 44; i < bytes.length; i += 2) { const value = view.getInt16(i,true) / 32767; peak = Math.max(peak, Math.abs(value)); energy += value * value; }
    const frames = (bytes.length - 44) / 4;
    expect(frames).toBe(item.stats[version].frames); expect(frames / 48000).toBeCloseTo(item.stats[version].duration,5);
    expect(peak).toBeGreaterThan(0.02); expect(peak).toBeLessThanOrEqual(0.331);
    expect(peak).toBeCloseTo(item.stats[version].peak,4);
    expect(Math.sqrt(energy / (frames * 2))).toBeCloseTo(item.stats[version].rms,4);
    expect(Math.abs(view.getInt16(bytes.length - 2,true) / 32767)).toBeLessThan(0.0005);
  }
});
