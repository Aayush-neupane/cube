import { Face } from './types';

export interface RGB { r: number; g: number; b: number; }

export interface FrameAnalysis {
  cells: RGB[];
  darkFrac: number; // fraction of overlay pixels that are near-black (grid gaps)
  contrast: number; // std-dev of overlay luminance
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
 * True only if the frame plausibly contains a cube face: real cube faces
 * always show dark plastic grid gaps plus strong sticker-vs-gap contrast,
 * while faces, walls and skies do not.
 */
export function looksLikeCube(f: FrameAnalysis): boolean {
  return f.darkFrac >= 0.07 && f.contrast >= 28;
}
