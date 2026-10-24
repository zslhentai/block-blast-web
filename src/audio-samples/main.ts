import '../audio-lab/style.css';
import './style.css';
import { GROUPS, isCatalog, processingSummary } from './catalog';
import type { EventGroup, Sample, SampleVersion } from './catalog';
import { SamplePlayer } from './player';
const base = new URL('../audio-samples/', location.href).href;
const status = document.querySelector<HTMLElement>('#sample-status')!;
const notice = document.querySelector<HTMLElement>('#catalog-status')!;
const audio = document.querySelector<HTMLAudioElement>('#sample-audio')!;
const player = new SamplePlayer(audio, message => { status.textContent = message; });
let selected: EventGroup = 'place';
const list = document.querySelector('#sample-list')!;
const tabs = document.querySelector('#groups')!;
const groups = new Map<EventGroup, HTMLElement>();
for (const [key, label] of Object.entries(GROUPS)) {
  const group = key as EventGroup;
  const button = document.createElement('button'); button.textContent = label;
  button.dataset.testid = `group-${group}`; button.setAttribute('aria-pressed', String(group === selected));
  button.addEventListener('click', () => {
    player.stop(); selected = group;
    for (const [name, section] of groups) section.hidden = name !== selected;
    for (const tab of tabs.querySelectorAll('button')) tab.setAttribute('aria-pressed', String(tab === button));
  });
  tabs.append(button);
}
function addLink(parent: HTMLElement, text: string, href: string, testid: string, download = false): void {
  const link = document.createElement('a'); link.textContent = text; link.href = href; link.dataset.testid = testid;
  if (download) link.download = href.split('/').at(-1)!;
  else { link.target = '_blank'; link.rel = 'noopener'; }
  parent.append(link);
}
function card(sample: Sample): HTMLElement {
  const article = document.createElement('article'); article.dataset.testid = `card-${sample.code}`;
  const code = document.createElement('div'); code.className = 'number'; code.textContent = `${sample.code} · ${sample.pack}`;
  const heading = document.createElement('h2'); heading.textContent = sample.title;
  const note = document.createElement('p'); note.textContent = sample.note;
  const timing = document.createElement('span'); timing.className = 'tag'; timing.textContent = `A ${sample.stats.A.duration.toFixed(2)} s · B ${sample.stats.B.duration.toFixed(2)} s · ${sample.license}`;
  article.append(code, heading, note, timing);
  const actions = document.createElement('div'); actions.className = 'actions';
  const track = (version: SampleVersion) => ({ url: base + sample.files[version], label: `${sample.code} · ${version === 'A' ? 'A 原声选段' : version === 'B' ? 'B 加工版' : '完整原文件'}`, original: version === 'original' });
  for (const [mode, label] of [['A','听 A · 原声选段'],['B','听 B · 加工版'],['AB','A → B'],['BA','B → A']] as const) {
    const button = document.createElement('button'); button.textContent = label; button.dataset.testid = `${sample.code}-${mode}`;
    if (mode !== 'B') button.className = 'secondary';
    button.addEventListener('click', () => { void player.play(mode === 'AB' ? [track('A'), track('B')] : mode === 'BA' ? [track('B'), track('A')] : [track(mode)]); });
    actions.append(button);
  }
  article.append(actions);
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = '来源、加工与完整文件'; summary.dataset.testid = `${sample.code}-details`;
  const metadata = document.createElement('div'); metadata.className = 'sample-meta';
  const source = document.createElement('p'); source.textContent = `${sample.author} · ${sample.origin}。副本文件：${sample.path.split('/').at(-1)}。`;
  const recipe = document.createElement('p'); recipe.textContent = processingSummary(sample);
  const gain = document.createElement('p'); gain.textContent = `A/B 共同试听增益 ${sample.sharedGainDb >= 0 ? '+' : ''}${sample.sharedGainDb.toFixed(1)} dB；原文件时长 ${sample.originalMetrics.duration.toFixed(2)} 秒。原始文件保留来源字节和 SHA-256。`;
  const links = document.createElement('div'); links.className = 'sample-links';
  addLink(links, '素材官方页', sample.official, `${sample.code}-source`);
  addLink(links, '取得文件的固定提交', `https://github.com/${sample.repo}/blob/${sample.commit}/${sample.path.split('/').map(encodeURIComponent).join('/')}`, `${sample.code}-mirror`);
  addLink(links, 'CC0 许可副本', base + sample.licenseFile, `${sample.code}-license`);
  addLink(links, '下载原文件', base + sample.files.original, `${sample.code}-download-original`, true);
  addLink(links, '下载加工版', base + sample.files.B, `${sample.code}-download-edited`, true);
  const original = document.createElement('button'); original.className = 'secondary'; original.textContent = '听完整原文件 · 原始电平'; original.dataset.testid = `${sample.code}-original`;
  original.addEventListener('click', () => { void player.play([track('original')]); });
  metadata.append(source, recipe, gain, links, original); details.append(summary, metadata); article.append(details);
  return article;
}
async function load(): Promise<void> {
  try {
    const response = await fetch(base + 'catalog.json'); if (!response.ok) throw new Error('Catalog unavailable');
    const value: unknown = await response.json(); if (!isCatalog(value)) throw new Error('Invalid catalog');
    for (const [key, label] of Object.entries(GROUPS)) {
      const group = key as EventGroup; const section = document.createElement('section'); section.hidden = group !== selected;
      section.setAttribute('aria-label', label); section.className = 'sample-cards';
      for (const sample of value.items.filter(item => item.group === group)) section.append(card(sample));
      groups.set(group, section); list.append(section);
    }
    notice.textContent = `${value.items.length} 个现成素材初筛 · 全部 CC0 · 人工听审待确认`;
  } catch { notice.textContent = '素材目录未能加载，请刷新后重试。'; }
}
void load();
document.querySelector('#sample-stop')!.addEventListener('click', () => player.stop());
document.addEventListener('visibilitychange', () => { if (document.hidden) player.stop('已停止 · 返回后点击版本继续'); });
window.addEventListener('pagehide', () => player.stop());
Object.defineProperty(window, 'blockBlastSamples', { value: Object.freeze({ snapshot: () => player.snapshot() }) });
