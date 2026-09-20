import { useEffect, useState } from 'react';
import CubeCanvas from './components/Cube/CubeCanvas';
import ScrambleBar from './components/ScrambleBar';
import ScanCube from './components/ScanCube';
import SolveGuide from './components/SolveGuide';
import FaceControls from './components/FaceControls';
import TimerPanel from './components/TimerPanel';
import Panels from './components/Panels';
import SiteLogo from './components/SiteLogo';
import { SITE } from './site';
import { useCubeStore } from './store/useCubeStore';
import { formatTime } from './utils/format';

export default function App() {
  const [scanning, setScanning] = useState(false);  const doScramble = useCubeStore((s) => s.doScramble);
  const doReset = useCubeStore((s) => s.doReset);
  const undo = useCubeStore((s) => s.undo);
  const redo = useCubeStore((s) => s.redo);
  const canUndo = useCubeStore((s) => s.history.length > 0);
  const canRedo = useCubeStore((s) => s.future.length > 0);
  const solved = useCubeStore((s) => s.solved);
  const justSolvedAt = useCubeStore((s) => s.justSolvedAt);
  const solves = useCubeStore((s) => s.timer.solves);
  const settings = useCubeStore((s) => s.settings);
  const updateSettings = useCubeStore((s) => s.updateSettings);
  const loadPersisted = useCubeStore((s) => s.loadPersisted);

  useEffect(() => {
    loadPersisted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const k = e.key;

      if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        doScramble(20);
        return;
      }
      if (k === 'Enter') {
        if (target && target.tagName === 'BUTTON') return;
        e.preventDefault();
        doReset();
        return;
      }
      if (k === 'Backspace') {
        e.preventDefault();
        undo();
        return;
      }
      const upper = k.toUpperCase();
      if (['U', 'D', 'L', 'R', 'F', 'B', 'X', 'Y', 'Z'].includes(upper) && k.length === 1) {
        e.preventDefault();
        const move = e.shiftKey ? `${upper}'` : upper;
        useCubeStore.getState().enqueueMove(move);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doScramble, doReset, undo, redo]);

  const lastSolve = solves.length > 0 ? solves[solves.length - 1] : null;
  const showSolvedToast = solved && justSolvedAt != null && Date.now() - justSolvedAt < 8000;

  const socials = [
    { label: 'Portfolio', href: SITE.portfolioUrl },
    { label: 'GitHub', href: SITE.githubUrl },
    { label: 'Instagram', href: SITE.instagramUrl },
    ...(SITE.redditUrl ? [{ label: 'Reddit', href: SITE.redditUrl }] : []),
  ];

  return (
    <div className="min-h-full bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Top navigation */}
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex h-[52px] max-w-[1120px] items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <SiteLogo size={30} />
            <div className="leading-tight">
              <p className="text-[14px] font-extrabold tracking-[0.18em]">{SITE.wordmark}</p>
              <p className="text-[8px] uppercase tracking-[0.22em] text-neutral-400">{SITE.tagline}</p>
            </div>
          </div>
          <nav className="flex items-center gap-1.5" aria-label="App">
            <button
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              aria-label="Toggle theme"
              className="h-8 w-8 rounded-md border border-neutral-200 text-[13px] text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {settings.theme === 'dark' ? '☾' : '☀'}
            </button>
            <button
              onClick={() => updateSettings({ soundOn: !settings.soundOn })}
              aria-label="Toggle sound"
              aria-pressed={settings.soundOn}
              className="h-8 w-8 rounded-md border border-neutral-200 text-[13px] text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {settings.soundOn ? '♪' : '∅'}
            </button>
          </nav>
        </div>
        <div aria-hidden className="aurora-hairline" />
      </header>

      {/* Main */}
      <main className="mx-auto max-w-[1120px] px-4 pb-10 pt-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Cube + primary controls */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="relative h-[360px] sm:h-[460px] lg:h-[520px]">
              <CubeCanvas />
              {showSolvedToast && (
                <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2" aria-live="polite">
                  <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-neutral-900 dark:text-emerald-300">
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Solved{lastSolve != null ? ` · ${formatTime(lastSolve)}` : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Single action deck */}
            <div className="grid grid-cols-4 gap-2" aria-label="Cube actions">
              <button
                onClick={() => doScramble(20)}
                className="h-11 rounded-md bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Scramble
              </button>
              <button
                onClick={undo}
                disabled={!canUndo}
                className="h-11 rounded-md border border-neutral-200 bg-white text-[14px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                ↶ Undo
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="h-11 rounded-md border border-neutral-200 bg-white text-[14px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                ↷ Redo
              </button>
              <button
                onClick={doReset}
                className="h-11 rounded-md border border-neutral-200 bg-white text-[14px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Reset
              </button>
            </div>

            <FaceControls />
          </div>

          {/* Sidebar: scan, scramble, guide, timer */}
          <div className="flex min-w-0 flex-col gap-3">
            <button
              onClick={() => setScanning(true)}
              className="aurora-btn h-11 rounded-md text-[14px] font-semibold text-white"
            >
              📷 Scan a real cube
            </button>
            <ScrambleBar />
            <SolveGuide />
            <TimerPanel />
          </div>
        </div>

        <Panels />

        {scanning && <ScanCube onClose={() => setScanning(false)} />}

        <footer className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800" aria-label="Footer">
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href={SITE.portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${SITE.developer} — portfolio`}
              className="flex items-center gap-2"
            >
              <SiteLogo size={28} />
              <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                Developed by <span className="font-semibold text-neutral-800 dark:text-neutral-100">{SITE.developer}</span>
              </span>
            </a>
            <nav className="flex items-center gap-1 text-[12px] text-neutral-400" aria-label="Social links">
              {socials.map((s, i) => (
                <span key={s.label} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden>·</span>}
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="px-1 hover:text-neutral-700 dark:hover:text-neutral-200">
                    {s.label}
                  </a>
                </span>
              ))}
            </nav>
            <p className="text-[11px] text-neutral-400">© 2026 {SITE.appName}. All solves stay in your browser.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
