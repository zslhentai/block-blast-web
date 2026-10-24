import type { CueKind } from '../audition-cues';
export type Direction = 'A' | 'B';
export const KINDS: readonly CueKind[] = ['place', 'single', 'multi', 'combo'];
export const DIRECTIONS: readonly Direction[] = ['A', 'B'];
export const PCM_RATE = 48000;
export const DURATIONS: Record<CueKind, number> = { place: 0.22, single: 0.76, multi: 0.86, combo: 0.9 };
export interface PcmStats { peak: number; rms: number; energy: number; dc: number }
export function stats(data: Float32Array): PcmStats {
  let peak = 0, energy = 0, dc = 0;
  for (const x of data) { peak = Math.max(peak, Math.abs(x)); energy += x * x; dc += x; }
  return { peak, rms: Math.sqrt(energy / data.length), energy, dc: dc / data.length };
}
function random(seed: number): () => number {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000 * 2 - 1; };
}
function add(target: Float32Array, source: Float32Array, at: number, gain: number, rate: number): void {
  const offset = Math.round(at * rate);
  for (let i = 0; i < source.length && offset + i < target.length; i++) target[offset + i] += source[i] * gain;
}
// A struck body: short noise excitation drives inharmonic damped resonators.
// This is a time-domain recurrence, not a held oscillator chord.
function strike(rate: number, base: number, length: number, glass: boolean, seed: number): Float32Array {
  const data = new Float32Array(Math.ceil(length * rate)); const noise = random(seed);
  const modes = glass ? [1, 1.47, 2.09, 2.81, 3.93] : [1, 1.62, 2.72];
  for (let m = 0; m < modes.length; m++) {
    const hz = base * modes[m]; if (hz > rate * 0.42) continue;
    const decay = length / (glass ? 4.8 + m * 0.5 : 7 + m);
    const radius = Math.exp(-1 / (rate * decay)); const coefficient = 2 * radius * Math.cos(2 * Math.PI * hz / rate);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const time = i / rate;
      const excitation = time < 0.0035 ? noise() * Math.sin(Math.PI * time / 0.0035) : 0;
      const y = coefficient * y1 - radius * radius * y2 + excitation * 0.07;
      y2 = y1; y1 = y;
      // Equalize resonator drive so low modes do not dominate the glass layers.
      data[i] += y * Math.sin(2 * Math.PI * hz / rate) / (1 + m * 0.55);
    }
  }
  return data;
}
// Karplus–Strong waveguide: seeded noisy pluck evolves through a damped delay line.
function pluck(rate: number, hz: number, length: number, seed: number, bright: boolean): Float32Array {
  const data = new Float32Array(Math.ceil(rate * length));
  const line = new Float32Array(Math.max(2, Math.round(rate / hz - 0.5))); const noise = random(seed);
  let excitation = 0;
  for (let i = 0; i < line.length; i++) { excitation += (bright ? 0.65 : 0.26) * (noise() - excitation); line[i] = excitation; }
  let pointer = 0, previous = 0;
  for (let i = 0; i < data.length; i++) {
    const value = line[pointer];
    line[pointer] = (value * (bright ? 0.57 : 0.48) + previous * (bright ? 0.43 : 0.52)) * (bright ? 0.986 : 0.978);
    previous = value; pointer = (pointer + 1) % line.length;
    data[i] = value * Math.min(1, i / (rate * 0.002)) * Math.exp(-i / (rate * length * 0.35));
  }
  return data;
}
// A moving noise band creates a tactile tick / short brushed sweep, without a pure tone bed.
function brush(rate: number, length: number, low: number, high: number, seed: number): Float32Array {
  const data = new Float32Array(Math.ceil(rate * length)); const noise = random(seed);
  let slow = 0, fast = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length; const value = noise();
    const cutoff = low + (high - low) * Math.sin(Math.PI * t);
    fast += (1 - Math.exp(-2 * Math.PI * cutoff / rate)) * (value - fast);
    slow += (1 - Math.exp(-2 * Math.PI * 450 / rate)) * (value - slow);
    data[i] = (fast - slow) * Math.sin(Math.PI * t) ** 2 * Math.exp(-t * 3);
  }
  return data;
}
function makeRaw(kind: CueKind, direction: Direction, rate: number): Float32Array {
  const rich = direction === 'B'; const data = new Float32Array(Math.ceil(DURATIONS[kind] * rate));
  const seed = 0x573af + KINDS.indexOf(kind) * 907 + (rich ? 103 : 0);
  const body = (hz: number, at: number, duration: number, gain: number, n: number) => add(data, strike(rate, hz, duration, rich, seed + n), at, gain, rate);
  const string = (hz: number, at: number, duration: number, gain: number, n: number) => add(data, pluck(rate, hz, duration, seed + n, rich), at, gain, rate);
  const sweep = (at: number, duration: number, gain: number, n: number) => add(data, brush(rate, duration, 900, rich ? 4200 : 2800, seed + n), at, gain, rate);
  if (kind === 'place') {
    body(rich ? 1180 : 1480, 0, 0.12, 0.8, 1);
    body(rich ? 470 : 680, 0.002, 0.065, 0.24, 2);
    sweep(0, 0.016, 0.55, 3);
    if (rich) { body(1730, 0.009, 0.085, 0.24, 4); sweep(0.018, 0.013, 0.17, 5); }
  } else {
    const ratio = kind === 'combo' ? 2 ** (1 / 12) : 1;
    const notes = [261.63, 329.63, 392].map(hz => hz * ratio);
    sweep(0, kind === 'multi' ? 0.13 : 0.065, rich ? 0.22 : 0.12, 5);
    body(310 * ratio, 0, 0.105, rich ? 0.14 : 0.23, 6);
    notes.forEach((hz, i) => {
      const at = (kind === 'multi' ? 0.028 : 0.008) * i;
      string(hz * 2, at, 0.42, rich ? 0.4 : 0.6, 10 + i);
      if (rich) { body(hz, at, 0.44, 0.16, 20 + i); body(hz * 4.03, at + 0.012, 0.19, 0.28, 25 + i); }
    });
    // Discrete, short struck grains carry timbre changes and micro-rhythm.
    const count = kind === 'single' ? (rich ? 5 : 2) : kind === 'multi' ? (rich ? 9 : 4) : (rich ? 10 : 5);
    for (let i = 0; i < count; i++) {
      const at = 0.045 + i * (kind === 'combo' ? 0.024 : 0.018);
      const hz = notes[i % 3] * (rich ? 3.02 + (i % 2) * 0.48 : 3.0);
      body(hz, at, rich ? 0.075 : 0.045, (rich ? 0.18 : 0.075) * (1 - i / (count * 1.5)), 40 + i);
    }
    if (kind === 'multi') { sweep(0.075, 0.12, rich ? 0.23 : 0.1, 60); string(523.25, 0.11, 0.34, 0.18, 61); }
    if (kind === 'combo') {
      [523.25, 659.25, 783.99].forEach((hz, i) => {
        string(hz * ratio, 0.13 + i * 0.052, 0.34, rich ? 0.36 : 0.42, 70 + i);
        if (rich) body(hz * ratio * 1.5, 0.15 + i * 0.052, 0.16, 0.11, 80 + i);
      });
    }
  }
  let low = 0, dc = 0;
  for (let i = 0; i < data.length; i++) {
    // Mild excitation saturation, DC removal and final damping keep high modes contained.
    const x = Math.tanh(data[i] * 1.4) / 1.4;
    dc += (1 - Math.exp(-2 * Math.PI * 65 / rate)) * (x - dc);
    low += (1 - Math.exp(-2 * Math.PI * 6500 / rate)) * (x - dc - low);
    const fade = Math.min(1, i / (rate * 0.001), (data.length - 1 - i) / (rate * 0.012));
    data[i] = low * Math.max(0, fade);
  }
  return data;
}
export function createPcmPair(kind: CueKind, rate = PCM_RATE): Record<Direction, Float32Array> {
  if (!Number.isInteger(rate) || rate < 16000 || rate > 96000) throw new Error('Unsupported PCM sample rate');
  const pair = { A: makeRaw(kind, 'A', rate), B: makeRaw(kind, 'B', rate) };
  // Match total energy over the SAME duration; B is not made louder or longer.
  for (const data of Object.values(pair)) {
    const scale = (kind === 'place' ? 0.065 : 0.055) / stats(data).rms;
    for (let i = 0; i < data.length; i++) data[i] *= scale;
  }
  const peakScale = Math.min(1, 0.56 / Math.max(stats(pair.A).peak, stats(pair.B).peak));
  for (const data of Object.values(pair)) for (let i = 0; i < data.length; i++) data[i] *= peakScale;
  return pair;
}
export function encodeWav(data: Float32Array, rate = PCM_RATE): Uint8Array {
  const wav = new Uint8Array(44 + data.length * 2); const view = new DataView(wav.buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) wav[at + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, wav.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), true);
  return wav;
}
// Original short room impulse: sparse early reflections + damped diffuse noise.
export function createImpulse(rate: number, direction: Direction): [Float32Array, Float32Array] {
  const length = Math.ceil(rate * (direction === 'A' ? 0.16 : 0.22));
  return [0, 1].map(channel => {
    const data = new Float32Array(length); const noise = random(0x4837 + channel * 83); let low = 0;
    const taps = channel ? [0.009, 0.021, 0.038, 0.059] : [0.007, 0.017, 0.033, 0.053];
    for (let i = 0; i < length; i++) {
      const t = i / rate; low += 0.24 * (noise() - low);
      data[i] = t > 0.014 ? low * 0.09 * Math.exp(-t * 36) * Math.min(1, (length - 1 - i) / (rate * 0.012)) : 0;
    }
    taps.forEach((t, i) => { data[Math.round(t * rate)] += 0.5 / (i + 1); });
    return data;
  }) as [Float32Array, Float32Array];
}
