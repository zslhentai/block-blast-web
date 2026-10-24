import { test, expect } from 'bun:test';
import { SoundManager, AUDIO_FEEDBACK } from './sounds';

test('optional sound is muted by default, bounds overlapping voices and stops immediately on mute', () => {
  let created = 0, active = 0, suspended = 0;
  const make = (): AudioContext => ({
    state: 'running', currentTime: 0, destination: {}, suspend: async () => { suspended++; },
    createOscillator: () => {
      created++; let playing = false;
      return { frequency: { setValueAtTime: () => {} }, type: 'sine', connect: () => {}, disconnect: () => {},
        start: () => { playing = true; active++; }, stop: (when?: number) => { if (when === undefined && playing) { active--; playing = false; } } };
    },
    createGain: () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} }),
  }) as unknown as AudioContext;
  const sound = new SoundManager(make);
  sound.init(); sound.play('place'); expect(created).toBe(0);
  sound.setEnabled(true); sound.init();
  for (let i = 0; i < 10; i++) sound.play('clear');
  expect(active).toBe(AUDIO_FEEDBACK.maxVoices);
  sound.setEnabled(false); expect(active).toBe(0); expect(suspended).toBe(1);
  sound.play('place'); expect(created).toBe(10);
});

test('unsupported Web Audio fails silently without making feedback a gameplay dependency', () => {
  const sound = new SoundManager(() => { throw new Error('unsupported'); });
  sound.setEnabled(true);
  expect(() => { sound.init(); sound.play('clear'); sound.suspend(); }).not.toThrow();
});
