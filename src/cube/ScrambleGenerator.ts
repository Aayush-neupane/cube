import { FACES, Face } from './types';

const SUFFIXES = ['', "'", '2'];

function axisOf(face: Face): 'x' | 'y' | 'z' {
  if (face === 'R' || face === 'L') return 'x';
  if (face === 'U' || face === 'D') return 'y';
  return 'z';
}

export function generateScramble(length = 20, rng: () => number = Math.random): string[] {
  const moves: string[] = [];
  let prevFace: Face | null = null;
  let prevAxis: string | null = null;

  while (moves.length < length) {
    const face = FACES[Math.floor(rng() * FACES.length)];
    const axis = axisOf(face);
    // Avoid same face consecutively
    if (face === prevFace) continue;
    // Avoid same axis consecutively (prevents R L, U D redundancies)
    if (axis === prevAxis) continue;
    const suffix = SUFFIXES[Math.floor(rng() * SUFFIXES.length)];
    moves.push(`${face}${suffix}`);
    prevFace = face;
    prevAxis = axis;
  }
  return moves;
}

export function scrambleToString(moves: string[]): string {
  return moves.join(' ');
}

export function parseScrambleString(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}
