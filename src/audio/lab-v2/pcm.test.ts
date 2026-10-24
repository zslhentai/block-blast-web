import { expect, test } from 'bun:test';
import { createPcmPair, encodeWav, stats, KINDS, DIRECTIONS, PCM_RATE, DURATIONS, createImpulse } from './pcm';
for (const kind of KINDS) {
  test(`${kind}: A/B are different reproducible PCM materials with matched duration/energy and no clipped samples`, async () => {
    const pair = createPcmPair(kind);
    const again = createPcmPair(kind);
    const metrics = DIRECTIONS.map(direction => stats(pair[direction]));
    expect(metrics[0].energy / metrics[1].energy).toBeCloseTo(1, 5);
    let difference = 0;
    for (const direction of DIRECTIONS) {
      const data = pair[direction];
      expect(data.length).toBe(Math.ceil(PCM_RATE * DURATIONS[kind]));
      expect(data.every(Number.isFinite)).toBe(true);
      expect(stats(data).peak).toBeLessThan(0.561);
      expect(stats(data).rms).toBeGreaterThan(0.01);
      expect(Math.abs(stats(data).dc)).toBeLessThan(0.0002);
      expect(data[0]).toBe(0); expect(Math.abs(data.at(-1)!)).toBe(0);
      expect(data).toEqual(again[direction]);
      const wav = encodeWav(data); const view = new DataView(wav.buffer);
      expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
      expect(view.getUint32(24, true)).toBe(48000); expect(view.getUint16(34, true)).toBe(16);
      expect(view.getUint32(40, true)).toBe(data.length * 2);
      const asset = new Uint8Array(await Bun.file(`public/audio-lab-v2/${kind}-${direction}.wav`).arrayBuffer());
      expect(wav).toEqual(asset); // Published material must match its original generator exactly.
      const manifest: { assets: { name: string; sha256: string }[] } = await Bun.file('public/audio-lab-v2/manifest.json').json();
      expect(new Bun.CryptoHasher('sha256').update(asset).digest('hex')).toBe(manifest.assets.find(entry => entry.name === `${kind}-${direction}.wav`)!.sha256);
    }
    for (let i = 0; i < pair.A.length; i++) difference += (pair.A[i] - pair.B[i]) ** 2;
    expect(difference / metrics[0].energy).toBeGreaterThan(0.5);
  });
}
test('PCM/room generation is sample-rate aware, deterministic, stereo and finite with a bounded tail', () => {
  for (const rate of [44100, 48000]) for (const direction of DIRECTIONS) {
    const impulse = createImpulse(rate, direction);
    expect(impulse).toEqual(createImpulse(rate, direction));
    expect(impulse[0]).not.toEqual(impulse[1]);
    for (const data of impulse) {
      expect(data.every(Number.isFinite)).toBe(true); expect(data[0]).toBe(0); expect(Math.abs(data.at(-1)!)).toBe(0);
      expect(stats(data).energy).toBeLessThan(2);
      expect(data.length / rate).toBeLessThanOrEqual(0.221);
    }
    expect(createPcmPair('place', rate).A.length).toBe(Math.ceil(rate * DURATIONS.place));
  }
  expect(() => createPcmPair('place', 1)).toThrow();
});
