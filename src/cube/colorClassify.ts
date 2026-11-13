import { Face } from './types';

export interface RGB { r: number; g: number; b: number; }
/** Perceptual color reading: [L, a, b] (CIELAB, D65). */
export type Lab = [number, number, number];

export interface FrameAnalysis {
  cells: Lab[];
  metrics: OverlayMetrics;
}

export interface OverlayMetrics {
  darkFrac: number; // fraction of overlay pixels that are near-black (grid gaps)
  contrast: number; // std-dev of overlay luminance
  gridLines: number; // 0..4 internal boundaries that look like dark grid gaps
  uniformity: number; // mean within-sticker color spread (flat stickers = low)
}

export const SCAN_FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** The six facelet slots of every corner piece, in reading order. */
const CORNER_POSITIONS: Face[][] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
/** The four facelet slots of every edge piece, in reading order. */
const EDGE_POSITIONS: Face[][] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'],
  ['D', 'R'], ['D', 'F'], ['D', 'L'], ['D', 'B'],
  ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];

/** Compact RGB -> CIELAB (perceptually uniform, robust under varied lighting). */
export function rgbToLab({ r, g, b }: RGB): Lab {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (t: number) => (t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116);
  x = g2(x); y = g2(y); z = g2(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * Component-wise median of several readings of the same sticker.
 * Taking a median (instead of a mean) throws away glare hotspots and stray
 * dark gap pixels, which is what made red/orange flip-flop before.
 */
export function medianLab(readings: Lab[]): Lab {
  if (readings.length === 0) return [0, 0, 0];
  const pick = (i: 0 | 1 | 2) => {
    const v = readings.map((r) => r[i]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return [pick(0), pick(1), pick(2)];
}

/**
 * Lightness is deliberately down-weighted: two stickers of the same paint can
 * differ hugely in brightness (top face vs shadowed side) while red vs orange
 * — the classic scanner mixup — differ mostly in chroma/hue. Chroma space is
 * where the six cube colors actually separate.
 */
const LIGHTNESS_WEIGHT = 0.4;

function deltaE(a: Lab, b: Lab): number {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(LIGHTNESS_WEIGHT * dL * dL + da * da + db * db);
}

/** Centers are the reference palette; they define the color of each face. */
function centerDistances(samples: Lab[][]): number[][] {
  const centers = samples.map((s) => s[4]);
  const dist: number[][] = [];
  for (const face of samples) {
    for (const cell of face) dist.push(centers.map((c) => deltaE(cell, c)));
  }
  return dist;
}

const CAPACITY = 9; // every color appears exactly nine times
const CENTER_CELLS = new Set([4, 13, 22, 31, 40, 49]);

/**
 * Assign all 54 stickers to the six colors so that each color is used exactly
 * nine times (centers are pinned). Classifying each sticker in isolation lets
 * one borderline cell steal a color from another and produces an invalid cube;
 * this global assignment keeps the counts balanced and hands ambiguous cells
 * to their most confident owner.
 */
function assignColors(dist: number[][]): number[] {
  const cells = dist.length;
  const result = new Array<number>(cells).fill(-1);
  const used = new Array<number>(6).fill(0);

  for (const i of CENTER_CELLS) {
    if (i >= cells) continue;
    const face = Math.floor(i / 9);
    result[i] = face;
    used[face]++;
  }

  const pairs: Array<{ i: number; c: number; d: number }> = [];
  for (let i = 0; i < cells; i++) {
    if (result[i] >= 0) continue;
    for (let c = 0; c < 6; c++) pairs.push({ i, c, d: dist[i][c] });
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const p of pairs) {
    if (result[p.i] >= 0 || used[p.c] >= CAPACITY) continue;
    result[p.i] = p.c;
    used[p.c]++;
  }
  // Slots and cells are both 54, so the greedy pass always fills every cell.

  // Local 2-opt: exchange two cells whose colors would fit each other better.
  // Swaps never change the per-color counts.
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i < cells; i++) {
      if (CENTER_CELLS.has(i)) continue;
      for (let j = i + 1; j < cells; j++) {
        if (CENTER_CELLS.has(j)) continue;
        const ci = result[i], cj = result[j];
        if (ci === cj) continue;
        const before = dist[i][ci] + dist[j][cj];
        const after = dist[i][cj] + dist[j][ci];
        if (after < before - 1e-6) {
          result[i] = cj;
          result[j] = ci;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return result;
}

/** Cells whose two best matches are nearly tied — worth a human look. */
function ambiguousCells(dist: number[][], assigned: number[]): number[] {
  const out: number[] = [];
  const MARGIN = 9; // Lab units; similar paint under odd light lands here
  for (let i = 0; i < dist.length; i++) {
    const own = dist[i][assigned[i]];
    let second = Infinity;
    for (let c = 0; c < 6; c++) if (c !== assigned[i]) second = Math.min(second, dist[i][c]);
    if (second - own < MARGIN) out.push(i);
  }
  return out;
}

export interface ScanResult {
  /** 54 facelet colors in U, R, F, D, L, B order, row-major as viewed. */
  colors: Face[];
  /** Number of stickers whose color was a close call. */
  ambiguous: number;
  /** Facelet indices (into `colors`) whose color was a close call. */
  ambiguousFacelets: number[];
  /** Quarter-turns applied per captured face to make the cube consistent. */
  rotations: number[];
  /** True when the readings form a possible cube. */
  valid: boolean;
  /** True when more than one face orientation fitted the readings equally well. */
  orientationAmbiguous: boolean;
}

const CORNERS: number[][] = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const EDGES: number[][] = [
  [5, 10], [7, 19], [3, 37], [1, 46],
  [32, 16], [28, 25], [30, 43], [34, 52],
  [23, 12], [21, 41], [50, 39], [48, 14],
];

/** Rotate a 3×3 sticker grid clockwise by `turns` quarter-turns. */
export function rotateFace<T>(face: T[], turns: number): T[] {
  let out = face;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    const next = new Array<T>(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) next[c * 3 + (2 - r)] = out[r * 3 + c];
    }
    out = next;
  }
  return out;
}

const pieceKey = (colors: Face[]): string => [...colors].sort().join('');
const CORNER_KEYS = new Set(CORNER_POSITIONS.map(pieceKey));
const EDGE_KEYS = new Set(EDGE_POSITIONS.map(pieceKey));

/**
 * Structural validity: nine stickers of each color with the centers in place,
 * and every corner/edge a real piece that appears exactly once.
 *
 * This is a necessary condition for any reachable cube, and — unlike a full
 * orientation/parity solver — it never rejects a genuine state. That makes it
 * safe for choosing between orientation hypotheses.
 */
export function isValidArrangement(f: Face[]): boolean {
  if (f.length !== 54) return false;
  const counts: Record<string, number> = {};
  for (const c of f) counts[c] = (counts[c] ?? 0) + 1;
  for (let i = 0; i < 6; i++) {
    const face = SCAN_FACES[i];
    if (counts[face] !== 9) return false;
    if (f[i * 9 + 4] !== face) return false;
  }

  const corners = new Set<string>();
  for (const idx of CORNERS) {
    const key = pieceKey(idx.map((i) => f[i]));
    if (corners.has(key) || !CORNER_KEYS.has(key)) return false;
    corners.add(key);
  }
  const edges = new Set<string>();
  for (const idx of EDGES) {
    const key = pieceKey(idx.map((i) => f[i]));
    if (edges.has(key) || !EDGE_KEYS.has(key)) return false;
    edges.add(key);
  }
  return corners.size === 8 && edges.size === 12;
}

/**
 * Rebuild the cube from the six captured faces.
 *
 * Two failure modes are handled automatically:
 *  - similar colors (red/orange, white/yellow) are split by a global
 *    nine-per-color assignment rather than per-sticker nearest-neighbor;
 *  - a face held at the "wrong" rotation is repaired by searching the 4
 *    rotations of each face (4^6 = 4096) for the one arrangement that is a
 *    real cube, preferring the orientation the hold instructions describe.
 */
export function reconstructCube(samples: Lab[][]): ScanResult {
  if (samples.length !== 6 || samples.some((s) => s.length !== 9)) {
    throw new Error('Scanner expected six faces of nine stickers.');
  }
  const dist = centerDistances(samples);
  const assigned = assignColors(dist);
  const colors = assigned.map((c) => SCAN_FACES[c]);

  let best: { rotations: number[]; facelets: Face[] } | null = null;
  let bestCost = Infinity;
  let ties = 0;
  const attempt = new Array<number>(6).fill(0);
  for (let code = 0; code < 4 ** 6; code++) {
    let k = code;
    let cost = 0;
    for (let f = 0; f < 6; f++) {
      const r = k % 4;
      k = Math.floor(k / 4);
      attempt[f] = r;
      cost += Math.min(r, 4 - r); // a 3-quarter turn is one turn the other way
    }
    if (cost > bestCost) continue;
    const facelets: Face[] = [];
    for (let f = 0; f < 6; f++) facelets.push(...rotateFace(colors.slice(f * 9, f * 9 + 9), attempt[f]));
    if (!isValidArrangement(facelets)) continue;
    if (cost < bestCost) {
      best = { rotations: [...attempt], facelets };
      bestCost = cost;
      ties = 1;
    } else {
      ties++;
    }
    if (bestCost === 0) break; // matches the hold instructions — nothing to guess
  }

  const rotations = best?.rotations ?? new Array<number>(6).fill(0);
  const unsure = new Set(ambiguousCells(dist, assigned));
  const ambiguousFacelets: number[] = [];
  for (let f = 0; f < 6; f++) {
    const order = rotateFace([0, 1, 2, 3, 4, 5, 6, 7, 8], rotations[f]);
    for (let k = 0; k < 9; k++) if (unsure.has(order[k])) ambiguousFacelets.push(f * 9 + k);
  }

  return {
    colors: best?.facelets ?? colors,
    ambiguous: unsure.size,
    ambiguousFacelets,
    rotations,
    valid: best !== null,
    orientationAmbiguous: bestCost > 0 && ties > 1,
  };
}

/** Classify every cell against the six observed centers (self-calibrating). */
export function classifyAll(samples: Lab[][]): Face[] {
  return reconstructCube(samples).colors;
}

/**
 * Swap two colors among a face's non-center stickers (centers define the
 * scheme and stay fixed). One-tap fix for the classic red/orange mixup.
 */
export function swapColors(grid: string[], faceIdx: number, a: Face, b: Face): string[] {
  return grid.map((g, i) => {
    if (Math.floor(i / 9) !== faceIdx || i % 9 === 4) return g;
    if (g === a) return b;
    if (g === b) return a;
    return g;
  });
}

/** Swap two colors across the whole cube, leaving the six centers alone. */
export function swapColorsEverywhere(grid: string[], a: Face, b: Face): string[] {
  return grid.map((g, i) => {
    if (i % 9 === 4) return g;
    if (g === a) return b;
    if (g === b) return a;
    return g;
  });
}

/**
 * Structural metrics for an N×N RGBA overlay image: global darkness/contrast
 * plus dark grid lines near the 1/3 and 2/3 boundaries plus sticker flatness.
 * A real cube face passes all four; faces and rooms cannot fake straight grid
 * gaps at those positions.
 */
export function computeOverlayMetrics(data: ArrayLike<number>, N: number): OverlayMetrics {
  const lum = new Float64Array(N * N);
  let dark = 0, sum = 0, sumSq = 0;
  for (let p = 0; p < N * N; p++) {
    const l = 0.2126 * data[p * 4] + 0.7152 * data[p * 4 + 1] + 0.0722 * data[p * 4 + 2];
    lum[p] = l;
    if (l < 80) dark++;
    sum += l;
    sumSq += l * l;
  }
  const total = N * N;
  const mean = sum / total;
  const contrast = Math.sqrt(Math.max(0, (sumSq / total) - mean * mean));

  // Grid gaps: dark bands along the four internal boundaries. A real gap is a
  // STRAIGHT line spanning the square, so we measure the longest continuous
  // dark run. The band is searched in a small window around the exact 1/3 and
  // 2/3 positions so a slightly off-centre cube still passes.
  const B = 4, T = 110, NEED = 0.5, WINDOW = 0.09, STEP = 0.015;
  const runAt = (isVertical: boolean, at: number): number => {
    const c0 = Math.max(0, Math.round(at) - B), c1 = Math.min(N - 1, Math.round(at) + B);
    let best = 0, run = 0;
    for (let i = 0; i < N; i++) {
      let d = 0, n = 0;
      for (let c = c0; c <= c1; c++) {
        n++;
        const p = isVertical ? i * N + c : c * N + i;
        if (lum[p] < T) d++;
      }
      if (d * 2 >= n) run++;
      else {
        if (run > best) best = run;
        run = 0;
      }
    }
    if (run > best) best = run;
    return best / N;
  };
  const longestNear = (isVertical: boolean, at: number): number => {
    let best = 0;
    for (let off = -WINDOW; off <= WINDOW + 1e-9; off += STEP) {
      best = Math.max(best, runAt(isVertical, at + off * N));
    }
    return best;
  };
  let gridLines = 0;
  for (const at of [N / 3, (2 * N) / 3]) {
    if (longestNear(true, at) >= NEED) gridLines++;
    if (longestNear(false, at) >= NEED) gridLines++;
  }

  // Sticker flatness: mean Lab spread inside the central 55% of each cell.
  const spreads: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x0 = Math.floor(((c + 0.225) * N) / 3), x1 = Math.ceil(((c + 0.775) * N) / 3);
      const y0 = Math.floor(((r + 0.225) * N) / 3), y1 = Math.ceil(((r + 0.775) * N) / 3);
      const labs: Lab[] = [];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = y * N + x;
          labs.push(rgbToLab({ r: data[p * 4], g: data[p * 4 + 1], b: data[p * 4 + 2] }));
        }
      }
      if (labs.length === 0) continue;
      let mL = 0, mA = 0, mB = 0;
      for (const l of labs) { mL += l[0]; mA += l[1]; mB += l[2]; }
      mL /= labs.length; mA /= labs.length; mB /= labs.length;
      let s = 0;
      for (const l of labs) s += Math.sqrt((l[0] - mL) ** 2 + (l[1] - mA) ** 2 + (l[2] - mB) ** 2);
      spreads.push(s / labs.length);
    }
  }
  const uniformity = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : Infinity;
  return { darkFrac: dark / total, contrast, gridLines, uniformity };
}

/**
 * True only if the frame plausibly contains a cube face. Thresholds are
 * intentionally forgiving: a good face wrongly rejected costs the user more
 * than a blurry one that lands in the review screen (which is editable).
 */
export function looksLikeCube(m: OverlayMetrics): boolean {
  return m.darkFrac >= 0.04 && m.contrast >= 18 && m.gridLines >= 3 && m.uniformity <= 32;
}
