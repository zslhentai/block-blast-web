import type { Board, Shape, DealerMemory, DealerMode } from './types';
import { createRandom } from './rng';
import { CATALOGUE, createShapes, shapeKey } from './shapes';
import { boardFeatures, packBoard, piecePlacements, fits, searchHand, placeAndClear, type SearchResult } from './board-search';
import { parseDealerMemory } from './dealer-memory';

export const ADAPTIVE_POLICY = 'bounded-classic-v3';
// Independent, experimental presets; never claimed as original weights.
export const DIFFICULTY_PRESETS = {
  gentle: { help: .52, challenge: .04, pressureHelp: .25, noviceHelp: .20 },
  balanced: { help: .28, challenge: .12, pressureHelp: .25, noviceHelp: .20 },
  brisk: { help: .12, challenge: .24, pressureHelp: .18, noviceHelp: .12 },
} as const;
export type DifficultyPreset = keyof typeof DIFFICULTY_PRESETS;
export const DEALER_LIMITS = { candidates: 4, candidateWork: 2000, randomWork: 512, solutionSample: 8, maxAssistStreak: 2, maxChallengeStreak: 1 } as const;
export interface DealerContext { combo?: number; dryMoves?: number; memory?: DealerMemory }
export interface Deal { shapes: Shape[]; rngState: number; dealer?: DealerMemory }
export type HandDealer = (board: Board, seed: number, round: number, context?: DealerContext) => Deal;
interface Candidate {
  index: number;
  search: SearchResult;
  legalAnchors: number;
  fitNow: number;
  diversity: number;
  quality: number;
}
export interface DealReport {
  deal: Deal;
  policy: typeof ADAPTIVE_POLICY;
  preset: DifficultyPreset;
  requested: DealerMode;
  used: DealerMode;
  reason: string;
  selected: number;
  input: { seed: number; round: number; empty: number; isolated: number; combo: number; dryMoves: number };
  parameters: { helpChance: number; challengeChance: number };
  candidates: Candidate[];
  work: number;
}
const entries = new Map(CATALOGUE.map(entry => [entry.key, entry]));
export function randomHand(_board: Board, seed: number, round: number): Deal {
  const random = createRandom(seed);
  return { shapes: createShapes(3, random.next, round, `r${round}-${seed}`), rngState: random.state() };
}
export function generateAdaptiveHand(board: Board, seed: number, round: number, context: DealerContext = {}, preset: DifficultyPreset = 'balanced'): DealReport {
  const random = createRandom(seed), packed = packBoard(board), features = boardFeatures(packed);
  const memory = parseDealerMemory(context.memory), config = DIFFICULTY_PRESETS[preset];
  // Fixed RNG consumption: four independent candidate hands then one strategy roll.
  const hands = Array.from({ length: DEALER_LIMITS.candidates }, (_, i) => createShapes(3, random.next, round, `r${round}-${seed}${i ? `-c${i}` : ''}`));
  const roll = random.next(), combo = context.combo ?? 0, dryMoves = context.dryMoves ?? 0;
  const pressure = features.empty <= 20 || (features.isolated >= 4 && features.empty < 36) || (dryMoves >= 2 && features.empty < 28);
  const helpChance = memory?.assistStreak === DEALER_LIMITS.maxAssistStreak ? 0 : Math.min(.8, config.help + Number(pressure) * config.pressureHelp + Number(round <= 3) * config.noviceHelp);
  const challengeChance = round >= 8 && features.empty >= 24 && combo >= 2 && memory?.challengeStreak !== 1 ? config.challenge : 0;
  const requested: DealerMode = roll < helpChance ? 'assisted' : roll < helpChance + challengeChance ? 'challenge' : 'random';
  const considered = requested === 'random' ? hands.slice(0, 1) : hands;
  const candidates = considered.map((shapes, index): Candidate => {
    const search = searchHand(packed, shapes, { maxWork: requested === 'random' ? DEALER_LIMITS.randomWork : DEALER_LIMITS.candidateWork, maxSolutions: DEALER_LIMITS.solutionSample });
    let legalAnchors = 0, fitNow = 0;
    for (const shape of shapes) { const count = piecePlacements(shape).filter(p => fits(packed, p)).length; legalAnchors += count; if (count) fitNow++; }
    const families = shapes.map(shape => entries.get(shapeKey(shape.cells))!.family);
    const repeated = families.filter(family => memory?.recentFamilies.includes(family)).length;
    const diversity = new Set(families).size - repeated * .25;
    let end = packed;
    for (const move of search.moves) end = placeAndClear(end, piecePlacements(shapes[move.slot]).find(p => p.row === move.row && p.col === move.col)!).board;
    const after = boardFeatures(end);
    // A bounded, first-path sample: these are design indicators, not a failure probability.
    const quality = (search.bestRemainingCells ?? features.empty) * .6 + after.adjacencies * .08 - after.isolated * 3 + search.maxClearedLines * 5 + search.solutions * .4 + Math.min(64, legalAnchors) * .04 + diversity * 2;
    return { index, search, legalAnchors, fitNow, diversity, quality };
  });
  let selected = 0, used: DealerMode = 'random', reason = 'ordinary-independent-hand';
  if (requested !== 'random') {
    const solved = candidates.filter(candidate => candidate.search.status === 'solved');
    if (solved.length) {
      const scored = solved.map(candidate => ({ candidate, rank: requested === 'assisted' ? candidate.quality : -candidate.quality + candidate.diversity * 3 }));
      scored.sort((a, b) => b.rank - a.rank || a.candidate.index - b.candidate.index);
      selected = scored[0].candidate.index; used = requested;
      reason = requested === 'assisted' ? pressure ? 'bounded-pressure-assistance' : round <= 3 ? 'bounded-onboarding-assistance' : 'bounded-variety-assistance' : 'solvable-challenge-after-clears';
    } else reason = 'no-proven-candidate-keep-original';
  }
  const shapes = hands[selected];
  const dealer: DealerMemory = { version: 1, mode: used, assistStreak: used === 'assisted' ? (memory?.assistStreak ?? 0) + 1 : 0,
    challengeStreak: used === 'challenge' ? 1 : 0, recentFamilies: [...memory?.recentFamilies ?? [], ...shapes.map(shape => entries.get(shapeKey(shape.cells))!.family)].slice(-6) };
  return { deal: { shapes, rngState: random.state(), dealer }, policy: ADAPTIVE_POLICY, preset, requested, used, reason, selected,
    input: { seed, round, empty: features.empty, isolated: features.isolated, combo, dryMoves }, parameters: { helpChance, challengeChance }, candidates, work: candidates.reduce((sum, candidate) => sum + candidate.search.work, 0) };
}
