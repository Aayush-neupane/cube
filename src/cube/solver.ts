import { invertMove, parseMove } from './types';

/**
 * Solver helpers.
 *
 * The app tracks a "trail": the simplified net sequence of moves from the
 * solved state to the current state. Because every cube move is reversible,
 * the solution from ANY state is always just the reverse + inverse of the
 * trail — exact for every scramble, even after the user makes extra moves.
 */

function norm4(q: number): number {
  return ((q % 4) + 4) % 4;
}

/**
 * Merge two moves on the same base (e.g. R + R' -> cancel, R + R -> R2).
 * Returns the merged move, '' when they cancel out, or null for different bases.
 */
export function mergePair(a: string, b: string): string | null {
  let pa, pb;
  try {
    pa = parseMove(a);
    pb = parseMove(b);
  } catch {
    return null;
  }
  if (pa.base !== pb.base) return null;
  const total = norm4(pa.quarter + pb.quarter);
  if (total === 0) return '';
  const baseQ = norm4(parseMove(pa.base).quarter);
  if (total === baseQ) return pa.base;
  if (total === norm4(-parseMove(pa.base).quarter)) return `${pa.base}'`;
  return `${pa.base}2`; // total === 2
}

/** Cancel/merge adjacent same-face moves across a whole sequence. */
export function simplifyMoves(moves: string[]): string[] {
  const stack: string[] = [];
  for (const m of moves) {
    let cur: string | null = m;
    while (cur !== null) {
      const top = stack[stack.length - 1];
      if (top === undefined) {
        stack.push(cur);
        break;
      }
      const merged = mergePair(top, cur);
      if (merged === null) {
        stack.push(cur);
        break;
      }
      stack.pop();
      cur = merged === '' ? null : merged;
    }
  }
  return stack;
}

/** Append moves to a trail, keeping it simplified. */
export function pushTrail(trail: string[], moves: string[]): string[] {
  if (moves.length === 0) return trail;
  return simplifyMoves([...trail, ...moves]);
}

/** Exact solution for a trail: reverse order, invert each move. */
export function solutionForTrail(trail: string[]): string[] {
  return trail
    .slice()
    .reverse()
    .map((m) => {
      try {
        return invertMove(m);
      } catch {
        return m;
      }
    });
}

const FACE_NAMES: Record<string, string> = {
  U: 'Top',
  D: 'Bottom',
  L: 'Left',
  R: 'Right',
  F: 'Front',
  B: 'Back',
};

const SLICE_NAMES: Record<string, string> = {
  M: 'Middle layer',
  E: 'Equatorial layer',
  S: 'Standing layer',
};

/** Plain-English instruction for a single move, e.g. "Turn the Right face counter-clockwise". */
export function describeMove(move: string): string {
  let p;
  try {
    p = parseMove(move);
  } catch {
    return `Do ${move}`;
  }
  const faceName = FACE_NAMES[p.base];
  if (!faceName) {
    const sliceName = SLICE_NAMES[p.base];
    if (sliceName) {
      if (p.suffix === '') return `Turn the ${sliceName} clockwise (${p.base})`;
      if (p.suffix === "'") return `Turn the ${sliceName} counter-clockwise (${p.base}')`;
      return `Turn the ${sliceName} a half-turn (180°, ${p.base}2)`;
    }
    // Whole-cube rotation — direction words get confusing, keep the notation.
    return `Rotate the whole cube (${move})`;
  }
  if (p.suffix === '') return `Turn the ${faceName} face clockwise`;
  if (p.suffix === "'") return `Turn the ${faceName} face counter-clockwise`;
  return `Turn the ${faceName} face a half-turn (180°)`;
}
