import { type GameState, BOARD_SIZE } from './types';
import { dealHand } from './dealer';

export function createEmptyBoard(): GameState['board'] {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => 0));
}
export function createInitialState(highScore = 0, seed = 0x12345678): GameState {
  const board = createEmptyBoard();
  const { shapes, rngState, dealer } = dealHand(board, seed, 1);
  return { board, shapes, rngState, dealer, score: 0, linesCleared: 0, status: 'idle', highScore,
    combo: 0, dryMoves: 0, round: 1, moves: 0, revision: 0 };
}
