import Assets from '../assets.json';
import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { GEAR, GEAR_SLOTS, GearItem, gearBySlot, getGear } from '../game/gear';
import { MaterialId, hasMaterials, materialIconUrl } from '../game/materials';
import GearIcon from './GearIcon';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const gearText = (k: string): string => (Text.gear as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];

function rarityIcon(key: string): string {
  switch (key) {
    case 'material_bronze':
    case 'material_iron':
      return Assets.icons.ore.url;
    case 'material_steel':
      return Assets.icons.steel.url;
    case 'material_dragon':
      return Assets.icons.dragon_scales.url;
    default:
      return '';
  }
}

const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;

export default function ForgeModal({
  save,
  onForge,
  onEquip,
  onClose,
}: {
  save: SaveData;
  onForge: (id: string) => void;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  const canForge = (item: GearItem): boolean => {
    if (save.gold < item.cost) return false;
    if (!hasMaterials(save.materials, item.recipe?.materials)) return false;
    for (const [itemId, need] of Object.entries(item.recipe?.items ?? {})) {
      if ((save.inventory[itemId] ?? 0) < (need as number)) return false;
    }
    if ((item.recipe?.shards ?? 0) > 0 && save.shards < (item.recipe?.shards ?? 0)) return false;
    return true;
  };

  return (
    <div className="modal-backdrop">
      <div className="modal forge-modal">
        <h2 className="modal-title">{Text.forge.title}</h2>
        <p className="shop-gold">{fmt(Text.ui.owned, save.gold)}</p>

        <div className="forge-body">
          {GEAR_SLOTS.map((slot) => {
            const items = gearBySlot(slot).filter((g) => g.recipe);
            if (items.length === 0) return null;
            return (
              <div className="gear-section" key={slot}>
                <div className="gear-section-title">{gearText(slot)}</div>
                {items.map((item) => {
                  const owned = (save.inventory[item.id] ?? 0) > 0;
                  const equipped = save.equipped[item.slot] === item.id;
                  const ok = canForge(item);
                  return (
                    <div className={`craft-card ${rarityClass(item)}`} key={item.id}>
                      <span className="craft-icon">
                        <GearIcon item={item} />
                      </span>
                      <div className="craft-info">
                        <div className="craft-header">
                          <span className="craft-name">{gearText(item.nameKey)}</span>
                          {item.materialKey && (
                            <span className={`gear-material ${item.materialKey.replace('material_', '')}`}>
                              {rarityIcon(item.materialKey) && (
                                <img className="rarity-icon" src={rarityIcon(item.materialKey)} alt="" />
                              )}
                              {gearText(item.materialKey)}
                            </span>
                          )}
                        </div>
                        <span className="craft-desc">{gearText(item.descKey)}</span>
                        <div className="craft-req">
                          <span className="req-item">
                            <span className="mat-icon">
                              <img src={Assets.icons.gold.url} alt="" />
                            </span>
                            <span className={`req-amount${save.gold < item.cost ? ' missing' : ''}`}>{item.cost}</span>
                          </span>
                          {Object.entries(item.recipe?.items ?? {}).map(([itemId, count]) => {
                            const need = count as number;
                            const have = save.inventory[itemId] ?? 0;
                            const g = getGear(itemId);
                            return (
                              <span className="req-item" key={`item-${itemId}`}>
                                <span className="req-plus">+</span>
                                <span className="mat-icon">
                                  <GearIcon item={g} />
                                </span>
                                <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                  {gearText(g.nameKey)}: {have}/{need}
                                </span>
                              </span>
                            );
                          })}
                          {Object.entries(item.recipe?.materials ?? {}).map(([mid, count]) => {
                            const need = count as number;
                            const have = save.materials[mid as MaterialId] ?? 0;
                            return (
                              <span className="req-item" key={`mat-${mid}`}>
                                <span className="req-plus">+</span>
                                <span className="mat-icon">
                                  <img src={materialIconUrl(mid as MaterialId)} alt="" />
                                </span>
                                <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                  {need}× {matText(`mat_${mid}`)}
                                </span>
                              </span>
                            );
                          })}
                          {(item.recipe?.shards ?? 0) > 0 && (
                            <span className="req-item">
                              <span className="req-plus">+</span>
                              <span className="mat-icon shard">🔷</span>
                              <span className={`req-amount${save.shards < (item.recipe?.shards ?? 0) ? ' missing' : ''}`}>
                                {item.recipe?.shards}× Shards
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      {equipped ? (
                        <button className="craft-btn equipped" disabled data-ui>
                          {Text.forge.equipped}
                        </button>
                      ) : owned ? (
                        <button className="craft-btn" onClick={() => onEquip(item.id)} data-ui>
                          {Text.forge.equip}
                        </button>
                      ) : (
                        <button className="craft-btn forge" onClick={() => onForge(item.id)} disabled={!ok} data-ui>
                          {Text.forge.forge}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
