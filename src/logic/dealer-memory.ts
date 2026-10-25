import type { DealerMemory } from './types';
export function parseDealerMemory(value: unknown): DealerMemory | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || typeof data.mode !== 'string' || !['random', 'assisted', 'challenge'].includes(data.mode) ||
      !Number.isInteger(data.assistStreak) || Number(data.assistStreak) < 0 || Number(data.assistStreak) > 2 ||
      !Number.isInteger(data.challengeStreak) || Number(data.challengeStreak) < 0 || Number(data.challengeStreak) > 1 ||
      !Array.isArray(data.recentFamilies) || data.recentFamilies.length > 6 ||
      data.recentFamilies.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return;
  if ((data.mode !== 'assisted' && data.assistStreak !== 0) || (data.mode !== 'challenge' && data.challengeStreak !== 0)) return;
  if ((data.mode === 'assisted' && data.assistStreak === 0) || (data.mode === 'challenge' && data.challengeStreak !== 1)) return;
  return { version: 1, mode: data.mode as DealerMemory['mode'], assistStreak: Number(data.assistStreak), challengeStreak: Number(data.challengeStreak), recentFamilies: [...data.recentFamilies] };
}
