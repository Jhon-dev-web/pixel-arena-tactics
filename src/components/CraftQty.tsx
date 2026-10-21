import { useEffect, useState } from 'react';
import { t } from '../locales';
import { SaveData } from '../game/engine';
import { clampCraftQty, craftTimeLeftMs, craftUnitMs, craftUnitsFinished, maxCraftQty } from '../game/craftJob';
import type { CraftJobKind } from '../game/craftJobTypes';
import { Meter, SecondaryButton } from './ui';

/** "45 s" / "2 min 5 s" */
export function fmtCraftTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total < 60) return t('craft.seconds', { n: total });
  return t('craft.minutes', { m: Math.floor(total / 60), s: total % 60 });
}

/** A clock that ticks every second while `active` (the progress bar of a running job). */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** The quantity of a recipe: - / number / + and "Max" (the most the hero's materials, Gold, shards, gems and room allow), plus the time it takes. */
export function QtyPicker({
  save,
  kind,
  recipeId,
  qty,
  onChange,
}: {
  save: SaveData;
  kind: CraftJobKind;
  recipeId: string;
  qty: number;
  onChange: (n: number) => void;
}) {
  // what the hero is busy with is the notice's business (a click on a busy hero explains it); here only what he could afford
  const max = maxCraftQty({ ...save, activeHuntingZone: null, activeOreId: null, activeWoodId: null, craftJob: null }, kind, recipeId);
  const shown = clampCraftQty(save, kind, recipeId, qty);
  const set = (n: number) => onChange(Math.max(1, Math.min(Math.max(1, max), Math.floor(Number.isFinite(n) ? n : 1))));
  return (
    <div className="craft-qty" data-ui>
      <span className="craft-qty-label">{t('craft.qty')}</span>
      <button className="craft-qty-btn" onClick={() => set(shown - 1)} disabled={shown <= 1} aria-label={t('craft.qtyMinus')} data-ui>
        −
      </button>
      <input className="craft-qty-input" type="number" inputMode="numeric" min={1} max={Math.max(1, max)} value={shown} onChange={(e) => set(Number(e.target.value))} aria-label={t('craft.qty')} />
      <button className="craft-qty-btn" onClick={() => set(shown + 1)} disabled={shown >= max} aria-label={t('craft.qtyPlus')} data-ui>
        +
      </button>
      <button className="craft-qty-max" onClick={() => set(max)} disabled={max < 1} data-ui>
        {t('craft.max')}
      </button>
      <span className="craft-qty-time">{t('craft.time', { time: fmtCraftTime(craftUnitMs(recipeId) * shown) })}</span>
    </div>
  );
}

/** The running production job: what, how far, how long is left, and Cancel. Renders nothing without a job. */
export function CraftJobPanel({ save, name, stalled, onCancel }: { save: SaveData; name: (recipeId: string) => string; stalled?: boolean; onCancel: () => void }) {
  const job = save.craftJob;
  const now = useNowTick(!!job);
  if (!job) return null;
  const finished = Math.max(job.done, craftUnitsFinished(job, now));
  const pct = (finished / job.qty) * 100;
  return (
    <div className="craft-job" role="status" aria-live="polite">
      <div className="craft-job-head">
        <span className="craft-job-name">{t('craft.making', { name: `${job.qty}× ${name(job.recipeId)}` })}</span>
        <span className="craft-job-count">{t('craft.progress', { done: finished, total: job.qty })}</span>
      </div>
      <Meter pct={pct} tone="xp" label={t('craft.progress', { done: finished, total: job.qty })} />
      <div className="craft-job-foot">
        <span className="craft-job-left">{t('craft.left', { time: fmtCraftTime(craftTimeLeftMs(job, now)) })}</span>
        {stalled && <span className="craft-job-stalled">{t('craft.stalledBag')}</span>}
        <SecondaryButton onClick={onCancel}>{t('craft.cancel')}</SecondaryButton>
      </div>
    </div>
  );
}
