import type { GameState } from './logic/types';
import type { CanvasConfig } from './renderer/canvas';
import type { GameRenderer } from './renderer';
import type { GameAudioFeedback } from './audio/game-feedback';
import type { AlgorithmDiagnostics } from './dev/algorithms';
declare global {
  interface Window {
    blockBlastAlgorithms?: AlgorithmDiagnostics;
    blockBlast?: Readonly<{ getState(): GameState; getLayout(): CanvasConfig; getFeedback(): ReturnType<GameRenderer['getFeedback']>;getAudio():ReturnType<GameAudioFeedback['snapshot']> }>;
  }
}
export {};
