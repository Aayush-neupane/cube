import { useState } from 'react';
import MoveHistory from './MoveHistory';
import StatsPanel from './StatsPanel';
import AlgorithmTrainer from './AlgorithmTrainer';
import SettingsPanel from './SettingsPanel';
import HelpPanel from './HelpPanel';
import { useCubeStore } from '../store/useCubeStore';

const TABS = ['History', 'Statistics', 'Algorithms', 'Settings', 'Help'] as const;
type Tab = (typeof TABS)[number];

/** Secondary tools live here behind tabs so the main view stays calm. */
export default function Panels() {
  const [tab, setTab] = useState<Tab>('History');
  const showHistory = useCubeStore((s) => s.settings.showHistory);

  const visible = TABS.filter((t) => t !== 'History' || showHistory);
  const active: Tab = visible.includes(tab) ? tab : 'Statistics';

  return (
    <section aria-label="More tools" className="mt-3 rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Secondary panels">
        {visible.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={active === t}
            onClick={() => setTab(t)}
            className={`h-8 shrink-0 rounded-md px-3 text-[13px] font-medium ${
              active === t
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-3" role="tabpanel">
        {active === 'History' && <MoveHistory bare />}
        {active === 'Statistics' && <StatsPanel bare />}
        {active === 'Algorithms' && <AlgorithmTrainer bare />}
        {active === 'Settings' && <SettingsPanel />}
        {active === 'Help' && <HelpPanel bare />}
      </div>
    </section>
  );
}
