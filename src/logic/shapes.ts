import { Shape, COLORS } from './types';

// Block Blast style shapes (various sizes and configurations)
const SHAPE_DEFINITIONS: [number, number][][] = [
  // Single block
  [[0, 0]],
  // Domino - horizontal
  [[0, 0], [0, 1]],
  // Domino - vertical
  [[0, 0], [1, 0]],
  // Triple - horizontal
  [[0, 0], [0, 1], [0, 2]],
  // Triple - vertical
  [[0, 0], [1, 0], [2, 0]],
  // L-shape (3 blocks)
  [[0, 0], [1, 0], [1, 1]],
  // L-shape mirrored
  [[0, 0], [0, 1], [1, 0]],
  // 2x2 square
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  // T-shape
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  // S-shape
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  // Z-shape
  [[0, 0], [0, 1], [1, 1], [1, 2]],
  // Line - 4 blocks
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  // Line - 5 blocks
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  // Big L (4 blocks)
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  // Big L mirrored
  [[0, 0], [0, 1], [0, 2], [1, 0]],
  // Cross
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  // 2x3 rectangle
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
  // 3x3 square
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
];

let shapeIdCounter = 0;

export function rotateShape(cells: [number, number][], rotation: number): [number, number][] {
  if (rotation === 0) return cells;

  return cells.map(([row, col]) => {
    switch (rotation) {
      case 1: return [col, -row];
      case 2: return [-row, -col];
      case 3: return [-col, row];
      default: return [row, col];
    }
  });
}

export function createRandomShape(): Shape {
  const cells = SHAPE_DEFINITIONS[Math.floor(Math.random() * SHAPE_DEFINITIONS.length)];
  const color = Math.floor(Math.random() * COLORS.length) + 1;
  const rotation = Math.floor(Math.random() * 4);
  const rotatedCells = rotateShape(cells as [number, number][], rotation);

  const minRow = Math.min(...rotatedCells.map(([r]) => r));
  const minCol = Math.min(...rotatedCells.map(([_, c]) => c));
  const normalizedCells = rotatedCells.map(([r, c]) => [r - minRow, c - minCol] as [number, number]);

  return {
    id: `shape-${++shapeIdCounter}`,
    cells: normalizedCells,
    color,
  };
}

export function createShapes(count: number): Shape[] {
  return Array.from({ length: count }, () => createRandomShape());
}
