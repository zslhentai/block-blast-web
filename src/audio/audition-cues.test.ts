import { expect, test } from 'bun:test';
import { AUDITION, createCue, scheduleCue } from './audition-cues';
import type { CueKind } from './audition-cues';

for (const kind of ['place', 'single', 'multi', 'combo'] as CueKind[]) {
  test(`${kind}: finite, bounded original layers, soft attacks and silent releases`, () => {
    const cue = createCue(kind);
    expect(cue.voices.length).toBeLessThanOrEqual(AUDITION.maxVoicesPerCue);
    expect(cue.duration).toBeLessThanOrEqual(1);
    expect(cue.duration).toBeGreaterThan(0.1);
    let sum = 0;
    for (const voice of cue.voices) {
      for (const value of [voice.frequency, voice.gain, voice.offset, voice.duration, voice.attack]) expect(Number.isFinite(value)).toBe(true);
      expect(voice.gain).toBeGreaterThan(0); expect(voice.offset).toBeGreaterThanOrEqual(0);
      expect(voice.attack).toBeGreaterThan(0); expect(voice.attack).toBeLessThan(voice.duration - 0.004);
      expect(voice.offset + voice.duration).toBeLessThanOrEqual(cue.duration);
      sum += voice.gain;
    }
    // Conservative sum of all layers, even if peaks coincided at max slider value.
    expect(sum * AUDITION.maxVolume).toBeLessThan(0.45);
    expect(createCue(kind)).toEqual(cue);
  });
}
test('Combo transposes by semitone per level, without extending duration or inflating gain', () => {
  const two = createCue('combo', 2), three = createCue('combo', 3);
  for (let i = 0; i < two.voices.length; i++) {
    expect(three.voices[i].frequency).toBeCloseTo(two.voices[i].frequency * 2 ** (1 / 12), 5);
    expect(three.voices[i].gain).toBe(two.voices[i].gain);
  }
  expect(three.duration).toBe(two.duration);
  expect(createCue('combo', 500)).toEqual(createCue('combo', 4));
  expect(createCue('combo', -5)).toEqual(two);
  expect(createCue('combo', NaN)).toEqual(two);
});

test('scheduling uses local generated noise, caps layers, cleans on end and stops future nodes once', () => {
  const ends: (() => void)[] = []; let disconnects = 0, stops = 0, notified = 0;
  const points: number[] = [];
  const param = () => ({ value: 0, setValueAtTime: (v: number) => points.push(v),
    linearRampToValueAtTime: (v: number) => points.push(v), exponentialRampToValueAtTime: (v: number) => points.push(v) });
  const noise: Float32Array[] = [];
  const node = () => {
    const source = { type: '', frequency: param(), connect: () => {}, disconnect: () => { disconnects++; },
      onended: null as (() => void) | null, start: () => { ends.push(() => source.onended?.()); },
      stop: (time?: number) => { if (time === undefined) stops++; } };
    return source;
  };
  const ctx = { currentTime: 2, sampleRate: 44100, createOscillator: node, createBufferSource: node,
    createGain: () => ({ gain: param(), connect: () => {}, disconnect: () => { disconnects++; } }),
    createBiquadFilter: () => ({ frequency: param(), connect: () => {}, disconnect: () => { disconnects++; } }),
    createBuffer: (_: number, frames: number) => { const data = new Float32Array(frames); noise.push(data); return { getChannelData: () => data }; },
  } as unknown as BaseAudioContext;
  const output = {} as AudioNode;
  const cue = createCue('combo');
  const playing = scheduleCue(ctx, output, cue, 10, () => { notified++; });
  expect(playing.voices).toBe(cue.voices.length);
  expect(noise[0].some(v => v !== 0)).toBe(true);
  expect(Math.max(...noise[0])).toBeLessThan(1);
  ends[0](); expect(notified).toBe(0);
  playing.stop(); playing.stop();
  expect(notified).toBe(1); expect(stops).toBe(cue.voices.length - 1);
  expect(disconnects).toBeGreaterThan(cue.voices.length);
  expect(points.filter(point => point === 0).length).toBe(cue.voices.length * 2);
  let finished = 0;
  const second = scheduleCue(ctx, output, cue, 20, () => { finished++; });
  expect(noise[1]).toEqual(noise[0]);
  for (const end of ends.slice(cue.voices.length)) end();
  expect(finished).toBe(1); second.stop(); expect(finished).toBe(1);
  const overfull = scheduleCue(ctx, output, { ...cue, voices: Array(100).fill(cue.voices[1]) });
  expect(overfull.voices).toBe(AUDITION.maxVoicesPerCue); overfull.stop();
});
