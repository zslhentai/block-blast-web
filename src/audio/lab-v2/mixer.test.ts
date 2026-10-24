import { test, expect } from 'bun:test';
import { PcmMixer } from './mixer';

test('dense scheduled input ducks older tails, bounds simultaneous voices, and stop disconnects every source', () => {
  let now = 0; let disconnected = 0; const stopTimes: number[] = [];
  const param = () => ({ value: 0, cancelScheduledValues: () => {}, setTargetAtTime: () => {},
    setValueAtTime: () => {}, linearRampToValueAtTime: () => {} });
  const node = () => ({ connect: () => {}, disconnect: () => { disconnected++; }, gain: param(), frequency: param(), Q: param() });
  const ctx = {
    get currentTime() { return now; }, sampleRate: 48000,
    createGain: node, createBiquadFilter: node, createConvolver: node, createWaveShaper: node,
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createBuffer: (_channels: number, length: number, rate: number) => ({ length, duration: length / rate, getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ ...node(), buffer: null, playbackRate: param(), onended: null, start: () => {},
      stop: (at?: number) => { if (at !== undefined) stopTimes.push(at); } }),
  } as unknown as BaseAudioContext;
  const mixer = new PcmMixer(ctx, {} as AudioNode);
  const buffer = { length: 48000, getChannelData: () => new Float32Array(48000) } as unknown as AudioBuffer;
  mixer.schedule(Array.from({ length: 30 }, (_, i) => ({ buffer, direction: 'B' as const, offset: i * 0.14, rate: 1 })));
  expect(mixer.snapshot().queued).toBe(7); // Batch bounded even for an oversized request.
  for (now = 0; now < 3; now += 0.007) {
    const snapshot = mixer.snapshot(); expect(snapshot.active).toBeLessThanOrEqual(3);
    expect(snapshot.fading).toBeLessThanOrEqual(1);
  }
  expect(stopTimes.some(time => time < 0.5)).toBe(true);
  mixer.stop(); mixer.stop(); expect(mixer.snapshot()).toEqual({ active: 0, queued: 0, fading: 0 });
  expect(disconnected).toBe(32); // Four nodes per voice, eight maximum queued sources.
});
