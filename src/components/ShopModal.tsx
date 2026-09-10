import { t } from '../locales';
import Assets from '../assets.json';
import { SaveData } from '../game/engine';
import { CONSUMABLES, CONSUMABLE_STACK, ConsumableId } from '../game/consumables';
import { GEMS, GemId } from '../game/gems';
import { MAX_SLOTS, inventorySlotsUsed } from '../game/inventory';
import ConsumableIcon from './ConsumableIcon';
import GemIcon from './GemIcon';
import TitleIcon from './TitleIcon';

const conText = (k: string): string => t(`consumables.${k}`);
const gemText = (k: string): string => t(`gems.${k}`);
const costLabel = (): string => t('forge.cost');

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
        <h2 className="modal-title">
          <TitleIcon src={Assets.icons.gold.url} fallback="🛒" /> {t('shop.title')}
        </h2>
        <p className="shop-gold">{t('ui.owned', { n: save.gold })}</p>
        <p className="shop-space">{t('inventory.space', { n: slots, m: MAX_SLOTS })}</p>

        <div className="shop-body">
          {CONSUMABLES.filter((c) => c.purchasable).map((c) => {
            const qty = save.consumables?.[c.id] ?? 0;
            const bagFull = qty === 0 && slots >= MAX_SLOTS;
            const disabled = save.gold < c.cost || qty >= CONSUMABLE_STACK || bagFull;
            return (
              <div className="gear-row" key={c.id}>
                <div className="gear-info">
                  <span className="gear-name">
                    <span className="gear-name-text">
                      <ConsumableIcon item={c} className="inline-icon" /> {conText(c.nameKey)}
                    </span>
                    <span className="gear-count">{t('shop.youHave', { n: qty })}</span>
                  </span>
                  <span className="gear-desc">{conText(c.descKey)}</span>
                  <span className="gear-cost">
                    <span>{costLabel()}:</span>
                    <img className="inline-icon" src={Assets.icons.gold.url} alt="" />
                    <span className="cost-value">{c.cost}</span>
                  </span>
                </div>
                <button className="gear-action buy" onClick={() => onBuyConsumable(c.id)} disabled={disabled} data-ui>
                  {bagFull ? t('shop.bagFull') : t('gear.buy')}
                </button>
              </div>
            );
          })}

          <div className="shop-section-title">
            <img className="inline-icon" src="/assets/icons/gem_ruby.png" alt="" /> {t('shop.gems')}
          </div>
          {GEMS.map((g) => {
            const owned = save.gems?.[g.id] ?? 0;
            const disabled = save.shards < g.shardCost;
            return (
              <div className="gear-row" key={g.id}>
                <div className="gear-info">
                  <span className="gear-name">
                    <span className="gear-name-text">
                      <GemIcon item={g} className="inline-icon" /> {gemText(g.nameKey)}
                    </span>
                    <span className="gear-count">{t('shop.youOwn', { n: owned })}</span>
                  </span>
                  <span className="gear-desc">{gemText(g.descKey)}</span>
                  <span className="gear-cost">
                    <span>{costLabel()}:</span>
                    <img className="inline-icon" src="/assets/icons/shards.png" alt="" />
                    <span className="cost-value">{g.shardCost}</span>
                  </span>
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
