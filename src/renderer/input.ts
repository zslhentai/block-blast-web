import { Shape } from '../logic/types';
import { CanvasConfig } from './canvas';

export interface DragState {
  isDragging: boolean;
  shape: Shape | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  previewRow: number;
  previewCol: number;
  isValidPlacement: boolean;
}

export function createInitialDragState(): DragState {
  return {
    isDragging: false,
    shape: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    previewRow: -1,
    previewCol: -1,
    isValidPlacement: false,
  };
}

export function getGridPosition(x: number, y: number, config: CanvasConfig): { row: number; col: number } | null {
  const { cellSize, gridOffsetX, gridOffsetY } = config;
  const col = Math.floor((x - gridOffsetX) / cellSize);
  const row = Math.floor((y - gridOffsetY) / cellSize);
  if (row >= 0 && row < 8 && col >= 0 && col < 8) {
    return { row, col };
  }
  return null;
}
