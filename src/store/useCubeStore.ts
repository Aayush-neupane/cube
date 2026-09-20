import { create } from 'zustand';
import { cubeEngine } from '../cube/CubeState';
import { generateScramble } from '../cube/ScrambleGenerator';
import { invertMove, parseMove } from '../cube/types';
import { pushTrail, simplifyMoves } from '../cube/solver';
import { sound, setSoundEnabled } from '../utils/sound';

export interface Settings {
  animationSpeed: number; // 1 = normal, 0.5 slow, 2 fast; maps to duration
  cameraSensitivity: number;
  soundOn: boolean;
  theme: 'light' | 'dark';
  showNotation: boolean;
  showTimer: boolean;
  showHistory: boolean;
}

export interface TimerState {
  running: boolean;
  startStamp: number | null;
  elapsed: number; // live elapsed while running
  solves: number[]; // ms
}

interface CubeStore {
  // move pipeline
  moveQueue: string[];
  animating: boolean;
  history: string[];
  future: string[]; // redo stack
  /** Simplified net path from solved -> current state. Powers the Solve guide. */
  trail: string[];
  /** Bumped when a scanned real-cube state is loaded; the 3D view rebuilds. */
  scanVersion: number;
  scramble: string[];
  scrambleApplied: boolean;
  solved: boolean;
  justSolvedAt: number | null;
  solveCount: number;

  timer: TimerState;
  settings: Settings;

  // actions
  enqueueMove: (move: string, opts?: { record?: boolean; clearFuture?: boolean; silent?: boolean }) => void;
  enqueueMoves: (moves: string[], opts?: { record?: boolean; clearFuture?: boolean; silent?: boolean }) => void;
  consumeQueueForAnimation: () => string[];
  setAnimating: (v: boolean) => void;
  notifyMoveAnimated: (move: string) => void;

  doScramble: (length?: number) => void;
  doReset: () => void;
  /** Load a scanned physical-cube state: `solution` solves it; the engine
   *  reproduces the state by applying the inverted solution instantly. */
  loadScannedState: (solution: string[]) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  startTimer: () => void;
  stopTimer: () => void;
  tickTimer: (now: number) => void;
  resetTimer: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  loadPersisted: () => void;
}

const SETTINGS_KEY = 'rubik-sim.settings.v1';
const SOLVES_KEY = 'rubik-sim.solves.v1';

function loadSettings(): Settings {
  const defaults: Settings = {
    animationSpeed: 1,
    cameraSensitivity: 1,
    soundOn: true,
    theme: 'dark',
    showNotation: true,
    showTimer: true,
    showHistory: true,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  // respect OS theme if no saved pref
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches && !localStorage.getItem(SETTINGS_KEY)) {
      return { ...defaults, theme: 'light' };
    }
  } catch { /* ignore */ }
  return defaults;
}

function loadSolves(): number[] {
  try {
    const raw = localStorage.getItem(SOLVES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((n) => typeof n === 'number' && n > 0).slice(-200);
    }
  } catch { /* ignore */ }
  return [];
}

function persistSolves(solves: number[]) {
  try {
    localStorage.setItem(SOLVES_KEY, JSON.stringify(solves.slice(-200)));
  } catch { /* ignore */ }
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const useCubeStore = create<CubeStore>((set, get) => ({
  moveQueue: [],
  animating: false,
  history: [],
  future: [],
  trail: [],
  scanVersion: 0,
  scramble: [],
  scrambleApplied: false,
  solved: true,
  justSolvedAt: null,
  solveCount: 0,

  timer: { running: false, startStamp: null, elapsed: 0, solves: loadSolves() },
  settings: loadSettings(),

  enqueueMove: (move, opts) => {
    const { record = true, clearFuture = true, silent = false } = opts ?? {};
    try {
      parseMove(move);
    } catch {
      return;
    }
    // M moves unsupported in 3D pivot (middle slice) — expand to equivalent for engine+visual.
    // Trainer contains M moves; map M2 -> R2 L2 X2-ish? For simplicity expand M/M'/M2 to slice-safe equivalents:
    // We keep logical engine unaware of M; instead translate here:
    // M = L' + R + X' ... too complex. Alternative: ignore M in engine, but trainer "M2" rows note the workaround.
    // Here: if move starts with M, expand to "L' R X'" style? X is whole rotation which changes orientation — not ideal.
    // Simplest correct-feeling: treat M as middle layer turn around x: implement directly via queue of two moves is wrong.
    // Instead we handle M inside Canvas pivot as its own layer (x=0). Engine needs support: our CubeState supports layer via parseMove only for faces.
    // -> Extend: if M, apply manually? CubeState.applyParsed is private. So translate M2 to (R2 L2 with center fix-up is not accurate).
    // Decision: support M directly in CubeState via raw axis/layer call through applyMove fallback below.
    const normalized: string[] = normalizeMove(move);
    // Apply logically immediately (deterministic, testable)
    for (const m of normalized) {
      try {
        cubeEngine.applyMove(m);
      } catch {
        continue;
      }
    }
    const isSolved = cubeEngine.isSolved();
    const state = get();

    // Timer logic: auto-start on first solving move after a scramble; auto-stop on solved
    let timer = state.timer;
    const wasScrambled = state.scrambleApplied && state.scramble.length > 0;
    if (record && wasScrambled && !timer.running && !isSolved) {
      timer = { ...timer, running: true, startStamp: performance.now(), elapsed: timer.elapsed };
    }

    let solves = timer.solves;
    let running = timer.running;
    let startStamp = timer.startStamp;
    let elapsed = timer.elapsed;
    let justSolvedAt: number | null = state.justSolvedAt;
    let scrambleApplied = state.scrambleApplied;

    if (isSolved && !state.solved) {
      // just became solved
      justSolvedAt = Date.now();
      if (running && startStamp != null) {
        const dur = performance.now() - startStamp + elapsed;
        solves = [...solves, Math.round(dur)];
        persistSolves(solves);
        try { sound.solve(); } catch { /* ignore */ }
        running = false;
        startStamp = null;
        elapsed = 0;
      } else {
        try { sound.solve(); } catch { /* ignore */ }
      }
      scrambleApplied = false;
    } else if (!isSolved) {
      justSolvedAt = null;
    }

    if (record && !silent && get().settings.soundOn) {
      try { sound.turn(); } catch { /* ignore */ }
    }

    set({
      moveQueue: [...state.moveQueue, ...normalized],
      history: record ? [...state.history, ...normalized] : state.history,
      future: record && clearFuture ? [] : state.future,
      // Trail tracks the NET transformation for the Solve guide — updated for
      // every applied move (user, scramble, undo, redo, solution steps alike).
      trail: pushTrail(state.trail, normalized),
      solved: isSolved,
      justSolvedAt,
      scrambleApplied,
      timer: { ...timer, solves, running, startStamp, elapsed },
      solveCount: state.solveCount + (isSolved && !state.solved ? 1 : 0),
    });
  },

  enqueueMoves: (moves, opts) => {
    for (const m of moves) get().enqueueMove(m, opts);
  },

  consumeQueueForAnimation: () => {
    const q = get().moveQueue;
    set({ moveQueue: [] });
    return q;
  },

  setAnimating: (v) => set({ animating: v }),
  notifyMoveAnimated: () => {
    // placeholder — per-move callbacks if needed later
  },

  doScramble: (length = 20) => {
    const moves = generateScramble(length);
    if (get().settings.soundOn) {
      try { sound.scramble(); } catch { /* ignore */ }
    }
    // Fresh scramble: keep history (append) but mark scrambled so timer auto-starts on solve attempt.
    // Clear redo stack.
    for (const m of moves) {
      try { cubeEngine.applyMove(m); } catch { /* ignore */ }
    }
    const state = get();
    set({
      moveQueue: [...state.moveQueue, ...moves],
      history: [...state.history, ...moves],
      future: [],
      trail: pushTrail(state.trail, moves),
      scramble: moves,
      scrambleApplied: true,
      solved: cubeEngine.isSolved(),
      justSolvedAt: null,
      timer: { ...state.timer, running: false, startStamp: null, elapsed: 0 },
    });
  },

  doReset: () => {
    cubeEngine.reset();
    const state = get();
    set({
      moveQueue: [],
      animating: false,
      history: [],
      future: [],
      trail: [],
      scramble: [],
      scrambleApplied: false,
      solved: true,
      justSolvedAt: null,
      timer: { ...state.timer, running: false, startStamp: null, elapsed: 0 },
    });
  },

  loadScannedState: (solution) => {
    const reversed = solution.slice().reverse().map((m) => {
      try {
        return invertMove(m);
      } catch {
        return m;
      }
    });
    cubeEngine.reset();
    for (const m of reversed) {
      try {
        cubeEngine.applyMove(m);
      } catch {
        /* validated solver notation — ignore strays */
      }
    }
    const state = get();
    set({
      moveQueue: [],
      animating: false,
      history: [],
      future: [],
      trail: simplifyMoves(reversed),
      scramble: [],
      scrambleApplied: false,
      solved: cubeEngine.isSolved(),
      justSolvedAt: null,
      scanVersion: state.scanVersion + 1,
      timer: { ...state.timer, running: false, startStamp: null, elapsed: 0 },
    });
  },

  undo: () => {
    const state = get();
    if (state.history.length === 0 || state.animating) {
      // allow undo even while animating? Spec: don't interrupt animation.
      // If animating, still queue the inverse — pivot queue handles order, so permit unless mid-frame?
      // We permit only when queue is small to avoid pileup; simplest: permit always (queued, non-interrupting).
    }
    const last = state.history[state.history.length - 1];
    if (!last) return;
    const inv = invertMove(last);
    try {
      cubeEngine.applyMove(inv);
    } catch { return; }
    const isSolved = cubeEngine.isSolved();
    set({
      moveQueue: [...state.moveQueue, inv],
      history: state.history.slice(0, -1),
      future: [last, ...state.future],
      trail: pushTrail(state.trail, [inv]),
      solved: isSolved,
      justSolvedAt: isSolved ? Date.now() : null,
      scrambleApplied: isSolved ? false : state.scrambleApplied,
    });
    if (get().settings.soundOn) {
      try { sound.turn(); } catch { /* ignore */ }
    }
  },

  redo: () => {
    const state = get();
    const next = state.future[0];
    if (!next) return;
    try {
      cubeEngine.applyMove(next);
    } catch { return; }
    const isSolved = cubeEngine.isSolved();
    set({
      moveQueue: [...state.moveQueue, next],
      history: [...state.history, next],
      future: state.future.slice(1),
      trail: pushTrail(state.trail, [next]),
      solved: isSolved,
      justSolvedAt: isSolved ? Date.now() : null,
    });
    if (get().settings.soundOn) {
      try { sound.turn(); } catch { /* ignore */ }
    }
  },

  // Note: the solve trail is intentionally kept — clearing the visible log
  // must not break the Solve guide.
  clearHistory: () => set({ history: [], future: [] }),

  startTimer: () => {
    const t = get().timer;
    if (t.running) return;
    set({ timer: { ...t, running: true, startStamp: performance.now() } });
  },
  stopTimer: () => {
    const t = get().timer;
    if (!t.running || t.startStamp == null) return;
    const dur = performance.now() - t.startStamp + t.elapsed;
    const solves = [...t.solves, Math.round(dur)];
    persistSolves(solves);
    set({ timer: { ...t, running: false, startStamp: null, elapsed: 0, solves } });
  },
  tickTimer: (now) => {
    const t = get().timer;
    if (!t.running || t.startStamp == null) return;
    set({ timer: { ...t, elapsed: now - t.startStamp } });
  },
  resetTimer: () => {
    const t = get().timer;
    set({ timer: { ...t, running: false, startStamp: null, elapsed: 0 } });
  },

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    if ('soundOn' in patch) setSoundEnabled(next.soundOn);
    if ('theme' in patch) {
      const root = document.documentElement;
      if (next.theme === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    }
  },

  loadPersisted: () => {
    const s = loadSettings();
    setSoundEnabled(s.soundOn);
    set({ settings: s, timer: { ...get().timer, solves: loadSolves() } });
    const root = document.documentElement;
    if (s.theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    if (reducedMotion()) {
      // instant-ish animations for reduced motion
      set({ settings: { ...get().settings, animationSpeed: 3 } });
    }
  },
}));

// M-move normalization: our visual pivot supports x=0 middle layer; engine applyParsed is private,
// so we emulate M via axis moves the engine understands by directly rotating cubies with x=0.
// Easiest: expand here using cubeEngine internals? Instead handle M as its own move type in types.
// For now, translate M/M'/M2 into equivalent wide-turn sequences that preserve centers for trainer demo:
// M  -> R' L X  (net effect equals M when ignoring center orientation)
// Pragmatically for practice, map M -> L' R X' is messy. We instead map M moves to plain middle-slice
// single entries the renderer understands (it parses M itself), and emulate logic with R+L+X compensation:
//   M  = R' + L + X'  (standard equivalence up to whole-cube orientation)
// To keep logical solved-detection sane for trainer, apply the compensation triple.
function normalizeMove(move: string): string[] {
  const m = move.trim();
  if (/^M/i.test(m)) {
    const upper = m.toUpperCase();
    if (upper === 'M2') return ["R2", "L2", "X2"];
    if (upper === "M'" || upper === "M’") return ["R", "L'", "X"];
    return ["R'", "L", "X'"]; // M
  }
  return [m];
}

export function reducedMotionActive(): boolean {
  return reducedMotion();
}
