import { GameState, BOARD_SIZE, SHAPES_TO_SPAWN } from './types';
import { createShapes } from './shapes';

export function createEmptyBoard(): GameState['board'] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 0)
  );
}

export function createInitialState(highScore: number = 0): GameState {
  return {
    board: createEmptyBoard(),
    shapes: createShapes(SHAPES_TO_SPAWN),
    score: 0,
    linesCleared: 0,
    status: 'idle',
    highScore,
    pendingGameOverCheck: false,
  };
}
