import './style.css';
import { GameRenderer } from './renderer/index';
import { createInitialState } from './logic/state';
import { type GameState } from './logic/types';
import { soundManager } from './audio/sounds';
import { GameStorage, DEFAULT_SETTINGS, STORAGE_KEY, parseSavedGame, type Settings, type StorageLike } from './storage/localStorage';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}
function randomSeed(): number {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Date.now() >>> 0; }
}
function init(): void {
  let browserStorage: StorageLike | undefined;
  try { browserStorage = window.localStorage; } catch { /* Private browsing may disallow storage. */ }
  let writerId = `tab-${randomSeed()}-${Date.now()}`;
  try {
    writerId = sessionStorage.getItem('block-blast-web:tab-id') ?? writerId;
    sessionStorage.setItem('block-blast-web:tab-id', writerId);
  } catch { /* The game can still run if session storage is unavailable. */ }
  const storage = new GameStorage(browserStorage, writerId);
  const saved = storage.load();
  let settings: Settings = saved?.settings ?? { ...DEFAULT_SETTINGS,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  const state = saved?.state ?? createInitialState(storage.best(), randomSeed());
  if (state.status === 'playing') state.status = 'paused';
  let externalUpdate = false;
  const menu = element<HTMLDialogElement>('menu');
  const over = element<HTMLDialogElement>('gameover');
  const settingsDialog = element<HTMLDialogElement>('settings');
  const feedback = element('feedback');
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  const save = (next: GameState): void => {
    if (!externalUpdate) storage.save(next, settings);
    element('save-status').textContent = externalUpdate ? '另一个页面已更新进度，请刷新后继续'
      : storage.available ? '进度已自动保存' : '此浏览器暂不能保存，仍可继续游玩';
  };
  const sync = (next: GameState): void => {
    element('score').textContent = String(next.score);
    element('best-score').textContent = String(next.highScore);
    element('combo').textContent = next.combo ? `连击 ×${next.combo}${next.dryMoves ? ` · 已间隔 ${next.dryMoves} 步` : ''}` : '';
    document.body.dataset.status = next.status;
    if (next.status === 'gameover') {
      menu.close(); settingsDialog.close();
      element('final-score').textContent = String(next.score);
      element('final-best').textContent = `最高分 ${next.highScore}`;
      if (!over.open) over.showModal();
    }
  };
  const renderer = new GameRenderer(element<HTMLCanvasElement>('game-canvas'), state, {
    onStateChange: next => { sync(next); save(next); },
    onFeedback: (kind, points) => {
      soundManager.play(kind); clearTimeout(feedbackTimer);
      feedback.textContent = kind === 'invalid' ? '这里放不下，换个位置试试' : kind === 'clear' ? `消除！+${points}` : `+${points}`;
      feedbackTimer = setTimeout(() => { feedback.textContent = ''; }, 1100);
    },
  });
  Object.defineProperty(window, 'blockBlast', { configurable: true,
    value: Object.freeze({ getState: () => renderer.getState(), getLayout: () => renderer.getLayout() }) });
  const showMenu = (): void => {
    const current = renderer.getState();
    element('menu-title').textContent = current.status === 'idle' ? '方块小憩' : '休息一下';
    element('menu-text').textContent = current.status === 'idle' ? '拖动下方方块，填满一行或一列即可消除。' : '棋盘和分数已经保存，准备好就继续。';
    element('continue').textContent = current.status === 'idle' ? '开始游戏' : '继续游戏';
    if (!menu.open) menu.showModal();
  };
  const restart = (): void => {
    if (externalUpdate) return;
    const current = renderer.getState();
    if (current.status !== 'gameover' && current.moves > 0 && !window.confirm('开始新游戏会覆盖当前棋局，最高分和设置会保留。继续吗？')) return;
    menu.close(); over.close(); settingsDialog.close();
    feedback.textContent = ''; clearTimeout(feedbackTimer);
    renderer.dispatch({ type: 'RESTART', seed: randomSeed() });
  };
  element('continue').addEventListener('click', () => {
    if (externalUpdate) return;
    soundManager.init(); menu.close();
    renderer.dispatch({ type: renderer.getState().status === 'idle' ? 'START_GAME' : 'RESUME' });
  });
  element('pause').addEventListener('click', () => { renderer.dispatch({ type: 'PAUSE' }); soundManager.suspend(); if (renderer.getState().status !== 'gameover') showMenu(); });
  element('new-game').addEventListener('click', restart); element('play-again').addEventListener('click', restart);
  let resumeAfterSettings = false;
  element('settings-open').addEventListener('click', () => {
    resumeAfterSettings = renderer.getState().status === 'playing';
    renderer.dispatch({ type: 'PAUSE' });
    if (!settingsDialog.open) settingsDialog.showModal();
  });
  const closeSettings = (): void => {
    settingsDialog.close();
    if (resumeAfterSettings && !externalUpdate) renderer.dispatch({ type: 'RESUME' });
    resumeAfterSettings = false;
  };
  element('settings-close').addEventListener('click', closeSettings);
  settingsDialog.addEventListener('cancel', e => { e.preventDefault(); closeSettings(); });
  for (const dialog of [menu, over]) dialog.addEventListener('cancel', e => e.preventDefault());
  const sound = element<HTMLInputElement>('sound'); const reduced = element<HTMLInputElement>('reduced-motion');
  sound.checked = settings.soundEnabled; reduced.checked = settings.reducedMotion;
  soundManager.setEnabled(settings.soundEnabled); renderer.setReducedMotion(settings.reducedMotion);
  sound.addEventListener('change', () => {
    settings = { ...settings, soundEnabled: sound.checked }; soundManager.setEnabled(sound.checked); soundManager.init(); save(renderer.getState());
  });
  reduced.addEventListener('change', () => {
    settings = { ...settings, reducedMotion: reduced.checked }; renderer.setReducedMotion(reduced.checked); save(renderer.getState());
  });
  element('game-canvas').addEventListener('pointerdown', () => soundManager.init());
  const suspend = (): void => {
    renderer.cancelDrag(); soundManager.suspend();
    renderer.dispatch({ type: 'PAUSE' }); save(renderer.getState());
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') suspend();
    else if (renderer.getState().status === 'paused' && !settingsDialog.open && !externalUpdate) showMenu();
  });
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', () => { if (renderer.getState().status === 'paused' && !settingsDialog.open) showMenu(); });
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    const incoming = parseSavedGame(e.newValue);
    if (!incoming) return;
    if (incoming.writerId === writerId) return;
    // Chromium can deliver a queued save from the previous document around a
    // reload. Identical game positions are not a concurrent-edit conflict.
    const { status: _incomingStatus, ...incomingPosition } = incoming.state;
    const { status: _currentStatus, ...currentPosition } = renderer.getState();
    if (JSON.stringify(incomingPosition) === JSON.stringify(currentPosition)) return;
    externalUpdate = true; renderer.dispatch({ type: 'PAUSE' }); renderer.cancelDrag(); soundManager.suspend(); save(renderer.getState());
    for (const id of ['pause', 'new-game', 'settings-open', 'continue']) element<HTMLButtonElement>(id).disabled = true;
  });
  // Original copyright text is inlined by the build, including the portable page.
  element('license').textContent = LICENSE_TEXT;
  sync(state); save(state);
  if (state.status === 'idle' || state.status === 'paused') showMenu();
  for (const id of ['pause', 'new-game', 'settings-open']) element<HTMLButtonElement>(id).disabled = false;
  document.body.dataset.gameReady = 'true';
}
const LICENSE_TEXT = `MIT License

Copyright (c) 2026 Hao Liu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
try { init(); } catch (error) {
  const status = document.getElementById('save-status');
  if (status) status.textContent = '游戏未能启动，请刷新页面重试。';
  console.error(error);
}
