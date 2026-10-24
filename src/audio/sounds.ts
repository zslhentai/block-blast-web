export const AUDIO_FEEDBACK = { placeSeconds: 0.06, clearSeconds: 0.14, peakGain: 0.025, maxVoices: 3 } as const;

// Reuse the upstream synthesis, with a short envelope and bounded voices.
export class SoundManager {
  private context: AudioContext | null = null;
  private enabled = false;
  private activeWanted = false;
  private readonly voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.suspend(); }
  init(): void {
    if (!this.enabled) return;
    this.activeWanted = true;
    try {
      this.context ??= this.createContext();
      if (this.context.state === 'suspended') {
        const context=this.context;
        void context.resume().then(()=>{if(!this.activeWanted||!this.enabled)return context.suspend();}).catch(() => {});
      }
    } catch { this.enabled = false; }
  }
  play(kind: 'place' | 'clear' | 'invalid'): boolean {
    if (!this.enabled || !this.activeWanted || !this.context || this.context.state !== 'running') return false;
    try {
      const ctx = this.context;
      if (this.voices.size >= AUDIO_FEEDBACK.maxVoices) {
        const oldest = this.voices.values().next().value;
        if (oldest) this.stop(oldest);
      }
      const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      const duration = kind === 'clear' ? AUDIO_FEEDBACK.clearSeconds : AUDIO_FEEDBACK.placeSeconds;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'clear' ? 640 : kind === 'place' ? 320 : 160, ctx.currentTime);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(AUDIO_FEEDBACK.peakGain, ctx.currentTime + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      oscillator.connect(gain); gain.connect(ctx.destination);
      const voice = { oscillator, gain }; this.voices.add(voice);
      oscillator.onended = () => { this.voices.delete(voice); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(); oscillator.stop(ctx.currentTime + duration);
      return true;
    } catch { return false; /* Sound never becomes a gameplay prerequisite. */ }
  }
  private stop(voice: { oscillator: OscillatorNode; gain: GainNode }): void {
    try { voice.oscillator.stop(); } catch { /* Already ended. */ }
    voice.oscillator.disconnect(); voice.gain.disconnect(); this.voices.delete(voice);
  }
  snapshot() { return { voices:this.voices.size,state:this.context?.state??'unavailable',enabled:this.enabled }; }
  stopVoices(): void {
    for (const voice of this.voices) this.stop(voice);
  }
  suspend(): void {
    this.activeWanted=false;this.stopVoices();
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
  }
}
export const soundManager = new SoundManager();
