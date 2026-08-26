import { useState } from 'react';
import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { GEAR, GearItem, getGear, refineLevel } from '../game/gear';
import { MATERIALS, MaterialId } from '../game/materials';
import GearIcon from './GearIcon';

const gearText = (k: string): string => (Text.gear as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];

const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;

export default function InventoryModal({
  save,
  onEquip,
  onUnequip,
  onClose,
}: {
  save: SaveData;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'all' | 'equipment' | 'materials'>('all');
  const [selected, setSelected] = useState<{ kind: 'gear' | 'material'; id: string } | null>(null);

  const gearItems = GEAR.filter((g) => (save.inventory[g.id] ?? 0) > 0);
  const materialItems = MATERIALS.map((m) => ({ ...m, qty: save.materials[m.id] ?? 0 })).filter((m) => m.qty > 0);

  const showEquipment = tab !== 'materials';
  const showMaterials = tab !== 'equipment';

  const selectedGear = selected?.kind === 'gear' ? getGear(selected.id) : null;
  const selectedMaterial =
    selected?.kind === 'material' ? MATERIALS.find((m) => m.id === (selected.id as MaterialId)) : null;

  const visibleCount = (showEquipment ? gearItems.length : 0) + (showMaterials ? materialItems.length : 0);

  return (
    <div className="modal-backdrop">
      <div className="modal inventory-modal">
        <h2 className="modal-title">🎒 {Text.inventory.title}</h2>

        <div className="inv-tabs">
          <button className={`tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')} data-ui>
            {Text.inventory.all}
          </button>
          <button className={`tab${tab === 'equipment' ? ' active' : ''}`} onClick={() => setTab('equipment')} data-ui>
            {Text.inventory.equipment}
          </button>
          <button className={`tab${tab === 'materials' ? ' active' : ''}`} onClick={() => setTab('materials')} data-ui>
            {Text.inventory.materials}
          </button>
        </div>

        <div className="inv-grid">
          {showEquipment &&
            gearItems.map((g) => (
              <button
                key={g.id}
                className={`inv-slot ${rarityClass(g)}${selected?.kind === 'gear' && selected.id === g.id ? ' active' : ''}`}
                onClick={() => setSelected({ kind: 'gear', id: g.id })}
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
                onClick={() => setSelected({ kind: 'material', id: m.id })}
                data-ui
              >
                <span className="inv-icon">
                  <img src={m.iconUrl} alt="" />
                </span>
                <span className="inv-qty">×{m.qty}</span>
              </button>
            ))}
          {Array.from({ length: Math.max(0, 24 - visibleCount) }).map((_, i) => (
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
              {save.equipped[selectedGear.slot] === selectedGear.id ? (
                <button className="craft-btn equipped" onClick={() => onUnequip(selectedGear.id)} data-ui>
                  {Text.inventory.unequip}
                </button>
              ) : (
                <button className="craft-btn" onClick={() => onEquip(selectedGear.id)} data-ui>
                  {Text.inventory.equip}
                </button>
              )}
            </>
          ) : selectedMaterial ? (
            <>
              <div className="inv-detail-name">
                <img className="mat-icon-img" src={selectedMaterial.iconUrl} alt="" /> {matText(selectedMaterial.nameKey)}
                <span className="inv-qty">×{selectedMaterial.qty}</span>
              </div>
              <div className="inv-detail-desc">{Text.inventory.materialDesc}</div>
            </>
          ) : (
            <div className="inv-detail-empty">{Text.inventory.hint}</div>
          )}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
