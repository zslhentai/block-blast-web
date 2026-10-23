import { type GameState, type GameAction, type Point } from '../logic/types';
import { gameReducer } from '../logic/reducer';
import { canPlace, placeShapeOnBoard } from '../logic/placement';
import { checkAndClearLines } from '../logic/lineClear';
import { initCanvas, type CanvasConfig, clearCanvas } from './canvas';
import { drawBoard, drawState, drawShapes, drawCell, drawPiece } from './draw';
import { type DragState, contains, projectDrag, toLocal } from './input';

interface RendererOptions {
  onStateChange: (state: GameState) => void;
  onFeedback: (kind: 'place' | 'clear' | 'invalid', points: number) => void;
}
export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private drag: DragState | null = null;
  private frame = 0;
  private flash: { cells: Point[]; until: number } | null = null;
  private reducedMotion = false;
  private viewport = { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio };
  private readonly observer: ResizeObserver;
  constructor(private readonly canvas: HTMLCanvasElement, private state: GameState, private readonly options: RendererOptions) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建游戏画布');
    this.ctx = context; this.config = initCanvas(canvas);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('lostpointercapture', this.onLostCapture);
    window.addEventListener('blur', this.cancelDrag);
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
    this.render();
  }
  getState(): GameState { return structuredClone(this.state); }
  getLayout(): CanvasConfig { return structuredClone(this.config); }
  setReducedMotion(value: boolean): void { this.reducedMotion = value; if (value) this.flash = null; this.requestRender(); }
  dispatch(action: GameAction): void {
    this.cancelDrag();
    const before = this.state;
    const after = gameReducer(before, action);
    if (after === before) return;
    this.state = after;
    this.flash = null;
    this.options.onStateChange(this.getState());
    this.requestRender();
  }
  private resize = (): void => {
    this.cancelDrag(); this.flash = null;
    this.config = initCanvas(this.canvas); this.requestRender();
    this.viewport = { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio };
  };
  private local(e: PointerEvent) { return toLocal(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), this.config); }
  private onDown = (e: PointerEvent): void => {
    if (this.drag || this.state.status !== 'playing' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { x, y } = this.local(e);
    const slot = this.config.slots.findIndex(rect => contains(rect, x, y));
    const shape = this.state.shapes[slot];
    if (!shape) return;
    e.preventDefault();
    this.drag = { pointerId: e.pointerId, pointerType: e.pointerType, shape, slot, revision: this.state.revision, currentX: x, currentY: y };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* Synthetic input may not have an active pointer. */ }
    this.requestRender();
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const { x, y } = this.local(e); this.drag.currentX = x; this.drag.currentY = y;
    this.requestRender();
  };
  private onUp = (e: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    // ResizeObserver and resize events can arrive *after* pointerup. Refuse to
    // commit coordinates measured against an earlier viewport or CSS size.
    const bounds = this.canvas.getBoundingClientRect();
    if (Math.abs(bounds.width - this.config.width) > 0.5 || Math.abs(bounds.height - this.config.height) > 0.5 ||
        window.innerWidth !== this.viewport.width || window.innerHeight !== this.viewport.height ||
        window.devicePixelRatio !== this.viewport.dpr) { this.resize(); return; }
    const drag = this.drag;
    const { x, y } = this.local(e); drag.currentX = x; drag.currentY = y;
    const { row, col } = projectDrag(drag, this.config);
    const before = this.state;
    let cleared: Point[] = [];
    if (canPlace(before.board, drag.shape, row, col)) {
      cleared = checkAndClearLines(placeShapeOnBoard(before.board, drag.shape, row, col)).cells;
    }
    this.dispatch({ type: 'PLACE_SHAPE', slot: drag.slot, shapeId: drag.shape.id, revision: drag.revision, row, col });
    if (this.state !== before) {
      if (cleared.length && !this.reducedMotion) this.flash = { cells: cleared, until: performance.now() + 180 };
      this.options.onFeedback(cleared.length ? 'clear' : 'place', this.state.score - before.score);
    } else this.options.onFeedback('invalid', 0);
    this.requestRender();
  };
  private onCancel = (e: PointerEvent): void => { if (this.drag?.pointerId === e.pointerId) this.cancelDrag(); };
  private onLostCapture = (e: PointerEvent): void => { if (this.drag?.pointerId === e.pointerId) this.cancelDrag(); };
  cancelDrag = (): void => {
    const drag = this.drag; this.drag = null;
    if (drag) {
      try { if (this.canvas.hasPointerCapture(drag.pointerId)) this.canvas.releasePointerCapture(drag.pointerId); } catch { /* Already released by the browser. */ }
      this.requestRender();
    }
  };
  private requestRender(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  render(): void {
    clearCanvas(this.ctx, this.config.width, this.config.height);
    drawBoard(this.ctx, this.config); drawState(this.ctx, this.state, this.config);
    drawShapes(this.ctx, this.state.shapes, this.config, this.drag?.shape.id);
    if (this.drag) {
      const target = projectDrag(this.drag, this.config);
      const valid = canPlace(this.state.board, this.drag.shape, target.row, target.col);
      if (valid) {
        const clear = checkAndClearLines(placeShapeOnBoard(this.state.board, this.drag.shape, target.row, target.col));
        for (const cell of clear.cells) drawCell(this.ctx, cell.row, cell.col, this.drag.shape.color, this.config, 0.28);
        for (const [r, c] of this.drag.shape.cells) drawCell(this.ctx, target.row + r, target.col + c, this.drag.shape.color, this.config, 0.45);
      }
      drawPiece(this.ctx, this.drag.shape, target.x, target.y, this.config.cellSize, valid ? 0.95 : 0.65);
    }
    if (this.flash) {
      const remaining = this.flash.until - performance.now();
      if (remaining > 0) {
        this.ctx.fillStyle = `rgba(255,255,255,${remaining / 180 * 0.4})`;
        for (const { row, col } of this.flash.cells) this.ctx.fillRect(this.config.gridOffsetX + col * this.config.cellSize,
          this.config.gridOffsetY + row * this.config.cellSize, this.config.cellSize, this.config.cellSize);
        this.requestRender();
      } else this.flash = null;
    }
  }
  destroy(): void {
    this.cancelDrag(); cancelAnimationFrame(this.frame); this.frame = 0; this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown); this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp); this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onLostCapture);
    window.removeEventListener('blur', this.cancelDrag); window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
  }
}
