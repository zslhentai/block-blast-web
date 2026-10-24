import { type GameState, type GameAction } from '../logic/types';
import { gameReducer } from '../logic/reducer';
import { canPlace, placeShapeOnBoard } from '../logic/placement';
import { checkAndClearLines } from '../logic/lineClear';
import { initCanvas, type CanvasConfig, clearCanvas } from './canvas';
import { drawBoard, drawState, drawShapes } from './draw';
import { type DragState, contains, projectDrag, toLocal } from './input';
import { FeedbackTimeline, moveFeedback, type MoveFeedback } from './feedback';
import { drawFeedback, drawPreview } from './effects';

interface RendererOptions {
  onStateChange: (state: GameState) => void;
  onFeedback: (kind: 'place' | 'clear' | 'invalid', points: number, tier: number, move:MoveFeedback|null, at:number) => void;
}
export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private drag: DragState | null = null;
  private dragBounds: { left: number; top: number } | null = null;
  private previewCache: { revision: number; shapeId: string; row: number; col: number; valid: boolean; clear: { row: number; col: number }[] } | null = null;
  private previewChecks = 0;
  private frame = 0;
  private readonly feedback = new FeedbackTimeline();
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
    window.visualViewport?.addEventListener('scroll', this.cancelDrag);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
    this.render();
  }
  getState(): GameState { return structuredClone(this.state); }
  getLayout(): CanvasConfig { return structuredClone(this.config); }
  getFeedback() {
    const now = performance.now();
    const { frames, rejected } = this.feedback.sample(now);
    const preview = this.drag ? projectDrag(this.drag, this.config) : null;
    return { reducedMotion: this.reducedMotion, activeMoves: frames.length, invalid: rejected !== null, previewChecks: this.previewChecks,
      framePending: this.frame !== 0,
      moves: frames.map(f => ({ revision: f.move.revision, startAt:f.start, age: now - f.start, clearedCells: f.move.cleared.length,
        rows: [...f.move.rows], cols: [...f.move.cols], tier: f.move.tier, strength: f.move.strength, particles: f.particles.length,
        visibleClearedCells: f.move.cleared.filter(p=>this.feedback.owns(f.move.revision,p) && !this.state.board[p.row][p.col]).length })),
      preview: preview && this.drag ? { row: preview.row, col: preview.col,
        x: preview.x, y: preview.y, valid: canPlace(this.state.board, this.drag.shape, preview.row, preview.col) } : null };
  }
  setReducedMotion(value: boolean): void {
    this.reducedMotion = value; if (value) this.feedback.reset(); this.requestRender();
  }
  dispatch(action: GameAction): void {
    this.cancelDrag();
    if (action.type !== 'PLACE_SHAPE') {
      this.feedback.reset(); cancelAnimationFrame(this.frame); this.frame = 0;
    }
    const before = this.state;
    const after = gameReducer(before, action);
    if (after === before) { this.requestRender(); return; }
    this.state = after;
    this.options.onStateChange(this.getState());
    const move = moveFeedback(before, after, action);
    if (move) {
      const at=performance.now();
      if (!this.reducedMotion && after.status === 'playing') this.feedback.add(move, at);
      this.options.onFeedback(move.cleared.length ? 'clear' : 'place', move.points, move.tier, move, at);
    }
    if (after.status !== 'playing') this.feedback.reset();
    this.requestRender();
  }
  private resize = (): void => {
    this.cancelDrag(); this.feedback.reset();
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
    const rect = this.canvas.getBoundingClientRect(); this.dragBounds = { left: rect.left, top: rect.top };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* Synthetic input may not have an active pointer. */ }
    this.requestRender();
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const latest = e.getCoalescedEvents?.().at(-1) ?? e;
    const { x, y } = this.local(latest); this.drag.currentX = x; this.drag.currentY = y;
    this.requestRender();
  };
  private onUp = (e: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    // ResizeObserver and resize events can arrive *after* pointerup. Refuse to
    // commit coordinates measured against an earlier viewport or CSS size.
    const bounds = this.canvas.getBoundingClientRect();
    if (Math.abs(bounds.width - this.config.width) > 0.5 || Math.abs(bounds.height - this.config.height) > 0.5 ||
        (this.dragBounds && (Math.abs(bounds.left-this.dragBounds.left) > .5 || Math.abs(bounds.top-this.dragBounds.top) > .5)) ||
        window.innerWidth !== this.viewport.width || window.innerHeight !== this.viewport.height ||
        window.devicePixelRatio !== this.viewport.dpr) { this.resize(); return; }
    const drag = this.drag;
    const { x, y } = this.local(e); drag.currentX = x; drag.currentY = y;
    const { row, col } = projectDrag(drag, this.config);
    const before = this.state;
    this.dispatch({ type: 'PLACE_SHAPE', slot: drag.slot, shapeId: drag.shape.id, revision: drag.revision, row, col });
    if (this.state === before) {
      if (!this.reducedMotion) this.feedback.reject(drag.slot, performance.now());
      this.options.onFeedback('invalid', 0, 0, null, performance.now());
    }
    this.requestRender();
  };
  private onCancel = (e: PointerEvent): void => { if (this.drag?.pointerId === e.pointerId) this.cancelDrag(); };
  private onLostCapture = (e: PointerEvent): void => { if (this.drag?.pointerId === e.pointerId) this.cancelDrag(); };
  cancelDrag = (): void => {
    const drag = this.drag; this.drag = null; this.dragBounds = null; this.previewCache = null;
    if (drag) {
      try { if (this.canvas.hasPointerCapture(drag.pointerId)) this.canvas.releasePointerCapture(drag.pointerId); } catch { /* Already released by the browser. */ }
      this.requestRender();
    }
  };
  private requestRender(): void {
    if (document.visibilityState === 'hidden') return;
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  render(): void {
    clearCanvas(this.ctx, this.config.width, this.config.height);
    drawBoard(this.ctx, this.config); drawState(this.ctx, this.state, this.config);
    const active = drawFeedback(this.ctx, this.state, this.config, this.feedback, performance.now(), this.drag !== null);
    drawShapes(this.ctx, this.state.shapes, this.config, this.drag?.shape.id);
    if (this.drag) {
      const target = projectDrag(this.drag, this.config);
      if (!this.previewCache || this.previewCache.revision !== this.state.revision || this.previewCache.shapeId !== this.drag.shape.id || this.previewCache.row !== target.row || this.previewCache.col !== target.col) {
        const valid = canPlace(this.state.board, this.drag.shape, target.row, target.col);
        const clear = valid ? checkAndClearLines(placeShapeOnBoard(this.state.board, this.drag.shape, target.row, target.col)).cells : [];
        this.previewCache = { revision: this.state.revision, shapeId: this.drag.shape.id, row: target.row, col: target.col, valid, clear };
        this.previewChecks++;
      }
      drawPreview(this.ctx, this.drag.shape, target, this.previewCache.valid, this.previewCache.clear, this.config);
    }
    if (active && this.state.status === 'playing') this.requestRender();
  }
  destroy(): void {
    this.cancelDrag(); this.feedback.reset(); cancelAnimationFrame(this.frame); this.frame = 0; this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown); this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp); this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onLostCapture);
    window.removeEventListener('blur', this.cancelDrag); window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('scroll', this.cancelDrag);
  }
}
