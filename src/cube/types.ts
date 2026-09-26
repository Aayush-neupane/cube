export type Axis = 'x' | 'y' | 'z';

export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';

export const FACES: Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];

export const FACE_COLORS: Record<Face, string> = {
  U: '#ffffff', // white top
  D: '#ffd500', // yellow bottom
  F: '#009b48', // green front
  B: '#0046ad', // blue back
  R: '#b71234', // red right (standard: red right when white top green front? actually orange left red right)
  L: '#ff5800', // orange left
};

export type Vec3 = [number, number, number];

export interface Sticker {
  dir: Vec3;      // current normal direction
  homeDir: Vec3;  // solved normal direction
  color: Face;    // which face color (equals homeDir face)
}

export interface Cubie {
  id: string;
  home: Vec3;
  pos: Vec3;
  stickers: Sticker[];
}

export function vecKey(v: Vec3): string {
  return `${v[0]},${v[1]},${v[2]}`;
}

export function dirToFace(d: Vec3): Face {
  if (d[0] === 1) return 'R';
  if (d[0] === -1) return 'L';
  if (d[1] === 1) return 'U';
  if (d[1] === -1) return 'D';
  if (d[2] === 1) return 'F';
  return 'B';
}

export function faceToDir(f: Face): Vec3 {
  switch (f) {
    case 'R': return [1, 0, 0];
    case 'L': return [-1, 0, 0];
    case 'U': return [0, 1, 0];
    case 'D': return [0, -1, 0];
    case 'F': return [0, 0, 1];
    case 'B': return [0, 0, -1];
  }
}

// Rotate integer vector by +/-90deg or 180deg around axis.
// quarter: +1 = +90deg (right-hand rule), -1 = -90deg, 2 = 180deg
export function rotateVec(v: Vec3, axis: Axis, quarter: number): Vec3 {
  const [x, y, z] = v;
  const q = ((quarter % 4) + 4) % 4; // 0..3, 1=+90, 3=-90, 2=180
  if (q === 0) return [x, y, z];
  if (axis === 'x') {
    if (q === 1) return [x, -z, y];
    if (q === 2) return [x, -y, -z];
    return [x, z, -y];
  }
  if (axis === 'y') {
    if (q === 1) return [z, y, -x];
    if (q === 2) return [-x, y, -z];
    return [-z, y, x];
  }
  // z
  if (q === 1) return [-y, x, z];
  if (q === 2) return [-x, -y, z];
  return [y, -x, z];
}

export interface ParsedMove {
  base: Face | 'X' | 'Y' | 'Z' | 'M' | 'E' | 'S';
  suffix: '' | "'" | '2' | "2'";
  axis: Axis;
  layer: number | 'all'; // -1 | 0 | 1 | all
  quarter: number; // +1 | -1 | 2
}

const BASE_AXIS: Record<string, Axis> = {
  R: 'x', L: 'x', X: 'x', M: 'x',
  U: 'y', D: 'y', Y: 'y', E: 'y',
  F: 'z', B: 'z', Z: 'z', S: 'z',
};

// Clockwise quarter-turn as seen from the face (positive = +90 RH).
// R=-1, L=+1, U=-1, D=+1, F=-1, B=+1, X=-1, Y=-1, Z=-1.
// Slices follow their face: M→L, E→D, S→F.
const BASE_QUARTER: Record<string, number> = {
  R: -1, L: 1, U: -1, D: 1, F: -1, B: 1,
  X: -1, Y: -1, Z: -1,
  M: 1, E: 1, S: -1,
};

const BASE_LAYER: Record<string, number | 'all'> = {
  R: 1, L: -1, U: 1, D: -1, F: 1, B: -1,
  X: 'all', Y: 'all', Z: 'all',
  M: 0, E: 0, S: 0,
};

export function parseMove(move: string): ParsedMove {
  const m = move.trim();
  if (!m) throw new Error(`Empty move`);
  const base = m[0].toUpperCase() as ParsedMove['base'];
  const rest = m.slice(1);
  if (!(base in BASE_AXIS)) throw new Error(`Invalid move: ${move}`);
  let suffix = rest as ParsedMove['suffix'];
  if (suffix !== '' && suffix !== "'" && suffix !== '2' && suffix !== "2'") {
    // allow "'2" variant? normalize
    if (suffix === "'2" || suffix === "2'") suffix = "2'";
    else throw new Error(`Invalid move suffix: ${move}`);
  }
  const axis = BASE_AXIS[base];
  const layer = BASE_LAYER[base];
  const baseQ = BASE_QUARTER[base];
  let quarter: number;
  if (suffix === '' ) quarter = baseQ;
  else if (suffix === "'") quarter = -baseQ as number;
  else quarter = 2; // 2 and 2' same
  if (quarter === 3) quarter = -1;
  if (quarter === -3) quarter = 1;
  return { base, suffix, axis, layer, quarter };
}

export function invertMove(move: string): string {
  const p = parseMove(move);
  if (p.suffix === '') return `${p.base}'`;
  if (p.suffix === "'") return `${p.base}`;
  return `${p.base}2`;
}

export function isValidMoveString(move: string): boolean {
  try {
    parseMove(move);
    return true;
  } catch {
    return false;
  }
}

export const ALL_MOVES: string[] = (() => {
  const out: string[] = [];
  for (const f of FACES) {
    out.push(f, `${f}'`, `${f}2`);
  }
  return out;
})();
