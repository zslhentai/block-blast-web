export type CellValue = number;
export type Board = CellValue[][];

export interface Shape {
  id: string;
  cells: [number, number][];
  color: number;
}

export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';

export interface GameState {
  board: Board;
  shapes: Shape[];
  score: number;
  linesCleared: number;
  status: GameStatus;
  highScore: number;
  pendingGameOverCheck: boolean;
}

export interface Point {
  row: number;
  col: number;
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'PLACE_SHAPE'; shape: Shape; row: number; col: number }
  | { type: 'CHECK_GAME_OVER' }
  | { type: 'RESTART' }
  | { type: 'SET_HIGH_SCORE'; score: number };

export const BOARD_SIZE = 8;
export const SHAPES_TO_SPAWN = 3;

export const COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#F39C12',
] as const;
