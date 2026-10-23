export interface CanvasConfig {
  width: number;
  height: number;
  cellSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
}

export function initCanvas(canvas: HTMLCanvasElement): CanvasConfig {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  
  const ctx = canvas.getContext('2d')!;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  const displayWidth = rect.width;
  const displayHeight = rect.height;
  
  const cellSize = Math.min(displayWidth, displayHeight) / 10;
  const gridSize = cellSize * 8;
  const gridOffsetX = (displayWidth - gridSize) / 2;
  const gridOffsetY = displayHeight * 0.15;
  
  return {
    width: displayWidth,
    height: displayHeight,
    cellSize,
    gridOffsetX,
    gridOffsetY,
  };
}

export function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
}
