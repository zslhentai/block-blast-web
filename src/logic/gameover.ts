import { Board, Shape, BOARD_SIZE } from './types';
import { canPlace } from './placement';

export function checkGameOver(board: Board, shapes: Shape[]): boolean {
  if (shapes.length === 0) return false;

  for (const shape of shapes) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (canPlace(board, shape, row, col)) {
          return false;
        }
      }
    }
  }
  return true;
}
