import type { GameState, Shape } from '../logic/types';
import type { CanvasConfig } from './canvas';
import { drawBlock, drawPiece } from './draw';
import { BLOCK_MATERIALS } from './theme';
import { type FeedbackTimeline } from './feedback';
import { MOTION } from './motion';

export function drawPreview(ctx: CanvasRenderingContext2D, shape: Shape, target: { row: number; col: number; x: number; y: number },
  valid: boolean, clear: { row: number; col: number }[], config: CanvasConfig): void {
  const { gridOffsetX: gx, gridOffsetY: gy, cellSize: s } = config;
  ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, s * 8, s * 8); ctx.clip();
  ctx.fillStyle = '#ffce6845';
  for (const p of clear) ctx.fillRect(gx + p.col * s + 1, gy + p.row * s + 1, s - 2, s - 2);
  ctx.strokeStyle = valid ? '#b8f4ee' : '#ff9999'; ctx.lineWidth = Math.max(1.5, s * 0.045);
  if (!valid) ctx.setLineDash([s * 0.12, s * 0.08]);
  for (const [r, c] of shape.cells) {
    const x = gx + (target.col + c) * s, y = gy + (target.row + r) * s;
    ctx.fillStyle = valid ? '#b2fff033' : '#ff58583d'; ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
  }
  ctx.restore();
  // The floating piece remains exactly at the finger-compensated projection.
  drawPiece(ctx, shape, target.x, target.y, s, valid ? 0.98 : 0.62);
  // Keep the snapped outline visible even when the floating face is perfectly
  // aligned with it. Painting it only underneath hid the valid-drop cue.
  ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, s * 8, s * 8); ctx.clip();
  ctx.strokeStyle = valid ? '#b8f4ee' : '#ff9999'; ctx.lineWidth = Math.max(1.5, s * 0.045);
  if (!valid) ctx.setLineDash([s * 0.12, s * 0.08]);
  for (const [r, c] of shape.cells) ctx.strokeRect(gx + (target.col + c) * s + 1,
    gy + (target.row + r) * s + 1, s - 2, s - 2);
  ctx.restore();
  if (!valid) {
    ctx.save(); ctx.fillStyle = '#ffe4e4'; ctx.strokeStyle = '#9f304c'; ctx.lineWidth = 3;
    ctx.font = `800 ${Math.max(14, s * 0.4)}px system-ui`; ctx.textAlign = 'center';
    ctx.strokeText('×', target.x + s * 0.5, target.y + s * 0.62);
    ctx.fillText('×', target.x + s * 0.5, target.y + s * 0.62); ctx.restore();
  }
}

export function drawFeedback(ctx: CanvasRenderingContext2D, state: GameState, config: CanvasConfig,
  timeline: FeedbackTimeline, now: number, dragging: boolean): boolean {
  const { frames, rejected } = timeline.sample(now);
  const { gridOffsetX: gx, gridOffsetY: gy, cellSize: s } = config;
  ctx.save(); ctx.beginPath(); ctx.rect(gx - 3, gy - 3, s * 8 + 6, s * 8 + 6); ctx.clip();
  for (const { move, start, particles } of frames) {
    const age = now - start;
    if (age < MOTION.placementMs) {
      const scale = 1 + Math.sin(age / MOTION.placementMs * Math.PI) * MOTION.placementOvershoot;
      for (const p of move.placed) {
        if (state.board[p.row][p.col] !== p.color) continue;
        drawBlock(ctx, gx + p.col * s - (scale - 1) * s / 2, gy + p.row * s - (scale - 1) * s / 2, s * scale, p.color);
      }
    }
    if (age < MOTION.clearMs) {
      const fade = Math.max(0, 1 - Math.max(0, age - MOTION.clearHoldMs) / (MOTION.clearMs - MOTION.clearHoldMs));
      for (const p of move.cleared) {
        // A newly placed block wins over the old disappearing snapshot.
        if (state.board[p.row][p.col]) continue;
        const x = gx + p.col * s, y = gy + p.row * s;
        drawBlock(ctx, x, y, s, p.color, fade);
        ctx.fillStyle = `rgba(255,218,132,${fade * 0.42})`; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.shadowColor = '#ffc45c'; ctx.shadowBlur = Math.min(10, s * 0.2);
        ctx.strokeStyle = `rgba(255,225,160,${fade})`; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
        ctx.shadowBlur = 0;
      }
    }
    const t = (age - MOTION.clearHoldMs) / (MOTION.particleMs - MOTION.clearHoldMs);
    if (t > 0 && t < 1) for (const p of particles) {
      const x = gx + (p.col + 0.5 + p.vx * t) * s;
      const y = gy + (p.row + 0.5 + p.vy * t + t * t * 1.4) * s;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = p.color % 2 ? '#ffe6a0' : BLOCK_MATERIALS[p.color - 1].top;
      const size = Math.max(1, s * 0.075 * (1 - t * 0.5)); ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (rejected) {
    const rect = config.slots[rejected.slot];
    ctx.save(); ctx.strokeStyle = `rgba(255,164,164,${1 - (now - rejected.start) / MOTION.invalidMs})`;
    ctx.lineWidth = 2; ctx.strokeRect(rect.x + 3, rect.y + 3, rect.width - 6, rect.height - 6); ctx.restore();
  }
  // Use the existing empty board/tray gap, never a live placement region.
  const latest = frames.at(-1);
  if (latest && !dragging) {
    const age = now - latest.start, { move } = latest;
    const duration = move.tier ? MOTION.comboMs : MOTION.scoreMs;
    if (age < duration) {
      const gap = config.slots[0].y - (gy + s * 8);
      const center = gy + s * 8 + gap / 2;
      const progress = age / duration;
      const alpha = Math.min(1, (1 - progress) * 5);
      const scale = move.tier ? 1 + Math.sin(Math.min(1, age / MOTION.comboAttackMs) * Math.PI) * (0.08 + move.tier * 0.025) : 1;
      ctx.save(); ctx.beginPath(); ctx.rect(gx, gy + s * 8 + 2, s * 8, gap - 4); ctx.clip();
      ctx.translate(gx + s * 4, center - (move.tier ? 0 : progress * Math.min(5, gap * 0.15))); ctx.scale(scale, scale);
      ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.min(move.tier ? 25 : 19, gap * 0.62)}px system-ui`;
      ctx.fillStyle = move.tier === 3 ? '#ffe58b' : move.tier === 2 ? '#e7caff' : '#d4f8ff';
      ctx.strokeStyle = '#2441a0'; ctx.lineWidth = move.tier ? 3 : 2;
      ctx.shadowColor = move.tier >= 2 ? '#bd89ff' : '#79dbff'; ctx.shadowBlur = move.tier ? 4 + move.tier * 2 : 0;
      const text = move.tier ? `Combo ×${move.combo}  +${move.points}` : `+${move.points}`;
      ctx.strokeText(text, 0, 0, s * 7.5); ctx.fillText(text, 0, 0, s * 7.5); ctx.restore();
    }
  }
  return frames.length > 0 || rejected !== null;
}
