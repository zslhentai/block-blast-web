// Original synthesis parameters for the isolated audition page only.
// No recording, samples, impulse responses, or third-party assets are used.
export type CueKind = 'place' | 'single' | 'multi' | 'combo';
export interface CueVoice {
  source: 'sine' | 'triangle' | 'noise';
  frequency: number;
  endFrequency?: number;
  offset: number;
  duration: number;
  attack: number;
  gain: number;
  filterHz?: number;
}
export interface CuePlan { kind: CueKind; voices: readonly CueVoice[]; duration: number }
export const AUDITION = { maxCues: 3, maxVoicesPerCue: 18, defaultVolume: 0.35, maxVolume: 0.7, gap: 1.5 } as const;
const tone = (frequency: number, gain: number, duration: number, offset = 0): CueVoice =>
  ({ source: 'sine', frequency, gain, duration, offset, attack: 0.006 });
const air = (gain: number, duration: number, offset = 0): CueVoice =>
  ({ source: 'noise', frequency: 0, gain, duration, offset, attack: 0.004, filterHz: 2200 });

export function createCue(kind: CueKind, comboLevel = 2): CuePlan {
  let voices: CueVoice[];
  if (kind === 'place') {
    voices = [
      { ...tone(1530, 0.12, 0.14), endFrequency: 1430, attack: 0.002 },
      { ...tone(1110, 0.055, 0.08), source: 'triangle', attack: 0.003 },
      { ...tone(510, 0.035, 0.055), endFrequency: 400 },
      { ...air(0.045, 0.022), filterHz: 2800 },
    ];
  } else {
    const level = Number.isFinite(comboLevel) ? Math.max(2, Math.min(4, Math.round(comboLevel))) : 2;
    const ratio = kind === 'combo' ? 2 ** ((level - 1) / 12) : 1;
    const chord = [261.63, 329.63, 392].map(hz => hz * ratio);
    const rolled = kind === 'multi';
    voices = [air(0.085, rolled ? 0.12 : 0.085), tone(130.81 * ratio, 0.055, 0.15)];
    chord.forEach((hz, i) => {
      const offset = rolled ? i * 0.032 : i * 0.006;
      voices.push(tone(hz, 0.085, rolled ? 0.82 : 0.72, offset));
      voices.push(tone(hz * 2, 0.025, 0.34, offset));
    });
    voices.push(tone(1046.5 * ratio, 0.024, 0.66, 0.06));
    if (kind === 'multi') {
      voices.push(air(0.035, 0.07, 0.06), tone(523.25, 0.04, 0.72, 0.096));
    }
    if (kind === 'combo') {
      [523.25, 659.25, 783.99].forEach((hz, i) => voices.push(tone(hz * ratio, 0.04, 0.56, 0.14 + i * 0.075)));
    }
  }
  return { kind, voices, duration: Math.max(...voices.map(voice => voice.offset + voice.duration)) };
}

export interface PlayingCue { stop: () => void; voices: number; duration: number }
// Public scheduling primitive also used by offline browser audio verification.
export function scheduleCue(ctx: BaseAudioContext, output: AudioNode, plan: CuePlan,
  at = ctx.currentTime, onEnded: () => void = () => {}): PlayingCue {
  const cleanups = new Set<() => void>();
  const cancellations = new Map<() => void, () => void>();
  let stopped = false;
  let notified = false;
  const notify = (): void => { if (!notified) { notified = true; onEnded(); } };
  const finish = (): void => { if (!cleanups.size) notify(); };
  for (const voice of plan.voices.slice(0, AUDITION.maxVoicesPerCue)) {
    const start = at + voice.offset; const end = start + voice.duration;
    const envelope = ctx.createGain();
    let source: OscillatorNode | AudioBufferSourceNode;
    let filter: BiquadFilterNode | undefined;
    if (voice.source === 'noise') {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * voice.duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Fixed, generated noise makes repeated comparisons reproducible; no gameplay RNG.
      let seed = 0x19af23;
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        data[i] = (seed >>> 0) / 0x100000000 * 2 - 1;
      }
      const noise = ctx.createBufferSource(); noise.buffer = buffer; source = noise;
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = voice.filterHz ?? 2200;
      source.connect(filter); filter.connect(envelope);
    } else {
      const oscillator = ctx.createOscillator(); oscillator.type = voice.source;
      oscillator.frequency.setValueAtTime(voice.frequency, start);
      if (voice.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(voice.endFrequency, end);
      source = oscillator; source.connect(envelope);
    }
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(voice.gain, start + voice.attack);
    envelope.gain.exponentialRampToValueAtTime(0.00001, end - 0.004);
    envelope.gain.linearRampToValueAtTime(0, end);
    envelope.connect(output);
    const cleanup = (): void => { source.disconnect(); filter?.disconnect(); envelope.disconnect(); cleanups.delete(cleanup); cancellations.delete(cleanup); finish(); };
    cleanups.add(cleanup); source.onended = cleanup;
    source.start(start); source.stop(end);
    // Keep the source available to the explicit stop without retaining finished nodes.
    const cancel = (): void => { try { source.stop(); } catch { /* Already ended. */ } cleanup(); };
    cancellations.set(cleanup, cancel);
  }
  // This map is local to one cue and is cleared on stop / natural completion.
  function stop(): void {
    if (stopped) return; stopped = true;
    for (const cleanup of [...cleanups]) cancellations.get(cleanup)?.();
    cancellations.clear(); notify();
  }
  return { stop, voices: cleanups.size, duration: plan.duration };
}
