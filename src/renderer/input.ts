import type { Shape } from '../logic/types';
import type { CanvasConfig, Rect } from './canvas';
import { shapeBounds } from './draw';

export interface DragState {
  pointerId: number;
  pointerType: string;
  shape: Shape;
  slot: number;
  revision: number;
  currentX: number;
  currentY: number;
}
export function toLocal(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, config: CanvasConfig) {
  return { x: (clientX - rect.left) * config.width / rect.width, y: (clientY - rect.top) * config.height / rect.height };
}
export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
export function projectDrag(drag: DragState, config: CanvasConfig) {
  const { rows, cols } = shapeBounds(drag.shape);
  const x = drag.currentX - cols * config.cellSize / 2;
  const y = drag.pointerType === 'touch' || drag.pointerType === 'pen'
    ? drag.currentY - rows * config.cellSize - config.cellSize * 1.15
    : drag.currentY - rows * config.cellSize / 2;
  return { x, y, row: Math.round((y - config.gridOffsetY) / config.cellSize), col: Math.round((x - config.gridOffsetX) / config.cellSize) };
}
