import type { CueKind } from '../audition-cues';
import { MIX, PcmMixer } from './mixer';
import type { MixEvent } from './mixer';
import { DIRECTIONS, KINDS } from './pcm';
import type { Direction } from './pcm';
export interface LabRequest { kind: CueKind; direction: Direction; offset: number; level?: number }
const labels = { place: '放置', single: '单行', multi: '多行', combo: 'Combo' };
export class PcmLabPlayer {
  private context: AudioContext | null = null;
  private mixer: PcmMixer | null = null;
  private generation = 0;
  private volume: number = MIX.defaultVolume;
  private loading: Promise<void> | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private message = '选择一组，交替听 A 与 B';
  constructor(private readonly changed: (message: string) => void,
    private readonly baseUrl: string,
    private readonly createContext: () => AudioContext = () => new AudioContext()) {}
  snapshot(): { active: number; queued: number; fading: number; state: string; cached: number; message: string } {
    return { ...this.mixer?.snapshot() ?? { active: 0, queued: 0, fading: 0 }, state: this.context?.state ?? 'uninitialized', cached: this.buffers.size, message: this.message };
  }
  private announce(message: string): void { this.message = message; this.changed(message); }
  setVolume(value: number): void { if (Number.isFinite(value)) { this.volume = Math.max(0, Math.min(MIX.maxVolume, value)); this.mixer?.setVolume(this.volume); } }
  stop(message = '已停止'): void {
    this.generation++; if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.mixer?.stop();
    if (this.context && this.context.state !== 'closed') void this.context.suspend().catch(() => {});
    this.announce(message);
  }
  private load(): Promise<void> {
    return this.loading ??= (async () => {
      const entries = await Promise.all(KINDS.flatMap(kind => DIRECTIONS.map(async direction => {
        const response = await fetch(`${this.baseUrl}${kind}-${direction}.wav`);
        if (!response.ok) throw new Error('Missing PCM');
        const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
        return [`${kind}-${direction}`, buffer] as const;
      })));
      for (const [key, buffer] of entries) this.buffers.set(key, buffer);
    })().catch(error => { this.loading = null; throw error; });
  }
  async audition(requests: readonly LabRequest[], message: string): Promise<void> {
    this.stop('正在准备音效…'); const generation = this.generation;
    try {
      // Create and request resume synchronously inside the tap, before network/decode awaits.
      this.context ??= this.createContext(); const resume = this.context.resume();
      await Promise.all([resume, this.load()]);
      if (generation !== this.generation) return;
      if (this.context.state !== 'running') throw new Error('Audio not running');
      this.mixer ??= new PcmMixer(this.context, this.context.destination); this.mixer.setVolume(this.volume, true);
      const events: MixEvent[] = requests.slice(0, MIX.maxBatch).map(request => ({
        buffer: this.buffers.get(`${request.kind}-${request.direction}`)!, direction: request.direction, offset: request.offset,
        rate: request.kind === 'combo' ? 2 ** ((Math.max(2, Math.min(4, request.level ?? 2)) - 2) / 12) : 1,
      }));
      this.mixer.schedule(events); this.announce(message);
      const duration = Math.max(...events.map(event => event.offset + (event.buffer.duration + 0.3) / event.rate));
      this.timer = setTimeout(() => { this.timer = null; if (generation === this.generation) this.announce('试听完成 · 可切换方向比较'); }, Math.ceil((duration + 0.1) * 1000));
    } catch {
      if (generation === this.generation) this.stop('音效未能加载或开启，请再次点击；检查网络和手机音量。');
    }
  }
  play(kind: CueKind, direction: Direction, level: number): Promise<void> {
    return this.audition([{ kind, direction, level, offset: 0 }], `播放：${labels[kind]} · ${direction}${kind === 'combo' ? ` · 等级 ${level}` : ''}`);
  }
  compare(kind: CueKind, reverse: boolean, level: number): Promise<void> {
    const order: Direction[] = reverse ? ['B', 'A'] : ['A', 'B'];
    return this.audition(order.map((direction, i) => ({ kind, direction, level, offset: i * 1.5 })), `对比：${labels[kind]} · ${order.join(' → ')} · 间隔 1.5 秒`);
  }
  stress(direction: Direction, clears: boolean, level: number): Promise<void> {
    const kinds: CueKind[] = clears ? ['single', 'multi', 'combo', 'single', 'multi', 'combo'] : Array.from({ length: 8 }, () => 'place' as const);
    return this.audition(kinds.map((kind, i) => ({ kind, direction, level, offset: i * (clears ? 0.26 : 0.14) })),
      `连续试听：${direction} · ${clears ? '6 次消除 / 260 ms 间隔' : '8 次放置 / 140 ms 间隔'}`);
  }
}
