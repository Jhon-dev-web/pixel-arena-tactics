// A horizontal progress bar (a profession's XP, a storage, a quest, a codex): `tone` 'full' (urgent) / 'xp' (green), `thin` for the slim one, `done` makes it green.
export default function Meter({ pct, tone, label, thin, done }: { pct: number; tone?: 'full' | 'xp'; label?: string; thin?: boolean; done?: boolean }) {
  const width = Math.max(0, Math.min(100, pct));
  const fill = tone ?? (done ? 'xp' : undefined);
  return (
    <div className={`ui-meter${thin ? ' thin' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} aria-label={label}>
      <div className={`ui-meter-fill${fill ? ` ${fill}` : ''}`} style={{ width: `${width}%` }} />
    </div>
  );
}
