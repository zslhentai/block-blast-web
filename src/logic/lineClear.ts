import { Board, BOARD_SIZE } from './types';

export interface LineClearResult {
  board: Board;
  linesCleared: number;
}

export function checkAndClearLines(board: Board): LineClearResult {
  const newBoard = board.map(row => [...row]);
  const rowsToClear: number[] = [];
  const colsToClear: number[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    if (newBoard[row].every(cell => cell !== 0)) {
      rowsToClear.push(row);
    }
  }

  for (let col = 0; col < BOARD_SIZE; col++) {
    let full = true;
    for (let row = 0; row < BOARD_SIZE; row++) {
      if (newBoard[row][col] === 0) {
        full = false;
        break;
      }
    }
    if (full) {
      colsToClear.push(col);
    }
  }

  for (const row of rowsToClear) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      newBoard[row][col] = 0;
    }
  }

  for (const col of colsToClear) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      newBoard[row][col] = 0;
    }
  }

  return {
    board: newBoard,
    linesCleared: rowsToClear.length + colsToClear.length,
  };
}
