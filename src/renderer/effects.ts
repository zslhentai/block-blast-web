import type { GameState, Shape } from '../logic/types';
import type { CanvasConfig } from './canvas';
import { drawBlock, drawCell, drawPiece } from './draw';
import { BLOCK_MATERIALS } from './theme';
import { type FeedbackTimeline } from './feedback';
import { MOTION, FEEDBACK_STRENGTH, placementScale, easeOutCubic } from './motion';

export function drawPreview(ctx: CanvasRenderingContext2D, shape: Shape, target: { row: number; col: number; x: number; y: number },
  valid: boolean, clear: { row: number; col: number }[], config: CanvasConfig): void {
  // Match the preview in d5690d6: translucent cells and the floating piece,
  // without V2's extra outlines, tints or invalid-position marker.
  if (valid) {
    for (const cell of clear) drawCell(ctx, cell.row, cell.col, shape.color, config, 0.28);
    for (const [r, c] of shape.cells) drawCell(ctx, target.row + r, target.col + c, shape.color, config, 0.45);
  }
  drawPiece(ctx, shape, target.x, target.y, config.cellSize, valid ? 0.95 : 0.65);
}

export function drawFeedback(ctx: CanvasRenderingContext2D, state: GameState, config: CanvasConfig,
  timeline: FeedbackTimeline, now: number, dragging: boolean): boolean {
  const { frames, rejected } = timeline.sample(now);
  const { gridOffsetX: gx, gridOffsetY: gy, cellSize: s } = config;
  ctx.save(); ctx.beginPath(); ctx.rect(gx - 3, gy - 3, s * 8 + 6, s * 8 + 6); ctx.clip();
  for (const { move, start, particles } of frames) {
    const age = now - start;
    if (age < MOTION.placementMs) {
      const scale = placementScale(age);
      for (const p of move.placed) {
        if (!timeline.owns(move.revision, p) || state.board[p.row][p.col] !== p.color) continue;
        drawBlock(ctx, gx + p.col * s - (scale - 1) * s / 2, gy + p.row * s - (scale - 1) * s / 2, s * scale, p.color);
      }
    }
    if (age < MOTION.clearMs) {
      const progress = Math.max(0, (age - MOTION.clearHoldMs) / (MOTION.clearMs - MOTION.clearHoldMs));
      const fade = 1 - easeOutCubic(progress);
      const scale = 1 - progress * .12;
      const level = FEEDBACK_STRENGTH[move.strength];
      for (const p of move.cleared) {
        // A newly placed block wins over the old disappearing snapshot.
        if (!timeline.owns(move.revision, p) || state.board[p.row][p.col]) continue;
        const x = gx + p.col * s, y = gy + p.row * s;
        const inset = (1-scale)*s/2;
        drawBlock(ctx, x+inset, y+inset, s*scale, p.color, fade);
        ctx.fillStyle = `rgba(255,226,155,${fade * level.flash})`; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        // A small perimeter halo preserves the colored face, without a white fill.
        ctx.shadowColor = '#ffd477'; ctx.shadowBlur = Math.min(level.glow, s * 0.18);
        ctx.strokeStyle = `rgba(255,222,148,${fade * .62})`; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
        ctx.shadowBlur = 0;
      }
    }
    const t = (age - MOTION.clearHoldMs) / (MOTION.particleMs - MOTION.clearHoldMs);
    if (t > 0 && t < 1) for (const p of particles) {
      if (!timeline.owns(move.revision, p)) continue;
      const x = gx + (p.col + 0.5 + p.vx * t) * s;
      const y = gy + (p.row + 0.5 + p.vy * t + t * t * 1.4) * s;
      const row = Math.floor((y-gy)/s), col = Math.floor((x-gx)/s);
      if (state.board[row]?.[col]) continue;
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
      ctx.shadowColor = move.tier === 3 ? '#e5bc56' : move.tier === 2 ? '#bd89ff' : '#79dbff'; ctx.shadowBlur = move.tier ? 4 + move.tier * 2 : 0;
      const text = move.tier ? `Combo ×${move.combo}  +${move.points}` : `+${move.points}`;
      ctx.strokeText(text, 0, 0, s * 7.5); ctx.fillText(text, 0, 0, s * 7.5); ctx.restore();
    }
  }
  return frames.length > 0 || rejected !== null;
}
