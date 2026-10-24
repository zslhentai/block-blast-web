import { SoundManager } from './sounds';
import type { MoveFeedback } from '../renderer/feedback';

export type SoundEvent = 'place' | 'single' | 'multi' | 'combo' | 'invalid';
export type AudioProfile = 'legacy' | 'samples';
export const SAMPLE_MIX = { gain:.08, duck:.35, maxVoices:3, retireSeconds:.008 } as const;
export function soundEvent(move: MoveFeedback | null): SoundEvent {
  if (!move) return 'invalid';
  if (!move.cleared.length) return 'place';
  if (move.combo>=2) return 'combo';
  return move.rows.length+move.cols.length>1?'multi':'single';
}
interface Voice { source:AudioBufferSourceNode;gain:GainNode }
type AudioFetch=(url:string)=>Promise<Response>;
interface AudioTrace { event:SoundEvent;revision:number|null;lines:number;requestedAt:number;startedAt:number|null;path:'muted'|'sample'|'legacy'|'fallback'|'unavailable' }
// Existing licensed WAVs only. There is no new synthesis, IR or pitch shifting.
class LicensedSamples {
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly pending=new Set<string>();
  private readonly failed=new Set<string>();
  private readonly voices=new Set<Voice>();
  private retiring:Voice|null=null;
  constructor(private readonly context:()=>AudioContext,private readonly base:string,private readonly fetchAudio:AudioFetch) {}
  prepare():void {
    for(const file of ['place-wood','clear-casual']) {
      if(this.buffers.has(file)||this.pending.has(file)||this.failed.has(file))continue;
      this.pending.add(file);
      void this.fetchAudio(`${this.base}${file}.wav`).then(async response=>{
        if(!response.ok)throw new Error('Sample unavailable');
        const buffer=await this.context().decodeAudioData(await response.arrayBuffer());
        if(buffer.duration<=0||buffer.duration>2)throw new Error('Invalid sample duration');
        this.buffers.set(file,buffer);
      }).catch(()=>{this.failed.add(file);}).finally(()=>this.pending.delete(file));
    }
  }
  private clean(voice:Voice):void {
    voice.source.onended=null;voice.source.disconnect();voice.gain.disconnect();this.voices.delete(voice);
    if(this.retiring===voice)this.retiring=null;
  }
  private stop(voice:Voice):void {try{voice.source.stop();}catch{/*already stopped*/}this.clean(voice);}
  stopAll():void {for(const voice of this.voices)this.stop(voice);if(this.retiring)this.stop(this.retiring);}
  has(event:SoundEvent):boolean {return this.buffers.has(event==='place'?'place-wood':event==='single'?'clear-casual':'');}
  play(event:SoundEvent):boolean {
    const buffer=this.buffers.get(event==='place'?'place-wood':event==='single'?'clear-casual':'');
    if(!buffer)return false;
    try {
      const ctx=this.context();if(ctx.state!=='running')return false;
      const now=ctx.currentTime;
      for(const voice of this.voices){voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(SAMPLE_MIX.gain*SAMPLE_MIX.duck,now,.006);}
      if(this.voices.size>=SAMPLE_MIX.maxVoices){
        const oldest=this.voices.values().next().value!;
        if(this.retiring)this.stop(this.retiring);
        this.voices.delete(oldest);this.retiring=oldest;
        oldest.gain.gain.cancelScheduledValues(now);oldest.gain.gain.setTargetAtTime(0,now,.002);oldest.source.stop(now+SAMPLE_MIX.retireSeconds);
      }
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.setValueAtTime(SAMPLE_MIX.gain,now);
      source.connect(gain);gain.connect(ctx.destination);
      const voice={source,gain};this.voices.add(voice);source.onended=()=>this.clean(voice);source.start(now);
      return true;
    }catch{this.stopAll();return false;}
  }
  snapshot(){return{ready:this.buffers.size,pending:this.pending.size,failed:this.failed.size,voices:this.voices.size,retiring:Number(this.retiring!==null)};}
}

// An accepted transition is the timing authority, shared with the visual timeline.
// Decode completion never replays an old event: unavailable candidates fall back now.
export class GameAudioFeedback {
  private context:AudioContext|null=null;
  private readonly legacy:SoundManager;
  private readonly samples:LicensedSamples|null;
  private enabled=false;
  private active=false;
  private lastRevision=-1;
  private readonly traces:AudioTrace[]=[];
  private received=0;
  private played=0;
  constructor(readonly profile:AudioProfile='legacy',base='./audio-samples/edited/',createContext:()=>AudioContext=()=>new AudioContext(),fetchAudio:AudioFetch=url=>fetch(url)){
    const getContext=()=>this.context??=createContext();
    this.legacy=new SoundManager(getContext);
    this.samples=profile==='samples'?new LicensedSamples(getContext,base,fetchAudio):null;
  }
  setEnabled(enabled:boolean):void{this.enabled=enabled;this.legacy.setEnabled(enabled);if(!enabled)this.suspend();}
  init():void{if(!this.enabled)return;this.active=true;this.legacy.init();try{this.samples?.prepare();}catch{/*optional sound*/}}
  play(move:MoveFeedback|null,at:number):void {
    if(move&&move.revision===this.lastRevision)return;
    if(move)this.lastRevision=move.revision;
    const event=soundEvent(move);this.received++;
    let path:AudioTrace['path']='muted',startedAt:number|null=null;
    if(this.enabled&&this.active){
      if(this.samples?.has(event)){
        this.legacy.stopVoices();path=this.samples.play(event)?'sample':'unavailable';
      }
      if(path!=='sample'){
        this.samples?.stopAll();
        const played=this.legacy.play(event==='place'?'place':event==='invalid'?'invalid':'clear');
        path=played?(this.profile==='legacy'?'legacy':'fallback'):'unavailable';
      }
      if(path!=='unavailable'){startedAt=performance.now();this.played++;}
    }
    this.traces.push({event,revision:move?.revision??null,lines:move?move.rows.length+move.cols.length:0,requestedAt:at,startedAt,path});
    if(this.traces.length>16)this.traces.shift();
  }
  suspend():void{this.active=false;this.samples?.stopAll();this.legacy.suspend();}
  reset():void{this.suspend();this.lastRevision=-1;}
  snapshot(){return{profile:this.profile,enabled:this.enabled,active:this.active,received:this.received,played:this.played,legacy:this.legacy.snapshot(),samples:this.samples?.snapshot()??null,recent:this.traces.map(event=>({...event}))};}
}
