import { useEffect, useState } from 'react';
import { useCubeStore } from '../store/useCubeStore';
import { formatTime } from '../utils/format';

function useLiveElapsed(): string {
  const running = useCubeStore((s) => s.timer.running);
  const startStamp = useCubeStore((s) => s.timer.startStamp);
  const elapsed = useCubeStore((s) => s.timer.elapsed);
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      force((x) => x + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  if (running && startStamp != null) {
    return formatTime(performance.now() - startStamp);
  }
  return formatTime(elapsed);
}

export default function TimerPanel() {
  const show = useCubeStore((s) => s.settings.showTimer);
  const timer = useCubeStore((s) => s.timer);
  const startTimer = useCubeStore((s) => s.startTimer);
  const stopTimer = useCubeStore((s) => s.stopTimer);
  const resetTimer = useCubeStore((s) => s.resetTimer);
  const solved = useCubeStore((s) => s.solved);
  const display = useLiveElapsed();

  if (!show) return null;

  const last = timer.solves.length > 0 ? timer.solves[timer.solves.length - 1] : null;

  return (
    <section aria-label="Speedcubing timer" className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Timer</h2>
        {solved ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            Solved{last != null ? ` · ${formatTime(last)}` : ''}
          </span>
        ) : timer.running ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">Timing…</span>
        ) : (
          <span className="text-[11px] text-neutral-400">Auto-starts on first move</span>
        )}
      </div>
      <div className="mt-1 font-mono text-[34px] font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white" aria-live="polite">
        {display}
      </div>
      <div className="mt-2 flex gap-2">
        {!timer.running ? (
          <button onClick={startTimer} className="h-8 flex-1 rounded-md bg-neutral-900 text-[13px] font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">Start</button>
        ) : (
          <button onClick={stopTimer} className="h-8 flex-1 rounded-md bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700">Stop</button>
        )}
        <button onClick={resetTimer} className="h-8 rounded-md border border-neutral-200 px-3 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Reset</button>
      </div>
      {timer.solves.length > 0 && (
        <div className="mt-3 border-t border-neutral-100 pt-2.5 dark:border-neutral-800">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Recent solves</p>
          <div className="mt-1.5 flex max-h-[84px] flex-wrap gap-1.5 overflow-y-auto">
            {timer.solves.slice(-8).reverse().map((s, i) => (
              <span key={`${s}-${i}`} className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                {formatTime(s)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
