interface BlockMaterial {
  faceTop: string;
  faceBottom: string;
  top: string;
  left: string;
  right: string;
  bottom: string;
  edge: string;
}

// Presentation only: existing board/shape color IDs and save data stay intact.
export const BLOCK_MATERIALS: readonly BlockMaterial[] = [
  { faceTop: '#dc3d40', faceBottom: '#b9232d', top: '#ff8885', left: '#e95758', right: '#96212c', bottom: '#791c29', edge: '#861f2b' },
  { faceTop: '#426aee', faceBottom: '#294bd4', top: '#92baff', left: '#527cf9', right: '#2741ad', bottom: '#1d328d', edge: '#203889' },
  { faceTop: '#27b9df', faceBottom: '#1492c2', top: '#93e8ff', left: '#41c9e8', right: '#117ca6', bottom: '#116182', edge: '#126681' },
  { faceTop: '#64c34d', faceBottom: '#3d9c32', top: '#bcf48c', left: '#86d864', right: '#31882c', bottom: '#286d29', edge: '#29692b' },
  { faceTop: '#f1c43d', faceBottom: '#e0a92b', top: '#ffe994', left: '#ffcf4b', right: '#b67c15', bottom: '#936014', edge: '#996414' },
  { faceTop: '#a264df', faceBottom: '#8046c2', top: '#d4a1ff', left: '#b37ae9', right: '#623193', bottom: '#4d2679', edge: '#50267b' },
  { faceTop: '#f18a2c', faceBottom: '#df6819', top: '#ffca86', left: '#ff9a42', right: '#b44d0d', bottom: '#8f3d0c', edge: '#943f0e' },
];
