export interface Rect { x: number; y: number; width: number; height: number }
export interface CanvasConfig {
  width: number;
  height: number;
  cellSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  trayCell: number;
  slots: Rect[];
}
// CSS pixels are the only input/layout coordinate system; DPR is for drawing.
export function calculateLayout(width: number, height: number): CanvasConfig {
  const boardSize = Math.max(1, Math.min(width - 24, 480, (height - 36) / 1.38, height - 124));
  const trayHeight = Math.max(88, boardSize * 0.38);
  const top = Math.max(8, (height - boardSize - trayHeight - 20) / 2);
  return { width, height, cellSize: boardSize / 8, gridOffsetX: (width - boardSize) / 2, gridOffsetY: top,
    trayCell: Math.max(1, Math.min(boardSize / 8 * 0.58, (width / 3 - 16) / 5)),
    slots: Array.from({ length: 3 }, (_, i) => ({ x: i * width / 3, y: top + boardSize + 20, width: width / 3, height: trayHeight })) };
}
export function initCanvas(canvas: HTMLCanvasElement): CanvasConfig {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法创建游戏画布');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return calculateLayout(rect.width, rect.height);
}
export function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
}
