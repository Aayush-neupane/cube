import { useEffect, useRef, useState } from 'react';
import { useCubeStore } from '../store/useCubeStore';
import { FACE_COLORS, Face } from '../cube/types';
import { ensureSolver, solveFacelets } from '../cube/externalSolver';

type Phase = 'intro' | 'capture' | 'manual' | 'review' | 'solving';

interface RGB { r: number; g: number; b: number; }

const SCAN_FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const CYCLE: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const FACE_NAMES: Record<Face, string> = { U: 'Top (white)', R: 'Right (red)', F: 'Front (green)', D: 'Bottom (yellow)', L: 'Left (orange)', B: 'Back (blue)' };
const HOLD_TOP: Record<Face, string> = {
  U: 'green edge at the bottom of the frame',
  R: 'white on top',
  F: 'white on top',
  D: 'green edge at the top of the frame',
  L: 'white on top',
  B: 'white on top',
};

// ---------- color science (compact RGB -> Lab + nearest-center match) ----------
function rgbToLab({ r, g, b }: RGB): [number, number, number] {
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

/** Classify every cell against the six observed center colors. */
function classifyAll(samples: RGB[][]): Face[] {
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

/** Sample the 9 cells inside the centered 62% overlay square of the video. */
function sampleFace(video: HTMLVideoElement): RGB[] | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const dw = video.clientWidth, dh = video.clientHeight;
  if (!dw || !dh) return null;
  const scale = Math.max(dw / vw, dh / vh); // object-fit: cover
  const offX = (dw - vw * scale) / 2;
  const offY = (dh - vh * scale) / 2;
  const S = 0.62 * Math.min(dw, dh);
  const ox = (dw - S) / 2, oy = (dh - S) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = vw; canvas.height = vh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, vw, vh);
  const cells: RGB[] = [];
  const inner = 0.8;
  const m = (S * (1 - inner)) / 2;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = ox + m + ((c + 0.5) / 3) * S * inner;
      const cy = oy + m + ((r + 0.5) / 3) * S * inner;
      const vx = Math.round((cx - offX) / scale);
      const vy = Math.round((cy - offY) / scale);
      const w = Math.max(2, Math.round((((S * inner) / 3) * 0.3) / scale));
      const x0 = Math.max(0, vx - w), y0 = Math.max(0, vy - w);
      const ww = Math.min(vw - x0, w * 2 + 1), hh = Math.min(vh - y0, w * 2 + 1);
      if (ww <= 0 || hh <= 0) return null;
      const data = ctx.getImageData(x0, y0, ww, hh).data;
      let R = 0, G = 0, B = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) { R += data[i]; G += data[i + 1]; B += data[i + 2]; n++; }
      cells.push({ r: R / n, g: G / n, b: B / n });
    }
  }
  return cells;
}

function validateGrid(grid: string[]): string | null {
  if (grid.some((g) => !g)) return 'Some stickers are still blank — tap the gray squares to set them.';
  for (const f of SCAN_FACES) {
    const n = grid.filter((g) => g === f).length;
    if (n !== 9) {
      const name = FACE_NAMES[f].split(' ')[0];
      return `Each color must appear exactly 9 times — ${name} appears ${n} times. Fix the highlighted face.`;
    }
  }
  return null;
}

function emptyGrid(): string[] {
  const g = Array(54).fill('');
  SCAN_FACES.forEach((f, i) => { g[i * 9 + 4] = f; }); // centers locked
  return g;
}

export default function ScanCube({ onClose }: { onClose: () => void }) {
  const loadScannedState = useCubeStore((s) => s.loadScannedState);
  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0);
  const [samples, setSamples] = useState<(RGB[] | null)[]>(Array(6).fill(null));
  const [grid, setGrid] = useState<string[]>(emptyGrid());
  const [error, setError] = useState<string | null>(null);
  const [warming, setWarming] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // warm up the solver tables in the background
  useEffect(() => {
    let live = true;
    ensureSolver().then(() => { if (live) setWarming(false); });
    return () => { live = false; };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('manual');
      setError('No camera available here (camera needs HTTPS or localhost) — enter the colors manually below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase('capture');
      setStep(0);
      // attach on next paint once the video element exists
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 30);
    } catch {
      setPhase('manual');
      setError('Camera was blocked or unavailable — enter the colors manually below. In your browser settings, allow camera access to scan.');
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const cells = sampleFace(video);
    if (!cells) {
      setError('Could not read the frame — hold still and try again.');
      return;
    }
    setError(null);
    setSamples((prev) => {
      const next = [...prev];
      next[step] = cells;
      return next;
    });
    if (step === 5) {
      // all faces captured -> classify everything against the six centers
      const all = samples.map((s, i) => (i === step ? cells : s));
      if (all.some((s) => !s)) {
        setError('A face is missing — please re-capture it.');
        return;
      }
      setGrid(classifyAll(all as RGB[][]));
      stopCamera();
      setPhase('review');
    } else {
      setStep(step + 1);
    }
  };

  const cycleCell = (idx: number) => {
    if (idx % 9 === 4) return; // center locked (it defines the color scheme)
    setGrid((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const curPos = cur ? CYCLE.indexOf(cur as Face) : -1;
      next[idx] = CYCLE[(curPos + 1) % 6];
      return next;
    });
  };

  const solve = async () => {
    const problem = validateGrid(grid);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPhase('solving');
    try {
      const solution = await solveFacelets(grid.join(''));
      loadScannedState(solution);
      onClose();
    } catch {
      setPhase('review');
      setError('This does not look like a valid cube state — a sticker or two is probably wrong. Compare with your cube and fix the colors, then try again.');
    }
  };

  const face = SCAN_FACES[step];
  const doneCount = samples.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Scan a real cube">
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 dark:bg-neutral-900 sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">📷 Scan a real cube</h2>
          <button onClick={() => { stopCamera(); onClose(); }} aria-label="Close scanner" className="h-8 w-8 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">✕</button>
        </div>

        {phase === 'intro' && (
          <div>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
              Point your camera at each of the 6 faces. The app reads the colors, rebuilds your exact cube in 3D, and gives you the full step-by-step solution.
            </p>
            <ul className="mt-2.5 space-y-1 text-[12.5px] text-neutral-500">
              <li>· Good light, no glare — plain background works best</li>
              <li>· Fill the square guide with one face at a time</li>
              <li>· You can fix any misread sticker afterwards</li>
            </ul>
            <button onClick={startCamera} className="aurora-btn mt-3 h-10 w-full rounded-md text-[14px] font-semibold text-white">
              Start scanning
            </button>
            <button
              onClick={() => { setGrid(emptyGrid()); setPhase('manual'); }}
              className="mt-2 h-9 w-full rounded-md border border-neutral-200 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              No camera? Enter colors manually
            </button>
            {warming && <p className="mt-2 text-center text-[11px] text-neutral-400">Preparing solver…</p>}
          </div>
        )}

        {phase === 'capture' && (
          <div>
            <p className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-300" aria-live="polite">
              <span className="font-mono font-semibold">Face {step + 1} of 6 — {FACE_NAMES[face]}</span>
              <br />
              <span className="text-neutral-500">Hold with {HOLD_TOP[face]}.</span>
            </p>
            <div className="relative mx-auto mt-2.5 aspect-square w-full max-w-[380px] overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
              <div aria-hidden className="absolute left-1/2 top-1/2 grid aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className={`border border-white/80 ${i === 4 ? 'bg-white/20' : ''}`} />
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="h-10 rounded-md border border-neutral-200 px-4 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                  ← Back
                </button>
              )}
              <button onClick={capture} className="h-10 flex-1 rounded-md bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
                Capture {doneCount > step ? 'again' : 'face'}
              </button>
            </div>
            {error && <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}

        {phase === 'manual' && (
          <div>
            <p className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-300" aria-live="polite">
              <span className="font-mono font-semibold">Face {step + 1} of 6 — {FACE_NAMES[face]}</span>
              <br />
              <span className="text-neutral-500">Tap a square to cycle its color. The center is fixed.</span>
            </p>
            {error && <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">{error}</p>}
            <FaceEditor faceIdx={step} grid={grid} onCycle={cycleCell} />
            <div className="mt-2.5 flex gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="h-10 rounded-md border border-neutral-200 px-4 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                  ← Back
                </button>
              )}
              {step < 5 ? (
                <button onClick={() => setStep(step + 1)} className="h-10 flex-1 rounded-md bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
                  Next face →
                </button>
              ) : (
                <button onClick={() => setPhase('review')} className="h-10 flex-1 rounded-md bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
                  Review →
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'review' && (
          <div>
            <p className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-300">
              Does this match your cube? Tap any square to fix its color.
            </p>
            <NetPreview grid={grid} onCycle={cycleCell} />
            {error && <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => { setSamples(Array(6).fill(null)); setStep(0); startCamera(); }}
                className="h-10 rounded-md border border-neutral-200 px-4 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                ↺ Re-scan
              </button>
              <button onClick={solve} className="aurora-btn h-10 flex-1 rounded-md text-[14px] font-semibold text-white">
                Solve this cube
              </button>
            </div>
          </div>
        )}

        {phase === 'solving' && (
          <div className="py-8 text-center">
            <p className="font-mono text-[15px] text-neutral-700 dark:text-neutral-200" aria-live="polite">Solving…</p>
            <p className="mt-1 text-[12px] text-neutral-400">Loading your cube into 3D</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FaceEditor({ faceIdx, grid, onCycle }: { faceIdx: number; grid: string[]; onCycle: (idx: number) => void }) {
  const cells = grid.slice(faceIdx * 9, faceIdx * 9 + 9);
  return (
    <div className="mx-auto mt-2.5 grid w-full max-w-[300px] grid-cols-3 gap-1.5">
      {cells.map((letter, i) => {
        const idx = faceIdx * 9 + i;
        const locked = i === 4;
        return (
          <button
            key={i}
            disabled={locked}
            onClick={() => onCycle(idx)}
            aria-label={locked ? `Center, fixed ${letter}` : `Sticker, currently ${letter || 'blank'}. Tap to change.`}
            className={`aspect-square rounded-md border ${letter ? 'border-black/10' : 'border-dashed border-neutral-300 dark:border-neutral-600'} ${locked ? 'ring-2 ring-neutral-900 dark:ring-white' : ''}`}
            style={{ background: letter ? FACE_COLORS[letter as Face] : 'transparent' }}
          />
        );
      })}
    </div>
  );
}

function NetPreview({ grid, onCycle }: { grid: string[]; onCycle: (idx: number) => void }) {
  // unfolded net: U on top; L F R B middle; D bottom
  const faces: Array<{ faceIdx: number; area: string }> = [
    { faceIdx: 0, area: 'u' },
    { faceIdx: 4, area: 'l' },
    { faceIdx: 2, area: 'f' },
    { faceIdx: 1, area: 'r' },
    { faceIdx: 3, area: 'b' },
    { faceIdx: 5, area: 'd' },
  ];
  return (
    <div
      className="mx-auto mt-2.5 grid w-full max-w-[380px] gap-1.5"
      style={{ gridTemplateAreas: `". u . ." "l f r b" ". d . ."`, gridTemplateColumns: 'repeat(4, 1fr)' }}
    >
      {faces.map(({ faceIdx, area }) => (
        <div key={faceIdx} className="grid grid-cols-3 gap-[3px]" style={{ gridArea: area }} role="group" aria-label={`${FACE_NAMES[SCAN_FACES[faceIdx]]} face`}>
          {grid.slice(faceIdx * 9, faceIdx * 9 + 9).map((letter, i) => {
            const idx = faceIdx * 9 + i;
            return (
              <button
                key={i}
                onClick={() => onCycle(idx)}
                aria-label={`${FACE_NAMES[SCAN_FACES[faceIdx]]} sticker ${i + 1}, ${letter || 'blank'}. Tap to change.`}
                className="aspect-square rounded-[3px] border border-black/10"
                style={{ background: letter ? FACE_COLORS[letter as Face] : '#e5e5e5' }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
