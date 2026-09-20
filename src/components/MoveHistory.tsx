import { useState } from 'react';
import { useCubeStore } from '../store/useCubeStore';

export default function MoveHistory({ bare = false }: { bare?: boolean }) {
  const history = useCubeStore((s) => s.history);
  const future = useCubeStore((s) => s.future);
  const undo = useCubeStore((s) => s.undo);
  const redo = useCubeStore((s) => s.redo);
  const clearHistory = useCubeStore((s) => s.clearHistory);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (history.length === 0) return;
    try {
      await navigator.clipboard.writeText(history.join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  return (
    <section aria-label="Move history" className={bare ? undefined : 'rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900'}>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Moves <span className="ml-1 font-mono text-[11px] font-normal text-neutral-400">{history.length}</span>
        </h2>
        <div className="flex gap-1.5">
          <button onClick={undo} disabled={history.length === 0} aria-label="Undo" className="h-7 rounded-md border border-neutral-200 px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">↶ Undo</button>
          <button onClick={redo} disabled={future.length === 0} aria-label="Redo" className="h-7 rounded-md border border-neutral-200 px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">↷ Redo</button>
        </div>
      </div>
      <div className="mt-2.5 flex max-h-[132px] min-h-[44px] flex-wrap content-start gap-1.5 overflow-y-auto" aria-live="polite">
        {history.length === 0 ? (
          <span className="text-[13px] text-neutral-400">No moves yet — turn a face to begin.</span>
        ) : (
          history.map((m, i) => (
            <span
              key={`${i}-${m}`}
              className={`move-chip rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300 ${i === history.length - 1 ? 'font-semibold' : ''}`}
            >
              {m}
            </span>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={copy} disabled={history.length === 0} className="h-7 flex-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
          {copied ? 'Copied algorithm' : 'Copy algorithm'}
        </button>
        <button onClick={clearHistory} disabled={history.length === 0} className="h-7 rounded-md border border-neutral-200 px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
          Clear
        </button>
      </div>
    </section>
  );
}
