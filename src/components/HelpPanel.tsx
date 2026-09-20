export default function HelpPanel({ bare = false }: { bare?: boolean }) {
  const rows: Array<[string, string]> = [
    ['U / D / L / R / F / B', 'Turn face clockwise'],
    ['Shift + letter', 'Counter-clockwise (e.g. ⇧U → U′)'],
    ['X / Y / Z (+ ⇧)', 'Whole-cube rotation'],
    ['Space', 'Scramble'],
    ['Enter', 'Reset cube'],
    ['Backspace / ⌘Z', 'Undo'],
    ['⇧⌘Z / Ctrl+Y', 'Redo'],
  ];
  return (
    <section aria-label="Keyboard shortcuts" className={bare ? undefined : 'rounded-lg border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900'}>
      <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Keyboard</h2>
      <dl className="mt-2 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 text-[12px]">
            <dt className="font-mono rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">{k}</dt>
            <dd className="text-right text-neutral-500">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-neutral-400">On screen: tap a face to turn it · ′ reverses · 2× doubles (e.g. U2, R2).</p>
    </section>
  );
}
