import { type GameState, type Shape, COLORS, BOARD_SIZE } from '../logic/types';
import type { CanvasConfig, Rect } from './canvas';

export function drawBoard(ctx: CanvasRenderingContext2D, config: CanvasConfig): void {
  const { cellSize, gridOffsetX, gridOffsetY } = config;
  ctx.strokeStyle = '#363655'; ctx.lineWidth = 1;
  for (let i = 0; i <= BOARD_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(gridOffsetX, gridOffsetY + i * cellSize);
    ctx.lineTo(gridOffsetX + BOARD_SIZE * cellSize, gridOffsetY + i * cellSize);
    ctx.moveTo(gridOffsetX + i * cellSize, gridOffsetY);
    ctx.lineTo(gridOffsetX + i * cellSize, gridOffsetY + BOARD_SIZE * cellSize);
    ctx.stroke();
  }
}
export function drawCell(ctx: CanvasRenderingContext2D, row: number, col: number, colorIndex: number, config: CanvasConfig, alpha = 1): void {
  const { cellSize, gridOffsetX, gridOffsetY } = config;
  const padding = Math.max(1, cellSize * 0.045);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS[colorIndex - 1];
  ctx.fillRect(gridOffsetX + col * cellSize + padding, gridOffsetY + row * cellSize + padding, cellSize - padding * 2, cellSize - padding * 2);
  ctx.globalAlpha = 1;
}
export function drawState(ctx: CanvasRenderingContext2D, state: GameState, config: CanvasConfig): void {
  state.board.forEach((row, r) => row.forEach((color, c) => { if (color) drawCell(ctx, r, c, color, config); }));
}
export function shapeBounds(shape: Shape): { rows: number; cols: number } {
  return { rows: Math.max(...shape.cells.map(([r]) => r)) + 1, cols: Math.max(...shape.cells.map(([, c]) => c)) + 1 };
}
export function drawPiece(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, size: number, alpha = 1): void {
  ctx.globalAlpha = alpha; ctx.fillStyle = COLORS[shape.color - 1];
  for (const [r, c] of shape.cells) ctx.fillRect(x + c * size + 1, y + r * size + 1, Math.max(1, size - 2), Math.max(1, size - 2));
  ctx.globalAlpha = 1;
}
export function pieceOrigin(shape: Shape, rect: Rect, size: number) {
  const { rows, cols } = shapeBounds(shape);
  return { x: rect.x + (rect.width - cols * size) / 2, y: rect.y + (rect.height - rows * size) / 2 };
}
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: (Shape | null)[], config: CanvasConfig, skipId?: string): void {
  shapes.forEach((shape, i) => {
    if (!shape || shape.id === skipId) return;
    const { x, y } = pieceOrigin(shape, config.slots[i], config.trayCell);
    drawPiece(ctx, shape, x, y, config.trayCell);
  });
}
