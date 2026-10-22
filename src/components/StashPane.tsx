import { useEffect, useState } from 'react';
import { fmtNum, t } from '../locales';
import { SaveData } from '../game/engine';
import { GEAR, isInstancedSlot } from '../game/gear';
import { MATERIALS, MaterialId, getMaterial, hasMaterials } from '../game/materials';
import { CONSUMABLES } from '../game/consumables';
import { STACK_LIMIT, slotsForQty } from '../game/inventory';
import { StackKind, nextStashUpgrade, stashCapacity, stashSlotsUsed } from '../game/stash';
import Assets from '../assets.json';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';
import { Button, Dialog, StatList, StatRow } from './ui';
import FreeSpace from './FreeSpace';

// The Baú do acampamento: its slots (the same stack rule as the inventory), the item the player picked, and the upgrade dialog.
// Moving things in and out is done from the item detail (InventoryPanel); here only what lives in the stash is shown.

const matText = (k: string): string => t(`materials.${k}`);
const gearName = (k: string): string => t(`gear.${k}`);
const stackCells = (qty: number): number[] => Array.from({ length: slotsForQty(qty) }, (_, i) => Math.min(STACK_LIMIT, qty - i * STACK_LIMIT));

export interface StashSel {
  kind: StackKind;
  id: string;
}

export default function StashPane({
  save,
  selected,
  onSelect,
  onUpgrade,
}: {
  save: SaveData;
  selected: StashSel | null;
  onSelect: (sel: StashSel) => void;
  onUpgrade: () => void;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  useEffect(() => {
    if (!upgradeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setUpgradeOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [upgradeOpen]);

  const stash = save.stash;
  const used = stashSlotsUsed(save);
  const capacity = stashCapacity(save);
  const quote = nextStashUpgrade(save);
  const affordable = !!quote && save.gold >= quote.gold && hasMaterials(save.materials, quote.materials);
  const isSel = (kind: StackKind, id: string) => selected?.kind === kind && selected.id === id;

  const materialItems = MATERIALS.filter((m) => (stash.materials[m.id] ?? 0) > 0);
  const consumableItems = CONSUMABLES.filter((c) => (stash.consumables[c.id] ?? 0) > 0);
  const gearItems = GEAR.filter((g) => !isInstancedSlot(g.slot) && (stash.gear[g.id] ?? 0) > 0);
  const cells = [
    ...gearItems.flatMap((g) => stackCells(stash.gear[g.id]).map((n, i) => ({ key: `g:${g.id}:${i}`, kind: 'gear' as StackKind, id: g.id, n, icon: <GearIcon item={g} />, name: gearName(g.nameKey) }))),
    ...materialItems.flatMap((m) => stackCells(stash.materials[m.id] ?? 0).map((n, i) => ({ key: `m:${m.id}:${i}`, kind: 'material' as StackKind, id: m.id, n, icon: <MaterialIcon item={m} />, name: matText(m.nameKey) }))),
    ...consumableItems.flatMap((c) => stackCells(stash.consumables[c.id] ?? 0).map((n, i) => ({ key: `c:${c.id}:${i}`, kind: 'consumable' as StackKind, id: c.id, n, icon: <ConsumableIcon item={c} />, name: t(`consumables.${c.nameKey}`) }))),
  ];

  return (
    <>
      <div className="inventory-summary">
        {used > capacity && (
          <span className="inventory-summary-chip over" role="status">
            {t('stash.space', { n: used, m: capacity })} · {t('inventory.overCapacity')}
          </span>
        )}
        <button className="inventory-expand-btn" onClick={() => setUpgradeOpen(true)} aria-label={t('stash.upgradeTitle')} data-ui>
          +
        </button>
      </div>
      <p className="stash-note">{t('stash.note')}</p>

      <div className="inv-grid stash-grid">
        {cells.map((c) => (
          <button key={c.key} className={`inv-slot${isSel(c.kind, c.id) ? ' active' : ''}`} onClick={() => onSelect({ kind: c.kind, id: c.id })} title={c.name} aria-label={`${c.name} ×${fmtNum(c.n)}`} data-ui>
            <span className="inv-icon">{c.icon}</span>
            <span className="inv-qty">×{fmtNum(c.n)}</span>
          </button>
        ))}
        <FreeSpace free={Math.max(0, capacity - used)} />
      </div>

      {upgradeOpen && (
        <Dialog
          icon={<img className="pixel-icon" src="/assets/icons/camp_stash.png" alt="" />}
          title={t('stash.upgradeTitle')}
          footer={
            <>
              {quote && (
                <Button
                  variant="primary"
                  block
                  disabled={!affordable}
                  onClick={() => {
                    onUpgrade();
                    setUpgradeOpen(false);
                  }}
                >
                  {t('inventory.confirmExpand')}
                </Button>
              )}
              <Button block onClick={() => setUpgradeOpen(false)}>
                {t('inventory.cancel')}
              </Button>
            </>
          }
        >
          <StatList>
            <StatRow label={t('inventory.currentCapacity')} value={capacity} />
            {quote && (
              <>
                <StatRow label={t('inventory.newCapacity')} value={quote.capacity} />
                <StatRow icon={<img src={Assets.icons.gold.url} alt="" />} label={t('inventory.expandCost')} value={fmtNum(quote.gold)} tone={save.gold >= quote.gold ? 'gold' : 'bad'} />
                {(Object.entries(quote.materials) as [MaterialId, number][]).map(([mid, need]) => {
                  const have = save.materials[mid] ?? 0;
                  return (
                    <StatRow
                      key={mid}
                      icon={<MaterialIcon item={getMaterial(mid)!} />}
                      label={matText(`mat_${mid}`)}
                      value={`${fmtNum(have)} / ${fmtNum(need)}`}
                      tone={have >= need ? 'good' : 'bad'}
                    />
                  );
                })}
              </>
            )}
          </StatList>
          <p className="ui-note">{quote ? t('stash.upgradeFromBag') : t('stash.maxLevel')}</p>
        </Dialog>
      )}
    </>
  );
}

