import { type Shape, COLORS } from './types';

type Cells = [number, number][];
type Group = 'small' | 'medium' | 'large';
interface Template { group: Group; cells: Cells }
// Upstream templates, normalized and deduplicated; add the missing mirrored L
// and large corners. The unverified cross piece is omitted from classic mode.
const SHAPE_DEFINITIONS: Template[] = [
  { group: 'small', cells: [[0, 0]] },
  { group: 'small', cells: [[0, 0], [0, 1]] },
  { group: 'small', cells: [[0, 0], [0, 1], [0, 2]] },
  { group: 'small', cells: [[0, 0], [1, 0], [1, 1]] },
  { group: 'medium', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { group: 'medium', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { group: 'medium', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { group: 'medium', cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { group: 'medium', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { group: 'medium', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { group: 'medium', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { group: 'large', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { group: 'large', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { group: 'large', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
  { group: 'large', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
];

export function rotateShape(cells: Cells, rotation: number): Cells {
  return cells.map(([r, c]) => {
    switch (rotation % 4) {
      case 1: return [c, -r];
      case 2: return [-r, -c];
      case 3: return [-c, r];
      default: return [r, c];
    }
  });
}
export function normalize(cells: Cells): Cells {
  const minRow = Math.min(...cells.map(([r]) => r));
  const minCol = Math.min(...cells.map(([, c]) => c));
  return cells.map(([r, c]): [number, number] => [r - minRow, c - minCol])
    .sort(([a, b], [c, d]) => a - c || b - d);
}
export function shapeKey(cells: Cells): string { return JSON.stringify(normalize(cells)); }

export const CATALOGUE = SHAPE_DEFINITIONS.flatMap((template, family) => {
  const unique = new Map<string, Cells>();
  for (let r = 0; r < 4; r++) {
    const cells = normalize(rotateShape(template.cells, r));
    unique.set(shapeKey(cells), cells);
  }
  return [...unique.entries()].map(([key, cells]) => ({
    key, cells, group: template.group, family, orientations: unique.size,
  }));
});

export function createRandomShape(
  random: () => number, id: string, round = 1,
  allowed = CATALOGUE,
): Shape {
  const progress = Math.max(0, Math.min(1, (round - 10) / 20));
  const groups = { small: 0.35 - 0.05 * progress, medium: 0.55, large: 0.10 + 0.05 * progress };
  const weight = (entry: typeof CATALOGUE[number]) =>
    groups[entry.group] / SHAPE_DEFINITIONS.filter(t => t.group === entry.group).length / entry.orientations;
  let position = random() * allowed.reduce((total, entry) => total + weight(entry), 0);
  let chosen = allowed[allowed.length - 1];
  for (const entry of allowed) {
    position -= weight(entry);
    if (position < 0) { chosen = entry; break; }
  }
  if (!chosen) throw new Error('Cannot choose from an empty catalogue');
  // Cosmetic color never consumes the gameplay RNG stream. Changing a palette
  // in the visual phase must not alter subsequent shapes in a saved game.
  let colorHash = 2166136261;
  for (const ch of id) colorHash = Math.imul(colorHash ^ ch.charCodeAt(0), 16777619);
  return { id, cells: chosen.cells.map(([r, c]) => [r, c]), color: (colorHash >>> 0) % COLORS.length + 1 };
}

export function createShapes(count: number, random: () => number, round = 1, prefix = 'shape'): Shape[] {
  const selected = new Set<string>();
  return Array.from({ length: count }, (_, i) => {
    const shape = createRandomShape(random, `${prefix}-${i}`, round, CATALOGUE.filter(e => !selected.has(e.key)));
    selected.add(shapeKey(shape.cells));
    return shape;
  });
}
