import type { GameState } from './logic/types';
import type { CanvasConfig } from './renderer/canvas';
declare global {
  interface Window {
    blockBlast?: Readonly<{ getState(): GameState; getLayout(): CanvasConfig }>;
  }
}
export {};
