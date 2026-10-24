import './style.css';
import { AuditionPlayer } from '../audio/audition-player';
import type { CueKind } from '../audio/audition-cues';
const status = document.querySelector<HTMLElement>('#status')!;
const player = new AuditionPlayer(message => { status.textContent = message; });
const level = document.querySelector<HTMLSelectElement>('#level')!;
const volume = document.querySelector<HTMLInputElement>('#volume')!;
volume.addEventListener('input', () => {
  player.setVolume(Number(volume.value) / 100);
  document.querySelector<HTMLOutputElement>('#volume-value')!.value = `${volume.value}%`;
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-cue], [data-current]')) {
  button.addEventListener('click', () => {
    void player.play((button.dataset.cue ?? button.dataset.current) as CueKind, Number(level.value), !!button.dataset.current);
  });
}
document.querySelector('#sequence')!.addEventListener('click', () => { void player.sequence(Number(level.value)); });
document.querySelector('#stop')!.addEventListener('click', () => player.stop());
document.addEventListener('visibilitychange', () => { if (document.hidden) player.stop('已暂停 · 返回后点击试听继续'); });
window.addEventListener('pagehide', () => player.stop());
// Read-only inspection for browser checks, scoped to this page, no gameplay hooks.
Object.defineProperty(window, 'blockBlastAudioLab', { value: Object.freeze({ snapshot: () => player.getSnapshot() }) });
