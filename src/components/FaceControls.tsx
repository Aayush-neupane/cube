import { useState } from 'react';
import { useCubeStore } from '../store/useCubeStore';
import { FACE_COLORS, Face } from '../cube/types';

const FACES_UI: Array<{ face: Face; name: string }> = [
  { face: 'U', name: 'Up' },
  { face: 'D', name: 'Down' },
  { face: 'F', name: 'Front' },
  { face: 'B', name: 'Back' },
  { face: 'L', name: 'Left' },
  { face: 'R', name: 'Right' },
];

/**
 * The only turn controls most people need: six big face buttons.
 * Tap = clockwise · arm ′ for reverse · arm 2 for a double turn.
 * Whole-cube rotations stay on the keyboard (X / Y / Z).
 */
export default function FaceControls() {
  const enqueueMove = useCubeStore((s) => s.enqueueMove);
  const show = useCubeStore((s) => s.settings.showNotation);
  const [prime, setPrime] = useState(false);
  const [double, setDouble] = useState(false);
  if (!show) return null;

  const turn = (face: Face) => {
    enqueueMove(`${face}${double ? '2' : prime ? "'" : ''}`);
    setPrime(false);
    setDouble(false);
  };

  const armedLabel = double ? 'double turn' : prime ? 'counter-clockwise' : 'clockwise';

  return (
    <section aria-label="Turn a face" className="rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-1.5">
        {FACES_UI.map(({ face, name }) => (
          <button
            key={face}
            onClick={() => turn(face)}
            aria-label={`Turn ${name} face ${armedLabel}`}
            title={`${name} (${face})`}
            className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md border border-neutral-200 transition-colors hover:border-neutral-900 active:bg-neutral-900 active:text-white active:[&_.fdot]:border-white/30 dark:border-neutral-700 dark:hover:border-neutral-400 dark:active:bg-white dark:active:text-neutral-900"
          >
            <span
              aria-hidden
              className="fdot inline-block h-2.5 w-2.5 rounded-[3px] border border-black/10"
              style={{ background: FACE_COLORS[face] }}
            />
            <span className="font-mono text-[16px] font-bold leading-none">{face}</span>
          </button>
        ))}
        <button
          onClick={() => { setPrime((v) => !v); setDouble(false); }}
          aria-pressed={prime}
          aria-label="Reverse next turn"
          title="Reverse: the next tap turns counter-clockwise"
          className={`h-14 w-11 shrink-0 rounded-md border font-mono text-[20px] font-bold transition-colors ${
            prime
              ? 'border-transparent bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-500 hover:text-neutral-700 dark:border-neutral-600 dark:hover:border-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          ′
        </button>
        <button
          onClick={() => { setDouble((v) => !v); setPrime(false); }}
          aria-pressed={double}
          aria-label="Double next turn"
          title="Double: the next tap turns twice (e.g. U2)"
          className={`h-14 w-11 shrink-0 rounded-md border font-mono text-[15px] font-bold transition-colors ${
            double
              ? 'border-transparent bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-500 hover:text-neutral-700 dark:border-neutral-600 dark:hover:border-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          2×
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-neutral-400">
        {double
          ? 'Double armed — tap a face for a 2× turn (e.g. U → U2)'
          : prime
            ? 'Reverse armed — next tap goes counter-clockwise'
            : 'Tap a face to turn it · ′ reverses · 2× doubles'}
      </p>
    </section>
  );
}
