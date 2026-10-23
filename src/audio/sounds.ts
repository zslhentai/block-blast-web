type SoundType = 'place' | 'placeFail' | 'clear' | 'clearDouble' | 'clearTriple' | 'clearMega' | 'combo' | 'gameover';

import { loadGameData, saveGameData } from '../storage/localStorage';

class SoundManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = false;
  private bgMusicEnabled: boolean = false;
  private bgMusicGain: GainNode | null = null;
  private currentBgMusicTimeout: ReturnType<typeof setTimeout> | null = null;

  private tempoMultiplier: number = 1.0;
  private tempoChangeStack: { multiplier: number; endTime: number }[] = [];
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;
  private nextNoteIndex: number = 0;
  private nextBassIndex: number = 0;
  private musicStartTime: number = 0;
  private currentLoop: number = 0;
  private isPlaying: boolean = false;

  private readonly BASE_TEMPO = 120;
  private readonly LOOKAHEAD = 0.1;
  private readonly SCHEDULE_INTERVAL = 25;

  async init(): Promise<void> {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Resume audio context if it's suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // Create background music gain node
    this.bgMusicGain = this.audioContext.createGain();
    this.bgMusicGain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
    this.bgMusicGain.connect(this.audioContext.destination);
    
    // Load bg music setting from localStorage
    const savedData = loadGameData();
    this.bgMusicEnabled = savedData.settings.bgMusicEnabled;
    
    this.enabled = true;
    
    // Start bg music if it was enabled
    if (this.bgMusicEnabled) {
      this.playRandomBgMusic();
    }
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  
  isBgMusicEnabled(): boolean { return this.bgMusicEnabled; }
  
  setBgMusicEnabled(enabled: boolean): void {
    this.bgMusicEnabled = enabled;
    
    // Save to localStorage
    const savedData = loadGameData();
    savedData.settings.bgMusicEnabled = enabled;
    saveGameData(savedData);
    
    if (enabled && this.enabled && this.bgMusicGain) {
      this.playRandomBgMusic();
    } else {
      this.stopBgMusic();
    }
  }
  
  private stopBgMusic(): void {
    if (this.currentBgMusicTimeout) {
      clearTimeout(this.currentBgMusicTimeout);
      this.currentBgMusicTimeout = null;
    }
    if (this.scheduleBgMusicTimeout) {
      clearTimeout(this.scheduleBgMusicTimeout);
      this.scheduleBgMusicTimeout = null;
    }
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.isPlaying = false;
    this.tempoMultiplier = 1.0;
    this.tempoChangeStack = [];
  }
  
  private readonly NOTE_FREQS: { [key: string]: number } = {
    'B3': 246.94, 'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
    'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51,
    'E3': 164.81, 'G3': 196.00, 'A2': 110.00, 'B2': 123.47, 'C3': 130.81, 'D3': 146.83, 'G2': 98.00,
    'F#3': 185.00, 'A3': 220.00
  };

  private scheduleBgMusicTimeout: ReturnType<typeof setTimeout> | null = null;
  private targetTempoMultiplier: number = 1.0;

  applyTempoChange(linesCleared: number): void {
    if (!this.isPlaying || !this.audioContext) return;
    
    const newMultiplier = 1.1 + 0.2 * linesCleared;
    const duration = 5 + linesCleared * 5;
    const now = this.audioContext.currentTime;
    
    if (this.tempoChangeStack.length > 0) {
      const maxCurrentMultiplier = Math.max(...this.tempoChangeStack.map(t => t.multiplier));
      const effectiveMultiplier = Math.max(maxCurrentMultiplier, newMultiplier);
      
      this.tempoChangeStack = this.tempoChangeStack.map(t => ({
        ...t,
        multiplier: effectiveMultiplier,
        endTime: now + duration
      }));
    } else {
      this.tempoChangeStack.push({ multiplier: newMultiplier, endTime: now + duration });
    }
    
    this.targetTempoMultiplier = newMultiplier;
    this.updateEffectiveTempo();
  }

  private updateEffectiveTempo(): void {
    const now = this.audioContext!.currentTime;
    this.tempoChangeStack = this.tempoChangeStack.filter(t => t.endTime > now);
    
    if (this.tempoChangeStack.length > 0) {
      const maxMultiplier = Math.max(...this.tempoChangeStack.map(t => t.multiplier));
      this.targetTempoMultiplier = maxMultiplier;
    } else {
      this.targetTempoMultiplier = 1.0;
    }
  }

  private updateTempoSmoothly(): void {
    if (this.tempoMultiplier < this.targetTempoMultiplier) {
      this.tempoMultiplier = this.targetTempoMultiplier;
    } else if (this.tempoMultiplier > this.targetTempoMultiplier) {
      this.tempoMultiplier += (this.targetTempoMultiplier - this.tempoMultiplier) * 0.05;
    }
  }

  private readonly melodyData = [
    // --- A段：经典的上升序列 (16小节) ---
    { n: 'C4', d: 1 }, { n: 'C4', d: 1 }, { n: 'E4', d: 1 }, { n: 'G4', d: 1 }, { n: 'G4', d: 2 }, { n: 'G5', d: 1 }, { n: 'G5', d: 2 }, { n: 'E5', d: 1 }, { n: 'E5', d: 2 },
    { n: 'C4', d: 1 }, { n: 'C4', d: 1 }, { n: 'E4', d: 1 }, { n: 'G4', d: 1 }, { n: 'G4', d: 2 }, { n: 'F5', d: 1 }, { n: 'F5', d: 2 }, { n: 'D5', d: 1 }, { n: 'D5', d: 2 },
    { n: 'G3', d: 1 }, { n: 'G3', d: 1 }, { n: 'B3', d: 1 }, { n: 'D4', d: 1 }, { n: 'D4', d: 2 }, { n: 'F5', d: 1 }, { n: 'F5', d: 2 }, { n: 'D5', d: 1 }, { n: 'D5', d: 2 },
    { n: 'G3', d: 1 }, { n: 'G3', d: 1 }, { n: 'B3', d: 1 }, { n: 'D4', d: 1 }, { n: 'D4', d: 2 }, { n: 'E5', d: 1 }, { n: 'E5', d: 2 }, { n: 'C5', d: 1 }, { n: 'C5', d: 2 },

    // --- B段：优雅的下行与转折 (16小节) ---
    { n: 'C5', d: 1 }, { n: 'C5', d: 1 }, { n: 'C5', d: 1 }, { n: 'C5', d: 2 }, { n: 'E5', d: 1 }, { n: 'G5', d: 2 }, { n: 'G5', d: 1 }, { n: 'F5', d: 3 },
    { n: 'B4', d: 1 }, { n: 'B4', d: 1 }, { n: 'B4', d: 1 }, { n: 'B4', d: 2 }, { n: 'D5', d: 1 }, { n: 'G5', d: 2 }, { n: 'G5', d: 1 }, { n: 'E5', d: 3 },
    { n: 'C5', d: 1 }, { n: 'C5', d: 1 }, { n: 'C5', d: 1 }, { n: 'C5', d: 2 }, { n: 'E5', d: 1 }, { n: 'A5', d: 2 }, { n: 'A5', d: 1 }, { n: 'G5', d: 2 }, { n: 'F5', d: 1 },
    { n: 'E5', d: 1 }, { n: 'D5', d: 1 }, { n: 'G4', d: 1 }, { n: 'B4', d: 1 }, { n: 'D5', d: 1 }, { n: 'F5', d: 1 }, { n: 'E5', d: 2 }, { n: 'D5', d: 1 }, { n: 'C5', d: 3 }
  ];

  private readonly bassData = [
    // A段：16小节
    { n: 'G2', d: 3 }, { n: 'G2', d: 3 }, { n: 'G2', d: 3 }, { n: 'G2', d: 3 },
    { n: 'C3', d: 3 }, { n: 'C3', d: 3 }, { n: 'C3', d: 3 }, { n: 'C3', d: 3 },
    { n: 'D3', d: 3 }, { n: 'D3', d: 3 }, { n: 'D3', d: 3 }, { n: 'D3', d: 3 },
    { n: 'G2', d: 3 }, { n: 'G2', d: 3 }, { n: 'G2', d: 3 }, { n: 'G2', d: 3 },
    // B段：16小节
    { n: 'C3', d: 3 }, { n: 'C3', d: 3 }, { n: 'C3', d: 3 }, { n: 'C3', d: 3 },
    { n: 'G2', d: 3 }, { n: 'G2', d: 3 }, { n: 'G2', d: 3 }, { n: 'G2', d: 3 },
    { n: 'A2', d: 3 }, { n: 'A2', d: 3 }, { n: 'A2', d: 3 }, { n: 'A2', d: 3 },
    { n: 'D3', d: 3 }, { n: 'D3', d: 3 }, { n: 'G2', d: 3 }, { n: 'G2', d: 3 },
  ];

  private readonly melodyTotalBeats = this.melodyData.reduce((acc, curr) => acc + curr.d, 0);

  private nextMelodyTime: number = 0;
  private nextBassTime: number = 0;
  private melodyInProgress: boolean = false;
  private bassInProgress: boolean = false;

  private playRussianFolkTheme(): void {
    if (!this.audioContext || !this.bgMusicGain) return;
    
    this.isPlaying = true;
    this.tempoMultiplier = 1.0;
    this.tempoChangeStack = [];
    this.musicStartTime = this.audioContext.currentTime;
    this.nextMelodyTime = this.musicStartTime;
    this.nextBassTime = this.musicStartTime;
    this.currentLoop = 0;
    this.nextNoteIndex = 0;
    this.nextBassIndex = 0;
    this.melodyInProgress = false;
    this.bassInProgress = false;

    this.schedulerInterval = setInterval(() => this.musicScheduler(), this.SCHEDULE_INTERVAL);
  }

  private musicScheduler(): void {
    if (!this.isPlaying || !this.audioContext || !this.bgMusicGain) return;

    this.updateEffectiveTempo();
    this.updateTempoSmoothly();
    const ctx = this.audioContext;
    const currentTime = ctx.currentTime;
    const quarterNoteTime = (60 / this.BASE_TEMPO) / this.tempoMultiplier;

    while (this.nextMelodyTime < currentTime + this.LOOKAHEAD) {
      const note = this.melodyData[this.nextNoteIndex];
      const dur = note.d * quarterNoteTime;
      this.scheduleNote(note.n, dur, this.nextMelodyTime, 'square', 0.25);
      this.nextMelodyTime += dur;
      this.nextNoteIndex++;
      if (this.nextNoteIndex >= this.melodyData.length) {
        this.nextNoteIndex = 0;
        this.currentLoop++;
      }
    }

    const melodyTotalTime = this.melodyTotalBeats * quarterNoteTime;
    const loopStartTime = this.musicStartTime + (this.currentLoop - 1) * melodyTotalTime;
    const bassLoopDuration = this.bassData.reduce((acc, curr) => acc + curr.d, 0) * quarterNoteTime;

    while (this.nextBassTime < currentTime + this.LOOKAHEAD) {
      const expectedBassTime = loopStartTime + (this.nextBassTime - loopStartTime) % bassLoopDuration;
      if (this.nextBassTime >= loopStartTime - 0.1) {
        const note = this.bassData[this.nextBassIndex];
        const dur = note.d * quarterNoteTime;
        this.scheduleNote(note.n, dur, this.nextBassTime, 'triangle', 0.35);
        this.nextBassTime += dur;
        this.nextBassIndex++;
        if (this.nextBassIndex >= this.bassData.length) {
          this.nextBassIndex = 0;
        }
      } else {
        this.nextBassTime += quarterNoteTime;
      }
    }
  }

  private scheduleNote(note: string | null, duration: number, time: number, type: 'square' | 'triangle' | 'sawtooth', volume: number): void {
    if (!note || !this.audioContext || !this.bgMusicGain) return;
    const freq = this.NOTE_FREQS[note];
    if (!freq) return;

    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.05);
    gain.gain.linearRampToValueAtTime(volume * 0.7, time + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.9);

    osc.connect(gain);
    gain.connect(this.bgMusicGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  private playRandomBgMusic(): void {
    if (!this.bgMusicEnabled || !this.enabled || !this.audioContext || !this.bgMusicGain) return;
    this.playRussianFolkTheme();
  }
  
  private createOscillator(frequency: number, type: OscillatorType, startTime: number, duration: number, ctx: AudioContext): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(frequency, startTime);
    osc.type = type;
    return osc;
  }

  private createGain(value: number, startTime: number, ctx: AudioContext): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(value, startTime);
    return gain;
  }

  play(type: SoundType): void {
    if (!this.enabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    
    switch (type) {
      case 'place': {
        const osc = this.createOscillator(1200, 'sine', now, 0.08, ctx);
        const gain = this.createGain(0.15, now, ctx);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
      
      case 'placeFail': {
        const osc = this.createOscillator(150, 'sawtooth', now, 0.3, ctx);
        const gain = this.createGain(0.1, now, ctx);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      
      case 'clear': {
        // Single line clear - satisfying pop
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, i) => {
          const osc = this.createOscillator(freq, 'triangle', now + i * 0.05, 0.3, ctx);
          const gain = this.createGain(0.2, now + i * 0.05, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.05);
          osc.stop(now + i * 0.05 + 0.3);
        });
        break;
      }
      
      case 'clearDouble': {
        // Double line - rising arpeggio with harmony
        const baseNotes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        const harmonyNotes = [659.25, 783.99, 1046.50, 1318.51]; // E5, G5, C6, E6
        
        baseNotes.forEach((freq, i) => {
          const osc = this.createOscillator(freq, 'triangle', now + i * 0.04, 0.4, ctx);
          const gain = this.createGain(0.25, now + i * 0.04, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.04);
          osc.stop(now + i * 0.04 + 0.4);
        });
        
        harmonyNotes.forEach((freq, i) => {
          const osc = this.createOscillator(freq, 'sine', now + i * 0.04 + 0.02, 0.35, ctx);
          const gain = this.createGain(0.15, now + i * 0.04 + 0.02, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.37);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.04 + 0.02);
          osc.stop(now + i * 0.04 + 0.37);
        });
        break;
      }
      
      case 'clearTriple': {
        // Triple line - triumphant fanfare
        const chord1 = [523.25, 659.25, 783.99]; // C major
        const chord2 = [659.25, 783.99, 1046.50]; // E minor
        const chord3 = [783.99, 1046.50, 1318.51]; // G major
        
        // First chord with impact
        chord1.forEach(freq => {
          const osc = this.createOscillator(freq, 'triangle', now, 0.5, ctx);
          const gain = this.createGain(0.3, now, ctx);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.5);
        });
        
        // Second chord
        chord2.forEach(freq => {
          const osc = this.createOscillator(freq, 'triangle', now + 0.15, 0.4, ctx);
          const gain = this.createGain(0.25, now + 0.15, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + 0.15);
          osc.stop(now + 0.55);
        });
        
        // Third chord - climax
        chord3.forEach(freq => {
          const osc = this.createOscillator(freq, 'triangle', now + 0.3, 0.6, ctx);
          const gain = this.createGain(0.35, now + 0.3, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + 0.3);
          osc.stop(now + 0.9);
        });
        
        // Add sparkle high notes
        const sparkleNotes = [2093, 2637, 3136, 4186]; // C7, E7, G7, C8
        sparkleNotes.forEach((freq, i) => {
          const osc = this.createOscillator(freq, 'sine', now + 0.4 + i * 0.03, 0.3, ctx);
          const gain = this.createGain(0.1, now + 0.4 + i * 0.03, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7 + i * 0.03);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + 0.4 + i * 0.03);
          osc.stop(now + 0.7 + i * 0.03);
        });
        break;
      }
      
      case 'clearMega': {
        // Mega clear (4+ lines) - EPIC CELEBRATION
        const now = ctx.currentTime;
        
        // Bass drop impact
        const bassOsc = this.createOscillator(60, 'sawtooth', now, 1.0, ctx);
        const bassGain = this.createGain(0.4, now, ctx);
        bassOsc.frequency.exponentialRampToValueAtTime(30, now + 1.0);
        bassGain.gain.setValueAtTime(0.4, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        bassOsc.connect(bassGain);
        bassGain.connect(ctx.destination);
        bassOsc.start(now);
        bassOsc.stop(now + 1.0);
        
        // Rising power chord
        const powerChord = [261.63, 392.00, 523.25]; // C4, G4, C5
        [0, 0.1, 0.2, 0.3].forEach((delay, idx) => {
          const mult = 1 + idx * 0.5;
          powerChord.forEach(freq => {
            const osc = this.createOscillator(freq * mult, 'triangle', now + delay, 0.8, ctx);
            const gain = this.createGain(0.3 - idx * 0.05, now + delay, ctx);
            gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.8);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + 0.8);
          });
        });
        
        // Fast arpeggio cascade
        const cascadeNotes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00, 2637.02];
        cascadeNotes.forEach((freq, i) => {
          const osc = this.createOscillator(freq, 'sine', now + 0.3 + i * 0.02, 0.4, ctx);
          const gain = this.createGain(0.15, now + 0.3 + i * 0.02, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7 + i * 0.02);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + 0.3 + i * 0.02);
          osc.stop(now + 0.7 + i * 0.02);
        });
        
        // Victory shimmer
        const shimmerNotes = [4186.01, 5274.04, 6271.93, 8372.02];
        shimmerNotes.forEach((freq, i) => {
          const osc = this.createOscillator(freq, 'sine', now + 0.5 + i * 0.05, 0.5, ctx);
          const gain = this.createGain(0.08, now + 0.5 + i * 0.05, ctx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0 + i * 0.05);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + 0.5 + i * 0.05);
          osc.stop(now + 1.0 + i * 0.05);
        });
        break;
      }
      
      case 'gameover': {
        // 四段式下降悲伤音效
        const stages = [
          { freq: 400, duration: 0.4, type: 'sawtooth' as OscillatorType, vol: 0.3 },
          { freq: 300, duration: 0.4, type: 'sawtooth' as OscillatorType, vol: 0.25 },
          { freq: 200, duration: 0.4, type: 'sawtooth' as OscillatorType, vol: 0.2 },
          { freq: 100, duration: 0.5, type: 'sawtooth' as OscillatorType, vol: 0.15 },
        ];
        
        let timeOffset = 0;
        stages.forEach((stage) => {
          const osc = ctx.createOscillator();
          osc.frequency.setValueAtTime(stage.freq, now + timeOffset);
          osc.frequency.exponentialRampToValueAtTime(stage.freq * 0.7, now + timeOffset + stage.duration);
          osc.type = stage.type;

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.001, now + timeOffset);
          gain.gain.linearRampToValueAtTime(stage.vol, now + timeOffset + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + stage.duration);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + timeOffset);
          osc.stop(now + timeOffset + stage.duration);
          
          timeOffset += stage.duration - 0.05; // 轻微重叠
        });
        break;
      }
    }
  }
  
  // Helper to determine which clear sound to play based on line count
  playClear(linesCleared: number): void {
    if (linesCleared >= 4) {
      this.play('clearMega');
    } else if (linesCleared === 3) {
      this.play('clearTriple');
    } else if (linesCleared === 2) {
      this.play('clearDouble');
    } else {
      this.play('clear');
    }
    
    if (linesCleared > 0) {
      this.applyTempoChange(linesCleared);
    }
  }
}

export const soundManager = new SoundManager();
