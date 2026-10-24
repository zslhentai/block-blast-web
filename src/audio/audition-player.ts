import { SoundManager } from './sounds';
import { AUDITION, createCue, scheduleCue } from './audition-cues';
import type { CueKind, PlayingCue } from './audition-cues';

// Isolated owner: does not import the game entry point, settings or storage.
export class AuditionPlayer {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private volume: number = AUDITION.defaultVolume;
  private generation = 0;
  private readonly active = new Set<PlayingCue>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly baseline: SoundManager;
  private message = '点击任一试听按钮开始';
  constructor(private readonly changed: (message: string) => void = () => {},
    private readonly createContext: () => AudioContext = () => new AudioContext()) {
    this.baseline = new SoundManager(() => this.getContext());
  }
  private getContext(): AudioContext { return this.context ??= this.createContext(); }
  getSnapshot(): { active: number; timers: number; state: string; volume: number; message: string } {
    return { active: this.active.size, timers: this.timers.size, state: this.context?.state ?? 'uninitialized', volume: this.volume, message: this.message };
  }
  private announce(message: string): void { this.message = message; this.changed(message); }
  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(AUDITION.maxVolume, value));
    if (this.output && this.context) {
      this.output.gain.cancelScheduledValues(this.context.currentTime);
      this.output.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    }
  }
  stop(message = '已停止'): void {
    this.generation++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const cue of [...this.active]) cue.stop();
    this.active.clear(); this.baseline.setEnabled(false);
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
    this.announce(message);
  }
  private async prepare(): Promise<number | null> {
    this.stop('准备播放…');
    const generation = this.generation;
    try {
      // Both construction and resume happen in the original user gesture (iOS).
      const ctx = this.getContext();
      await ctx.resume();
      if (generation !== this.generation) return null;
      if (ctx.state !== 'running') throw new Error('Audio did not start');
      if (!this.output) { this.output = ctx.createGain(); this.output.connect(ctx.destination); }
      this.output.gain.value = this.volume;
      return generation;
    } catch {
      if (generation === this.generation) this.announce('浏览器未能开启声音，请再次点击；并检查设备音量。');
      return null;
    }
  }
  private candidate(kind: CueKind, level: number): void {
    if (!this.context || !this.output) return;
    if (this.active.size >= AUDITION.maxCues) this.active.values().next().value?.stop();
    const plan = createCue(kind, level);
    let playing: PlayingCue | undefined;
    playing = scheduleCue(this.context, this.output, plan, this.context.currentTime, () => {
      if (playing) this.active.delete(playing);
    });
    this.active.add(playing);
  }
  private later(callback: () => void, milliseconds: number): void {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, milliseconds);
    this.timers.add(timer);
  }
  async play(kind: CueKind, level = 2, current = false): Promise<void> {
    const generation = await this.prepare();
    if (generation === null) return;
    try {
      if (current) {
        this.baseline.setEnabled(true); this.baseline.init(); this.baseline.play(kind === 'place' ? 'place' : 'clear');
      } else this.candidate(kind, level);
      this.announce(current ? '播放：正式版当前音效（原音量）' : `播放：原创候选 · ${kind === 'combo' ? `Combo ${level}` : { place: '放置', single: '单行消除', multi: '多行消除' }[kind]}`);
      this.later(() => { if (generation === this.generation) this.announce('播放完成 · 可再次点击比较'); }, 1100);
    } catch { this.stop('播放失败，请再次点击或换浏览器重试。'); }
  }
  async sequence(level = 2): Promise<void> {
    const generation = await this.prepare();
    if (generation === null) return;
    const kinds: CueKind[] = ['place', 'single', 'multi', 'combo'];
    kinds.forEach((kind, i) => {
      const play = (): void => {
        if (generation !== this.generation) return;
        try { this.candidate(kind, level); this.announce(`连续试听 ${i + 1}/4 · ${['放置', '单行', '多行', `Combo ${level}`][i]}`); }
        catch { this.stop('播放失败，请再次点击或换浏览器重试。'); }
      };
      if (!i) play(); else this.later(play, i * AUDITION.gap * 1000);
    });
    this.later(() => { if (generation === this.generation) this.announce('连续试听完成'); }, 5600);
  }
}
