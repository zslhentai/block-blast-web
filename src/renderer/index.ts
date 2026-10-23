import { GameState, COLORS, BOARD_SIZE, Board } from '../logic/types';
import { gameReducer } from '../logic/reducer';
import { initCanvas, CanvasConfig, clearCanvas } from './canvas';
import { drawBoard, drawState, drawShapes, drawCell } from './draw';
import { DragState, createInitialDragState, getGridPosition } from './input';
import { loadGameData } from '../storage/localStorage';
import { canPlace } from '../logic/placement';
import { soundManager } from '../audio/sounds';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: 'normal' | 'electric' | 'spark';
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  scale: number;
  lineCount: number;
}

interface ScoreAnimation {
  value: number;
  displayValue: number;
  startTime: number;
  duration: number;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config!: CanvasConfig;
  private state: GameState;
  private dragState: DragState;
  private linesToClear: { rows: number[]; cols: number[] } = { rows: [], cols: [] };
  private animatingLines: { rows: number[]; cols: number[]; startTime: number; lineCount: number } | null = null;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private screenShake: { intensity: number; decay: number } = { intensity: 0, decay: 0 };
  private scoreAnim: ScoreAnimation | null = null;
  private lastScore: number = 0;
  private soundIconSize: number = 40;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    const savedData = loadGameData();
    this.state = {
      board: Array.from({ length: 8 }, () => Array(8).fill(0)),
      shapes: [],
      score: 0,
      linesCleared: 0,
      status: 'idle',
      highScore: savedData.highScore,
      pendingGameOverCheck: false,
    };
    this.lastScore = 0;
    this.dragState = createInitialDragState();
    this.init();
  }

  private init(): void {
    this.config = initCanvas(this.canvas);
    this.bindEvents();
    this.render();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
  }

  private handlePointerDown(e: PointerEvent): void {
    // Check sound icon click (top-left corner)
    const iconX = 20;
    const iconY = 20;
    const iconSize = this.soundIconSize;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicked on sound icon
    if (x >= iconX - iconSize/2 && x <= iconX + iconSize/2 && 
        y >= iconY - iconSize/2 && y <= iconY + iconSize/2) {
      const isCurrentlyEnabled = soundManager.isBgMusicEnabled();
      soundManager.setBgMusicEnabled(!isCurrentlyEnabled);
      this.render();
      return;
    }
    
    if (this.state.status !== 'playing') {
      if (this.state.status === 'idle') this.dispatch({ type: 'START_GAME' as const });
      else if (this.state.status === 'gameover') this.dispatch({ type: 'RESTART' as const });
      return;
    }
    const shapeWidth = this.config.cellSize * 4 * 0.7;
    // Always use fixed 3-slot layout to match rendering
    const totalShapes = 3;
    const shapeStartX = this.config.width / 2 - (totalShapes * shapeWidth) / 2;
    const shapeAreaY = this.config.height - this.config.cellSize * 5 + this.config.cellSize;
    for (let i = 0; i < this.state.shapes.length; i++) {
      const shapeX = shapeStartX + i * shapeWidth;
      if (x >= shapeX && x <= shapeX + shapeWidth && y >= shapeAreaY && y <= shapeAreaY + this.config.cellSize * 4 * 0.7) {
        this.dragState = { isDragging: true, shape: this.state.shapes[i], startX: x, startY: y, currentX: x, currentY: y, previewRow: -1, previewCol: -1, isValidPlacement: false };
        return;
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragState.isDragging || !this.dragState.shape) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.dragState.currentX = x;
    this.dragState.currentY = y;
    
    const DRAG_OFFSET_BLOCKS = 4;
    const offsetY = y - DRAG_OFFSET_BLOCKS * this.config.cellSize;
    const gridPos = getGridPosition(x, offsetY, this.config);
    if (gridPos) {
      this.dragState.previewRow = gridPos.row;
      this.dragState.previewCol = gridPos.col;
      this.dragState.isValidPlacement = canPlace(this.state.board, this.dragState.shape, gridPos.row, gridPos.col);

      if (this.dragState.isValidPlacement) {
        this.linesToClear = this.calculateLinesToClear(this.state.board, this.dragState.shape, gridPos.row, gridPos.col);
      } else {
        this.linesToClear = { rows: [], cols: [] };
      }
    } else {
      this.dragState.previewRow = -1;
      this.dragState.previewCol = -1;
      this.linesToClear = { rows: [], cols: [] };
    }
    this.render();
  }

  private handlePointerUp(_e: PointerEvent): void {
    if (this.dragState.isDragging && this.dragState.shape && this.dragState.isValidPlacement && this.dragState.previewRow >= 0) {
      const linesBefore = this.calculateLinesToClear(this.state.board, this.dragState.shape, this.dragState.previewRow, this.dragState.previewCol);
      const lineCount = linesBefore.rows.length + linesBefore.cols.length;
      this.dispatch({ type: 'PLACE_SHAPE' as const, shape: this.dragState.shape, row: this.dragState.previewRow, col: this.dragState.previewCol });
      soundManager.play('place');
      if (lineCount > 0) {
        this.startLineClearAnimation(linesBefore.rows, linesBefore.cols, lineCount);
      }
    } else if (this.dragState.isDragging) {
      soundManager.play('placeFail');
    }
    this.dragState = createInitialDragState();
    this.linesToClear = { rows: [], cols: [] };
    this.render();
  }

  private calculateLinesToClear(board: Board, shape: { cells: [number, number][] }, row: number, col: number): { rows: number[]; cols: number[] } {
    const rows: number[] = [];
    const cols: number[] = [];
    const tempBoard = board.map(r => [...r]);
    shape.cells.forEach(([r, c]) => {
      tempBoard[row + r][col + c] = 1;
    });

    for (let r = 0; r < BOARD_SIZE; r++) {
      if (tempBoard[r].every(cell => cell !== 0)) rows.push(r);
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (tempBoard.every(r => r[c] !== 0)) cols.push(c);
    }

    return { rows, cols };
  }

  private createParticles(rows: number[], cols: number[], lineCount: number): void {
    // Create particles for cleared cells
    rows.forEach(row => {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const x = this.config.gridOffsetX + col * this.config.cellSize + this.config.cellSize / 2;
        const y = this.config.gridOffsetY + row * this.config.cellSize + this.config.cellSize / 2;
        this.spawnParticles(x, y, 8, lineCount);
      }
    });
    
    cols.forEach(col => {
      for (let row = 0; row < BOARD_SIZE; row++) {
        const x = this.config.gridOffsetX + col * this.config.cellSize + this.config.cellSize / 2;
        const y = this.config.gridOffsetY + row * this.config.cellSize + this.config.cellSize / 2;
        this.spawnParticles(x, y, 8, lineCount);
      }
    });

    // Electric sparks for 4+ lines
    if (lineCount >= 4) {
      this.spawnElectricSparks();
    }
  }

  private spawnParticles(x: number, y: number, count: number, lineCount: number): void {
    let colors: string[];
    
    // Color schemes based on line count
    if (lineCount >= 4) {
      colors = ['#FFD700', '#FF4500', '#FF6347', '#FFA500', '#FFFF00']; // Gold and fire
    } else if (lineCount === 3) {
      colors = ['#FF8C00', '#FF6347', '#DA70D6', '#FF1493', '#FF69B4']; // Orange and purple
    } else {
      colors = ['#00CED1', '#20B2AA', '#48D1CC', '#40E0D0', '#00FA9A']; // Cyan and emerald
    }
    
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        maxLife: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 5,
        type: 'normal',
      });
    }
  }

  private spawnElectricSparks(): void {
    const centerX = this.config.gridOffsetX + (BOARD_SIZE * this.config.cellSize) / 2;
    const centerY = this.config.gridOffsetY + (BOARD_SIZE * this.config.cellSize) / 2;
    
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 100;
      this.particles.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: Math.sin(angle) * (2 + Math.random() * 3),
        life: 1,
        maxLife: 1,
        color: '#FFFFFF',
        size: 2 + Math.random() * 3,
        type: 'electric',
      });
    }
  }

  private addFloatingText(text: string, x: number, y: number, lineCount: number): void {
    this.floatingTexts.push({
      text,
      x,
      y,
      vy: -3,
      life: 1,
      maxLife: 1,
      scale: 1,
      lineCount,
    });
  }

  private startScoreAnimation(points: number): void {
    if (points <= 0) return;
    
    this.scoreAnim = {
      value: this.state.score,
      displayValue: this.lastScore,
      startTime: Date.now(),
      duration: 1000,
    };
    
    this.lastScore = this.state.score;
    
    // Play score sound
    soundManager.play('place');
  }

  private startLineClearAnimation(rows: number[], cols: number[], lineCount: number): void {
    this.animatingLines = { rows, cols, startTime: Date.now(), lineCount };
    
    // Play appropriate sound
    soundManager.playClear(lineCount);
    
    // Create particles with color scheme
    this.createParticles(rows, cols, lineCount);
    
    // Screen shake for big clears
    if (lineCount >= 2) {
      this.screenShake.intensity = lineCount >= 4 ? 15 : 8;
      this.screenShake.decay = 0.8;
    }
    
    // Add floating text
    const centerX = this.config.gridOffsetX + (BOARD_SIZE * this.config.cellSize) / 2;
    const centerY = this.config.gridOffsetY + (BOARD_SIZE * this.config.cellSize) / 2;
    
    // 根据消除行数随机选择中文词组
    const texts: Record<number, string[]> = {
      1: ['漂亮!', '精准!', '随意!', '洒脱!'],
      2: ['超棒!', '厉害!', '精彩!', '起飞!'],
      3: ['太强了!', '不可思议!', '全场欢呼!', '神操作!'],
      4: ['无敌!', '炸裂!', '巅峰时刻!', '横扫千军!'],
    };
    
    let text = '';
    if (lineCount >= 4) {
      const options = texts[4];
      text = options[Math.floor(Math.random() * options.length)];
    } else if (lineCount === 3) {
      const options = texts[3];
      text = options[Math.floor(Math.random() * options.length)];
    } else if (lineCount === 2) {
      const options = texts[2];
      text = options[Math.floor(Math.random() * options.length)];
    } else {
      const options = texts[1];
      text = options[Math.floor(Math.random() * options.length)];
    }
    
    this.addFloatingText(text, centerX, centerY, lineCount);

    const animate = () => {
      if (!this.animatingLines && this.particles.length === 0 && this.floatingTexts.length === 0 && 
          this.screenShake.intensity <= 0.1 && !this.scoreAnim) return;
      
      const elapsed = Date.now() - (this.animatingLines?.startTime || 0);
      if (elapsed > 800 && this.animatingLines) {
        this.animatingLines = null;
      }
      
      // Update particles
      this.particles = this.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; // gravity
        p.life -= 0.02;
        return p.life > 0;
      });
      
      // Update floating texts
      this.floatingTexts = this.floatingTexts.filter(t => {
        t.y += t.vy;
        t.life -= 0.015;
        t.scale = 1 + (1 - t.life) * 0.5;
        return t.life > 0;
      });
      
      // Decay screen shake
      if (this.screenShake.intensity > 0) {
        this.screenShake.intensity *= this.screenShake.decay;
      }
      
      // Update score animation
      if (this.scoreAnim) {
        const scoreElapsed = Date.now() - this.scoreAnim.startTime;
        const progress = Math.min(scoreElapsed / this.scoreAnim.duration, 1);
        
        // Easing function
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        this.scoreAnim.displayValue = Math.floor(this.scoreAnim.displayValue + 
          (this.scoreAnim.value - this.scoreAnim.displayValue) * easeOutQuart);
        
        if (progress >= 1) {
          this.scoreAnim = null;
        }
      }
      
      this.render();
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  private dispatch(action: { type: string; shape?: any; row?: number; col?: number }): void {
    const oldScore = this.state.score;
    const oldStatus = this.state.status;
    this.state = gameReducer(this.state, action as any);

    // Check if score increased
    if (this.state.score > oldScore) {
      this.startScoreAnimation(this.state.score - oldScore);
    }

    // 检测 pendingGameOverCheck，延迟显示 Game Over
    if (this.state.pendingGameOverCheck && oldStatus !== 'gameover') {
      setTimeout(() => {
        this.dispatch({ type: 'CHECK_GAME_OVER' as const });
      }, 1500);
    }
    
    // 状态变为 gameover 时播放音效
    if (this.state.status === 'gameover' && oldStatus !== 'gameover') {
      soundManager.play('gameover');
    }

    this.render();
  }

  private drawScoreWithAnimation(): void {
    const score = this.scoreAnim ? this.scoreAnim.displayValue : this.state.score;
    const isAnimating = this.scoreAnim !== null;
    
    this.ctx.save();
    
    if (isAnimating) {
      // Bounce effect during animation
      const bounce = Math.sin(Date.now() / 50) * 5;
      this.ctx.translate(0, bounce);
      this.ctx.fillStyle = '#FFD700';
      this.ctx.shadowColor = '#FFA500';
      this.ctx.shadowBlur = 20;
    } else {
      this.ctx.fillStyle = '#ffffff';
    }
    
    this.ctx.font = 'bold 32px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Score: ${score}`, this.config.width / 2, 50);
    
    if (isAnimating) {
      this.ctx.shadowBlur = 0;
    }
    
    this.ctx.font = '16px sans-serif';
    this.ctx.fillStyle = '#aaaaaa';
    this.ctx.fillText(`Lines: ${this.state.linesCleared}`, this.config.width / 2, 80);
    
    this.ctx.restore();
  }

  private drawSoundIcon(): void {
    const iconX = 20;
    const iconY = 20;
    const iconSize = this.soundIconSize;
    const isEnabled = soundManager.isBgMusicEnabled();
    
    this.ctx.save();
    this.ctx.font = '24px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = isEnabled ? '#00FF00' : '#FF0000';
    this.ctx.fillText(isEnabled ? '🔊' : '🔇', iconX, iconY);
    this.ctx.restore();
  }

  public render(): void {
    // Apply screen shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.screenShake.intensity > 0.1) {
      shakeX = (Math.random() - 0.5) * this.screenShake.intensity;
      shakeY = (Math.random() - 0.5) * this.screenShake.intensity;
    }
    
    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);
    
    clearCanvas(this.ctx, this.config.width, this.config.height);
    drawBoard(this.ctx, this.config);
    drawState(this.ctx, this.state, this.config);

    // Draw line clear preview (yellow highlight)
    if ((this.linesToClear.rows.length > 0 || this.linesToClear.cols.length > 0) && this.dragState.isDragging) {
      this.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      this.linesToClear.rows.forEach(row => {
        this.ctx.fillRect(
          this.config.gridOffsetX,
          this.config.gridOffsetY + row * this.config.cellSize,
          this.config.cellSize * BOARD_SIZE,
          this.config.cellSize
        );
      });
      this.linesToClear.cols.forEach(col => {
        this.ctx.fillRect(
          this.config.gridOffsetX + col * this.config.cellSize,
          this.config.gridOffsetY,
          this.config.cellSize,
          this.config.cellSize * BOARD_SIZE
        );
      });
    }

    // Draw line clear flash animation
    if (this.animatingLines) {
      const elapsed = Date.now() - this.animatingLines.startTime;
      const progress = Math.min(elapsed / 300, 1);
      
      // Flash effect
      const flashAlpha = Math.sin(progress * Math.PI) * 0.8;
      this.ctx.fillStyle = `rgba(255, 255, 100, ${flashAlpha})`;
      
      this.animatingLines.rows.forEach(row => {
        this.ctx.fillRect(
          this.config.gridOffsetX,
          this.config.gridOffsetY + row * this.config.cellSize,
          this.config.cellSize * BOARD_SIZE,
          this.config.cellSize
        );
      });
      this.animatingLines.cols.forEach(col => {
        this.ctx.fillRect(
          this.config.gridOffsetX + col * this.config.cellSize,
          this.config.gridOffsetY,
          this.config.cellSize,
          this.config.cellSize * BOARD_SIZE
        );
      });
    }

    // Draw particles
    this.particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      this.ctx.globalAlpha = alpha;
      
      if (p.type === 'electric') {
        // Draw electric spark
        this.ctx.strokeStyle = p.color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.lineTo(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20);
        this.ctx.stroke();
      } else {
        // Draw normal particle
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });
    this.ctx.globalAlpha = 1;

    // Draw score with animation
    this.drawScoreWithAnimation();
    
    // Draw sound icon (top-left corner)
    this.drawSoundIcon();
    
    // Draw floating texts
    this.floatingTexts.forEach(t => {
      const alpha = t.life / t.maxLife;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      
      // Style based on line count
      if (t.lineCount >= 4) {
        // 4+ lines: Gold/Fire with electric effect
        this.ctx.fillStyle = '#FFD700';
        this.ctx.strokeStyle = '#FF4500';
        this.ctx.shadowColor = '#FF6347';
        this.ctx.shadowBlur = 20 + Math.sin(Date.now() / 50) * 10;
      } else if (t.lineCount === 3) {
        // 3 lines: Orange/Purple with glow
        this.ctx.fillStyle = '#FF8C00';
        this.ctx.strokeStyle = '#DA70D6';
        this.ctx.shadowColor = '#FF1493';
        this.ctx.shadowBlur = 15;
      } else {
        // 1-2 lines: Cyan/Emerald with white stroke
        this.ctx.fillStyle = '#00CED1';
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.shadowBlur = 0;
      }
      
      this.ctx.lineWidth = 3;
      this.ctx.font = `bold ${48 * t.scale}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.strokeText(t.text, t.x, t.y);
      this.ctx.fillText(t.text, t.x, t.y);
      this.ctx.restore();
    });
    
    if (this.state.status === 'playing' && this.state.shapes.length > 0) {
      // Pass the dragged shape ID to skip drawing it, but keep positions
      const draggedId = this.dragState.isDragging && this.dragState.shape ? this.dragState.shape.id : undefined;
      drawShapes(this.ctx, this.state.shapes, this.config, 0.7, draggedId);
    }
    if (this.dragState.isDragging && this.dragState.shape) {
      const DRAG_OFFSET_BLOCKS = 4;
      const offsetY = DRAG_OFFSET_BLOCKS * this.config.cellSize;
      this.dragState.shape.cells.forEach(([row, col]: [number, number]) => {
        const x = this.dragState.currentX - this.config.cellSize / 2 + col * this.config.cellSize;
        const y = this.dragState.currentY - this.config.cellSize / 2 + row * this.config.cellSize - offsetY;
        this.ctx.fillStyle = COLORS[this.dragState.shape!.color - 1];
        this.ctx.fillRect(x, y, this.config.cellSize - 2, this.config.cellSize - 2);
      });
      if (this.dragState.previewRow >= 0 && this.dragState.isValidPlacement) {
        this.dragState.shape.cells.forEach(([row, col]: [number, number]) => {
          drawCell(this.ctx, this.dragState.previewRow + row, this.dragState.previewCol + col, this.dragState.shape!.color, this.config, 0.5);
        });
      }
    }
    if (this.state.status === 'idle') this.drawOverlay('Tap to Start');
    else if (this.state.status === 'gameover') this.drawOverlay(`Game Over!\nScore: ${this.state.score}\nTap to Restart`);
    
    this.ctx.restore();
  }

  private drawOverlay(text: string): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.config.width, this.config.height);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 32px sans-serif';
    this.ctx.textAlign = 'center';
    const lines = text.split('\n');
    lines.forEach((line, i) => this.ctx.fillText(line, this.config.width / 2, this.config.height / 2 + i * 40));
  }
}
