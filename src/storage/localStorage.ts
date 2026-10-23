interface GameData {
  highScore: number;
  settings: {
    soundEnabled: boolean;
    vibrationEnabled: boolean;
    bgMusicEnabled: boolean;
  };
}

const STORAGE_KEY = 'block-blast-data';

export function loadGameData(): GameData {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('Failed to load game data:', e);
  }
  return { highScore: 0, settings: { soundEnabled: false, vibrationEnabled: false, bgMusicEnabled: false } };
}

export function saveGameData(data: GameData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save game data:', e);
  }
}
