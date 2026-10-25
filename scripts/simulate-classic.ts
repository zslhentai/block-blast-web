// Offline only. Both policies use the same production reducer, scoring and clears.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomHand, generateAdaptiveHand, DIFFICULTY_PRESETS, type DifficultyPreset, type HandDealer } from '../src/logic/adaptive-dealer';
import { searchHand, packBoard, piecePlacements, fits, placeAndClear, occupancyRows, population, boardFeatures, type Placement } from '../src/logic/board-search';
import { gameReducer } from '../src/logic/reducer';
import { createEmptyBoard } from '../src/logic/state';
import { createRandom } from '../src/logic/rng';
import { shapeKey } from '../src/logic/shapes';
import type { GameState } from '../src/logic/types';

const args = new Map(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('='); if (!arg.startsWith('--') || at < 3) throw new Error('Use --name=value');
  return [arg.slice(2, at), arg.slice(at + 1)] as const;
}));
const games = Number(args.get('games') ?? 1000), limit = Number(args.get('limit') ?? 240), startSeed = Number(args.get('start') ?? 0);
const auditEvery = Number(args.get('audit-every') ?? 10), auditWork = Number(args.get('audit-work') ?? 20000);
const modes = (args.get('modes') ?? (args.get('mode') === 'weighted' ? 'baseline' : 'balanced')).split(',');
const policies = (args.get('policies') ?? 'random,compact').split(',');
if (!Number.isSafeInteger(games) || games < 1 || games > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 2000 || !Number.isInteger(startSeed) || startSeed < 0 ||
    !Number.isInteger(auditEvery) || auditEvery < 1 || !Number.isInteger(auditWork) || auditWork < 0 ||
    modes.some(mode => mode !== 'baseline' && !Object.hasOwn(DIFFICULTY_PRESETS, mode)) || policies.some(p => !['random', 'compact'].includes(p))) throw new Error('Invalid simulation configuration');
const output = args.get('out') ?? 'artifacts/classic-simulation.json';
const sources = ['board-search', 'adaptive-dealer', 'dealer-memory', 'dealer', 'reducer', 'shapes', 'scoring', 'placement', 'lineClear'];
const sourceHashes = Object.fromEntries(sources.map(name => [name, new Bun.CryptoHasher('sha256').update(readFileSync(`src/logic/${name}.ts`)).digest('hex')]));
const quantiles = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.floor((sorted.length - 1) * q)];
  return { min: at(0), p10: at(.1), p25: at(.25), median: at(.5), p90: at(.9), p99: at(.99), max: at(1), mean: values.reduce((a, b) => a + b, 0) / values.length };
};
function compactScore(board: ReturnType<typeof packBoard>, piece: Placement): number {
  const next = placeAndClear(board, piece), rows = occupancyRows(next.board);
  let concentration = 0;
  for (const row of rows) concentration += population(row) ** 2;
  for (let c = 0; c < 8; c++) concentration += rows.reduce((n, row) => n + Number(Boolean(row & (1 << c))), 0) ** 2;
  const features = boardFeatures(next.board);
  return next.lines * 1000 + concentration - features.isolated * 100 - (64 - features.empty) * 2;
}
const began = performance.now(), groups: Record<string, unknown> = {};
for (const mode of modes) for (const policy of policies) {
  const started = performance.now(), lengths: number[] = [], scores: number[] = [], longestCombos: number[] = [], endingEmpty: number[] = [], dealerMs: number[] = [], works: number[] = [];
  const categories: Record<string, number> = {}, clearCounts: Record<string, number> = {}, comboCounts: Record<string, number> = {}, shapeCounts: Record<string, number> = {};
  const audit = { solved: 0, unsolvable: 0, unknown: 0 };
  let ended = 0, censored = 0, totalMoves = 0, refills = 0, immediateEnds = 0, duringHandEnds = 0, clears = 0, totalLines = 0, duplicateHands = 0, consecutiveIdenticalHands = 0;
  for (let game = 0; game < games; game++) {
    const seed = startSeed + game, agent = createRandom(seed ^ 0x9e3779b9);
    let previousHand = '', gameCombo = 0;
    const dealer: HandDealer = (board, rngState, round, context) => {
      const start = performance.now();
      const report = mode === 'baseline' ? null : generateAdaptiveHand(board, rngState, round, context, mode as DifficultyPreset);
      const deal = report?.deal ?? randomHand(board, rngState, round);
      dealerMs.push(performance.now() - start); works.push(report?.work ?? 0);
      const category = report?.used ?? 'random'; categories[category] = (categories[category] ?? 0) + 1;
      refills++;
      if ((refills - 1) % auditEvery === 0) audit[searchHand(board, deal.shapes, { maxWork: auditWork }).status]++;
      const keys = deal.shapes.map(s => shapeKey(s.cells));
      for (const key of keys) shapeCounts[key] = (shapeCounts[key] ?? 0) + 1;
      if (new Set(keys).size < 3) duplicateHands++;
      const key = [...keys].sort().join('|'); if (key === previousHand) consecutiveIdenticalHands++; previousHand = key;
      return deal;
    };
    const board = createEmptyBoard(), dealt = dealer(board, seed, 1);
    let state: GameState = { board, ...dealt, score: 0, highScore: 0, linesCleared: 0, combo: 0, dryMoves: 0, status: 'playing', round: 1, moves: 0, revision: 0 };
    while (state.status === 'playing' && state.moves < limit) {
      const packed = packBoard(state.board), legal: { slot: number; piece: Placement }[] = [];
      for (let slot = 0; slot < 3; slot++) {
        const shape = state.shapes[slot]; if (!shape) continue;
        for (const piece of piecePlacements(shape)) if (fits(packed, piece)) legal.push({ slot, piece });
      }
      if (!legal.length) throw new Error('Production state incorrectly says playing');
      let chosen = legal[Math.floor(agent.next() * legal.length)];
      if (policy === 'compact') {
        let best = -Infinity;
        for (const move of legal) { const score = compactScore(packed, move.piece); if (score > best) { best = score; chosen = move; } }
      }
      const before = state, expected = placeAndClear(packed, chosen.piece);
      state = gameReducer(state, { type: 'PLACE_SHAPE', slot: chosen.slot, shapeId: state.shapes[chosen.slot]!.id, revision: state.revision, row: chosen.piece.row, col: chosen.piece.col }, dealer);
      if (state.moves !== before.moves + 1 || JSON.stringify(packBoard(state.board)) !== JSON.stringify(expected.board) || state.linesCleared - before.linesCleared !== expected.lines) throw new Error('Reducer/agent occupancy disagreement');
      totalMoves++; gameCombo = Math.max(gameCombo, state.combo);
      const lines = state.linesCleared - before.linesCleared;
      if (lines) { clears++; totalLines += lines; clearCounts[lines] = (clearCounts[lines] ?? 0) + 1; comboCounts[state.combo] = (comboCounts[state.combo] ?? 0) + 1; }
      if (state.status === 'gameover') { if (state.round !== before.round) immediateEnds++; else duringHandEnds++; }
    }
    if (state.status === 'gameover') { ended++; endingEmpty.push(boardFeatures(packBoard(state.board)).empty); } else censored++;
    lengths.push(state.moves); scores.push(state.score); longestCombos.push(gameCombo);
  }
  const audits = audit.solved + audit.unsolvable + audit.unknown;
  const result = { mode, policy, games, limit, ended, censored, lengths: quantiles(lengths), scores: quantiles(scores), longestCombo: quantiles(longestCombos), endingEmpty: quantiles(endingEmpty), totalMoves, refills, categories,
    immediateEnds, duringHandEnds, clears, totalLines, clearEventRate: clears / totalMoves, clearCounts, comboCounts, duplicateHands, consecutiveIdenticalHands, shapeFrequencies: shapeCounts,
    auditedHands: { every: auditEvery, maxWork: auditWork, ...audit, provenUnsolvableRate: audit.unsolvable / audits, possibleUnsolvableRate: (audit.unsolvable + audit.unknown) / audits },
    dealerMs: quantiles(dealerMs), searchWork: quantiles(works), wallMs: performance.now() - started };
  groups[`${mode}/${policy}`] = result;
  const { shapeFrequencies: _shapes, comboCounts: _combo, ...summary } = result;
  console.log(JSON.stringify(summary));
}
const result = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes,
  seedRange: [startSeed, startSeed + games - 1], gamesPerPolicyAndMode: games, limit, runtime: Bun.version, elapsedMs: performance.now() - began,
  limits: 'Fixed-seed offline agents, not people or actual play duration. Compact is one-step, not optimal. Capped games are censored, not wins. Risk is a systematic every-N-hand audit with unknown interval; heuristic scores and solution samples are independent design indicators. Timing includes host scheduling/GC, not mobile FPS. Every selected move is checked against the production reducer.', groups };
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, elapsedMs: result.elapsedMs }));
