import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fixture, readState } from './helpers';
import { MOTION } from '../../src/renderer/motion';

test('bounded real-clock play and restart stress records rendering and post-GC heap without animation backlog', async ({ page },info) => {
  test.setTimeout(60000);
  page.on('dialog',dialog=>{void dialog.accept();});
  await page.addInitScript(()=>{
    const probe={costs:[] as number[],inputs:[] as number[],intervals:[] as number[],longTaskEntries:[] as {start:number;duration:number}[],draws:0,longTasks:0,maxLongTask:0,canvasCreated:0,lastFrame:0};
    Object.defineProperty(window,'experienceProbe',{value:probe});
    const clear=CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect=function(...args){probe.draws++;return clear.apply(this,args);};
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>raf(time=>{
      const before=probe.draws,start=performance.now();callback(time);
      if(probe.draws!==before){
        probe.costs.push(performance.now()-start);if(probe.costs.length>2048)probe.costs.shift();
        if(probe.lastFrame&&time-probe.lastFrame<100)probe.intervals.push(time-probe.lastFrame);
        if(probe.intervals.length>2048)probe.intervals.shift();probe.lastFrame=time;
      }
    });
    const create=document.createElement.bind(document);
    document.createElement=((name:string,options?:ElementCreationOptions)=>{
      if(name==='canvas')probe.canvasCreated++;return create(name,options);
    }) as typeof document.createElement;
    if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){probe.longTasks++;probe.maxLongTask=Math.max(probe.maxLongTask,entry.duration);probe.longTaskEntries.push({start:entry.startTime,duration:entry.duration});if(probe.longTaskEntries.length>128)probe.longTaskEntries.shift();}
    }).observe({type:'longtask',buffered:true});
  });
  await fixture(page);
  const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
  const heaps:number[]=[];
  const heap=async()=>{
    await session.send('HeapProfiler.collectGarbage');
    const metrics=await session.send('Performance.getMetrics');
    heaps.push(metrics.metrics.find(m=>m.name==='JSHeapUsedSize')!.value);
  };
  await heap();
  let placements=0,restarts=0;const driverWindows:[number,number][]=[];
  for(let batch=0;batch<3;batch++){
    const result=await page.evaluate(async()=>{
      let placements=0,restarts=0;const start=performance.now();
      const probe=(window as unknown as {experienceProbe:{inputs:number[]}}).experienceProbe;
      const canvas=document.querySelector('canvas')!;
      for(let i=0;i<500;i++){
        let state=window.blockBlast!.getState();
        if(state.status==='gameover'){document.getElementById('play-again')!.click();restarts++;state=window.blockBlast!.getState();}
        let chosen:{slot:number;row:number;col:number}|null=null;
        for(let slot=0;slot<3&&!chosen;slot++){
          const shape=state.shapes[slot];if(!shape)continue;
          for(let row=0;row<8&&!chosen;row++)for(let col=0;col<8;col++)if(shape.cells.every(([r,c])=>row+r<8&&col+c<8&&!state.board[row+r][col+c])){chosen={slot,row,col};break;}
        }
        if(!chosen)throw new Error('A playing state has no legal move');
        const shape=state.shapes[chosen.slot]!,layout=window.blockBlast!.getLayout(),rect=canvas.getBoundingClientRect();
        const slot=layout.slots[chosen.slot],rows=Math.max(...shape.cells.map(p=>p[0]))+1,cols=Math.max(...shape.cells.map(p=>p[1]))+1;
        const start={clientX:rect.left+slot.x+slot.width/2,clientY:rect.top+slot.y+slot.height/2};
        const end={clientX:rect.left+layout.gridOffsetX+(chosen.col+cols/2)*layout.cellSize,clientY:rect.top+layout.gridOffsetY+(chosen.row+rows+1.15)*layout.cellSize};
        const inputStart=performance.now();
        for(const [type,point] of [['pointerdown',start],['pointermove',end],['pointerup',end]] as const)canvas.dispatchEvent(new PointerEvent(type,{...point,pointerId:91,pointerType:'touch',bubbles:true,cancelable:true}));
        probe.inputs.push(performance.now()-inputStart);
        if(window.blockBlast!.getState().moves!==state.moves+1)throw new Error('Stress input was dropped or committed twice');
        placements++;
        const fx=window.blockBlast!.getFeedback();
        if(fx.activeMoves>3||fx.moves.reduce((n,m)=>n+m.particles,0)>48)throw new Error('Unbounded feedback');
        if(i%3===0)await new Promise(requestAnimationFrame);
      }
      for(let i=0;i<100;i++){
        document.getElementById('new-game')!.click();restarts++;
        if(window.blockBlast!.getState().moves!==0)throw new Error('Restart did not reset the game');
        if(i%5===0)await new Promise(requestAnimationFrame);
      }
      return {placements,restarts,start,end:performance.now()};
    });
    placements+=result.placements;restarts+=result.restarts;driverWindows.push([result.start,result.end]);
    await page.waitForTimeout(MOTION.comboMs+100);
    expect(await page.evaluate(()=>window.blockBlast!.getFeedback().activeMoves)).toBe(0);
    expect(await page.evaluate(()=>window.blockBlast!.getFeedback().framePending)).toBe(false);
    await heap();
  }
  const probe=await page.evaluate(()=>({...(window as unknown as {experienceProbe:{costs:number[];inputs:number[];intervals:number[];longTaskEntries:{start:number;duration:number}[];draws:number;longTasks:number;maxLongTask:number;canvasCreated:number}}).experienceProbe,userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight}}));
  const quantile=(values:number[],fraction:number)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*fraction)];
  const driverLongTasks=probe.longTaskEntries.filter(entry=>driverWindows.some(([start,end])=>entry.start>=start&&entry.start<end));
  const report={project:info.project.name,browser:page.context().browser()!.version(),placements,restarts,heaps,postGCHeapGrowth:heaps.at(-1)!-heaps[0],render:{draws:probe.draws,p50Ms:quantile(probe.costs,.5),p95Ms:quantile(probe.costs,.95),maxMs:Math.max(...probe.costs),over16ms:probe.costs.filter(t=>t>16.7).length},inputHandlers:{samples:probe.inputs.length,p50Ms:quantile(probe.inputs,.5),p95Ms:quantile(probe.inputs,.95),maxMs:Math.max(...probe.inputs)},frameIntervals:{p50Ms:quantile(probe.intervals,.5),p95Ms:quantile(probe.intervals,.95)},longTasksAll:probe.longTasks,maxLongTaskAll:probe.maxLongTask,driverLongTasks,driverWindows,canvasCreated:probe.canvasCreated,userAgent:probe.userAgent,dpr:probe.dpr,viewport:probe.viewport,limits:'Real-clock Linux Chromium under automation, not device FPS. Synthetic pointer stress, native touch is covered separately. Driver long tasks exclude loading and forced-GC windows. Heap includes browser warm-up and this instrumentation; three batches are a bounded probe, not a 30-minute phone endurance test.'};
  writeFileSync(info.outputPath('performance.json'),JSON.stringify(report,null,2)+'\n');
  expect(placements).toBe(1500);expect(restarts).toBeGreaterThanOrEqual(300);
  expect(probe.costs.length).toBeGreaterThan(50);expect(probe.canvasCreated).toBeLessThan(8);
  expect(report.postGCHeapGrowth).toBeLessThan(12*1024*1024);
  expect((await readState(page)).moves).toBe(0);
  await session.detach();
});
