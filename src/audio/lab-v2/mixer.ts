import { createImpulse } from './pcm';
import type { Direction } from './pcm';
export const MIX = { maxLive: 3, maxBatch: 8, duck: 0.36, defaultVolume: 0.35, maxVolume: 0.7, calibration: 0.35 } as const;
interface Voice { source: AudioBufferSourceNode; level: GainNode; nodes: AudioNode[]; start: number; end: number; retireAt: number | null }
export interface MixEvent { buffer: AudioBuffer; direction: Direction; offset: number; rate: number }
export class PcmMixer {
  private readonly voices = new Set<Voice>();
  private readonly padded = new WeakMap<AudioBuffer, AudioBuffer>();
  private readonly impulses = new Map<Direction, AudioBuffer>();
  private readonly input: GainNode;
  private readonly output: GainNode;
  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode) {
    this.input = ctx.createGain();
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 140; high.Q.value = 0.6;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 6800; low.Q.value = 0.55;
    const trim = ctx.createGain(); trim.gain.value = MIX.calibration;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20; compressor.knee.value = 8; compressor.ratio.value = 3;
    compressor.attack.value = 0.003; compressor.release.value = 0.085;
    const ceiling = ctx.createWaveShaper(); const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = 0.82 * Math.tanh(x / 0.82); }
    ceiling.curve = curve; ceiling.oversample = '2x';
    this.output = ctx.createGain(); this.output.gain.value = MIX.defaultVolume;
    this.input.connect(high); high.connect(low); low.connect(trim); trim.connect(compressor);
    compressor.connect(ceiling); ceiling.connect(this.output); this.output.connect(destination);
  }
  setVolume(volume: number, immediate = false): void {
    if (!Number.isFinite(volume)) return;
    this.output.gain.cancelScheduledValues(this.ctx.currentTime);
    const value = Math.max(0, Math.min(MIX.maxVolume, volume));
    if (immediate) this.output.gain.setValueAtTime(value, this.ctx.currentTime);
    else this.output.gain.setTargetAtTime(value, this.ctx.currentTime, 0.012);
  }
  private impulse(direction: Direction): AudioBuffer {
    let buffer = this.impulses.get(direction);
    if (!buffer) {
      const channels = createImpulse(this.ctx.sampleRate, direction);
      buffer = this.ctx.createBuffer(2, channels[0].length, this.ctx.sampleRate);
      channels.forEach((data, i) => buffer!.getChannelData(i).set(data)); this.impulses.set(direction, buffer);
    }
    return buffer;
  }
  private pad(buffer: AudioBuffer): AudioBuffer {
    let padded = this.padded.get(buffer);
    if (!padded) {
      // Silent padding lets the source's ended event clean up AFTER the room tail.
      padded = this.ctx.createBuffer(1, buffer.length + Math.ceil(this.ctx.sampleRate * 0.3), this.ctx.sampleRate);
      padded.getChannelData(0).set(buffer.getChannelData(0)); this.padded.set(buffer, padded);
    }
    return padded;
  }
  schedule(events: readonly MixEvent[], at = this.ctx.currentTime): void {
    for (const event of [...events].sort((a, b) => a.offset - b.offset).slice(0, MIX.maxBatch)) {
      const start = at + event.offset;
      const previous = [...this.voices].filter(v => v.start <= start && v.end > start && (v.retireAt === null || v.retireAt > start));
      for (const voice of previous) {
        voice.level.gain.cancelScheduledValues(start);
        voice.level.gain.setTargetAtTime(MIX.duck, start, 0.018);
      }
      if (previous.length >= MIX.maxLive) {
        const oldest = previous.sort((a, b) => a.start - b.start)[0];
        oldest.level.gain.cancelScheduledValues(start); oldest.level.gain.setValueAtTime(MIX.duck, start);
        oldest.level.gain.linearRampToValueAtTime(0, start + 0.008);
        oldest.end = start + 0.01; oldest.retireAt = start; oldest.source.stop(oldest.end);
      }
      const source = this.ctx.createBufferSource(); source.buffer = this.pad(event.buffer); source.playbackRate.value = event.rate;
      const convolver = this.ctx.createConvolver(); convolver.normalize = false; convolver.buffer = this.impulse(event.direction);
      const wet = this.ctx.createGain(); wet.gain.value = event.direction === 'A' ? 0.075 : 0.12;
      const level = this.ctx.createGain(); level.gain.value = 1;
      source.connect(level); source.connect(convolver); convolver.connect(wet); wet.connect(level); level.connect(this.input);
      const voice: Voice = { source, level, nodes: [source, convolver, wet, level], start,
        end: start + source.buffer.duration / event.rate, retireAt: null };
      this.voices.add(voice);
      source.onended = () => this.cleanup(voice);
      source.start(start); source.stop(voice.end);
    }
  }
  private cleanup(voice: Voice): void { for (const node of voice.nodes) node.disconnect(); this.voices.delete(voice); }
  stop(): void {
    for (const voice of this.voices) { voice.source.onended = null; try { voice.source.stop(); } catch { /* Ended. */ } this.cleanup(voice); }
  }
  snapshot(): { active: number; queued: number; fading: number } {
    const now = this.ctx.currentTime; const live = [...this.voices].filter(v => v.start <= now && v.end > now);
    return { active: live.filter(v => v.retireAt === null || v.retireAt > now).length, fading: live.filter(v => v.retireAt !== null && v.retireAt <= now).length,
      queued: [...this.voices].filter(v => v.start > now).length };
  }
}
