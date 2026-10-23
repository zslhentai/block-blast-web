// Deterministic stateful randomness, isolated from audio and visual effects.
export function createRandom(seed: number): { next: () => number; state: () => number } {
  let state = seed >>> 0;
  return {
    next: () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let n = Math.imul(state ^ (state >>> 15), 1 | state);
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    },
    state: () => state,
  };
}
