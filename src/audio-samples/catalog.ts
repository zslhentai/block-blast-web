export type EventGroup = 'place' | 'single' | 'multi' | 'combo';
export type SampleVersion = 'A' | 'B' | 'original';
export interface SampleMetrics { frames: number; duration: number; peak: number; rms: number }
export interface Sample {
  id: string; group: EventGroup; code: string; title: string; note: string; pack: string; author: string;
  official: string; origin: string; repo: string; commit: string; path: string; url: string; gitBlob: string;
  license: string; licenseUrl: string; review: string; files: Record<SampleVersion, string>;
  status: 'new' | 'retained' | 'rejected';
  sha256: Record<SampleVersion, string>; originalMetrics: SampleMetrics;
  previewRange: [number, number]; editedRange: [number, number]; sharedGainDb: number;
  highpassHz: number; lowpassHz: number; eqDbAt3600: number; fadeOutMs: number;
  baselineEndFadeMs: number; stats: Record<'A' | 'B', SampleMetrics>; licenseFile: string;
}
export interface Catalog { version: number; date: string; items: Sample[] }
export const GROUPS: Record<EventGroup, string> = { place: '方块放置', single: '单行消除', multi: '多行消除', combo: 'Combo' };
const range = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2
  && value.every(x => typeof x === 'number' && Number.isFinite(x)) && value[0] >= 0 && value[1] > value[0];
export function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<Catalog>;
  if (catalog.version !== 1 || typeof catalog.date !== 'string' || !Array.isArray(catalog.items) || !catalog.items.length) return false;
  const ids = new Set<string>();
  return catalog.items.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const s = item as Sample;
    if (typeof s.id !== 'string' || ids.has(s.id) || !/^[a-z0-9-]+$/.test(s.id)) return false;
    ids.add(s.id);
    return Object.hasOwn(GROUPS, s.group) && ['new','retained','rejected'].includes(s.status) && ['code','title','note','pack','author','origin','review','licenseFile'].every(key => typeof (s as unknown as Record<string, unknown>)[key] === 'string')
      && s.license === 'CC0-1.0' && [s.official, s.url, s.licenseUrl].every(url => typeof url === 'string' && url.startsWith('https://'))
      && ['A','B','original'].every(key => typeof s.files?.[key as SampleVersion] === 'string'
        && /^(preview|edited|original)\/[a-z0-9-]+\.(wav|ogg)$/.test(s.files[key as SampleVersion])
        && /^[a-f0-9]{64}$/.test(s.sha256?.[key as SampleVersion]))
      && ['A','B'].every(key => {
        const stats = s.stats?.[key as 'A' | 'B'];
        return stats && Number.isFinite(stats.duration) && stats.duration > 0 && stats.duration < 3
          && Number.isFinite(stats.peak) && stats.peak > 0 && stats.peak <= 0.331;
      }) && range(s.previewRange) && range(s.editedRange)
      && s.editedRange[0] === s.previewRange[0] && s.editedRange[1] <= s.previewRange[1]
      && [s.sharedGainDb, s.highpassHz, s.lowpassHz, s.eqDbAt3600, s.fadeOutMs, s.originalMetrics?.duration].every(Number.isFinite)
      && s.lowpassHz > s.highpassHz && /^licenses\/[a-z]+-CC0\.txt$/.test(s.licenseFile);
  });
}
export function processingSummary(s: Sample): string {
  return `取 ${s.editedRange[0].toFixed(3)}–${s.editedRange[1].toFixed(3)} 秒；高通 ${s.highpassHz} Hz，低通 ${s.lowpassHz} Hz；${s.eqDbAt3600 ? `3.6 kHz 削减 ${Math.abs(s.eqDbAt3600)} dB；` : '无额外频段削减；'}2 ms 淡入、${s.fadeOutMs} ms 淡出。无变调、无新合成、无叠层。`;
}
