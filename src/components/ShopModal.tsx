import { t } from '../locales';
import { SaveData } from '../game/engine';
import { CONSUMABLES, CONSUMABLE_STACK, ConsumableId } from '../game/consumables';
import { GEMS, GemId } from '../game/gems';
import { MAX_SLOTS, inventorySlotsUsed } from '../game/inventory';

const conText = (k: string): string => t(`consumables.${k}`);
const gemText = (k: string): string => t(`gems.${k}`);

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
        <h2 className="modal-title">{t('shop.title')}</h2>
        <p className="shop-gold">{t('ui.owned', { n: save.gold })}</p>
        <p className="shop-space">{t('inventory.space', { n: slots, m: MAX_SLOTS })}</p>

        <div className="shop-body">
          {CONSUMABLES.map((c) => {
            const qty = save.consumables?.[c.id] ?? 0;
            const disabled = save.gold < c.cost || qty >= CONSUMABLE_STACK;
            return (
              <div className="gear-row" key={c.id}>
                <div className="gear-info">
                  <span className="gear-name">
                    {c.icon} {conText(c.nameKey)}
                    <span className="gear-count">{t('shop.youHave', { n: qty })}</span>
                  </span>
                  <span className="gear-desc">{conText(c.descKey)}</span>
                  <span className="gear-cost">{t('ui.cost', { n: c.cost })}</span>
                </div>
                <button className="gear-action buy" onClick={() => onBuyConsumable(c.id)} disabled={disabled} data-ui>
                  {t('gear.buy')}
                </button>
              </div>
            );
          })}

          <div className="shop-section-title">{t('shop.gems')}</div>
          {GEMS.map((g) => {
            const owned = save.gems?.[g.id] ?? 0;
            const disabled = save.shards < g.shardCost;
            return (
              <div className="gear-row" key={g.id}>
                <div className="gear-info">
                  <span className="gear-name">
                    {g.icon} {gemText(g.nameKey)}
                    <span className="gear-count">{t('shop.youOwn', { n: owned })}</span>
                  </span>
                  <span className="gear-desc">{gemText(g.descKey)}</span>
                  <span className="gear-cost">{t('shop.gemCost', { n: g.shardCost })}</span>
                </div>
                <button className="gear-action buy" onClick={() => onBuyGem(g.id)} disabled={disabled} data-ui>
                  {t('gear.buy')}
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
