import { useMemo, useState } from 'react';
import { ALGORITHMS, ALGO_GROUPS, Algo } from '../cube/algorithms';
import { useCubeStore } from '../store/useCubeStore';

export default function AlgorithmTrainer({ bare = false }: { bare?: boolean }) {
  const [group, setGroup] = useState<(typeof ALGO_GROUPS)[number] | 'All'>('OLL');
  const [practiced, setPracticed] = useState<string | null>(null);
  const enqueueMoves = useCubeStore((s) => s.enqueueMoves);

  const list = useMemo(() => {
    if (group === 'All') return ALGORITHMS;
    return ALGORITHMS.filter((a) => a.group === group);
  }, [group]);

  const practice = (algo: Algo) => {
    // Filter out M-moves that the 3D pivot can't cleanly do? Store expands M -> R/L/X compensation.
    // Trainer rows with M note this in description.
    enqueueMoves(algo.moves);
    setPracticed(algo.id);
    setTimeout(() => setPracticed((p) => (p === algo.id ? null : p)), 1600);
  };

  const copy = async (algo: Algo) => {
    try {
      await navigator.clipboard.writeText(algo.notation);
    } catch { /* ignore */ }
  };

  return (
    <section aria-label="Algorithm trainer" className={bare ? undefined : 'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Algorithm trainer</h2>
          <p className="mt-0.5 text-[12px] text-neutral-500">Practice OLL, PLL and F2L on the live cube. Separate from the main solve flow.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-neutral-200 p-0.5 dark:border-neutral-700" role="tablist" aria-label="Algorithm groups">
          {(['OLL', 'PLL', 'F2L', 'All'] as const).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              onClick={() => setGroup(g as typeof group)}
              className={`h-7 rounded px-2.5 text-[12px] font-medium ${group === g ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100'}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((algo) => (
          <article key={algo.id} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{algo.name}</h3>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{algo.group}</span>
            </div>
            <p className="mt-1 font-mono text-[12.5px] leading-relaxed text-neutral-700 dark:text-neutral-300">{algo.notation}</p>
            <p className="mt-1 text-[12px] text-neutral-500">{algo.description}</p>
            <div className="mt-2.5 flex gap-1.5">
              <button
                onClick={() => practice(algo)}
                className={`h-8 flex-1 rounded-md text-[13px] font-medium ${practiced === algo.id ? 'bg-emerald-600 text-white' : 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'}`}
              >
                {practiced === algo.id ? 'Applied ✓' : 'Practice'}
              </button>
              <button onClick={() => copy(algo)} aria-label={`Copy ${algo.name}`} className="h-8 rounded-md border border-neutral-200 px-2.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                Copy
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
