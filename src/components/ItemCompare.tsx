import { useMemo } from 'react';
import { t } from '../locales';
import type { SaveData } from '../game/engine';
import type { GearSlot } from '../game/gear';
import type { GearInstance } from '../game/gearInstances';
import { compareItem } from '../game/statBreakdown';
import { fmtDelta, fmtStat, statName } from './statFormat';

const MAX_SHOWN = 4;

// "com este item: Dano 92 → 104": what the hero's permanent stats would be with this piece worn instead of what the slot holds, from the same breakdown the panel uses
// (set bonuses completed or broken by the swap included). Nothing for the piece that is already worn, and nothing for an item that is not gear of a slot.
export default function ItemCompare({ save, slot, templateId, instance }: { save: SaveData; slot: GearSlot; templateId: string; instance?: GearInstance | null }) {
  const cmp = useMemo(() => {
    try {
      return compareItem(save, { slot, templateId, instance: instance ?? undefined });
    } catch {
      return null;
    }
  }, [save, slot, templateId, instance]);
  if (!cmp) return null;
  const shown = cmp.changes.slice(0, MAX_SHOWN);
  return (
    <div className="item-compare" data-testid="item-compare">
      <span className="item-compare-lead">{t('statsPanel.compare')}</span>
      {cmp.changes.length === 0 && <span className="item-compare-none">{t('statsPanel.compareNone')}</span>}
      {shown.map((c) => (
        <span className={`item-compare-chg ${c.after > c.before ? 'up' : 'down'}`} key={c.id}>
          {statName(c.id)} {fmtStat(c.id, c.before)} <span aria-hidden>→</span> {fmtStat(c.id, c.after)}
          {Math.abs(c.setDelta) > 1e-9 && <span className="item-compare-set"> {t('statsPanel.compareSet', { v: fmtDelta(c.id, c.setDelta) })}</span>}
        </span>
      ))}
      {cmp.changes.length > shown.length && <span className="item-compare-more">{t('statsPanel.compareMore', { n: cmp.changes.length - shown.length })}</span>}
    </div>
  );
}
