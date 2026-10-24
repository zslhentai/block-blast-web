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
  // Leave room for the outer rim, a gap and even a five-cell vertical piece.
  // This exact inner grid is also used by hit testing and drag projection.
  const boardSize = Math.max(1, Math.min(width * 0.92, 480, (height - 28) / 1.5));
  // Include both side margins and the cast shadow of the longest (five-cell) piece.
  const trayCell = Math.max(1, Math.min(boardSize / 8 * 0.54, (width * 0.3 - 2) / 5.15));
  const trayHeight = Math.max(48, trayCell * 5 + 8);
  const gap = Math.max(12, boardSize * 0.10);
  const top = Math.max(6, Math.min(16, (height - boardSize - gap - trayHeight) * 0.12));
  return { width, height, cellSize: boardSize / 8, gridOffsetX: (width - boardSize) / 2, gridOffsetY: top,
    trayCell,
    slots: Array.from({ length: 3 }, (_, i) => ({ x: width * (0.05 + i * 0.3), y: top + boardSize + gap,
      width: width * 0.3, height: trayHeight })) };
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
  // The page owns the continuous blue background, including the HUD and tray.
  ctx.clearRect(0, 0, width, height);
}
