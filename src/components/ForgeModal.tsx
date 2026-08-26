import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { GEAR, GEAR_SLOTS, GearItem, gearBySlot } from '../game/gear';
import { hasMaterials } from '../game/materials';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const gearText = (k: string): string => (Text.gear as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];

function recipeText(item: GearItem): string {
  const parts = [`${item.cost} Gold`];
  for (const [mid, count] of Object.entries(item.recipe ?? {})) {
    parts.push(`${count}× ${matText(`mat_${mid}`)}`);
  }
  return parts.join('  +  ');
}

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
  const canForge = (item: GearItem) => save.gold >= item.cost && hasMaterials(save.materials, item.recipe);

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
                  const owned = save.owned.includes(item.id);
                  const equipped = save.equipped[item.slot] === item.id;
                  const ok = canForge(item);
                  return (
                    <div className="gear-row" key={item.id}>
                      <div className="gear-info">
                        <span className="gear-name">
                          {gearText(item.nameKey)}
                          {item.materialKey && (
                            <span className={`gear-material ${item.materialKey.replace('material_', '')}`}>
                              {gearText(item.materialKey)}
                            </span>
                          )}
                        </span>
                        <span className="gear-desc">{gearText(item.descKey)}</span>
                        {!owned && <span className="gear-recipe">{recipeText(item)}</span>}
                      </div>
                      {equipped ? (
                        <button className="gear-action equipped" disabled data-ui>
                          {Text.forge.equipped}
                        </button>
                      ) : owned ? (
                        <button className="gear-action" onClick={() => onEquip(item.id)} data-ui>
                          {Text.forge.equip}
                        </button>
                      ) : (
                        <button className="gear-action forge" onClick={() => onForge(item.id)} disabled={!ok} data-ui>
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

        <button className="modal-close" onClick={onClose} data-ui>
          {Text.ui.close}
        </button>
      </div>
    </div>
  );
}
