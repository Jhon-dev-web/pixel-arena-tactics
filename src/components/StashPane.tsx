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

// The Baú do acampamento: its slots (the same stack rule as the inventory), the item the player picked, and the upgrade dialog.
// Moving things in and out is done from the item detail (InventoryPanel); here only what lives in the stash is shown.

const matText = (k: string): string => t(`materials.${k}`);
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
    ...gearItems.flatMap((g) => stackCells(stash.gear[g.id]).map((n, i) => ({ key: `g:${g.id}:${i}`, kind: 'gear' as StackKind, id: g.id, n, icon: <GearIcon item={g} /> }))),
    ...materialItems.flatMap((m) => stackCells(stash.materials[m.id] ?? 0).map((n, i) => ({ key: `m:${m.id}:${i}`, kind: 'material' as StackKind, id: m.id, n, icon: <MaterialIcon item={m} /> }))),
    ...consumableItems.flatMap((c) => stackCells(stash.consumables[c.id] ?? 0).map((n, i) => ({ key: `c:${c.id}:${i}`, kind: 'consumable' as StackKind, id: c.id, n, icon: <ConsumableIcon item={c} /> }))),
  ];
  const empties = Math.max(0, capacity - cells.length);

  return (
    <>
      <div className="inventory-summary">
        <span className={`inventory-summary-chip${used > capacity ? ' over' : ''}`}>{t('stash.space', { n: used, m: capacity })}</span>
        <button className="inventory-expand-btn" onClick={() => setUpgradeOpen(true)} aria-label={t('stash.upgradeTitle')} data-ui>
          +
        </button>
      </div>
      <p className="stash-note">{t('stash.note')}</p>

      <div className="inv-grid stash-grid">
        {cells.map((c) => (
          <button key={c.key} className={`inv-slot${isSel(c.kind, c.id) ? ' active' : ''}`} onClick={() => onSelect({ kind: c.kind, id: c.id })} data-ui>
            <span className="inv-icon">{c.icon}</span>
            <span className="inv-qty">×{fmtNum(c.n)}</span>
          </button>
        ))}
        {Array.from({ length: empties }).map((_, i) => (
          <span key={`e${i}`} className="inv-slot empty" />
        ))}
      </div>

      {upgradeOpen && (
        <div className="modal-backdrop" onClick={() => setUpgradeOpen(false)}>
          <div className="modal expand-modal" onClick={(event) => event.stopPropagation()}>
            <h2 className="modal-title">{t('stash.upgradeTitle')}</h2>
            <div className="expand-rows">
              <div className="expand-row">
                <span>{t('inventory.currentCapacity')}</span>
                <span>{capacity}</span>
              </div>
              {quote ? (
                <>
                  <div className="expand-row">
                    <span>{t('inventory.newCapacity')}</span>
                    <span>{quote.capacity}</span>
                  </div>
                  <div className="expand-row">
                    <span>{t('inventory.expandCost')}</span>
                    <span className={save.gold >= quote.gold ? '' : 'missing'}>
                      <img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {fmtNum(quote.gold)}
                    </span>
                  </div>
                  {(Object.entries(quote.materials) as [MaterialId, number][]).map(([mid, need]) => {
                    const have = save.materials[mid] ?? 0;
                    return (
                      <div className="expand-row" key={mid}>
                        <span className="stash-cost-name">
                          <span className="mat-icon">
                            <MaterialIcon item={getMaterial(mid)!} />
                          </span>
                          {matText(`mat_${mid}`)}
                        </span>
                        <span className={have >= need ? '' : 'missing'}>
                          {fmtNum(have)} / {fmtNum(need)}
                        </span>
                      </div>
                    );
                  })}
                  <p className="salvage-hint">{t('stash.upgradeFromBag')}</p>
                </>
              ) : (
                <p className="salvage-hint">{t('stash.maxLevel')}</p>
              )}
            </div>
            <div className="expand-actions">
              <button className="expand-cancel-btn" type="button" onClick={() => setUpgradeOpen(false)} data-ui>
                {t('inventory.cancel')}
              </button>
              {quote && (
                <button
                  className="craft-btn"
                  type="button"
                  disabled={!affordable}
                  onClick={() => {
                    onUpgrade();
                    setUpgradeOpen(false);
                  }}
                  data-ui
                >
                  {t('inventory.confirmExpand')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

