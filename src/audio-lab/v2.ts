import './style.css';
import './v2.css';
import { PcmLabPlayer } from '../audio/lab-v2/player';
import { KINDS } from '../audio/lab-v2/pcm';
import type { Direction } from '../audio/lab-v2/pcm';
import type { CueKind } from '../audio/audition-cues';
const base = new URL('../audio-lab-v2/', location.href).href;
const status = document.querySelector<HTMLElement>('#status')!;
const player = new PcmLabPlayer(message => { status.textContent = message; }, base);
const descriptions = {
  place: ['普通放置', 'A：利落轻敲、细小颗粒。B：带共鸣的亮脆敲击、双重触感。'],
  single: ['单行消除', 'A：轻拨和声、两点碎亮音。B：饱满共鸣、五颗亮粒。'],
  multi: ['多行消除', 'A：错开的拨弦、短扫声。B：多层共鸣、九颗展开的碎亮音。'],
  combo: ['Combo 连击', 'A：克制的上行拨弦。B：共鸣展开、颗粒簇与奖励亮音。'],
};
const cards = document.querySelector('#cue-cards')!;
for (const [index, kind] of KINDS.entries()) {
  const article = document.createElement('article');
  article.innerHTML = `<div class="number">0${index + 1}</div><h2>${descriptions[kind][0]}</h2><p>${descriptions[kind][1]}</p>
    <div class="actions"><button data-testid="v2-${kind}-A" data-kind="${kind}" data-direction="A">听 A · 清脆</button><button class="rich" data-testid="v2-${kind}-B" data-kind="${kind}" data-direction="B">听 B · 饱满</button></div>
    <div class="actions compare"><button class="secondary" data-testid="compare-${kind}-AB" data-compare="${kind}" data-order="AB">A → B</button><button class="secondary" data-testid="compare-${kind}-BA" data-compare="${kind}" data-order="BA">B → A</button></div>
    <div class="downloads"><a data-testid="wav-${kind}-A" href="${base}${kind}-A.wav" download="${kind}-A.wav">下载 A 干声</a><a data-testid="wav-${kind}-B" href="${base}${kind}-B.wav" download="${kind}-B.wav">下载 B 干声</a></div>`;
  cards.append(article);
}
const level = document.querySelector<HTMLSelectElement>('#level')!;
const volume = document.querySelector<HTMLInputElement>('#volume')!;
volume.addEventListener('input', () => { player.setVolume(Number(volume.value) / 100); document.querySelector<HTMLOutputElement>('#volume-value')!.value = `${volume.value}%`; });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-kind]')) button.addEventListener('click', () => {
  void player.play(button.dataset.kind as CueKind, button.dataset.direction as Direction, Number(level.value));
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-compare]')) button.addEventListener('click', () => {
  void player.compare(button.dataset.compare as CueKind, button.dataset.order === 'BA', Number(level.value));
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-stress]')) button.addEventListener('click', () => {
  void player.stress(button.dataset.direction as Direction, button.dataset.stress === 'clears', Number(level.value));
});
document.querySelector('#stop')!.addEventListener('click', () => player.stop());
document.addEventListener('visibilitychange', () => { if (document.hidden) player.stop('已暂停 · 返回后点击试听继续'); });
window.addEventListener('pagehide', () => player.stop());
Object.defineProperty(window, 'blockBlastPcmLab', { value: Object.freeze({ snapshot: () => player.snapshot() }) });
