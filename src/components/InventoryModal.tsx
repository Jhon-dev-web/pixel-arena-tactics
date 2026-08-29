import { useState } from 'react';
import { t } from '../locales';
import { SaveData } from '../game/engine';
import { GEAR, GearItem, gearSellValue, getGear, refineLevel } from '../game/gear';
import { MATERIALS, MaterialId } from '../game/materials';
import { CONSUMABLES, getConsumable } from '../game/consumables';
import { MAX_SLOTS, inventorySlotsUsed } from '../game/inventory';
import { Rarity, rarityDef, substatLabel, substatNameKey } from '../game/rarity';
import GearIcon from './GearIcon';

const gearText = (k: string): string => t(`gear.${k}`);
const matText = (k: string): string => t(`materials.${k}`);
const conText = (k: string): string => t(`consumables.${k}`);

const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');
const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;
const rarClass = (r: Rarity | undefined): string => `r-${r ?? 'common'}`;

type SelKind = 'gear' | 'material' | 'consumable';

export default function InventoryModal({
  save,
  onEquip,
  onUnequip,
  onSell,
  onDiscard,
  onReforge,
  onClose,
}: {
  save: SaveData;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onSell: (kind: SelKind, id: string, qty: number) => void;
  onDiscard: (kind: SelKind, id: string) => void;
  onReforge: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'all' | 'equipment' | 'materials' | 'consumables'>('all');
  const [selected, setSelected] = useState<{ kind: SelKind; id: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const gearItems = GEAR.filter((g) => (save.inventory?.[g.id] ?? 0) > 0);
  const materialItems = MATERIALS.map((m) => ({ ...m, qty: save.materials?.[m.id] ?? 0 })).filter((m) => m.qty > 0);
  const consumableItems = CONSUMABLES.map((c) => ({ ...c, qty: save.consumables?.[c.id] ?? 0 })).filter((c) => c.qty > 0);

  const showEquipment = tab === 'all' || tab === 'equipment';
  const showMaterials = tab === 'all' || tab === 'materials';
  const showConsumables = tab === 'all' || tab === 'consumables';

  const slots = inventorySlotsUsed(save);

  const select = (kind: SelKind, id: string) => {
    setSelected({ kind, id });
    setConfirmDiscard(false);
  };

  const selectedGear = selected?.kind === 'gear' ? getGear(selected.id) : null;
  const selectedMaterial =
    selected?.kind === 'material' ? MATERIALS.find((m) => m.id === (selected.id as MaterialId)) : null;
  const selectedConsumable =
    selected?.kind === 'consumable' ? getConsumable(selected.id) : null;

  const selQty = selectedGear
    ? save.inventory?.[selectedGear.id] ?? 0
    : selectedMaterial
      ? save.materials?.[selectedMaterial.id] ?? 0
      : selectedConsumable
        ? save.consumables?.[selectedConsumable.id] ?? 0
        : 0;

  const unitValue = selectedGear
    ? gearSellValue(selectedGear)
    : selectedMaterial
      ? selectedMaterial.sellValue
      : selectedConsumable
        ? selectedConsumable.sellValue
        : 0;

  const isEquipped = !!selectedGear && save.equipped[selectedGear.slot] === selectedGear.id;
  const isEquippable = !!selectedGear && (selectedGear.slot === 'weapon' || selectedGear.slot === 'armor');
  const selectedRarity = selectedGear ? save.itemRarity?.[selectedGear.id] ?? 'common' : 'common';
  const selectedSubs = selectedGear ? save.itemSubstats?.[selectedGear.id] ?? [] : [];

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

  const sell1 = () => selected && onSell(selected.kind, selected.id, 1);
  const sellAll = () => selected && onSell(selected.kind, selected.id, selQty);

  return (
    <div className="modal-backdrop">
      <div className="modal inventory-modal">
        <h2 className="modal-title">🎒 {t('inventory.title')}</h2>
        <p className="shop-space">{t('inventory.space', { n: slots, m: MAX_SLOTS })}</p>

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
            gearItems.map((g) => (
              <button
                key={g.id}
                className={`inv-slot ${rarityClass(g)} ${rarClass(save.itemRarity?.[g.id])}${selected?.kind === 'gear' && selected.id === g.id ? ' active' : ''}`}
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
                  <img src={m.iconUrl} alt="" />
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
                <span className="inv-icon inv-emoji">{c.icon}</span>
                <span className="inv-qty">×{c.qty}</span>
              </button>
            ))}
          {Array.from({ length: Math.max(0, 24 - (gearItems.length + materialItems.length + consumableItems.length)) }).map((_, i) => (
            <span key={`empty-${i}`} className="inv-slot empty" />
          ))}
        </div>

        <div className="inv-detail">
          {selectedGear ? (
            <>
              <div className="inv-detail-name">
                <span className="inv-detail-icon">
                  <GearIcon item={selectedGear} />
                </span>
                {gearText(selectedGear.nameKey)}
                <span className="refine-tag">{refineTag(refineLevel(save.upgrades, selectedGear.id))}</span>
                <span className="inv-qty">×{save.inventory[selectedGear.id]}</span>
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
              {isEquippable &&
                (isEquipped ? (
                  <button className="craft-btn equipped" onClick={() => onUnequip(selectedGear.id)} data-ui>
                    {t('inventory.unequip')}
                  </button>
                ) : (
                  <button className="craft-btn" onClick={() => onEquip(selectedGear.id)} data-ui>
                    {t('inventory.equip')}
                  </button>
                ))}
              {selectedRarity !== 'common' && (
                <button className="reforge-btn" onClick={() => onReforge(selectedGear.id)} disabled={save.shards < 1} data-ui>
                  {t('forge.reforge')}
                </button>
              )}
            </>
          ) : selectedMaterial ? (
            <>
              <div className="inv-detail-name">
                <img className="mat-icon-img" src={selectedMaterial.iconUrl} alt="" /> {matText(selectedMaterial.nameKey)}
                <span className="inv-qty">×{save.materials[selectedMaterial.id]}</span>
              </div>
              <div className="inv-detail-desc">{t('inventory.materialDesc')}</div>
            </>
          ) : selectedConsumable ? (
            <>
              <div className="inv-detail-name">
                <span className="inv-emoji">{selectedConsumable.icon}</span> {conText(selectedConsumable.nameKey)}
                <span className="inv-qty">×{save.consumables?.[selectedConsumable.id] ?? 0}</span>
              </div>
              <div className="inv-detail-desc">{conText(selectedConsumable.descKey)}</div>
            </>
          ) : (
            <div className="inv-detail-empty">{t('inventory.hint')}</div>
          )}

          {selected && !isEquipped && selQty > 0 && (
            <div className="inv-actions">
              <div className="sell-actions">
                {selQty > 1 ? (
                  <>
                    <button className="inv-sell" onClick={sell1} data-ui>
                      {t('inventory.sellOne', { n: unitValue })}
                    </button>
                    <button className="inv-sell all" onClick={sellAll} data-ui>
                      {t('inventory.sellAll', { n: selQty * unitValue })}
                    </button>
                  </>
                ) : (
                  <button className="inv-sell" onClick={sell1} data-ui>
                    {t('inventory.sell', { n: unitValue })}
                  </button>
                )}
              </div>
              <button className={`inv-discard${confirmDiscard ? ' confirm' : ''}`} onClick={handleDiscard} data-ui>
                {confirmDiscard ? t('inventory.confirm') : t('inventory.discard')}
              </button>
            </div>
          )}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
