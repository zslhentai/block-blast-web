import type { Board, Shape } from './types';
import { CATALOGUE, shapeKey } from './shapes';

// Occupancy adapter only: colors/scoring/state remain in the production reducer.
// Two unsigned words avoid BigInt allocation on mobile JavaScript engines.
export interface Occupancy { low: number; high: number }
export interface Placement extends Occupancy { row: number; col: number }
export interface SearchMove { slot: number; row: number; col: number }
export interface SearchOptions { maxWork?: number; maxSolutions?: number; order?: readonly number[] }
export interface SearchResult {
  status: 'solved' | 'unsolvable' | 'unknown';
  moves: SearchMove[];
  solutions: number;
  exhaustive: boolean;
  work: number;
  states: number;
  cacheHits: number;
  bestRemainingCells: number | null;
  maxClearedLines: number;
}
export const population = (value: number): number => {
  let n = value >>> 0, count = 0;
  for (; n; n &= n - 1) count++;
  return count;
};
export function packBoard(board: Board): Occupancy {
  if (board.length !== 8 || board.some(row => row.length !== 8 || row.some(cell => !Number.isInteger(cell) || cell < 0))) throw new Error('Expected an 8×8 board');
  let low = 0, high = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]) {
    if (r < 4) low |= 1 << (r * 8 + c); else high |= 1 << ((r - 4) * 8 + c);
  }
  return { low: low >>> 0, high: high >>> 0 };
}
export function occupancyRows(board: Occupancy): number[] {
  return Array.from({ length: 8 }, (_, r) => ((r < 4 ? board.low : board.high) >>> ((r % 4) * 8)) & 255);
}
export const fits = (board: Occupancy, piece: Placement): boolean => !(board.low & piece.low) && !(board.high & piece.high);
export function placeAndClear(board: Occupancy, piece: Placement): { board: Occupancy; lines: number } {
  let low = (board.low | piece.low) >>> 0, high = (board.high | piece.high) >>> 0;
  const columns = low & (low >>> 8) & (low >>> 16) & (low >>> 24) & high & (high >>> 8) & (high >>> 16) & (high >>> 24) & 255;
  let rows = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    if (((low >>> shift) & 255) === 255) { low = (low & ~(255 << shift)) >>> 0; rows++; }
    if (((high >>> shift) & 255) === 255) { high = (high & ~(255 << shift)) >>> 0; rows++; }
  }
  const columnMask = (columns | (columns << 8) | (columns << 16) | (columns << 24)) >>> 0;
  return { board: { low: (low & ~columnMask) >>> 0, high: (high & ~columnMask) >>> 0 }, lines: rows + population(columns) };
}
function makePlacements(cells: Shape['cells']): readonly Placement[] {
  if (!cells.length || cells.some(p => p.length !== 2 || p.some(n => !Number.isInteger(n) || n < 0 || n > 7)) ||
      new Set(cells.map(p => p.join(','))).size !== cells.length || Math.min(...cells.map(p => p[0])) !== 0 || Math.min(...cells.map(p => p[1])) !== 0) throw new Error('Expected a normalized nonempty piece');
  const height = Math.max(...cells.map(p => p[0])) + 1, width = Math.max(...cells.map(p => p[1])) + 1;
  const placements: Placement[] = [];
  for (let row = 0; row <= 8 - height; row++) for (let col = 0; col <= 8 - width; col++) {
    let low = 0, high = 0;
    for (const [r, c] of cells) {
      const index = (row + r) * 8 + col + c;
      if (index < 32) low |= 1 << index; else high |= 1 << (index - 32);
    }
    placements.push({ row, col, low: low >>> 0, high: high >>> 0 });
  }
  return placements;
}
// Fixed catalogue cache. Unknown diagnostic pieces are not retained globally.
const placementsByKey = new Map(CATALOGUE.map(entry => [entry.key, makePlacements(entry.cells)]));
export function piecePlacements(shape: Shape): readonly Placement[] {
  // Validate before canonicalization so malformed offsets/duplicates cannot alias a valid entry.
  const cells = shape.cells;
  if (!cells.length || cells.some(p => p.length !== 2 || p.some(n => !Number.isInteger(n) || n < 0 || n > 7)) || new Set(cells.map(p => p.join(','))).size !== cells.length || Math.min(...cells.map(p => p[0])) !== 0 || Math.min(...cells.map(p => p[1])) !== 0) throw new Error('Invalid search piece');
  return placementsByKey.get(shapeKey(cells)) ?? makePlacements(cells);
}
export function boardFeatures(board: Occupancy) {
  const rows = occupancyRows(board);
  let isolated = 0, adjacencies = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!(rows[r] & (1 << c))) {
    const up = r > 0 && !(rows[r - 1] & (1 << c)), down = r < 7 && !(rows[r + 1] & (1 << c));
    const left = c > 0 && !(rows[r] & (1 << (c - 1))), right = c < 7 && !(rows[r] & (1 << (c + 1)));
    if (!up && !down && !left && !right) isolated++;
    adjacencies += Number(down) + Number(right);
  }
  return { empty: 64 - population(board.low) - population(board.high), isolated, adjacencies };
}
interface NodeResult { count: number; complete: boolean; path: SearchMove[]; bestEmpty: number; lines: number }

// Counts labeled slot/order/anchor paths. Equal geometric pieces still have distinct slots.
// Counts are lower bounds unless exhaustive. Work exhaustion never proves impossibility.
export function searchHand(board: Board | Occupancy, shapes: readonly (Shape | null)[], options: SearchOptions = {}): SearchResult {
  if (shapes.length > 3) throw new Error('At most three pieces');
  const packed = Array.isArray(board) ? packBoard(board) : board;
  const maxWork = options.maxWork ?? 100000, maxSolutions = options.maxSolutions ?? 1;
  if (!Number.isSafeInteger(maxWork) || maxWork < 0 || !(maxSolutions === Infinity || Number.isSafeInteger(maxSolutions) && maxSolutions >= 1)) throw new Error('Invalid search budget');
  const available = shapes.map(s => s ? piecePlacements(s) : []);
  const mask = shapes.reduce((bits, s, slot) => bits | (s ? 1 << slot : 0), 0);
  if (options.order && (options.order.length !== population(mask) || new Set(options.order).size !== options.order.length || options.order.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= shapes.length || !(mask & (1 << slot))))) throw new Error('Order must contain each nonempty slot once');
  const memo = new Map<string, NodeResult>();
  let work = 0, states = 0, cacheHits = 0;
  function visit(current: Occupancy, remaining: number): NodeResult {
    if (!remaining) return { count: 1, complete: true, path: [], bestEmpty: 64 - population(current.low) - population(current.high), lines: 0 };
    const key = `${current.low}:${current.high}:${remaining}`;
    const previous = memo.get(key);
    if (previous) { cacheHits++; return previous; }
    states++;
    const result: NodeResult = { count: 0, complete: true, path: [], bestEmpty: -1, lines: 0 };
    const forced = options.order?.[population(mask) - population(remaining)];
    for (let slot = 0; slot < shapes.length; slot++) {
      if (!(remaining & (1 << slot)) || (forced !== undefined && slot !== forced)) continue;
      for (const piece of available[slot]) {
        if (work >= maxWork) { result.complete = false; return result; }
        work++;
        if (!fits(current, piece)) continue;
        const next = placeAndClear(current, piece), child = visit(next.board, remaining & ~(1 << slot));
        if (child.count) {
          if (!result.count) result.path = [{ slot, row: piece.row, col: piece.col }, ...child.path];
          result.count = Math.min(maxSolutions, result.count + child.count);
          result.bestEmpty = Math.max(result.bestEmpty, child.bestEmpty);
          result.lines = Math.max(result.lines, next.lines + child.lines);
        }
        result.complete &&= child.complete;
        if (result.count >= maxSolutions) { result.complete = false; memo.set(key, result); return result; }
        if (work >= maxWork) { result.complete = false; return result; }
      }
    }
    memo.set(key, result); return result;
  }
  const result = visit(packed, mask);
  return { status: result.count ? 'solved' : result.complete ? 'unsolvable' : 'unknown', moves: result.path,
    solutions: result.count, exhaustive: result.complete, work, states, cacheHits,
    bestRemainingCells: result.count ? result.bestEmpty : null, maxClearedLines: result.lines };
}
