import { type Board, type Shape, BOARD_SIZE } from './types';
import { canPlace } from './placement';

export function checkGameOver(board: Board, shapes: (Shape | null)[]): boolean {
  if (shapes.every(shape => shape === null)) return false; // Await a complete new hand.

  for (const shape of shapes) {
    if (!shape) continue;
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
