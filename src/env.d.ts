import type { GameState } from './logic/types';
import type { CanvasConfig } from './renderer/canvas';
import type { GameRenderer } from './renderer';
declare global {
  interface Window {
    blockBlast?: Readonly<{ getState(): GameState; getLayout(): CanvasConfig; getFeedback(): ReturnType<GameRenderer['getFeedback']> }>;
  }
}
export {};
