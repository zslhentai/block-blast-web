// The upstream Web Audio approach, reduced to short optional effects for MVP.
class SoundManager {
  private context: AudioContext | null = null;
  private enabled = false;
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.suspend(); }
  init(): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { this.enabled = false; }
  }
  play(kind: 'place' | 'clear' | 'invalid'): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    try {
      const ctx = this.context;
      const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      const duration = kind === 'clear' ? 0.18 : 0.08;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'clear' ? 640 : kind === 'place' ? 320 : 160, ctx.currentTime);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(); oscillator.stop(ctx.currentTime + duration);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Sound is an optional enhancement, never a gameplay prerequisite. */ }
  }
  suspend(): void { if (this.context?.state === 'running') void this.context.suspend().catch(() => {}); }
}
export const soundManager = new SoundManager();
