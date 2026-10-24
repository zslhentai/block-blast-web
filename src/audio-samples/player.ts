export interface Track { url: string; label: string; original?: boolean }
// A native file player only: no AudioContext, synthesis, convolution or sound generation.
export class SamplePlayer {
  private generation = 0;
  private gap: ReturnType<typeof setTimeout> | undefined;
  private pending = 0;
  constructor(readonly audio: HTMLAudioElement, private readonly changed: (message: string) => void) {
    audio.preload = 'none'; audio.volume = 0.5;
    audio.addEventListener('error', () => {
      if (audio.getAttribute('src')) this.stop('音频未能载入。可重试 WAV 选段；完整源格式也可下载后试听。');
    });
  }
  snapshot(): { paused: boolean; currentTime: number; pending: number; src: string; state: number } {
    return { paused: this.audio.paused, currentTime: this.audio.currentTime, pending: this.pending, src: this.audio.getAttribute('src') ?? '', state: this.audio.readyState };
  }
  stop(message = '已停止'): void {
    this.generation++; clearTimeout(this.gap); this.gap = undefined; this.pending = 0;
    this.audio.onended = null; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    this.changed(message);
  }
  async play(tracks: readonly Track[]): Promise<void> {
    if (!tracks.length) return;
    this.stop(); const generation = this.generation;
    const playAt = async (index: number): Promise<void> => {
      if (generation !== this.generation) return;
      this.pending = tracks.length - index - 1;
      const track = tracks[index];
      this.audio.src = track.url;
      this.changed(`准备播放：${track.label}`);
      this.audio.onended = () => {
        if (generation !== this.generation) return;
        if (index + 1 < tracks.length) {
          this.changed('间隔 0.4 秒，再听下一版…');
          this.gap = setTimeout(() => { this.gap = undefined; void playAt(index + 1); }, 400);
        } else { this.pending = 0; this.changed('试听完成 · 可切换版本比较'); }
      };
      try {
        // The first call occurs in the original tap; the same media element is reused for A/B.
        await this.audio.play();
        if (generation === this.generation) this.changed(`播放：${track.label}${track.original ? ' · 原始电平可能较响或很轻' : ''}`);
      } catch {
        if (generation === this.generation) this.stop('浏览器未能播放，请再次点击对应版本，或检查音量/网络。');
      }
    };
    await playAt(0);
  }
}
