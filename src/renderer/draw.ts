import { type GameState, type Shape, BOARD_SIZE } from '../logic/types';
import type { CanvasConfig, Rect } from './canvas';
import { BLOCK_MATERIALS } from './theme';

// Explicit curves also work on Safari versions predating Canvas roundRect.
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}

const boardLayers = new WeakMap<CanvasRenderingContext2D, { key: string; canvas: HTMLCanvasElement }>();

export function drawBoard(ctx: CanvasRenderingContext2D, config: CanvasConfig): void {
  const dpr = ctx.getTransform().a;
  const key = [ctx.canvas.width, ctx.canvas.height, dpr, config.gridOffsetX, config.gridOffsetY, config.cellSize].join(':');
  let layer = boardLayers.get(ctx);
  if (layer?.key !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = ctx.canvas.width; canvas.height = ctx.canvas.height;
    const surface = canvas.getContext('2d');
    if (!surface) { paintBoard(ctx, config); return; }
    surface.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBoard(surface, config); layer = { key, canvas }; boardLayers.set(ctx, layer);
  }
  // Blit in backing pixels: no second scaling or blurry fractional stretch.
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer.canvas, 0, 0); ctx.restore();
}

function paintBoard(ctx: CanvasRenderingContext2D, config: CanvasConfig): void {
  const { cellSize, gridOffsetX, gridOffsetY } = config;
  const size = cellSize * BOARD_SIZE;
  const rim = Math.min(4, cellSize * 0.1);
  ctx.save();
  const edge = ctx.createLinearGradient(0, gridOffsetY - rim, 0, gridOffsetY + size + rim);
  edge.addColorStop(0, '#435f9f'); edge.addColorStop(0.3, '#2d457f'); edge.addColorStop(1, '#6482c7');
  roundedRect(ctx, gridOffsetX - rim, gridOffsetY - rim, size + rim * 2, size + rim * 2, cellSize * 0.18);
  ctx.fillStyle = edge; ctx.fill();
  roundedRect(ctx, gridOffsetX - rim / 2, gridOffsetY - rim / 2, size + rim, size + rim, cellSize * 0.14);
  ctx.fillStyle = '#1c254d'; ctx.fill();
  ctx.strokeStyle = '#18213f'; ctx.lineWidth = Math.max(1, rim / 2); ctx.stroke();
  const gap = Math.max(1, cellSize * 0.022);
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
    const x = gridOffsetX + col * cellSize + gap;
    const y = gridOffsetY + row * cellSize + gap;
    const groove = ctx.createLinearGradient(0, y, 0, y + cellSize);
    groove.addColorStop(0, '#1e274d'); groove.addColorStop(0.14, '#252f59');
    groove.addColorStop(0.84, '#242e57'); groove.addColorStop(1, '#20294f');
    roundedRect(ctx, x, y, cellSize - gap * 2, cellSize - gap * 2, cellSize * 0.07);
    ctx.fillStyle = groove; ctx.fill();
    ctx.strokeStyle = '#27325b'; ctx.lineWidth = 0.6; ctx.stroke();
  }
  ctx.restore();
}

// Every scale (board, tray, drag) uses the same bevel and light direction.
export function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colorIndex: number, alpha = 1): void {
  const material = BLOCK_MATERIALS[colorIndex - 1] ?? BLOCK_MATERIALS[0];
  const inset = Math.max(0.65, size * 0.016);
  const side = Math.max(0.1, size - inset * 2);
  const bevel = side * 0.145;
  const l = x + inset, t = y + inset, r = l + side, b = t + side;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#17294b66';
  ctx.fillRect(l + size * 0.055, t + size * 0.075, side, side);
  ctx.fillStyle = material.edge; ctx.fillRect(l, t, side, side);
  const face = ctx.createLinearGradient(0, t + bevel, 0, b - bevel);
  face.addColorStop(0, material.faceTop); face.addColorStop(1, material.faceBottom);
  ctx.fillStyle = face; ctx.fillRect(l + bevel, t + bevel, side - bevel * 2, side - bevel * 2);
  const facet = (color: string, points: [number, number][]): void => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath(); ctx.fill();
  };
  facet(material.top, [[l, t], [r, t], [r - bevel, t + bevel], [l + bevel, t + bevel]]);
  facet(material.left, [[l, t], [l + bevel, t + bevel], [l + bevel, b - bevel], [l, b]]);
  facet(material.right, [[r, t], [r, b], [r - bevel, b - bevel], [r - bevel, t + bevel]]);
  facet(material.bottom, [[l, b], [l + bevel, b - bevel], [r - bevel, b - bevel], [r, b]]);
  ctx.strokeStyle = material.edge; ctx.lineWidth = Math.max(0.5, size * 0.014);
  ctx.strokeRect(l, t, side, side);
  ctx.strokeStyle = '#ffffff45'; ctx.lineWidth = Math.max(0.5, size * 0.012);
  ctx.beginPath(); ctx.moveTo(l + 1, t + 0.7); ctx.lineTo(r - 1, t + 0.7); ctx.stroke();
  ctx.restore();
}
export function drawCell(ctx: CanvasRenderingContext2D, row: number, col: number, colorIndex: number, config: CanvasConfig, alpha = 1): void {
  const { cellSize, gridOffsetX, gridOffsetY } = config;
  drawBlock(ctx, gridOffsetX + col * cellSize, gridOffsetY + row * cellSize, cellSize, colorIndex, alpha);
}
export function drawState(ctx: CanvasRenderingContext2D, state: GameState, config: CanvasConfig): void {
  state.board.forEach((row, r) => row.forEach((color, c) => { if (color) drawCell(ctx, r, c, color, config); }));
}
export function shapeBounds(shape: Shape): { rows: number; cols: number } {
  return { rows: Math.max(...shape.cells.map(([r]) => r)) + 1, cols: Math.max(...shape.cells.map(([, c]) => c)) + 1 };
}
export function drawPiece(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, size: number, alpha = 1): void {
  for (const [r, c] of shape.cells) drawBlock(ctx, x + c * size, y + r * size, size, shape.color, alpha);
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
