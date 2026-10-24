import { test,expect } from 'bun:test';
import { GameAudioFeedback,soundEvent,SAMPLE_MIX } from './game-feedback';
import { readAudioScene,audioSceneState,AUDIO_SCENES } from './scenes';
import { gameReducer } from '../logic/reducer';
import { moveFeedback,type MoveFeedback } from '../renderer/feedback';
const move=(revision=1):MoveFeedback=>({revision,placed:[{row:0,col:0,color:1}],cleared:[],rows:[],cols:[],points:1,combo:0,tier:0,strength:0});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function mock(){
  let started=0,oscillators=0;
  const param=()=>({setValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{},setTargetAtTime:()=>{},cancelScheduledValues:()=>{}});
  const context={state:'running',currentTime:0,destination:{},suspend:async()=>{},decodeAudioData:async()=>({duration:.8}),
    createGain:()=>({gain:param(),connect:()=>{},disconnect:()=>{}}),
    createBufferSource:()=>({buffer:null,onended:null,connect:()=>{},disconnect:()=>{},start:()=>{started++;},stop:()=>{}}),
    createOscillator:()=>({frequency:param(),type:'sine',onended:null,connect:()=>{},disconnect:()=>{},start:()=>{oscillators++;},stop:()=>{}}),
  } as unknown as AudioContext;
  return{context,started:()=>started,oscillators:()=>oscillators};
}
test('scenario gate is explicit and each category derives from a real accepted transition',()=>{
  expect(readAudioScene('?profile=samples')).toBeNull();expect(readAudioScene('?audioLab=1&scene=bad&profile=bad')).toEqual({scene:'place',profile:'legacy'});
  for(const scene of Object.keys(AUDIO_SCENES) as (keyof typeof AUDIO_SCENES)[]){
    const before={...audioSceneState(scene),status:'playing' as const},row=scene==='place'||scene==='columns'?0:scene==='rows'?5:6,col=scene==='columns'?5:scene==='cross'?3:0;
    const action={type:'PLACE_SHAPE' as const,slot:0,shapeId:before.shapes[0]!.id,revision:0,row,col};
    const after=gameReducer(before,action),feedback=moveFeedback(before,after,action)!;
    expect(after.moves).toBe(1);expect(soundEvent(feedback)).toBe(scene==='place'?'place':scene==='single'?'single':scene.startsWith('combo')?'combo':'multi');
  }
  expect(soundEvent(null)).toBe('invalid');
});
test('muted and legacy profiles do not fetch samples; accepted revisions dispatch once',()=>{
  const m=mock();let fetches=0;
  const audio=new GameAudioFeedback('legacy','/',()=>m.context,async()=>{fetches++;throw new Error('unexpected fetch');});
  audio.init();audio.play(move(),0);expect(m.started()).toBe(0);expect(m.oscillators()).toBe(0);
  audio.setEnabled(true);audio.init();audio.play(move(2),0);audio.play(move(2),0);
  expect(audio.snapshot().received).toBe(2);expect(m.oscillators()).toBe(1);expect(fetches).toBe(0);
  audio.reset();audio.init();audio.play(move(1),0);expect(m.oscillators()).toBe(2);
});
test('licensed dense playback is bounded, ducks prior voices, deduplicates and stops without a replay queue',async()=>{
  const m=mock(),audio=new GameAudioFeedback('samples','/',()=>m.context,async()=>new Response(new ArrayBuffer(8)));
  audio.setEnabled(true);audio.init();await flush();expect(audio.snapshot().samples?.ready).toBe(2);
  for(let i=1;i<=30;i++)audio.play(move(i),i);
  const snapshot=audio.snapshot();expect(snapshot.samples?.voices).toBe(SAMPLE_MIX.maxVoices);expect(snapshot.samples?.retiring).toBe(1);
  expect(snapshot.recent).toHaveLength(16);expect(snapshot.played).toBe(30);expect(snapshot.recent.every(e=>e.path==='sample')).toBe(true);
  audio.suspend();expect(audio.snapshot().samples?.voices).toBe(0);expect(audio.snapshot().samples?.retiring).toBe(0);
  const started=m.started();await flush();expect(m.started()).toBe(started);
});
test('failed or pending sample decoding falls back immediately and never plays a stale event later',async()=>{
  const m=mock();let release:()=>void=()=>{};
  const wait=new Promise<void>(resolve=>{release=resolve;});
  const audio=new GameAudioFeedback('samples','/',()=>m.context,async()=>{await wait;return new Response(new ArrayBuffer(8));});
  audio.setEnabled(true);audio.init();audio.play(move(1),0);expect(audio.snapshot().recent.at(-1)?.path).toBe('fallback');
  audio.suspend();release();await flush();expect(m.started()).toBe(0);
  audio.init();audio.play(move(2),1);expect(audio.snapshot().recent.at(-1)?.path).toBe('sample');
  const bad=new GameAudioFeedback('samples','/',()=>m.context,async()=>new Response('missing',{status:404}));
  bad.setEnabled(true);bad.init();await flush();bad.play(move(),0);expect(bad.snapshot().samples?.failed).toBe(2);expect(bad.snapshot().recent.at(-1)?.path).toBe('fallback');
});
