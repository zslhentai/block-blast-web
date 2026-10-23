import { GameState, COLORS, BOARD_SIZE } from '../logic/types';
import { CanvasConfig } from './canvas';

export function drawBoard(ctx: CanvasRenderingContext2D, config: CanvasConfig): void {
  const { cellSize, gridOffsetX, gridOffsetY } = config;
  ctx.strokeStyle = '#2a2a4e';
  ctx.lineWidth = 1;
  
  for (let row = 0; row <= BOARD_SIZE; row++) {
    const y = gridOffsetY + row * cellSize;
    ctx.beginPath();
    ctx.moveTo(gridOffsetX, y);
    ctx.lineTo(gridOffsetX + BOARD_SIZE * cellSize, y);
    ctx.stroke();
  }
  
  for (let col = 0; col <= BOARD_SIZE; col++) {
    const x = gridOffsetX + col * cellSize;
    ctx.beginPath();
    ctx.moveTo(x, gridOffsetY);
    ctx.lineTo(x, gridOffsetY + BOARD_SIZE * cellSize);
    ctx.stroke();
  }
}

export function drawCell(ctx: CanvasRenderingContext2D, row: number, col: number, colorIndex: number, config: CanvasConfig, alpha: number = 1): void {
  const { cellSize, gridOffsetX, gridOffsetY } = config;
  const x = gridOffsetX + col * cellSize;
  const y = gridOffsetY + row * cellSize;
  const padding = 2;
  
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS[colorIndex - 1];
  ctx.fillRect(x + padding, y + padding, cellSize - padding * 2, cellSize - padding * 2);
  ctx.globalAlpha = 1;
}

export function drawState(ctx: CanvasRenderingContext2D, state: GameState, config: CanvasConfig): void {
  const { board } = state;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] !== 0) {
        drawCell(ctx, row, col, board[row][col], config);
      }
    }
  }
}

export function drawScore(ctx: CanvasRenderingContext2D, state: GameState, config: CanvasConfig): void {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Score: ${state.score}`, config.width / 2, 40);
  ctx.font = '16px sans-serif';
  ctx.fillText(`Lines: ${state.linesCleared}`, config.width / 2, 70);
}

export function drawShapes(ctx: CanvasRenderingContext2D, shapes: { id?: string; cells: [number, number][]; color: number }[], config: CanvasConfig, scale: number = 0.7, skipId?: string): void {
  const shapeWidth = config.cellSize * 4 * scale;
  const totalShapes = 3; // Always reserve space for 3 shapes
  const startX = config.width / 2 - (totalShapes * shapeWidth) / 2;
  const startY = config.height - config.cellSize * 5;

  shapes.forEach((shape, index) => {
    // Skip drawing the shape being dragged
    if (skipId && shape.id === skipId) return;

    const offsetX = startX + index * shapeWidth + shapeWidth / 2 - (2 * config.cellSize * scale);
    const offsetY = startY + config.cellSize;

    shape.cells.forEach(([row, col]) => {
      ctx.fillStyle = COLORS[shape.color - 1];
      ctx.fillRect(
        offsetX + col * config.cellSize * scale,
        offsetY + row * config.cellSize * scale,
        config.cellSize * scale - 1,
        config.cellSize * scale - 1
      );
    });
  });
}
