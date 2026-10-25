import type { Board, GameState } from '../logic/types';
import { observeDeals } from '../logic/dealer';
import { generateAdaptiveHand, ADAPTIVE_POLICY, type DealReport } from '../logic/adaptive-dealer';
import { searchHand } from '../logic/board-search';

export function installAlgorithmDiagnostics(getState: () => GameState) {
  let lastDeal: (DealReport & { elapsedMs: number }) | null = null;
  observeDeals(report => { lastDeal = structuredClone(report); });
  const api = Object.freeze({
    inspect() {
      const state = getState();
      return structuredClone({ policy: ADAPTIVE_POLICY, preset: 'balanced', state,
        hand: state.shapes, solution: searchHand(state.board, state.shapes, { maxWork: 100000, maxSolutions: 8 }),
        lastDeal, note: lastDeal ? 'Last observed refill' : 'Initial/restored deal was not observed; no invented trace' });
    },
    previewNextHand(assumedBoard?: Board) {
      const state = getState(), start = performance.now();
      // Hypothetical next refill on this board. Does not advance the real RNG,
      // publish a deal event, save, or pretend remaining pieces were placed.
      const report = generateAdaptiveHand(assumedBoard ?? state.board, state.rngState, state.round + 1,
        { combo: state.combo, dryMoves: state.dryMoves, memory: state.dealer });
      return structuredClone({ ...report, elapsedMs: performance.now() - start, assumption: 'Supplied/current board at the next refill; current hand is not simulated' });
    },
  });
  Object.defineProperty(window, 'blockBlastAlgorithms', { configurable: true, value: api });
  return api;
}
export type AlgorithmDiagnostics = ReturnType<typeof installAlgorithmDiagnostics>;
