import { useCubeStore } from '../store/useCubeStore';

export default function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const settings = useCubeStore((s) => s.settings);
  const update = useCubeStore((s) => s.updateSettings);

  return (
    <section aria-label="Settings" className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Settings</h2>
        {onClose && (
          <button onClick={onClose} aria-label="Close settings" className="h-7 w-7 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">✕</button>
        )}
      </div>

      <div className="mt-3 space-y-4">
        <div>
          <label htmlFor="anim-speed" className="flex justify-between text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
            Animation speed <span className="font-mono text-[12px] text-neutral-400">{settings.animationSpeed.toFixed(1)}×</span>
          </label>
          <input
            id="anim-speed"
            type="range"
            min={0.5}
            max={3}
            step={0.25}
            value={settings.animationSpeed}
            onChange={(e) => update({ animationSpeed: Number(e.target.value) })}
            className="mt-1.5 w-full accent-neutral-900 dark:accent-white"
          />
          <p className="text-[11px] text-neutral-400">Higher is faster. Reduced-motion users get instant turns.</p>
        </div>

        <div>
          <label htmlFor="cam-sens" className="flex justify-between text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
            Camera sensitivity <span className="font-mono text-[12px] text-neutral-400">{settings.cameraSensitivity.toFixed(1)}×</span>
          </label>
          <input
            id="cam-sens"
            type="range"
            min={0.4}
            max={2}
            step={0.1}
            value={settings.cameraSensitivity}
            onChange={(e) => update({ cameraSensitivity: Number(e.target.value) })}
            className="mt-1.5 w-full accent-neutral-900 dark:accent-white"
          />
        </div>

        <div className="grid gap-2">
          <Toggle label="Sound effects" checked={settings.soundOn} onChange={(v) => update({ soundOn: v })} hint="Subtle clicks only" />
          <Toggle label="Dark theme" checked={settings.theme === 'dark'} onChange={(v) => update({ theme: v ? 'dark' : 'light' })} />
          <Toggle label="Show move notation" checked={settings.showNotation} onChange={(v) => update({ showNotation: v })} />
          <Toggle label="Show timer" checked={settings.showTimer} onChange={(v) => update({ showTimer: v })} />
          <Toggle label="Show move history" checked={settings.showHistory} onChange={(v) => update({ showHistory: v })} />
        </div>
      </div>
    </section>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-neutral-200 px-2.5 py-2 dark:border-neutral-800">
      <span>
        <span className="block text-[13px] font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
        {hint && <span className="block text-[11px] text-neutral-400">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-neutral-900 dark:accent-white"
      />
    </label>
  );
}
