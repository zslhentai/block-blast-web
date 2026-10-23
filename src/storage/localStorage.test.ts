import { test, expect } from 'bun:test';
import { createInitialState } from '../logic/state';
import { gameReducer } from '../logic/reducer';
import { GameStorage, DEFAULT_SETTINGS, STORAGE_KEY, BACKUP_KEY, BEST_KEY, parseSavedGame, type StorageLike } from './localStorage';
class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
function fixture() {
  const memory = new MemoryStorage(); const storage = new GameStorage(memory);
  const state = { ...createInitialState(123, 7), status: 'playing' as const, combo: 2, dryMoves: 1 };
  storage.save(state, { soundEnabled: true, reducedMotion: true }); return { memory, storage, state };
}
test('full state, settings, best, RNG and chain round trip', () => {
  const { storage, state } = fixture(); const loaded = storage.load()!;
  expect(loaded.state).toEqual(state); expect(loaded.settings).toEqual({ soundEnabled: true, reducedMotion: true });
  const action = { type: 'RESTART' as const, seed: loaded.state.rngState };
  expect(gameReducer(loaded.state, action)).toEqual(gameReducer(state, action));
});
test('invalid current data falls back to a valid backup and preserves best', () => {
  const { memory, storage, state } = fixture(); storage.save({ ...state, highScore: 456 }, DEFAULT_SETTINGS);
  memory.setItem(STORAGE_KEY, '{broken');
  expect(parseSavedGame(memory.getItem(BACKUP_KEY))).not.toBeNull();
  expect(storage.load()!.state.highScore).toBe(456);
});
test.each(['bad-json', 'version', 'board', 'shape', 'empty-hand', 'number', 'settings'])(
  'rejects corrupted snapshot: %s', kind => {
    const { memory } = fixture(); const raw = memory.getItem(STORAGE_KEY)!;
    if (kind === 'bad-json') { expect(parseSavedGame('{')).toBeNull(); return; }
    const value = parseSavedGame(raw)!;
    if (kind === 'version') value.ruleVersion = 999;
    if (kind === 'board') value.state.board = [[1]];
    if (kind === 'shape') value.state.shapes[0]!.cells = [[0, 0], [0, 0]];
    if (kind === 'empty-hand') value.state.shapes = [null, null, null];
    if (kind === 'number') value.state.score = -1;
    const payload = kind === 'settings' ? { ...value, settings: { soundEnabled: 'yes' } } : value;
    expect(parseSavedGame(JSON.stringify(payload))).toBeNull();
  });
test('storage exceptions do not prevent playing, and no storage is supported', () => {
  const broken: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
  const storage = new GameStorage(broken);
  expect(storage.load()).toBeNull(); expect(storage.save(createInitialState(), DEFAULT_SETTINGS)).toBe(false);
  expect(storage.available).toBe(false); expect(new GameStorage().save(createInitialState(), DEFAULT_SETTINGS)).toBe(false);
});
test('best does not decrease when a stale/lower game is saved', () => {
  const { memory, storage } = fixture(); memory.setItem(BEST_KEY, '5000');
  storage.save(createInitialState(), DEFAULT_SETTINGS); expect(storage.best()).toBe(5000);
});
