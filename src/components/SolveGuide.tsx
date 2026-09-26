import { useState } from 'react';
import { useCubeStore } from '../store/useCubeStore';
import { cubeEngine } from '../cube/CubeState';
import { ensureSolver, solveFacelets } from '../cube/externalSolver';
import { describeMove, solutionForTrail } from '../cube/solver';

/**
 * On-request, step-by-step instructions to solve the cube from its current
 * state. Two engines: Exact (reverse + inverse of your trail — always in
 * sync with extra moves) and Shortest (optimal Kociemba solution computed
 * from the live cube state; recompute after each move you make).
 */
export default function SolveGuide() {
  const trail = useCubeStore((s) => s.trail);
  const solved = useCubeStore((s) => s.solved);
  const enqueueMove = useCubeStore((s) => s.enqueueMove);
  const enqueueMoves = useCubeStore((s) => s.enqueueMoves);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'exact' | 'short'>('exact');
  const [short, setShort] = useState<string[] | null>(null);
  const [shortKey, setShortKey] = useState('');
  const [computing, setComputing] = useState(false);
  const [solveErr, setSolveErr] = useState('');

  // Solved → nothing to teach.
  if (solved || trail.length === 0) return null;

  const exact = solutionForTrail(trail);
  const solution = mode === 'short' ? (short ?? []) : exact;
  const stale = mode === 'short' && short !== null && shortKey !== trail.join(' ');
  const next = solution[0];

  const findShortest = async () => {
    setComputing(true);
    setSolveErr('');
    try {
      await ensureSolver();
      const moves = await solveFacelets(cubeEngine.toFacelets());
      setShort(moves);
      setShortKey(trail.join(' '));
    } catch (e) {
      setSolveErr(e instanceof Error ? e.message : 'Solver failed — try again.');
    } finally {
      setComputing(false);
    }
  };

  const step = () => {
    if (!next) return;
    enqueueMove(next);
  };

  const autoSolve = () => {
    if (solution.length === 0) return;
    enqueueMoves(solution, { silent: true });
  };

  const copy = async () => {
    if (solution.length === 0) return;
    try {
      await navigator.clipboard.writeText(solution.join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  // Collapsed: a single inviting request button.
  if (!open) {
    return (
      <section aria-label="Solve guide" className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Stuck?</h2>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              Get exact instructions for this scramble · {solution.length} move{solution.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="mt-2.5 h-9 w-full rounded-md bg-neutral-900 text-[13px] font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Show me how to solve it
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Solve guide" className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Solve guide <span className="ml-1 font-mono text-[11px] font-normal text-neutral-400">{solution.length} left</span>
        </h2>
        <button
          onClick={() => setOpen(false)}
          className="h-7 rounded-md border border-neutral-200 px-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Hide
        </button>
      </div>

      <div className="mt-2.5 flex gap-1.5" role="tablist" aria-label="Solution type">
        {(['exact', 'short'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`h-7 flex-1 rounded-md text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            {m === 'exact' ? `Exact · ${exact.length}` : 'Shortest'}
          </button>
        ))}
      </div>

      {mode === 'short' && short === null && (
        <button
          onClick={findShortest}
          disabled={computing}
          className="mt-2.5 h-9 w-full rounded-md bg-neutral-900 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {computing ? 'Loading solver tables…' : 'Find shortest solution'}
        </button>
      )}
      {mode === 'short' && short !== null && stale && (
        <button
          onClick={findShortest}
          disabled={computing}
          className="mt-2.5 h-8 w-full rounded-md border border-amber-300 bg-amber-50 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {computing ? 'Computing…' : 'Cube changed — recompute shortest'}
        </button>
      )}
      {solveErr && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {solveErr}
        </p>
      )}

      {solution.length > 0 && (
      <>
      {/* Next move hero */}
      <div className="mt-2.5 rounded-md bg-neutral-50 p-3 text-center dark:bg-neutral-800/60" aria-live="polite">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Do this move</p>
        <p className="mt-0.5 font-mono text-[28px] font-bold leading-none tracking-tight text-neutral-900 dark:text-white">{next}</p>
        <p className="mt-1.5 text-[13px] text-neutral-600 dark:text-neutral-300">{describeMove(next)}</p>
      </div>

      {/* Full remaining sequence */}
      <div className="mt-2.5 flex max-h-[96px] flex-wrap content-start gap-1.5 overflow-y-auto">
        {solution.map((m, i) => (
          <span
            key={`${i}-${m}`}
            className={`rounded border px-1.5 py-0.5 font-mono text-[12px] ${
              i === 0
                ? 'border-transparent bg-neutral-900 font-semibold text-white dark:bg-white dark:text-neutral-900'
                : 'border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'
            }`}
          >
            {m}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={step}
          className="h-9 rounded-md bg-neutral-900 text-[13px] font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Next move ▸
        </button>
        <button
          onClick={autoSolve}
          className="h-9 rounded-md border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Auto-solve
        </button>
      </div>
      <button
        onClick={copy}
        className="mt-2 h-7 w-full rounded-md border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {copied ? 'Solution copied' : 'Copy full solution'}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
        Tip: press “Next move” after each turn you make — the guide follows along.
      </p>
      </>
      )}
    </section>
  );
}
