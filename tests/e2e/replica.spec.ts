import { test, expect } from '@playwright/test';
import { fixture, readState, drag, coordinates } from './helpers';
import { CATALOGUE } from '../../src/logic/shapes';
import { canPlace, placeShapeOnBoard } from '../../src/logic/placement';
import { checkAndClearLines } from '../../src/logic/lineClear';
import { createEmptyBoard } from '../../src/logic/state';
import type { Shape } from '../../src/logic/types';

test('all 39 orientations accept real touch at the displayed cells across three phone sizes', async ({ context }) => {
  test.setTimeout(60000);
  for(let i=0;i<CATALOGUE.length;i+=3) {
    const page=await context.newPage();
    const [width,height]=[[320,568],[393,852],[412,915]][i/3%3];await page.setViewportSize({width,height});
    const shapes=CATALOGUE.slice(i,i+3).map((s,j):Shape=>({id:`catalogue-${i+j}`,color:j+1,cells:s.cells}));
    await fixture(page,{shapes});
    for(let slot=0;slot<shapes.length;slot++) {
      const before=await readState(page),shape=before.shapes[slot]!;
      let target:{row:number;col:number}|undefined;
      for(let r=0;r<8&&!target;r++) for(let c=0;c<8;c++) if(canPlace(before.board,shape,r,c)){target={row:r,col:c};break;}
      expect(target,shape.id).toBeDefined();
      const board=checkAndClearLines(placeShapeOnBoard(before.board,shape,target!.row,target!.col)).board;
      await drag(page,slot,target!.row,target!.col,true);
      const after=await readState(page);expect(after.moves).toBe(before.moves+1);expect(after.board).toEqual(board);
      expect(after.shapes.some(s=>s?.id===shape.id)).toBe(false);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.close();
  }
});

test('moving the canvas or visual viewport while a pointer is held cancels instead of shifting the drop', async ({ page }) => {
  const shape:Shape={id:'held',color:1,cells:[[0,0]]};
  await fixture(page,{shapes:[shape,{...shape,id:'next'},null]});
  const before=await readState(page),p=await coordinates(page,0,3,3,true);
  await page.evaluate(p=>{
    const canvas=document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:71,pointerType:'touch',clientX:p.startX,clientY:p.startY,bubbles:true,cancelable:true}));
    canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:71,pointerType:'touch',clientX:p.endX,clientY:p.endY,bubbles:true,cancelable:true}));
    canvas.style.transform='translateY(36px)';
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:71,pointerType:'touch',clientX:p.endX,clientY:p.endY,bubbles:true,cancelable:true}));
    canvas.style.transform='';
  },p);
  expect(await readState(page)).toEqual(before);
  await page.evaluate(p=>{
    const canvas=document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:72,pointerType:'touch',clientX:p.startX,clientY:p.startY,bubbles:true,cancelable:true}));
    window.visualViewport?.dispatchEvent(new Event('scroll'));
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:72,pointerType:'touch',clientX:p.endX,clientY:p.endY,bubbles:true,cancelable:true}));
  },p);
  expect(await readState(page)).toEqual(before);
  await page.evaluate(p=>{
    const canvas=document.querySelector('canvas')!,view=window.visualViewport!;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:73,pointerType:'touch',clientX:p.startX,clientY:p.startY,bubbles:true,cancelable:true}));
    const scale=view.scale;Object.defineProperty(view,'scale',{configurable:true,value:1.25});
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:73,pointerType:'touch',clientX:p.endX,clientY:p.endY,bubbles:true,cancelable:true}));
    Object.defineProperty(view,'scale',{configurable:true,value:scale});
  },p);
  expect(await readState(page)).toEqual(before);
  await drag(page,0,3,3,true);expect((await readState(page)).board[3][3]).toBe(1);
});

test('overlapping consecutive clears retire the older cell snapshot and same-cell dragging reuses the preview', async ({ page },info) => {
  await page.clock.install({time:new Date('2026-10-24T15:00:00Z')});await page.clock.pauseAt(new Date('2026-10-24T15:00:01Z'));
  const board=createEmptyBoard();board[6]=[0,1,1,2,1,1,1,1];for(let r=0;r<6;r++)board[r][3]=2;
  await fixture(page,{board,shapes:[{id:'row',color:7,cells:[[0,0]]},{id:'column',color:3,cells:[[0,0],[1,0]]},{id:'next',color:5,cells:[[0,0]]}]});
  await drag(page,0,6,0,true);await page.clock.runFor(32);await drag(page,1,6,3,true);await page.clock.runFor(32);
  expect((await readState(page)).board.flat().filter(Boolean)).toHaveLength(0);
  const fx=await page.evaluate(()=>window.blockBlast!.getFeedback());
  expect(fx.moves.map(m=>m.visibleClearedCells)).toEqual([7,8]);
  await page.screenshot({path:info.outputPath('overlapping-clears.png')});
  const p=await coordinates(page,2,3,3,true),session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.startX,y:p.startY}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.endX,y:p.endY}]});await page.clock.runFor(32);
  const count=await page.evaluate(()=>window.blockBlast!.getFeedback().previewChecks);
  for(let i=0;i<8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.endX+i*.02,y:p.endY}]});await page.clock.runFor(16);}
  expect(await page.evaluate(()=>window.blockBlast!.getFeedback().previewChecks)).toBe(count);
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await session.detach();
});

test('ending and short-screen settings have reproducible screenshots and reachable controls',async({page,context},info)=>{
  await page.setViewportSize({width:393,height:852});
  const board=Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>(r+c)%2));
  await fixture(page,{board,shapes:[{id:'last-fit',color:7,cells:[[0,0]]},{id:'blocked',color:2,cells:[[0,0],[0,1]]},null]});
  await drag(page,0,0,0,true);await expect(page.getByTestId('gameover')).toBeVisible();
  await page.screenshot({path:info.outputPath('gameover.png')});await page.close();
  const short=await context.newPage();await short.setViewportSize({width:320,height:568});await fixture(short);
  await short.getByTestId('settings-open').click();
  const close=await short.getByTestId('settings-close').boundingBox();
  expect(close!.height).toBeGreaterThanOrEqual(44);expect(close!.y).toBeGreaterThanOrEqual(0);expect(close!.y+close!.height).toBeLessThanOrEqual(568);
  expect(await short.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await short.screenshot({path:info.outputPath('settings-short.png')});
  await short.keyboard.press('Escape');expect((await readState(short)).status).toBe('playing');await short.close();
});
