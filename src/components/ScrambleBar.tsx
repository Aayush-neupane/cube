import { useState } from 'react';
import { useCubeStore } from '../store/useCubeStore';

export default function ScrambleBar() {
  const scramble = useCubeStore((s) => s.scramble);
  const doScramble = useCubeStore((s) => s.doScramble);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (scramble.length === 0) return;
    try {
      await navigator.clipboard.writeText(scramble.join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  return (
    <section aria-label="Scramble" className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Scramble</h2>
        <span className="text-[11px] text-neutral-400">20 moves</span>
      </div>
      <p className="mt-2 min-h-[40px] font-mono text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300" aria-live="polite">
        {scramble.length > 0 ? scramble.join(' ') : <span className="text-neutral-400">Press Scramble to generate a challenge.</span>}
      </p>
      {scramble.length > 0 && (
        <p className="mt-1 text-[11px] text-neutral-400">Want the answer? The Solve guide just below gives step-by-step instructions.</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => doScramble(20)}
          className="h-8 flex-1 rounded-md bg-neutral-900 px-3 text-[13px] font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Scramble
        </button>
        <button
          onClick={() => doScramble(20)}
          className="h-8 rounded-md border border-neutral-200 px-3 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          New
        </button>
        <button
          onClick={copy}
          disabled={scramble.length === 0}
          className="h-8 rounded-md border border-neutral-200 px-3 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          aria-label="Copy scramble"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}
