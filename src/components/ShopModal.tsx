import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { MATERIALS, MaterialId } from '../game/materials';
import { CONSUMABLES, CONSUMABLE_STACK, ConsumableId } from '../game/consumables';
import { MAX_SLOTS, inventorySlotsUsed } from '../game/inventory';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const fmt2 = (s: string, n: number, m: number) => s.replace('{n}', String(n)).replace('{m}', String(m));
const shopText = (k: string): string => (Text.shop as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];
const conText = (k: string): string => (Text.consumables as Record<string, string>)[k];

export default function ShopModal({
  save,
  onBuyConsumable,
  onBuyMaterial,
  onSellMaterial,
  onClose,
}: {
  save: SaveData;
  onBuyConsumable: (id: ConsumableId) => void;
  onBuyMaterial: (id: MaterialId) => void;
  onSellMaterial: (id: MaterialId) => void;
  onClose: () => void;
}) {
  const slots = inventorySlotsUsed(save);
  const sellable = MATERIALS.filter((m) => (save.materials[m.id] ?? 0) > 0);

  return (
    <div className="modal-backdrop">
      <div className="modal shop-modal">
        <h2 className="modal-title">{Text.shop.title}</h2>
        <p className="shop-gold">{fmt(Text.ui.owned, save.gold)}</p>
        <p className="shop-space">{fmt2(Text.inventory.space, slots, MAX_SLOTS)}</p>

        <div className="shop-body">
          <div className="shop-section-title">{Text.shop.consumables}</div>
          {CONSUMABLES.map((c) => {
            const qty = save.consumables?.[c.id] ?? 0;
            const disabled = save.gold < c.cost || qty >= CONSUMABLE_STACK;
            return (
              <div className="gear-row" key={c.id}>
                <div className="gear-info">
                  <span className="gear-name">
                    {c.icon} {conText(c.nameKey)}
                    <span className="gear-count">{fmt(Text.shop.youHave, qty)}</span>
                  </span>
                  <span className="gear-desc">{conText(c.descKey)}</span>
                  <span className="gear-cost">{fmt(Text.ui.cost, c.cost)}</span>
                </div>
                <button className="gear-action buy" onClick={() => onBuyConsumable(c.id)} disabled={disabled} data-ui>
                  {Text.gear.buy}
                </button>
              </div>
            );
          })}

          <div className="shop-section-title">{Text.shop.materials}</div>
          {MATERIALS.map((m) => (
            <div className="gear-row" key={m.id}>
              <div className="gear-info">
                <span className="gear-name">
                  {m.icon} {matText(m.nameKey)}
                  <span className="gear-count">{fmt(Text.shop.youHave, save.materials[m.id])}</span>
                </span>
                <span className="gear-desc">{fmt(Text.shop.buyPack, m.packSize)}</span>
                <span className="gear-cost">{fmt(Text.ui.cost, m.packCost)}</span>
              </div>
              <button
                className="gear-action buy"
                onClick={() => onBuyMaterial(m.id)}
                disabled={save.gold < m.packCost}
                data-ui
              >
                {Text.gear.buy}
              </button>
            </div>
          ))}

          <div className="shop-section-title">{Text.shop.sellMaterials}</div>
          {sellable.length === 0 ? (
            <p className="sell-empty">{Text.shop.sellEmpty}</p>
          ) : (
            sellable.map((m) => {
              const qty = save.materials[m.id] ?? 0;
              const total = qty * m.sellValue;
              return (
                <div className="gear-row" key={m.id}>
                  <div className="gear-info">
                    <span className="gear-name">
                      {m.icon} {matText(m.nameKey)}
                      <span className="gear-count">{fmt(Text.shop.youHave, qty)}</span>
                    </span>
                    <span className="gear-desc">{fmt(Text.shop.sellEach, m.sellValue)}</span>
                    <span className="gear-cost">{fmt(Text.shop.sellTotal, total)}</span>
                  </div>
                  <button className="gear-action sell" onClick={() => onSellMaterial(m.id)} data-ui>
                    {Text.shop.sell}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
