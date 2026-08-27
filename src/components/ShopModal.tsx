import { t } from '../locales';
import { SaveData } from '../game/engine';
import { CONSUMABLES, CONSUMABLE_STACK, ConsumableId } from '../game/consumables';
import { MAX_SLOTS, inventorySlotsUsed } from '../game/inventory';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const conText = (k: string): string => t(`consumables.${k}`);

export default function ShopModal({
  save,
  onBuyConsumable,
  onClose,
}: {
  save: SaveData;
  onBuyConsumable: (id: ConsumableId) => void;
  onClose: () => void;
}) {
  const slots = inventorySlotsUsed(save);

  return (
    <div className="modal-backdrop">
      <div className="modal shop-modal">
        <h2 className="modal-title">{t('shop.title')}</h2>
        <p className="shop-gold">{fmt(t('ui.owned'), save.gold)}</p>
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
                    <span className="gear-count">{fmt(t('shop.youHave'), qty)}</span>
                  </span>
                  <span className="gear-desc">{conText(c.descKey)}</span>
                  <span className="gear-cost">{fmt(t('ui.cost'), c.cost)}</span>
                </div>
                <button className="gear-action buy" onClick={() => onBuyConsumable(c.id)} disabled={disabled} data-ui>
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
