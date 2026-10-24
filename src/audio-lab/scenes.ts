import './style.css';
import './scenes.css';
import { AUDIO_SCENES,type AudioScene } from '../audio/scenes';
import type { AudioProfile } from '../audio/game-feedback';
const frame=document.querySelector<HTMLIFrameElement>('#game')!,select=document.querySelector<HTMLSelectElement>('#scenario')!;
const status=document.querySelector<HTMLElement>('#status')!,diagnostics=document.querySelector<HTMLElement>('#diagnostics')!;
const labels={place:'普通放置',single:'单行消除',multi:'多线消除',combo:'Combo',invalid:'非法位置'};
let profile:AudioProfile='legacy';
let focusAfterLoad=false;
for(const [value,text] of Object.entries(AUDIO_SCENES)){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
function reset(showGame=false):void{
  focusAfterLoad=showGame;
  const scene=select.value as AudioScene;
  const url=new URL('../',location.href);url.search=new URLSearchParams({audioLab:'1',scene,profile}).toString();frame.src=url.href;
  document.querySelector('#instruction')!.textContent=scene==='place'?'拖动任意方块到空棋盘。':scene==='rows'?'把左侧竖两格补到第 6、7 行左侧缺口。':scene==='columns'?'把左侧横两格补到第 6、7 列顶部缺口。':scene==='cross'?'把左侧单格补到第 7 行、第 4 列的交叉缺口。':'把左侧单格补到第 7 行左侧缺口。';
  for(const name of ['legacy','samples'])document.querySelector(`#${name}`)!.setAttribute('aria-pressed',String(name===profile));
  status.textContent='请点棋盘内“开始游戏”，再拖动方块。';diagnostics.textContent='';
}
frame.addEventListener('load',()=>{if(focusAfterLoad){frame.scrollIntoView({block:'center',behavior:'instant'});focusAfterLoad=false;}});
for(const name of ['legacy','samples'] as const)document.querySelector(`#${name}`)!.addEventListener('click',()=>{profile=name;reset(true);});
select.addEventListener('change',()=>reset(true));document.querySelector('#reset')!.addEventListener('click',()=>reset(true));
const stop=()=>{try{frame.contentDocument?.getElementById('pause')?.click();}catch{/*frame is still loading*/}};
document.querySelector('#stop')!.addEventListener('click',stop);
const timer=setInterval(()=>{
  try{
    const audio=frame.contentWindow?.blockBlast?.getAudio();if(!audio)return;
    const last=audio.recent.at(-1);
    if(last)status.textContent=`刚刚触发：${labels[last.event]} · ${last.path==='sample'?'候选采样':last.path==='fallback'?'现有音效回退':last.path==='muted'?'静音':last.path==='unavailable'?'浏览器未能播放':'现有音效'}`;
    diagnostics.textContent=JSON.stringify(audio,null,2);
  }catch{/*owned frame is navigating*/}
},200);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',()=>{clearInterval(timer);stop();});reset();
