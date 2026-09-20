import { Cube } from 'rubik-cube-solver';

let ready = false;
let initPromise: Promise<void> | null = null;

/** Build solver tables lazily (blocks ~2s) without freezing the first paint. */
export function ensureSolver(): Promise<void> {
  if (ready) return Promise.resolve();
  if (!initPromise) {
    initPromise = new Promise((resolve) => {
      setTimeout(() => {
        try {
          Cube.initSolver();
        } catch {
          /* solve() will throw a useful error later */
        }
        ready = true;
        resolve();
      }, 60);
    });
  }
  return initPromise;
}

export function isSolverReady(): boolean {
  return ready;
}

/** Solve a 54-facelet string (URFDLB order). Returns moves like ["R","U'","F2"]. */
export async function solveFacelets(facelets: string): Promise<string[]> {
  await ensureSolver();
  const raw = Cube.fromString(facelets).solve() as unknown as string;
  if (!raw || typeof raw !== 'string') throw new Error('Solver returned no solution.');
  return raw.trim().split(/\s+/).filter(Boolean);
}
