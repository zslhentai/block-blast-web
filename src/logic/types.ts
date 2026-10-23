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
  shapes: (Shape | null)[];
  score: number;
  linesCleared: number;
  status: GameStatus;
  highScore: number;
  combo: number;
  dryMoves: number;
  round: number;
  moves: number;
  rngState: number;
  revision: number;
}

export interface Point {
  row: number;
  col: number;
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'PLACE_SHAPE'; shapeId: string; slot: number; row: number; col: number; revision: number }
  | { type: 'CHECK_GAME_OVER' }
  | { type: 'RESTART'; seed: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export const BOARD_SIZE = 8;
export const SHAPES_TO_SPAWN = 3;
export const RULE_VERSION = 1;
export const CATALOGUE_VERSION = 1;

export const COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#F39C12',
] as const;
