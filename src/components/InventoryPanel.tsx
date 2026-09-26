import { useState } from 'react';
import { activeLocale, t } from '../locales';
import { SaveData } from '../game/engine';
import { GEAR, GearItem, getGear, isInstancedSlot } from '../game/gear';
import { canAffordReforge, getReforgeCost } from '../game/reforge';
import T from '../game/tunables';
import { clampRefine, isInstanceEquipped, listGearInstances, resolveGearInstance, salvageBlockReason } from '../game/gearInstances';
import { MATERIALS, MaterialId, getMaterial } from '../game/materials';
import { getSalvageReturn, hasSalvageValue } from '../game/salvage';
import { CONSUMABLES, getConsumable } from '../game/consumables';
import { inventoryCapacity, inventorySlotsUsed, nextExpansion } from '../game/inventory';
import { Rarity, rarityDef, substatLabel, substatNameKey } from '../game/rarity';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';
import { refineTag } from './gearLabel';

// The inventory grid + detail panel — extracted from what used to be InventoryModal's whole body, so
// the Personagem view (embedded, no modal chrome) and the still-existing quick-access "Inventário"
// modal (InventoryModal.tsx, kept for direct sidebar access) render the exact same component, same
// state, same handlers. No new inventory, no duplicated source of truth.

const gearText = (k: string): string => t(`gear.${k}`);
const matText = (k: string): string => t(`materials.${k}`);
const conText = (k: string): string => t(`consumables.${k}`);
const fmtNum = (n: number): string => n.toLocaleString(activeLocale === 'pt' ? 'pt-BR' : 'en-US');

const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;
const rarClass = (r: Rarity | undefined): string => `r-${r ?? 'common'}`;
const EQUIPPABLE_SLOTS = new Set(['weapon', 'armor']);
const MANUALLY_USABLE = new Set(['xp_potion', 'strength_elixir', 'atk_elixir']);

type SelKind = 'gear' | 'material' | 'consumable';

export default function InventoryPanel({
  save,
  onEquip,
  onUnequip,
  onDiscard,
  onReforge,
  onSalvage,
  onUseConsumable,
  onExpand,
}: {
  save: SaveData;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onDiscard: (kind: SelKind, id: string) => void;
  onReforge: (id: string) => void;
  onSalvage: (id: string) => void;
  onUseConsumable: (id: string) => void;
  onExpand: () => void;
}) {
  const [tab, setTab] = useState<'all' | 'equipment' | 'materials' | 'consumables'>('all');
  const [selected, setSelected] = useState<{ kind: SelKind; id: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmSalvage, setConfirmSalvage] = useState(false);
  const [expandOpen, setExpandOpen] = useState(false);

  const gearInstances = listGearInstances(save);
  const stackableGear = GEAR.filter((g) => !isInstancedSlot(g.slot) && (save.inventory?.[g.id] ?? 0) > 0);
  const materialItems = MATERIALS.map((m) => ({ ...m, qty: save.materials?.[m.id] ?? 0 })).filter((m) => m.qty > 0);
  const consumableItems = CONSUMABLES.map((c) => ({ ...c, qty: save.consumables?.[c.id] ?? 0 })).filter((c) => c.qty > 0);

  const showEquipment = tab === 'all' || tab === 'equipment';
  const showMaterials = tab === 'all' || tab === 'materials';
  const showConsumables = tab === 'all' || tab === 'consumables';

  const slots = inventorySlotsUsed(save);
  const capacity = inventoryCapacity(save);
  const expansion = nextExpansion(save);
  const canAffordExpansion = !!expansion && save.gold >= expansion.goldCost;

  const select = (kind: SelKind, id: string) => {
    setSelected({ kind, id });
    setConfirmDiscard(false);
    setConfirmSalvage(false);
  };

  const selectedInstance = selected?.kind === 'gear' ? resolveGearInstance(save, selected.id)?.instance ?? null : null;
  const selectedGear: GearItem | null =
    selected?.kind === 'gear' ? (selectedInstance ? getGear(selectedInstance.templateId) : getGear(selected.id) ?? null) : null;
  const selectedMaterial =
    selected?.kind === 'material' ? MATERIALS.find((m) => m.id === (selected.id as MaterialId)) : null;
  const selectedConsumable =
    selected?.kind === 'consumable' ? getConsumable(selected.id) : null;

  const selQty = selectedInstance
    ? 1
    : selectedGear
      ? save.inventory?.[selectedGear.id] ?? 0
      : selectedMaterial
        ? save.materials?.[selectedMaterial.id] ?? 0
        : selectedConsumable
          ? save.consumables?.[selectedConsumable.id] ?? 0
          : 0;

  const isEquipped = selectedInstance
    ? isInstanceEquipped(save, selectedInstance.id)
    : !!selectedGear && save.equipped[selectedGear.slot as 'relic'] === selectedGear.id;
  const isEquippable = !!selectedGear && EQUIPPABLE_SLOTS.has(selectedGear.slot);
  const selectedRarity: Rarity = selectedInstance?.rarity ?? 'common';
  const selectedSubs = selectedInstance?.substats ?? [];
  const selectedLevel = selectedInstance ? clampRefine(selectedInstance.upgrade) : 0;

  const salvageReason = selected?.kind === 'gear' ? salvageBlockReason(save, selected.id) : null;
  const salvagePreview = selectedGear ? getSalvageReturn(selectedGear) : null;

  const handleSalvage = () => {
    if (!selected || !selectedGear) return;
    if (!confirmSalvage) {
      setConfirmSalvage(true);
      return;
    }
    onSalvage(selected.id);
    setSelected(null);
    setConfirmSalvage(false);
  };

  const handleDiscard = () => {
    if (!selected) return;
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onDiscard(selected.kind, selected.id);
    setSelected(null);
    setConfirmDiscard(false);
  };

  const gearSlotsShown = gearInstances.length + stackableGear.length;

  return (
    <>
      <div className="inventory-summary">
        <span className="inventory-summary-chip">{t('inventory.space', { n: slots, m: capacity })}</span>
        <button
          className="inventory-expand-btn"
          onClick={() => setExpandOpen(true)}
          aria-label={t('inventory.expandTitle')}
          data-ui
        >
          +
        </button>
      </div>

      {expandOpen && (
        <div className="modal-backdrop" onClick={() => setExpandOpen(false)}>
          <div className="modal expand-modal" onClick={(event) => event.stopPropagation()}>
            <h2 className="modal-title">{t('inventory.expandTitle')}</h2>
            <div className="expand-rows">
              <div className="expand-row">
                <span>{t('inventory.currentCapacity')}</span>
                <span>{capacity}</span>
              </div>
              {expansion ? (
                <>
                  <div className="expand-row">
                    <span>{t('inventory.newCapacity')}</span>
                    <span>{expansion.nextCapacity}</span>
                  </div>
                  <div className="expand-row">
                    <span>{t('inventory.expandCost')}</span>
                    <span className={canAffordExpansion ? '' : 'missing'}>{fmtNum(expansion.goldCost)} {t('inventory.reforgeGold')}</span>
                  </div>
                </>
              ) : (
                <p className="salvage-hint">{t('inventory.maxCapacityReached')}</p>
              )}
            </div>
            <div className="expand-actions">
              <button className="expand-cancel-btn" type="button" onClick={() => setExpandOpen(false)} data-ui>
                {t('inventory.cancel')}
              </button>
              {expansion && (
                <button
                  className="craft-btn"
                  type="button"
                  disabled={!canAffordExpansion}
                  onClick={() => {
                    onExpand();
                    setExpandOpen(false);
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

      <div className="inv-tabs">
        <button className={`tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')} data-ui>
          {t('inventory.all')}
        </button>
        <button className={`tab${tab === 'equipment' ? ' active' : ''}`} onClick={() => setTab('equipment')} data-ui>
          {t('inventory.equipment')}
        </button>
        <button className={`tab${tab === 'materials' ? ' active' : ''}`} onClick={() => setTab('materials')} data-ui>
          {t('inventory.materials')}
        </button>
        <button className={`tab${tab === 'consumables' ? ' active' : ''}`} onClick={() => setTab('consumables')} data-ui>
          {t('inventory.consumables')}
        </button>
      </div>

      <div className="inv-grid">
        {showEquipment &&
          gearInstances.map((inst) => {
            const g = getGear(inst.templateId);
            const equipped = isInstanceEquipped(save, inst.id);
            return (
              <button
                key={inst.id}
                className={`inv-slot ${rarityClass(g)} ${rarClass(inst.rarity)}${selected?.kind === 'gear' && selected.id === inst.id ? ' active' : ''}`}
                onClick={() => select('gear', inst.id)}
                data-ui
              >
                <span className="inv-icon">
                  <GearIcon item={g} />
                </span>
                <span className="inv-qty">
                  {refineTag(clampRefine(inst.upgrade)).trim()}
                  {equipped ? ' ✓' : ''}
                </span>
              </button>
            );
          })}
        {showEquipment &&
          stackableGear.map((g) => (
            <button
              key={g.id}
              className={`inv-slot ${rarityClass(g)} ${rarClass(undefined)}${selected?.kind === 'gear' && selected.id === g.id ? ' active' : ''}`}
              onClick={() => select('gear', g.id)}
              data-ui
            >
              <span className="inv-icon">
                <GearIcon item={g} />
              </span>
              <span className="inv-qty">×{save.inventory[g.id]}</span>
            </button>
          ))}
        {showMaterials &&
          materialItems.map((m) => (
            <button
              key={m.id}
              className={`inv-slot${selected?.kind === 'material' && selected.id === m.id ? ' active' : ''}`}
              onClick={() => select('material', m.id)}
              data-ui
            >
              <span className="inv-icon">
                <MaterialIcon item={m} />
              </span>
              <span className="inv-qty">×{m.qty}</span>
            </button>
          ))}
        {showConsumables &&
          consumableItems.map((c) => (
            <button
              key={c.id}
              className={`inv-slot${selected?.kind === 'consumable' && selected.id === c.id ? ' active' : ''}`}
              onClick={() => select('consumable', c.id)}
              data-ui
            >
              <span className="inv-icon">
                <ConsumableIcon item={c} />
              </span>
              <span className="inv-qty">×{c.qty}</span>
            </button>
          ))}
        {Array.from({ length: Math.max(0, 24 - (gearSlotsShown + materialItems.length + consumableItems.length)) }).map((_, i) => (
          <span key={`empty-${i}`} className="inv-slot empty" />
        ))}
      </div>

      <div className={`inv-detail-backdrop${selected ? ' open' : ''}`} onClick={() => setSelected(null)}>
      <div className="inv-detail" onClick={(event) => event.stopPropagation()}>
        {selected && <button className="inv-detail-close" onClick={() => setSelected(null)} aria-label={t('ui.close')} data-ui>✕</button>}
        {selectedGear ? (
          <>
            <div className="inv-detail-name">
              <span className="inv-detail-icon">
                <GearIcon item={selectedGear} />
              </span>
              <span className="inv-detail-name-text">
                {gearText(selectedGear.nameKey)}
                <span className="refine-tag">{refineTag(selectedLevel)}</span>
              </span>
              {!selectedInstance && <span className="inv-qty">×{save.inventory[selectedGear.id]}</span>}
              {selectedInstance && isEquipped && <span className="inv-qty">{t('inventory.equipped')}</span>}
            </div>
            <div className="inv-detail-desc">{gearText(selectedGear.descKey)}</div>
            {selectedRarity !== 'common' && (
              <div className={`rarity-line ${rarClass(selectedRarity)}`}>{t(`rarity.${rarityDef(selectedRarity).nameKey}`)}</div>
            )}
            {selectedSubs.length > 0 && (
              <div className="substat-list">
                {selectedSubs.map((s, i) => (
                  <span className="substat-line" key={i}>
                    +{substatLabel(s)} {t(`rarity.${substatNameKey(s.type)}`)}
                  </span>
                ))}
              </div>
            )}
            {selectedInstance && (
              <div className="substat-list">
                <span className="substat-line">{t('forge.durability', { n: selectedInstance.durability, m: 100 })}</span>
                {selectedInstance.sockets.length > 0 && (
                  <span className="substat-line">{t('inventory.socketsCount', { n: selectedInstance.sockets.length })}</span>
                )}
              </div>
            )}
            {isEquippable &&
              (isEquipped ? (
                <button className="craft-btn equipped" onClick={() => onUnequip(selected!.id)} data-ui>
                  {t('inventory.unequip')}
                </button>
              ) : (
                <button className="craft-btn" onClick={() => onEquip(selected!.id)} data-ui>
                  {t('inventory.equip')}
                </button>
              ))}
            {selectedInstance &&
              selectedRarity !== 'common' &&
              (() => {
                const cost = getReforgeCost(save, selectedInstance.id);
                if (!cost) return null;
                const rows: { key: string; label: string; have: number; need: number; mat?: MaterialId }[] = [
                  { key: 'gold', label: t('inventory.reforgeGold'), have: save.gold, need: cost.gold },
                  { key: 'shard', label: t('inventory.reforgeShard'), have: save.shards, need: cost.shards },
                  ...Object.entries(cost.materials).map(([mid, need]) => ({
                    key: mid,
                    label: matText(`mat_${mid}`),
                    have: save.materials[mid as MaterialId] ?? 0,
                    need: need as number,
                    mat: mid as MaterialId,
                  })),
                ];
                return (
                  <div className="reforge-panel">
                    <div className="substat-line">{t('inventory.reforgeCount', { n: selectedInstance.reforgeCount })}</div>
                    <p className="salvage-hint">{t('forge.reforgeExplanation')}</p>
                    <div className="salvage-preview reforge-costs">
                      {rows.map((r) => (
                        <span className="floor-drop" key={r.key}>
                          <span className="reforge-cost-name">
                            {r.mat && (
                              <span className="mat-icon">
                                <MaterialIcon item={getMaterial(r.mat)!} />
                              </span>
                            )}
                            {r.label}
                          </span>
                          <span className={`req-amount${r.have < r.need ? ' missing' : ''}`}>
                            {fmtNum(r.have)} / {fmtNum(r.need)}
                          </span>
                        </span>
                      ))}
                    </div>
                    <button
                      className="reforge-btn"
                      onClick={() => onReforge(selectedInstance.id)}
                      disabled={!canAffordReforge(save, cost)}
                      data-ui
                    >
                      {t('forge.reforge')}
                    </button>
                  </div>
                );
              })()}
            {hasSalvageValue(selectedGear) &&
              (salvageReason === 'equipped' ? (
                <p className="salvage-hint">{t('inventory.unequipToSalvage')}</p>
              ) : (
                <div className="salvage-block">
                  <p className="salvage-hint">{t('inventory.salvageRounding', { pct: Math.round(T.economySinks.salvageRecoveryRate * 100) })}</p>
                  {confirmSalvage && salvagePreview && (
                    <div className="salvage-preview">
                      <span className="salvage-preview-label">{t('inventory.salvagePreview')}</span>
                      {Object.entries(salvagePreview.materials).map(([mid, qty]) => (
                        <span className="floor-drop" key={mid}>
                          <span className="mat-icon">
                            <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                          </span>
                          <span>
                            +{qty as number} {matText(`mat_${mid}`)}
                          </span>
                        </span>
                      ))}
                      {Object.keys(salvagePreview.materials).length === 0 && <span className="salvage-hint">{t('inventory.salvageEmpty')}</span>}
                      {selectedInstance && selectedInstance.sockets.length > 0 && (
                        <span className="floor-drop">{t('inventory.gemsReturn', { n: selectedInstance.sockets.length })}</span>
                      )}
                    </div>
                  )}
                  <button className={`salvage-btn${confirmSalvage ? ' confirm' : ''}`} onClick={handleSalvage} data-ui>
                    {confirmSalvage ? t('inventory.confirmSalvage') : t('inventory.salvage')}
                  </button>
                </div>
              ))}
          </>
        ) : selectedMaterial ? (
          <>
            <div className="inv-detail-name">
              <MaterialIcon item={selectedMaterial} className="mat-icon-img" />
              <span className="inv-detail-name-text">{matText(selectedMaterial.nameKey)}</span>
              <span className="inv-qty">×{save.materials[selectedMaterial.id]}</span>
            </div>
            <div className="inv-detail-desc">{t('inventory.materialDesc')}</div>
          </>
        ) : selectedConsumable ? (
          <>
            <div className="inv-detail-name">
              <ConsumableIcon item={selectedConsumable} className="mat-icon-img" />
              <span className="inv-detail-name-text">{conText(selectedConsumable.nameKey)}</span>
              <span className="inv-qty">×{save.consumables?.[selectedConsumable.id] ?? 0}</span>
            </div>
            <div className="inv-detail-desc">{conText(selectedConsumable.descKey)}</div>
          </>
        ) : (
          <div className="inv-detail-empty">{t('inventory.hint')}</div>
        )}

        {selected?.kind === 'consumable' && MANUALLY_USABLE.has(selected.id) && selQty > 0 && (
          <div className="inv-actions">
            <button
              className="inv-sell"
              onClick={() => {
                onUseConsumable(selected.id);
                setSelected(null);
              }}
              data-ui
            >
              {t('inventory.use')}
            </button>
          </div>
        )}

        {selected && !isEquipped && selQty > 0 && (
          <div className="inv-actions">
            {confirmDiscard && selectedInstance && selectedInstance.sockets.length > 0 && (
              <span className="salvage-hint">{t('inventory.gemsReturn', { n: selectedInstance.sockets.length })}</span>
            )}
            <button className={`inv-discard${confirmDiscard ? ' confirm' : ''}`} onClick={handleDiscard} data-ui>
              {confirmDiscard ? t('inventory.confirm') : t('inventory.discard')}
            </button>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
