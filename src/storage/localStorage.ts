import { type GameState, type Shape, BOARD_SIZE, COLORS, RULE_VERSION, CATALOGUE_VERSION } from '../logic/types';
import { CATALOGUE, shapeKey } from '../logic/shapes';
import { checkGameOver } from '../logic/gameover';

export const STORAGE_KEY = 'block-blast-web:run:v1';
export const BACKUP_KEY = `${STORAGE_KEY}:backup`;
export const BEST_KEY = 'block-blast-web:best:rules-v1';
export interface Settings { soundEnabled: boolean; reducedMotion: boolean }
export const DEFAULT_SETTINGS: Settings = { soundEnabled: false, reducedMotion: false };
export interface SavedGame {
  schemaVersion: 1;
  ruleVersion: number;
  catalogueVersion: number;
  savedAt: number;
  writerId?: string;
  state: GameState;
  settings: Settings;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function validShape(value: unknown): value is Shape {
  if (!record(value) || typeof value.id !== 'string' || !value.id.length || value.id.length > 160 ||
      !integer(value.color, COLORS.length) || value.color === 0 || !Array.isArray(value.cells) ||
      !value.cells.length || value.cells.length > 9) return false;
  if (!value.cells.every(cell => Array.isArray(cell) && cell.length === 2 && cell.every(n => integer(n, 4)))) return false;
  const cells = value.cells as [number, number][];
  if (new Set(cells.map(cell => cell.join(','))).size !== cells.length ||
      Math.min(...cells.map(([r]) => r)) !== 0 || Math.min(...cells.map(([, c]) => c)) !== 0) return false;
  return CATALOGUE.some(entry => entry.key === shapeKey(cells));
}
export function parseSavedGame(raw: string | null): SavedGame | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.schemaVersion !== 1 || value.ruleVersion !== RULE_VERSION ||
        value.catalogueVersion !== CATALOGUE_VERSION || !integer(value.savedAt) ||
        !record(value.state) || !record(value.settings)) return null;
    if (value.writerId !== undefined && (typeof value.writerId !== 'string' || value.writerId.length > 160)) return null;
    const state = value.state;
    if (!Array.isArray(state.board) || state.board.length !== BOARD_SIZE ||
        !state.board.every(row => Array.isArray(row) && row.length === BOARD_SIZE && row.every(n => integer(n, COLORS.length)))) return null;
    if (!Array.isArray(state.shapes) || state.shapes.length !== 3 || state.shapes.every(s => s === null) ||
        !state.shapes.every(s => s === null || validShape(s))) return null;
    const ids = state.shapes.filter((s): s is Shape => s !== null).map(s => s.id);
    if (new Set(ids).size !== ids.length) return null;
    if (!['idle', 'playing', 'paused', 'gameover'].includes(String(state.status)) ||
        !['score', 'highScore', 'combo', 'linesCleared', 'round', 'moves', 'revision'].every(k => integer(state[k])) ||
        !integer(state.dryMoves, 3) || !integer(state.rngState, 0xffffffff) ||
        Number(state.highScore) < Number(state.score) || Number(state.round) < 1 ||
        typeof value.settings.soundEnabled !== 'boolean' || typeof value.settings.reducedMotion !== 'boolean') return null;
    // Recompute derived termination; never trust a stale persisted flag.
    const parsed = value as unknown as SavedGame;
    const over = checkGameOver(parsed.state.board, parsed.state.shapes);
    parsed.state.status = over ? 'gameover' : parsed.state.status === 'gameover' ? 'playing' : parsed.state.status;
    return parsed;
  } catch { return null; }
}
export class GameStorage {
  available = true;
  constructor(private readonly storage?: StorageLike, private readonly writerId = '') { this.available = Boolean(storage); }
  best(): number {
    try {
      const n = Number(this.storage?.getItem(BEST_KEY));
      return integer(n) ? n : 0;
    } catch { this.available = false; return 0; }
  }
  load(): SavedGame | null {
    try {
      if (!this.storage) return null;
      const saved = parseSavedGame(this.storage.getItem(STORAGE_KEY)) ?? parseSavedGame(this.storage.getItem(BACKUP_KEY));
      if (saved) saved.state.highScore = Math.max(saved.state.highScore, saved.state.score, this.best());
      return saved;
    } catch { this.available = false; return null; }
  }
  save(state: GameState, settings: Settings): boolean {
    try {
      if (!this.storage) return false;
      const best = Math.max(this.best(), state.highScore, state.score);
      this.storage.setItem(BEST_KEY, String(best));
      const current = this.storage.getItem(STORAGE_KEY);
      if (parseSavedGame(current)) this.storage.setItem(BACKUP_KEY, current!);
      const saved: SavedGame = {
        schemaVersion: 1, ruleVersion: RULE_VERSION, catalogueVersion: CATALOGUE_VERSION,
        savedAt: Date.now(), writerId: this.writerId, state: { ...state, highScore: best }, settings,
      };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(saved));
      this.available = true;
      return true;
    } catch { this.available = false; return false; }
  }
}
