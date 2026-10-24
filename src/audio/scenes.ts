import { createInitialState,createEmptyBoard } from '../logic/state';
import type { GameState,Shape } from '../logic/types';
import type { AudioProfile } from './game-feedback';
export const AUDIO_SCENES={place:'普通放置',single:'单行消除',rows:'双行消除',columns:'双列消除',cross:'行列交叉',combo2:'Combo ×2',combo3:'Combo ×3'} as const;
export type AudioScene=keyof typeof AUDIO_SCENES;
export function readAudioScene(search:string):{scene:AudioScene;profile:AudioProfile}|null{
  const query=new URLSearchParams(search);if(query.get('audioLab')!=='1')return null;
  const requested=query.get('scene')??'place';
  return{scene:Object.hasOwn(AUDIO_SCENES,requested)?requested as AudioScene:'place',profile:query.get('profile')==='samples'?'samples':'legacy'};
}
export function audioSceneState(scene:AudioScene):GameState{
  const board=createEmptyBoard();let shape:Shape={id:'scene-first',color:7,cells:[[0,0]]};
  if(scene==='place')shape={...shape,cells:[[0,0],[0,1],[0,2]]};
  if(['single','combo2','combo3'].includes(scene))board[6]=[0,2,2,5,5,1,6,7];
  if(scene==='rows'){board[5]=[0,2,2,5,5,1,6,7];board[6]=[...board[5]];shape={...shape,cells:[[0,0],[1,0]]};}
  if(scene==='columns'){for(let r=1;r<8;r++){board[r][5]=2;board[r][6]=5;}shape={...shape,cells:[[0,0],[0,1]]};}
  if(scene==='cross'){board[6]=[1,2,2,0,5,1,6,7];for(let r=0;r<8;r++)if(r!==6)board[r][3]=2;}
  return{...createInitialState(0,17),board,status:'idle',combo:scene==='combo2'?1:scene==='combo3'?2:0,shapes:[shape,{id:'scene-next',color:2,cells:[[0,0],[0,1],[0,2]]},{id:'scene-last',color:5,cells:[[0,0],[1,0],[1,1]]}]};
}
