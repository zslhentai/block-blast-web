import { describe, test, expect } from 'bun:test';
import { gameReducer } from './reducer';
import { createInitialState } from './state';

describe('reducer', () => {
  test('START_GAME transitions to playing', () => {
    const state = createInitialState();
    const newState = gameReducer(state, { type: 'START_GAME' });
    expect(newState.status).toBe('playing');
  });

  test('PLACE_SHAPE adds blocks to board', () => {
    const state = { ...createInitialState(), status: 'playing' as const };
    const shape = { id: 'test', cells: [[0, 0]] as [number, number][], color: 1 };
    const newState = gameReducer(state, { type: 'PLACE_SHAPE', shape, row: 0, col: 0 });
    expect(newState.board[0][0]).toBe(1);
    expect(newState.score).toBe(10);
  });

  test('PLACE_SHAPE clears lines', () => {
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      board: Array.from({ length: 8 }, (_, i) => 
        i === 0 ? [1, 1, 1, 1, 1, 1, 1, 1] : Array(8).fill(0)
      ),
    };
    const shape = { id: 'test', cells: [[0, 0]] as [number, number][], color: 1 };
    const newState = gameReducer(state, { type: 'PLACE_SHAPE', shape, row: 1, col: 0 });
    expect(newState.linesCleared).toBe(1);
    expect(newState.board[0].every(c => c === 0)).toBe(true);
  });

  test('RESTART resets game', () => {
    const state = { ...createInitialState(), score: 100, status: 'gameover' as const };
    const newState = gameReducer(state, { type: 'RESTART' });
    expect(newState.score).toBe(0);
    expect(newState.status).toBe('playing');
  });

  // ====== Corner Case Tests ======

  test('PLACE_SHAPE when last shape is placed sets pendingGameOverCheck to true', () => {
    // Create state with only 1 shape remaining
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      board: Array.from({ length: 8 }, () => Array(8).fill(0)),
      shapes: [{ id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 }],
    };
    
    const shape = { id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 };
    const newState = gameReducer(state, { type: 'PLACE_SHAPE', shape, row: 0, col: 0 });
    
    // New shapes should be generated
    expect(newState.shapes.length).toBe(3);
    // pendingGameOverCheck should be true (delayed game over check)
    expect(newState.pendingGameOverCheck).toBe(true);
    // Status should still be playing (not gameover yet)
    expect(newState.status).toBe('playing');
  });

  test('PLACE_SHAPE with remaining shapes does NOT set pendingGameOverCheck', () => {
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      board: Array.from({ length: 8 }, () => Array(8).fill(0)),
      shapes: [
        { id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 },
        { id: 'shape-2', cells: [[0, 0]] as [number, number][], color: 1 },
      ],
    };
    
    const shape = { id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 };
    const newState = gameReducer(state, { type: 'PLACE_SHAPE', shape, row: 0, col: 0 });
    
    // pendingGameOverCheck should NOT be set
    expect(newState.pendingGameOverCheck).toBe(false);
    // Status should be checked immediately
    expect(newState.status).toBe('playing');
  });

  test('CHECK_GAME_OVER transitions to gameover when no moves possible', () => {
    // Create a state where no shapes can be placed
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      // Full board - no moves possible
      board: Array.from({ length: 8 }, () => Array(8).fill(1)),
      shapes: [{ id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 }],
      pendingGameOverCheck: true,
    };
    
    const newState = gameReducer(state, { type: 'CHECK_GAME_OVER' });
    
    expect(newState.status).toBe('gameover');
    expect(newState.pendingGameOverCheck).toBe(false);
  });

  test('CHECK_GAME_OVER stays playing when moves are possible', () => {
    // Empty board - moves are possible
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      board: Array.from({ length: 8 }, () => Array(8).fill(0)),
      shapes: [{ id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 }],
      pendingGameOverCheck: true,
    };
    
    const newState = gameReducer(state, { type: 'CHECK_GAME_OVER' });
    
    expect(newState.status).toBe('playing');
    expect(newState.pendingGameOverCheck).toBe(false);
  });

  test('CHECK_GAME_OVER does NOT trigger gameover for partial board that has moves', () => {
    // Board with some blocks but still has space for single block
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      board: Array.from({ length: 8 }, (_, row) => 
        row === 0 ? Array(8).fill(1) : Array(8).fill(0)
      ),
      shapes: [{ id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 }],
      pendingGameOverCheck: true,
    };
    
    const newState = gameReducer(state, { type: 'CHECK_GAME_OVER' });
    
    // Should stay playing since we can place shapes
    expect(newState.status).toBe('playing');
    expect(newState.pendingGameOverCheck).toBe(false);
  });

  test('PLACE_SHAPE with remaining shapes leaves correct count', () => {
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      board: Array.from({ length: 8 }, () => Array(8).fill(0)),
      shapes: [
        { id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 },
        { id: 'shape-2', cells: [[0, 0]] as [number, number][], color: 1 },
        { id: 'shape-3', cells: [[0, 0]] as [number, number][], color: 1 },
      ],
    };
    
    const shape = { id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 };
    const newState = gameReducer(state, { type: 'PLACE_SHAPE', shape, row: 0, col: 0 });
    
    // Should have 2 remaining shapes (shape-2 and shape-3)
    expect(newState.shapes.length).toBe(2);
  });

  test('pendingGameOverCheck is false initially', () => {
    const state = createInitialState();
    expect(state.pendingGameOverCheck).toBe(false);
  });

  test('pendingGameOverCheck is reset to false on RESTART', () => {
    const state = {
      ...createInitialState(),
      status: 'gameover' as const,
      pendingGameOverCheck: true,
    };
    
    const newState = gameReducer(state, { type: 'RESTART' });
    expect(newState.pendingGameOverCheck).toBe(false);
  });

  test('pendingGameOverCheck is false after normal placement (with remaining shapes)', () => {
    const state = {
      ...createInitialState(),
      status: 'playing' as const,
      board: Array.from({ length: 8 }, () => Array(8).fill(0)),
      shapes: [
        { id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 },
        { id: 'shape-2', cells: [[0, 0]] as [number, number][], color: 1 },
        { id: 'shape-3', cells: [[0, 0]] as [number, number][], color: 1 },
      ],
    };
    
    const shape = { id: 'shape-1', cells: [[0, 0]] as [number, number][], color: 1 };
    const newState = gameReducer(state, { type: 'PLACE_SHAPE', shape, row: 0, col: 0 });
    
    // pendingGameOverCheck should be false - immediate check done
    expect(newState.pendingGameOverCheck).toBe(false);
  });
});
