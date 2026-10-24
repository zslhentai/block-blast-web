// Offline experience probe. The agent evaluates row masks; every chosen transition
// is checked against the production placement/clear functions. Never imported by the game.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { dealHand } from '../src/logic/dealer';
import { createShapes, CATALOGUE, shapeKey } from '../src/logic/shapes';
import { createRandom } from '../src/logic/rng';
import { createEmptyBoard } from '../src/logic/state';
import { placeShapeOnBoard, canPlace } from '../src/logic/placement';
import { checkAndClearLines } from '../src/logic/lineClear';
import type { Board, Shape } from '../src/logic/types';

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const at = arg.indexOf('=');
  if (!arg.startsWith('--') || at < 3) throw new Error('Use --name=value');
  args.set(arg.slice(2, at), arg.slice(at + 1));
}
const games = Number(args.get('games') ?? 512), limit = Number(args.get('limit') ?? 240);
const mode = args.get('mode') ?? 'current', output = args.get('out') ?? 'artifacts/classic-simulation.json';
if (!Number.isInteger(games) || games < 1 || games > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 2000 || !['current','weighted'].includes(mode)) throw new Error('Invalid simulation arguments');
const pop = (n: number): number => { let count = 0; for (; n; n &= n - 1) count++; return count; };
const masks = (board: Board) => board.map(row => row.reduce((bits, cell, c) => bits | (cell ? 1 << c : 0), 0));
interface Option { row: number; col: number; bits: number[] }
const options = new Map(CATALOGUE.map(shape => {
  const height = Math.max(...shape.cells.map(p => p[0])) + 1, width = Math.max(...shape.cells.map(p => p[1])) + 1;
  const placements: Option[] = [];
  for (let row = 0; row <= 8 - height; row++) for (let col = 0; col <= 8 - width; col++) {
    const bits = Array<number>(8).fill(0);
    for (const [r,c] of shape.cells) bits[row+r] |= 1 << (col+c);
    placements.push({ row, col, bits });
  }
  return [shape.key, placements] as const;
}));
function evaluate(board: number[], option: Option) {
  const next = board.map((row,r) => row | option.bits[r]);
  const cols = next.reduce((a,b) => a & b, 255), rows = next.filter(row => row === 255).length;
  for (let r=0;r<8;r++) next[r] = next[r] === 255 ? 0 : next[r] & ~cols;
  let concentration = 0, holes = 0, occupied = 0;
  for (let r=0;r<8;r++) {
    const count = pop(next[r]); occupied += count; concentration += count*count;
    for (let c=0;c<8;c++) if (!(next[r] & (1 << c)) && (r===0 || next[r-1] & (1<<c)) && (r===7 || next[r+1] & (1<<c)) && (c===0 || next[r] & (1<<(c-1))) && (c===7 || next[r] & (1<<(c+1)))) holes++;
  }
  for (let c=0;c<8;c++) { let count=0; for(let r=0;r<8;r++) count += Number(Boolean(next[r] & (1<<c))); concentration += count*count; }
  return { next, lines: rows+pop(cols), score: (rows+pop(cols))*1000 + concentration - holes*100 - occupied*2 };
}
const quantiles = (values: number[]) => {
  const sorted = [...values].sort((a,b)=>a-b);
  return { min:sorted[0], p10:sorted[Math.floor((sorted.length-1)*.1)], median:sorted[Math.floor((sorted.length-1)*.5)], p90:sorted[Math.floor((sorted.length-1)*.9)], p99:sorted[Math.floor((sorted.length-1)*.99)], max:sorted.at(-1), mean:values.reduce((a,b)=>a+b,0)/values.length };
};
const started = performance.now(), groups: Record<string, unknown> = {};
for (const policy of ['random','compact'] as const) {
  const lengths: number[]=[], endings: number[]=[], dealerMs: number[]=[], shapesCount: Record<string,number>={}, clearCounts: Record<string,number>={};
  let ended=0, censored=0, totalMoves=0, clears=0, totalLines=0, refills=0, immediateEnds=0, highCrowdingDeals=0;
  for(let seed=0;seed<games;seed++) {
    let board=createEmptyBoard(), hand:(Shape|null)[]=[], rngState=seed, round=0, moves=0;
    const agent=createRandom(seed ^ 0x9e3779b9);
    while(moves<limit) {
      let justDealt=false;
      if(hand.every(s=>s===null)) {
        round++;refills++;justDealt=true;
        if(board.flat().filter(Boolean).length>=40) highCrowdingDeals++;
        const start=performance.now();
        if(mode==='current') { const dealt=dealHand(board,rngState,round);hand=dealt.shapes;rngState=dealt.rngState; }
        else { const rng=createRandom(rngState);hand=createShapes(3,rng.next,round,`r${round}-${rngState}`);rngState=rng.state(); }
        dealerMs.push(performance.now()-start);
        for(const shape of hand) if(shape) {const key=shapeKey(shape.cells);shapesCount[key]=(shapesCount[key]??0)+1;}
      }
      const current=masks(board), legal: {slot:number;option:Option}[]=[];
      for(let slot=0;slot<3;slot++) {
        const shape=hand[slot];if(!shape)continue;
        for(const option of options.get(shapeKey(shape.cells))!) if(option.bits.every((bits,r)=>!(bits & current[r]))) legal.push({slot,option});
      }
      if(!legal.length) {ended++;if(justDealt)immediateEnds++;endings.push(board.flat().filter(Boolean).length);break;}
      let chosen=legal[Math.floor(agent.next()*legal.length)];
      if(policy==='compact') {
        let best=-Infinity;
        for(const move of legal) {const score=evaluate(current,move.option).score;if(score>best){best=score;chosen=move;}}
      }
      const shape=hand[chosen.slot]!;
      if(!canPlace(board,shape,chosen.option.row,chosen.option.col))throw new Error('Agent/legal oracle mismatch');
      const actual=checkAndClearLines(placeShapeOnBoard(board,shape,chosen.option.row,chosen.option.col));
      const predicted=evaluate(current,chosen.option);
      if(JSON.stringify(masks(actual.board))!==JSON.stringify(predicted.next) || actual.linesCleared!==predicted.lines)throw new Error('Agent/clear oracle mismatch');
      board=actual.board;hand[chosen.slot]=null;moves++;totalMoves++;
      if(actual.linesCleared){clears++;totalLines+=actual.linesCleared;clearCounts[actual.linesCleared]=(clearCounts[actual.linesCleared]??0)+1;}
    }
    if(moves===limit)censored++;
    lengths.push(moves);
  }
  groups[policy]={games,limit,ended,censored,lengths:quantiles(lengths),terminalOccupancy:endings.length?quantiles(endings):null,totalMoves,clears,totalLines,clearEventRate:clears/Math.max(1,totalMoves),clearCounts,refills,immediateEnds,highCrowdingDeals,dealerMs:quantiles(dealerMs),shapeFrequencies:shapesCount};
}
const sourceHashes=Object.fromEntries(['dealer','shapes','placement','lineClear'].map(name=>[name,new Bun.CryptoHasher('sha256').update(readFileSync(`src/logic/${name}.ts`)).digest('hex')]));
const result={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes,mode,seedRange:[0,games-1],limit,policies:'random legal placement; one-step compact heuristic without dealer witnesses. Offline agents are not human players. Capped games are censored, not wins.',runtime:Bun.version,elapsedMs:performance.now()-started,groups};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,mode,elapsedMs:result.elapsedMs,groups:Object.fromEntries(Object.entries(groups).map(([key,value])=>{const {shapeFrequencies:_shapes,...summary}=value as Record<string,unknown>;return[key,summary];}))},null,2));
