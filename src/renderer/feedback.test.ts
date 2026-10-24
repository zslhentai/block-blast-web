import { test, expect } from 'bun:test';
import { createInitialState } from '../logic/state';
import { gameReducer } from '../logic/reducer';
import type { Board, GameAction, Shape } from '../logic/types';
import { FeedbackTimeline, moveFeedback, feedbackDuration } from './feedback';
import { MOTION, placementScale, FEEDBACK_STRENGTH } from './motion';

const empty = (): Board => Array.from({ length: 8 }, () => Array<number>(8).fill(0));
const mono: Shape = { id: 'one', color: 7, cells: [[0, 0]] };
function transition(board: Board, shape = mono, combo = 0) {
  const before = { ...createInitialState(0, 17), status: 'playing' as const, board, combo, shapes: [shape, mono, null] };
  const action: GameAction = { type: 'PLACE_SHAPE', slot: 0, shapeId: shape.id, revision: 0, row: 0, col: 0 };
  const raw = JSON.stringify(before);
  const after = gameReducer(before, action);
  const move = moveFeedback(before, after, action)!;
  expect(JSON.stringify(before)).toBe(raw);
  return { before, after, action, move };
}

test.each(['row', 'two-rows', 'two-columns', 'cross'])(
  'feedback snapshots the committed %s clear, with exact colors and a deduplicated union', kind => {
    const board = empty(); let shape = mono;
    if (kind === 'row') board[0] = [0, 1, 1, 1, 1, 1, 1, 1];
    if (kind === 'two-rows') {
      board[0] = board[1] = [0, 1, 1, 1, 1, 1, 1, 1];
      shape = { id: 'vertical', color: 7, cells: [[0, 0], [1, 0]] };
    }
    if (kind === 'two-columns') {
      for (let r = 1; r < 8; r++) { board[r][0] = 2; board[r][1] = 2; }
      shape = { id: 'horizontal', color: 7, cells: [[0, 0], [0, 1]] };
    }
    if (kind === 'cross') { board[0] = [0, 1, 1, 1, 1, 1, 1, 1]; for (let r = 1; r < 8; r++) board[r][0] = 2; }
    const { after, move } = transition(board, shape);
    expect(after.board.flat().filter(Boolean)).toHaveLength(0);
    expect(move.cleared).toHaveLength(kind === 'row' ? 8 : kind === 'cross' ? 15 : 16);
    expect(new Set(move.cleared.map(p => `${p.row},${p.col}`)).size).toBe(move.cleared.length);
    expect(move.rows).toEqual(kind === 'two-columns' ? [] : kind === 'two-rows' ? [0, 1] : [0]);
    expect(move.cols).toEqual(kind === 'two-columns' ? [0, 1] : kind === 'cross' ? [0] : []);
    expect(move.cleared.find(p => p.row === 0 && p.col === 0)?.color).toBe(7);
    expect(move.points).toBe(after.score); expect(move.tier).toBe(0);
    expect(move.strength).toBe(kind==='row'?0:1);
  });

test.each([[0, 0], [1, 1], [2, 2], [3, 2], [4, 3]] as const)('chain %i gives tier %i only on a real clear', (combo, tier) => {
  const board = empty(); board[0] = [0, 1, 1, 1, 1, 1, 1, 1];
  expect(transition(board, mono, combo).move.tier).toBe(tier);
  expect(transition(empty(), mono, combo).move.tier).toBe(0);
});

test('newer touches own each cell even after it is cleared again, including large saved revisions', () => {
  const board=empty();board[0]=[0,1,1,1,1,1,1,1];
  const first=transition(board).move, timeline=new FeedbackTimeline();
  const revision=2**32+1;
  timeline.add({...first,revision},0);
  expect(timeline.owns(revision,{row:0,col:0})).toBe(true);
  timeline.add({...first,revision:revision+1,placed:[{row:0,col:3,color:2}],cleared:[{row:0,col:3,color:2}]},20);
  expect(timeline.owns(revision,{row:0,col:3})).toBe(false);
  expect(timeline.owns(revision,{row:0,col:2})).toBe(true);
  expect(timeline.owns(revision+1,{row:0,col:3})).toBe(true);
  timeline.reset();expect(timeline.owns(revision+1,{row:0,col:3})).toBe(false);
});

test('ordinary/enhanced/reward feedback scales bounded particles and the placement settles exactly', () => {
  const board=empty();board[0]=[0,1,1,1,1,1,1,1];
  for(const [combo,strength] of [[0,0],[1,1],[2,2]] as const) {
    const move=transition(board,mono,combo).move,timeline=new FeedbackTimeline();timeline.add(move,0);
    expect(move.strength).toBe(strength);
    expect(timeline.sample(1).frames[0].particles).toHaveLength(Math.min(FEEDBACK_STRENGTH[strength].particles,move.cleared.length*2));
  }
  expect(placementScale(0)).toBe(1);expect(placementScale(MOTION.placementMs)).toBe(1);
  expect(placementScale(MOTION.placementMs*.28)).toBeCloseTo(1+MOTION.placementOvershoot);
  expect(placementScale(MOTION.placementMs*.75)).toBeLessThan(placementScale(MOTION.placementMs*.4));
});

test('rejected, repeated and stale actions never generate a second feedback event', () => {
  const { before, after, action } = transition(empty());
  expect(moveFeedback(before, before, action)).toBeNull();
  expect(moveFeedback(after, gameReducer(after, action), action)).toBeNull();
  expect(moveFeedback(before, after, { type: 'PAUSE' })).toBeNull();
});

test('rapid effects are bounded, expire without timers, deduplicate revisions, and reset completely', () => {
  const board = empty(); board[0] = [0, 1, 1, 1, 1, 1, 1, 1];
  const { move } = transition(board, mono, 4);
  const timeline = new FeedbackTimeline();
  timeline.add(move, 100); timeline.add(move, 110);
  expect(timeline.sample(120).frames).toHaveLength(1);
  for (let i = 2; i < 12; i++) timeline.add({ ...move, revision: i }, 100 + i);
  const frames = timeline.sample(150).frames;
  expect(frames).toHaveLength(MOTION.maxMoves);
  expect(frames.reduce((sum, f) => sum + f.particles.length, 0)).toBeLessThanOrEqual(MOTION.maxParticles);
  expect(timeline.sample(111 + feedbackDuration(move)).frames).toHaveLength(0);
  timeline.reject(1, 1000); expect(timeline.sample(1001).rejected?.slot).toBe(1);
  expect(timeline.sample(1000 + MOTION.invalidMs).rejected).toBeNull();
  timeline.add(move, 2000); timeline.reject(2, 2000); timeline.reset();
  expect(timeline.sample(2001)).toEqual({ frames: [], rejected: null });
});
