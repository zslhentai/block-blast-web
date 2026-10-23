import { type Board, type Shape, BOARD_SIZE } from './types';

export function canPlace(board: Board, shape: Shape, row: number, col: number): boolean {
  if (!Number.isInteger(row) || !Number.isInteger(col) || shape.cells.length === 0) return false;
  for (const [dr, dc] of shape.cells) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) {
      return false;
    }
    if (board[newRow][newCol] !== 0) {
      return false;
    }
  }
  return true;
}

export function placeShapeOnBoard(board: Board, shape: Shape, row: number, col: number): Board {
  const newBoard = board.map(r => [...r]);
  for (const [dr, dc] of shape.cells) {
    newBoard[row + dr][col + dc] = shape.color;
  }
  return newBoard;
}
