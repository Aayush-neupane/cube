import { useEffect, useRef, useState } from 'react';
import { useCubeStore } from '../store/useCubeStore';
import { FACE_COLORS, Face } from '../cube/types';
import { RGB, FrameAnalysis, classifyAll, looksLikeCube, computeOverlayMetrics, swapColors } from '../cube/colorClassify';
import { ensureSolver, solveFacelets } from '../cube/externalSolver';

type Phase = 'intro' | 'capture' | 'manual' | 'review' | 'solving';

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

// ---------- frame sampling (DOM/canvas side; color math lives in cube/colorClassify) ----------
/** Sample the 9 cells inside the centered 62% overlay square of the video. */
function sampleCells(ctx: CanvasRenderingContext2D, toVideo: (cx: number, cy: number) => [number, number], S: number, ox: number, oy: number, vw: number, vh: number): RGB[] | null {
  const cells: RGB[] = [];
  const inner = 0.8;
  const m = (S * (1 - inner)) / 2;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = ox + m + ((c + 0.5) / 3) * S * inner;
      const cy = oy + m + ((r + 0.5) / 3) * S * inner;
      const [vx, vy] = toVideo(cx, cy);
      const w = 3;
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

/**
 * Read one frame: sticker colors + cube-presence metrics.
 * A real cube face always has dark plastic grid gaps and strong
 * sticker-vs-gap contrast; faces, walls and skies do not.
 */
function analyzeFrame(video: HTMLVideoElement): FrameAnalysis | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const dw = video.clientWidth, dh = video.clientHeight;
  if (!dw || !dh) return null;
  const scale = Math.max(dw / vw, dh / vh); // object-fit: cover
  const offX = (dw - vw * scale) / 2;
  const offY = (dh - vh * scale) / 2;
  const S = 0.62 * Math.min(dw, dh);
  const ox = (dw - S) / 2, oy = (dh - S) / 2;
  const toVideo = (cx: number, cy: number): [number, number] => [
    Math.round((cx - offX) / scale),
    Math.round((cy - offY) / scale),
  ];
  const canvas = document.createElement('canvas');
  canvas.width = vw; canvas.height = vh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, vw, vh);

  const cells = sampleCells(ctx, toVideo, S, ox, oy, vw, vh);
  if (!cells) return null;

  // Downscaled copy of just the overlay square for structural metrics
  const N = 96;
  const small = document.createElement('canvas');
  small.width = N; small.height = N;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;
  const [sx, sy] = toVideo(ox, oy);
  const [ex, ey] = toVideo(ox + S, oy + S);
  sctx.drawImage(canvas, sx, sy, ex - sx, ey - sy, 0, 0, N, N);
  const px = sctx.getImageData(0, 0, N, N).data;
  return { cells, metrics: computeOverlayMetrics(px, N) };
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
  const [rejects, setRejects] = useState(0);
  const [warming, setWarming] = useState(true);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [meta, setMeta] = useState('');
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
    setLive(false);
  };
  useEffect(() => stopCamera, []);

  // Attach the stream whenever the viewfinder exists (robust against slow renders)
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (phase === 'capture' && video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        setError('Video is paused — tap the viewfinder to start it.');
      });
    }
    if (phase !== 'capture') setLive(false);
  }, [phase, step]);

  const pokeVideo = () => {
    videoRef.current?.play().catch(() => {
      setError('Video refused to play — try closing other camera apps, or use manual entry.');
    });
  };

  const startCamera = async () => {
    setError(null);
    setLive(false);
    setMeta('');
    const insecure =
      typeof window !== 'undefined' &&
      window.isSecureContext === false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('manual');
      setError(
        insecure
          ? 'Camera is blocked because this page is not on HTTPS — browsers only allow the camera on HTTPS or localhost. Use manual entry here, or open the hosted (https) version on your phone to scan.'
          : 'No camera API available on this device — enter the colors manually below.'
      );
      return;
    }
    // If the permission prompt hangs or the driver stalls, don't leave the
    // user staring at a dead screen — bail out with manual entry.
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setStarting(false);
        setPhase('manual');
        setError('The camera took too long to respond — enter the colors manually below, or try again.');
      }
    }, 15000);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (settled) {
        stream.getTracks().forEach((t) => t.stop()); // late arrival after timeout
        return;
      }
      settled = true;
      clearTimeout(timer);
      streamRef.current = stream;
      // Best effort: lock white balance + exposure so colors don't drift
      // between the six captures (the main cause of red/orange mixups).
      try {
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          whiteBalanceMode?: string[];
          exposureMode?: string[];
        };
        const adv: Record<string, string> = {};
        if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) {
          adv.whiteBalanceMode = 'manual';
        }
        if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual')) {
          adv.exposureMode = 'manual';
        }
        if (Object.keys(adv).length > 0) {
          await track.applyConstraints({ advanced: [adv] } as MediaTrackConstraints);
        }
      } catch {
        /* phones vary wildly — unlocked camera still scans, just less steadily */
      }
      setStarting(false);
      setPhase('capture');
      setStep(0);
    } catch (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setStarting(false);
      const name = e instanceof DOMException ? e.name : '';
      setPhase('manual');
      if (name === 'NotAllowedError') {
        setError('Camera permission was denied — allow camera access for this site in your browser settings, then try again. Or enter the colors manually below.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No suitable camera found on this device — enter the colors manually below.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('The camera is busy (another app may be using it) — close other camera apps and try again, or enter colors manually.');
      } else {
        setError('Camera could not start — enter the colors manually below.');
      }
    }
  };

  const capture = (force = false) => {
    try {
      const video = videoRef.current;
      if (!video) {
        setError('Viewfinder is not ready yet — wait a second and try again.');
        return;
      }
      if (video.videoWidth === 0) {
        setError('Video has no picture yet (waiting for the camera…) — wait for “live” and try again.');
        return;
      }
      const frame = analyzeFrame(video);
      if (!frame) {
        setError(`Could not read the frame (signal ${video.videoWidth}×${video.videoHeight}) — hold still and try again.`);
        return;
      }
      if (!force && !looksLikeCube(frame.metrics)) {
        const m = frame.metrics;
        let hint = 'fill the square edge-to-edge with a single cube face, holding the phone straight';
        if (m.contrast < 25) hint = 'add more light — the frame is too flat or dark';
        else if (m.darkFrac < 0.06) hint = 'no dark grid gaps visible — move closer so the face fills the square';
        else if (m.gridLines < 3) hint = 'hold the phone straight so the grid lines run across the full square, and tilt away from glare on the black gaps';
        else hint = 'hold perfectly still while capturing';
        setRejects((r) => r + 1);
        setError(`No cube detected (${m.gridLines}/4 grid lines found) — ${hint}.`);
        return;
      }
      setRejects(0);
      const cells = frame.cells;
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
    } catch (e) {
      setError(`Capture failed unexpectedly (${e instanceof Error ? e.message : 'unknown error'}) — try again or use manual entry.`);
    }
  };

  const cycleCell = (idx: number) => {
    if (idx % 9 === 4) return; // center locked (it defines the color scheme)
    setGrid((prev) => {
      // No color may appear more than 9 times — full colors are skipped.
      const counts: Record<string, number> = {};
      for (const g of prev) if (g) counts[g] = (counts[g] ?? 0) + 1;
      const cur = prev[idx];
      const startPos = cur ? CYCLE.indexOf(cur as Face) : -1;
      for (let k = 1; k <= 6; k++) {
        const cand = CYCLE[(startPos + k) % 6];
        const effective = (counts[cand] ?? 0) - (cur === cand ? 1 : 0);
        if (effective < 9) {
          if (cand === cur) return prev;
          const next = [...prev];
          next[idx] = cand;
          return next;
        }
      }
      return prev;
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
          <h2 className="text-[15px] font-semibold tracking-tight">Scan a real cube</h2>
          <button onClick={() => { stopCamera(); onClose(); }} aria-label="Close scanner" className="h-8 w-8 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">✕</button>
        </div>

        {phase === 'intro' && (
          <div>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
              Point your camera at each of the 6 faces. The app reads the colors, rebuilds your exact cube in 3D, and gives you the full step-by-step solution.
            </p>
            <ul className="mt-2.5 space-y-1 text-[12.5px] text-neutral-500">
              <li>· Good light, no glare — plain background works best</li>
              <li>· Fill the square completely with one face at a time</li>
              <li>· Non-cube frames are rejected automatically</li>
              <li>· You can fix any misread sticker afterwards</li>
            </ul>
            <button onClick={startCamera} disabled={starting} className="mt-3 h-10 w-full rounded-md bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
              {starting ? 'Starting camera…' : 'Start scanning'}
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
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                onPlaying={() => setLive(true)}
                onLoadedMetadata={(e) => setMeta(`${e.currentTarget.videoWidth}×${e.currentTarget.videoHeight}`)}
                onClick={pokeVideo}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div aria-hidden className="absolute left-1/2 top-1/2 grid aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className={`border border-white/80 ${i === 4 ? 'bg-white/20' : ''}`} />
                ))}
              </div>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-neutral-400" aria-live="polite">
              {live ? '● Camera live — fit one face inside the square' : 'Starting camera… if this never turns live, tap the viewfinder.'}
              {meta ? ` · signal ${meta}` : ''}
            </p>
            <div className="mt-2.5 flex gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="h-10 rounded-md border border-neutral-200 px-4 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                  ← Back
                </button>
              )}
              <button onClick={() => capture()} className="h-10 flex-1 rounded-md bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
                Capture {doneCount > step ? 'again' : 'face'}
              </button>
            </div>
            {error && <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
            {rejects >= 2 && (
              <button
                onClick={() => capture(true)}
                className="mt-2 w-full text-center text-[12px] font-medium text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                The cube is in frame but keeps getting rejected? Use this frame anyway
              </button>
            )}
            <button
              onClick={() => { stopCamera(); setGrid(emptyGrid()); setStep(0); setPhase('manual'); setError(null); }}
              className="mt-2 w-full text-center text-[12px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Wrongly rejected? Enter colors manually instead
            </button>
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
            <NetPreview grid={grid} onCycle={cycleCell} onSwap={(f) => setGrid((prev) => swapColors(prev, f, 'R', 'L'))} />
            {error && <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => { setSamples(Array(6).fill(null)); setStep(0); startCamera(); }}
                className="h-10 rounded-md border border-neutral-200 px-4 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                ↺ Re-scan
              </button>
              <button onClick={solve} className="h-10 flex-1 rounded-md bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
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

function NetPreview({ grid, onCycle, onSwap }: { grid: string[]; onCycle: (idx: number) => void; onSwap: (faceIdx: number) => void }) {
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
        <div key={faceIdx} style={{ gridArea: area }}>
          <div className="grid grid-cols-3 gap-[3px]" role="group" aria-label={`${FACE_NAMES[SCAN_FACES[faceIdx]]} face`}>
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
          <button
            onClick={() => onSwap(faceIdx)}
            aria-label={`Swap red and orange on the ${FACE_NAMES[SCAN_FACES[faceIdx]]} face`}
            className="mt-1 w-full rounded border border-neutral-200 py-0.5 text-[10px] font-medium text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            ⇄ red/orange
          </button>
        </div>
      ))}
    </div>
  );
}
