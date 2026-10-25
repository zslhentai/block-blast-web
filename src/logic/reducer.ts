import { type GameState, type GameAction } from './types';
import { createInitialState } from './state';
import { dealHand, type HandDealer } from './dealer';
import { canPlace, placeShapeOnBoard } from './placement';
import { checkAndClearLines } from './lineClear';
import { calculateScore } from './scoring';
import { checkGameOver } from './gameover';

export function gameReducer(state: GameState, action: GameAction, dealer: HandDealer = dealHand): GameState {
  switch (action.type) {
    case 'START_GAME': return state.status === 'idle' ? { ...state, status: 'playing' } : state;
    case 'PAUSE': return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'RESUME': return state.status === 'paused' ? { ...state, status: 'playing' } : state;
    case 'RESTART': return { ...createInitialState(state.highScore, action.seed), status: 'playing' };
    case 'CHECK_GAME_OVER':
      return state.status === 'playing' && checkGameOver(state.board, state.shapes)
        ? { ...state, status: 'gameover' } : state;
    case 'PLACE_SHAPE': {
      if (state.status !== 'playing' || action.revision !== state.revision ||
          !Number.isInteger(action.slot) || action.slot < 0 || action.slot >= 3) return state;
      const shape = state.shapes[action.slot];
      if (!shape || shape.id !== action.shapeId || !canPlace(state.board, shape, action.row, action.col)) return state;
      const cleared = checkAndClearLines(placeShapeOnBoard(state.board, shape, action.row, action.col));
      const dryMoves = cleared.linesCleared ? 0 : Math.min(3, state.dryMoves + 1);
      const combo = cleared.linesCleared ? state.combo + 1 : dryMoves >= 3 ? 0 : state.combo;
      const score = state.score + calculateScore(shape.cells.length, cleared.linesCleared, cleared.cells.length, combo).points;
      let shapes = state.shapes.map((s, i) => i === action.slot ? null : s);
      let { round, rngState, dealer: dealerMemory } = state;
      if (shapes.every(s => s === null)) {
        round++;
        const dealt = dealer(cleared.board, rngState, round, { combo, dryMoves, memory: dealerMemory });
        shapes = dealt.shapes; rngState = dealt.rngState; dealerMemory = dealt.dealer;
      }
      return { ...state, board: cleared.board, shapes, round, rngState, dealer: dealerMemory, score, combo, dryMoves,
        highScore: Math.max(state.highScore, score), linesCleared: state.linesCleared + cleared.linesCleared,
        moves: state.moves + 1, revision: state.revision + 1,
        status: checkGameOver(cleared.board, shapes) ? 'gameover' : 'playing' };
    }
  }
}
