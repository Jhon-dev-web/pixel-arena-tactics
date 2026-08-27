import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { CONSUMABLES, CONSUMABLE_STACK, ConsumableId } from '../game/consumables';
import { GEMS, GemId } from '../game/gems';
import { MAX_SLOTS, inventorySlotsUsed } from '../game/inventory';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const conText = (k: string): string => (Text.consumables as Record<string, string>)[k];
const gemText = (k: string): string => (Text.gems as Record<string, string>)[k];

export default function ShopModal({
  save,
  onBuyConsumable,
  onBuyGem,
  onClose,
}: {
  save: SaveData;
  onBuyConsumable: (id: ConsumableId) => void;
  onBuyGem: (id: GemId) => void;
  onClose: () => void;
}) {
  const slots = inventorySlotsUsed(save);

  return (
    <div className="modal-backdrop">
      <div className="modal shop-modal">
        <h2 className="modal-title">{Text.shop.title}</h2>
        <p className="shop-gold">{fmt(Text.ui.owned, save.gold)}</p>
        <p className="shop-space">
          {Text.inventory.space.replace('{n}', String(slots)).replace('{m}', String(MAX_SLOTS))}
        </p>

        <div className="shop-body">
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

          <div className="shop-section-title">{Text.shop.gems}</div>
          {GEMS.map((g) => {
            const owned = save.gems?.[g.id] ?? 0;
            const disabled = save.shards < g.shardCost;
            return (
              <div className="gear-row" key={g.id}>
                <div className="gear-info">
                  <span className="gear-name">
                    {g.icon} {gemText(g.nameKey)}
                    <span className="gear-count">{fmt(Text.shop.youOwn, owned)}</span>
                  </span>
                  <span className="gear-desc">{gemText(g.descKey)}</span>
                  <span className="gear-cost">{fmt(Text.shop.gemCost, g.shardCost)}</span>
                </div>
                <button className="gear-action buy" onClick={() => onBuyGem(g.id)} disabled={disabled} data-ui>
                  {Text.gear.buy}
                </button>
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
