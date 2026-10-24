import { test,expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { ready,drag } from './helpers';
import { STORAGE_KEY } from '../../src/storage/localStorage';

async function open(page:import('@playwright/test').Page,scene:string,profile:string){
  await page.goto(`./?audioLab=1&scene=${scene}&profile=${profile}`);await ready(page);await page.getByTestId('continue').click();
  if(profile==='samples')await expect.poll(()=>page.evaluate(()=>window.blockBlast!.getAudio().samples?.ready)).toBe(2);
}
test('real scene transitions dispatch place/single/multi/combo once at the same timestamp as the visual timeline',async({page},info)=>{
  test.setTimeout(60000);
  const traces:unknown[]=[];
  await page.addInitScript(()=>{
    localStorage.setItem('scene-save-sentinel','preserved');
    const starts={samples:0,oscillators:0};Object.defineProperty(window,'audioSceneStarts',{value:starts});
    const source=AudioBufferSourceNode.prototype.start,oscillator=OscillatorNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){starts.samples++;return source.apply(this,args);};
    OscillatorNode.prototype.start=function(...args){starts.oscillators++;return oscillator.apply(this,args);};
  });
  for(const profile of ['legacy','samples'])for(const scene of ['place','single','rows','columns','cross','combo2','combo3']){
    await open(page,scene,profile);
    await drag(page,0,scene==='place'||scene==='columns'?0:scene==='rows'?5:6,scene==='columns'?5:scene==='cross'?3:0,true);
    const result=await page.evaluate(()=>({audio:window.blockBlast!.getAudio(),fx:window.blockBlast!.getFeedback(),state:window.blockBlast!.getState(),starts:(window as unknown as {audioSceneStarts:{samples:number;oscillators:number}}).audioSceneStarts}));
    const event=scene==='place'?'place':scene==='single'?'single':scene.startsWith('combo')?'combo':'multi';
    expect(result.audio.received).toBe(1);expect(result.audio.played).toBe(1);expect(result.audio.recent[0].event).toBe(event);
    const sample=profile==='samples'&&['place','single'].includes(scene);
    expect(result.audio.recent[0].path).toBe(sample?'sample':profile==='legacy'?'legacy':'fallback');
    expect(result.starts).toEqual({samples:Number(sample),oscillators:Number(!sample)});
    expect(result.audio.recent[0].requestedAt).toBe(result.fx.moves[0].startAt);
    expect(result.audio.recent[0].startedAt).toBeGreaterThanOrEqual(result.audio.recent[0].requestedAt);
    expect(result.state.moves).toBe(1);
    expect(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)))).toEqual({'scene-save-sentinel':'preserved'});
    traces.push({profile,scene,event:result.audio.recent[0],visualStart:result.fx.moves[0].startAt,sourcesStarted:result.starts,moves:result.state.moves,score:result.state.score});
  }
  writeFileSync(info.outputPath('audio-events.json'),JSON.stringify({project:info.project.name,browser:page.context().browser()!.version(),limits:'Browser scheduling evidence, not speaker latency or perceptual listening. One native Chromium touch placement per fixed scene/profile.',traces},null,2)+'\n');
});

test('missing sample falls back now; reload retries, mute/cancel/background never replay stale audio',async({page})=>{
  await page.route('**/audio-samples/edited/clear-casual.wav',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('./?audioLab=1&scene=single&profile=samples');await ready(page);await page.getByTestId('continue').click();
  await expect.poll(()=>page.evaluate(()=>window.blockBlast!.getAudio().samples?.failed)).toBe(1);
  await drag(page,0,6,0,true);expect(await page.evaluate(()=>window.blockBlast!.getAudio().recent.at(-1)?.path)).toBe('fallback');
  await page.unrouteAll({behavior:'wait'});await open(page,'single','samples');
  expect(await page.evaluate(()=>window.blockBlast!.getAudio().received)).toBe(0);
  await drag(page,0,6,0,true,true);expect(await page.evaluate(()=>window.blockBlast!.getAudio().received)).toBe(0);
  await drag(page,0,6,0,true);expect(await page.evaluate(()=>window.blockBlast!.getAudio().recent.at(-1)?.path)).toBe('sample');
  await page.getByTestId('settings-open').click();expect(await page.evaluate(()=>window.blockBlast!.getAudio().samples?.voices)).toBe(0);
  await page.getByTestId('sound').uncheck();await page.getByTestId('settings-close').click();
  await drag(page,1,0,0,true);expect(await page.evaluate(()=>window.blockBlast!.getAudio().recent.at(-1)?.path)).toBe('muted');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  const audio=await page.evaluate(()=>window.blockBlast!.getAudio());expect(audio.samples?.voices).toBe(0);expect(audio.samples?.retiring).toBe(0);expect(audio.legacy.voices).toBe(0);
  await page.waitForTimeout(100);expect(await page.evaluate(()=>window.blockBlast!.getAudio().played)).toBe(audio.played);
});

test('phone A/B controls use the same game in an isolated iframe and preserve the formal save',async({page},info)=>{
  await page.addInitScript(key=>localStorage.setItem(key,'formal-save-sentinel'),STORAGE_KEY);
  await page.goto('audio-lab/scenes.html');await page.getByTestId('scene-select').selectOption('single');await page.getByTestId('scene-samples').click();
  await expect.poll(()=>page.evaluate(()=>document.querySelector<HTMLIFrameElement>('#game')!.contentWindow?.blockBlast?.getAudio().profile)).toBe('samples');
  await page.getByTestId('scene-game').scrollIntoViewIfNeeded();
  const child=page.frameLocator('#game');await child.getByTestId('continue').click();
  await expect.poll(()=>page.evaluate(()=>document.querySelector<HTMLIFrameElement>('#game')!.contentWindow!.blockBlast!.getAudio().samples?.ready)).toBe(2);
  const before=await page.evaluate(()=>document.querySelector<HTMLIFrameElement>('#game')!.contentWindow!.blockBlast!.getState());
  await page.getByTestId('scene-game').scrollIntoViewIfNeeded();
  const p=await page.evaluate(()=>{
    const frame=document.querySelector<HTMLIFrameElement>('#game')!,outer=frame.getBoundingClientRect(),game=frame.contentWindow!.blockBlast!,config=game.getLayout();
    const canvas=frame.contentDocument!.querySelector('canvas')!.getBoundingClientRect(),slot=config.slots[0];
    const left=outer.left+frame.clientLeft+canvas.left,top=outer.top+frame.clientTop+canvas.top;
    return{x1:left+slot.x+slot.width/2,y1:top+slot.y+slot.height/2,x2:left+config.gridOffsetX+.5*config.cellSize,y2:top+config.gridOffsetY+8.15*config.cellSize};
  });
  const session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x1,y:p.y1}]});
  for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x1+(p.x2-p.x1)*i/6,y:p.y1+(p.y2-p.y1)*i/6}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
  await expect(page.getByTestId('scene-status')).toContainText('单行消除 · 候选采样');
  await page.screenshot({path:info.outputPath('game-scene-ab.png'),fullPage:true});
  await page.getByTestId('scene-legacy').click();
  await expect.poll(()=>page.evaluate(()=>document.querySelector<HTMLIFrameElement>('#game')!.contentWindow?.blockBlast?.getAudio().profile)).toBe('legacy');
  await page.getByTestId('scene-game').scrollIntoViewIfNeeded();await child.getByTestId('continue').click();
  expect(await page.evaluate(()=>document.querySelector<HTMLIFrameElement>('#game')!.contentWindow!.blockBlast!.getState())).toEqual(before);
  await page.getByTestId('scene-stop').click();await expect(child.getByTestId('menu')).toBeVisible();
  await page.goto('about:blank');await page.goBack();
  await page.getByTestId('scene-diagnostics-data').evaluate(element=>{element.textContent='waiting-for-return';});
  await expect(page.getByTestId('scene-diagnostics-data')).toContainText('"profile"');
  expect(await page.evaluate(()=>localStorage.getItem('block-blast-web:run:v1'))).toBe('formal-save-sentinel');
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([STORAGE_KEY]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
