import { describe, test, expect } from 'bun:test';
import { GameRenderer } from './index';

describe('GameRenderer drag', () => {
  test('should allow dragging after 5 shapes placed', () => {
    // 创建模拟的 canvas
    const eventHandlers: { [key: string]: Function[] } = {};
    const canvas = {
      getContext: () => ({
        scale: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
      }),
      addEventListener: (event: string, handler: Function) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
      width: 400,
      height: 800,
    } as any;

    const renderer = new GameRenderer(canvas);
    
    // 获取内部状态用于测试
    const getState = () => (renderer as any).state;
    const getDragState = () => (renderer as any).dragState;
    
    // 1. 开始游戏
    eventHandlers['pointerdown']?.forEach((h: Function) => 
      h({ clientX: 200, clientY: 400, preventDefault: () => {} })
    );
    
    expect(getState().status).toBe('playing');
    expect(getState().shapes.length).toBe(3);
    
    // 2. 模拟放置5个形状
    const config = (renderer as any).config;
    const shapeAreaY = config.height - config.cellSize * 4 + config.cellSize; // 匹配drawShapes的偏移
    const shapeWidth = config.cellSize * 2;
    
    // 放置前3个形状
    for (let i = 0; i < 3; i++) {
      const shapes = getState().shapes;
      const startX = config.width / 2 - (shapes.length * shapeWidth) / 2;
      const shapeX = startX + 0 * shapeWidth + shapeWidth / 2; // 点击第一个形状的中心
      
      // 开始拖动
      eventHandlers['pointerdown']?.forEach((h: Function) => 
        h({ clientX: shapeX, clientY: shapeAreaY + config.cellSize, preventDefault: () => {} })
      );
      
      expect(getDragState().isDragging).toBe(true);
      
      // 移动到棋盘上方
      const gridOffsetX = config.gridOffsetX;
      const gridOffsetY = config.gridOffsetY;
      eventHandlers['pointermove']?.forEach((h: Function) => 
        h({ clientX: gridOffsetX + 50, clientY: gridOffsetY + 50 })
      );
      
      // 放置
      eventHandlers['pointerup']?.forEach((h: Function) => 
        h({ clientX: gridOffsetX + 50, clientY: gridOffsetY + 50 })
      );
    }
    
    // 此时应该已经生成了新的3个形状（第4、5、6个）
    expect(getState().shapes.length).toBe(3);
    
    // 3. 放置第4个形状
    {
      const shapes = getState().shapes;
      const startX = config.width / 2 - (shapes.length * shapeWidth) / 2;
      const shapeX = startX + 0 * shapeWidth + shapeWidth / 2;
      
      eventHandlers['pointerdown']?.forEach((h: Function) => 
        h({ clientX: shapeX, clientY: shapeAreaY + config.cellSize, preventDefault: () => {} })
      );
      
      expect(getDragState().isDragging).toBe(true);
      
      const gridOffsetX = config.gridOffsetX;
      const gridOffsetY = config.gridOffsetY;
      eventHandlers['pointermove']?.forEach((h: Function) => 
        h({ clientX: gridOffsetX + 60, clientY: gridOffsetY + 60 })
      );
      
      eventHandlers['pointerup']?.forEach((h: Function) => 
        h({ clientX: gridOffsetX + 60, clientY: gridOffsetY + 60 })
      );
    }
    
    // 4. 放置第5个形状
    {
      const shapes = getState().shapes;
      const startX = config.width / 2 - (shapes.length * shapeWidth) / 2;
      const shapeX = startX + 0 * shapeWidth + shapeWidth / 2;
      
      eventHandlers['pointerdown']?.forEach((h: Function) => 
        h({ clientX: shapeX, clientY: shapeAreaY + config.cellSize, preventDefault: () => {} })
      );
      
      expect(getDragState().isDragging).toBe(true);
      
      const gridOffsetX = config.gridOffsetX;
      const gridOffsetY = config.gridOffsetY;
      eventHandlers['pointermove']?.forEach((h: Function) => 
        h({ clientX: gridOffsetX + 70, clientY: gridOffsetY + 70 })
      );
      
      eventHandlers['pointerup']?.forEach((h: Function) => 
        h({ clientX: gridOffsetX + 70, clientY: gridOffsetY + 70 })
      );
    }
    
    // 5. 验证第6个形状可以拖动 - 这是bug出现的地方
    {
      const shapes = getState().shapes;
      expect(shapes.length).toBeGreaterThan(0);
      
      const startX = config.width / 2 - (shapes.length * shapeWidth) / 2;
      const shapeX = startX + 0 * shapeWidth + shapeWidth / 2;
      
      // 重置拖动状态
      (renderer as any).dragState = { isDragging: false };
      
      eventHandlers['pointerdown']?.forEach((h: Function) => 
        h({ clientX: shapeX, clientY: shapeAreaY + config.cellSize, preventDefault: () => {} })
      );
      
      // 这是关键断言：第6个形状应该可以被拖动
      expect(getDragState().isDragging).toBe(true);
      expect(getDragState().shape).toBeDefined();
    }
  });
});
