import { GameRenderer } from './renderer/index';
import { soundManager } from './audio/sounds';

let bgMusicOn = false;

function init(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas not found');
    return;
  }
  const renderer = new GameRenderer(canvas);
  canvas.addEventListener('touchstart', () => soundManager.init().then(() => renderer.render()), { once: true });
  canvas.addEventListener('click', () => soundManager.init().then(() => renderer.render()), { once: true });
  
  // Keyboard shortcut to toggle background music (M key)
  window.addEventListener('keydown', async (e) => {
    if (e.key === 'm' || e.key === 'M') {
      await soundManager.init();
      const isEnabled = soundManager.isBgMusicEnabled();
      soundManager.setBgMusicEnabled(!isEnabled);
      renderer.render();
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}
