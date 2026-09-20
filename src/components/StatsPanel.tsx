import { useCubeStore } from '../store/useCubeStore';
import { averageOf, formatTime } from '../utils/format';

export default function StatsPanel({ bare = false }: { bare?: boolean }) {
  const solves = useCubeStore((s) => s.timer.solves);
  const doResetSolves = () => {
    try {
      localStorage.removeItem('rubik-sim.solves.v1');
    } catch { /* ignore */ }
    useCubeStore.setState((s) => ({ timer: { ...s.timer, solves: [] } }));
  };

  const current = solves.length > 0 ? solves[solves.length - 1] : null;
  const best = solves.length > 0 ? Math.min(...solves) : null;
  const ao5 = averageOf(solves, 5);
  const ao12 = averageOf(solves, 12);

  const rows: Array<[string, string]> = [
    ['Current', current != null ? formatTime(current) : '—'],
    ['Best', best != null ? formatTime(best) : '—'],
    ['Ao5', ao5 != null ? formatTime(ao5) : '—'],
    ['Ao12', ao12 != null ? formatTime(ao12) : '—'],
    ['Total', String(solves.length)],
  ];

  return (
    <section aria-label="Solve statistics" className={bare ? undefined : 'rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900'}>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Statistics</h2>
        {solves.length > 0 && (
          <button onClick={doResetSolves} className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">Clear</button>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-5">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-md bg-neutral-50 px-2 py-1.5 text-center dark:bg-neutral-800/60">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{k}</dt>
            <dd className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-neutral-400">Stored locally in your browser.</p>
    </section>
  );
}
