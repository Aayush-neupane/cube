import { Face } from './types';

export interface RGB { r: number; g: number; b: number; }

export interface FrameAnalysis {
  cells: RGB[];
  metrics: OverlayMetrics;
}

export interface OverlayMetrics {
  darkFrac: number; // fraction of overlay pixels that are near-black (grid gaps)
  contrast: number; // std-dev of overlay luminance
  gridLines: number; // 0..4 internal boundaries that look like dark grid gaps
  uniformity: number; // mean within-sticker color spread (flat stickers = low)
}

const SCAN_FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** Compact RGB -> CIELAB (perceptually uniform, robust under varied lighting). */
export function rgbToLab({ r, g, b }: RGB): [number, number, number] {
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

function labDist(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Classify every cell against the six observed center colors (self-calibrating). */
export function classifyAll(samples: RGB[][]): Face[] {
  const centers = samples.map((s) => rgbToLab(s[4]));
  const out: Face[] = [];
  for (const faceSamples of samples) {
    for (const cell of faceSamples) {
      const lab = rgbToLab(cell);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < 6; i++) {
        const d = labDist(lab, centers[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      out.push(SCAN_FACES[best]);
    }
  }
  return out;
}

/**
 * Structural metrics for an N×N RGBA overlay image: global darkness/contrast
 * plus dark grid lines at exactly the 1/3 and 2/3 boundaries plus sticker
 * flatness. A real cube face passes all four; faces and rooms cannot fake
 * straight grid gaps at those exact positions.
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

  // grid gaps: dark bands (±3px) along the four internal boundaries.
  // A real gap is a STRAIGHT line spanning the square, so we measure the
  // longest continuous dark run — eyebrows and shadows make short blobs.
  // isVertical: boundary is a vertical line (x = at), runs extend along y.
  const B = 3, T = 110, NEED = 0.65;
  const longestRun = (isVertical: boolean, at: number): number => {
    const c0 = Math.max(0, Math.round(at) - B), c1 = Math.min(N - 1, Math.round(at) + B);
    let best = 0, run = 0;
    for (let i = 0; i < N; i++) {
      let dark = 0, n = 0;
      for (let c = c0; c <= c1; c++) {
        n++;
        const p = isVertical ? i * N + c : c * N + i;
        if (lum[p] < T) dark++;
      }
      if (dark * 2 >= n) run++;
      else {
        if (run > best) best = run;
        run = 0;
      }
    }
    if (run > best) best = run;
    return best / N;
  };
  let gridLines = 0;
  for (const at of [N / 3, (2 * N) / 3]) {
    if (longestRun(true, at) >= NEED) gridLines++;
    if (longestRun(false, at) >= NEED) gridLines++;
  }

  // sticker flatness: mean Lab spread inside the central 55% of each cell
  const spreads: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x0 = Math.floor(((c + 0.225) * N) / 3), x1 = Math.ceil(((c + 0.775) * N) / 3);
      const y0 = Math.floor(((r + 0.225) * N) / 3), y1 = Math.ceil(((r + 0.775) * N) / 3);
      const labs: Array<[number, number, number]> = [];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = y * N + x;
          labs.push(rgbToLab({ r: data[p * 4], g: data[p * 4 + 1], b: data[p * 4 + 2] }));
        }
      }
      let mL = 0, mA = 0, mB = 0;
      for (const l of labs) { mL += l[0]; mA += l[1]; mB += l[2]; }
      mL /= labs.length; mA /= labs.length; mB /= labs.length;
      let s = 0;
      for (const l of labs) s += Math.sqrt((l[0] - mL) ** 2 + (l[1] - mA) ** 2 + (l[2] - mB) ** 2);
      spreads.push(s / labs.length);
    }
  }
  const uniformity = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  return { darkFrac: dark / total, contrast, gridLines, uniformity };
}

/**
 * True only if the frame plausibly contains a cube face.
 */
export function looksLikeCube(m: OverlayMetrics): boolean {
  return m.darkFrac >= 0.06 && m.contrast >= 25 && m.gridLines >= 3 && m.uniformity <= 20;
}
