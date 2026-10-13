import { useState } from 'react';
import { fmtNum, t } from '../locales';
import Assets from '../assets.json';
import { SaveData, playerLevel } from '../game/engine';
import { MATERIALS } from '../game/materials';
import { SellKind, merchantBudget, merchantPrice, merchantQuote, merchantRemaining } from '../game/merchant';
import { QTY_MODES, QtyMode, unitsFor } from '../game/qty';
import MaterialIcon from './MaterialIcon';
import { CONSUMABLES, CONSUMABLE_STACK, ConsumableId } from '../game/consumables';
import { GEMS, GemId } from '../game/gems';
import { inventoryCapacity, inventorySlotsUsed } from '../game/inventory';
import ConsumableIcon from './ConsumableIcon';
import GemIcon from './GemIcon';
import TitleIcon from './TitleIcon';
import WholesalePanel from './WholesalePanel';
import { WholesaleLine, wholesaleUnlocked } from '../game/wholesale';

const conText = (k: string): string => t(`consumables.${k}`);
const gemText = (k: string): string => t(`gems.${k}`);
const costLabel = (): string => t('forge.cost');

export default function ShopModal({
  save,
  onBuyConsumable,
  onBuyGem,
  onSell,
  onSellWholesale,
  initialTab,
  onClose,
}: {
  save: SaveData;
  onBuyConsumable: (id: ConsumableId) => void;
  onBuyGem: (id: GemId) => void;
  onSell: (kind: SellKind, id: string, qty: number | 'all') => void;
  onSellWholesale: (lines: WholesaleLine[]) => void;
  initialTab?: 'buy' | 'sell' | 'wholesale';
  onClose: () => void;
}) {
  const slots = inventorySlotsUsed(save);
  const capacity = inventoryCapacity(save);
  const [tab, setTab] = useState<'buy' | 'sell' | 'wholesale'>(initialTab ?? 'buy');
  // selling a WHOLE type needs a second tap on the same button
  const [armed, setArmed] = useState<string | null>(null);
  const now = Date.now();
  const modeLabel = (m: QtyMode): string => (m === 'stack' ? t('inventory.qtyStack') : m === 'all' ? t('inventory.qtyAll') : String(m));
  const sellRows: { kind: SellKind; id: string; qty: number; price: number }[] = [
    ...MATERIALS.map((m) => ({ kind: 'material' as SellKind, id: m.id, qty: save.materials?.[m.id] ?? 0, price: merchantPrice('material', m.id) })),
    ...CONSUMABLES.map((c) => ({ kind: 'consumable' as SellKind, id: c.id, qty: save.consumables?.[c.id] ?? 0, price: merchantPrice('consumable', c.id) })),
  ].filter((r) => r.qty > 0 && r.price > 0);
  const budget = merchantBudget(playerLevel(save.xp));
  const left = merchantRemaining(save, now);

  return (
    <div className="modal-backdrop">
      <div className="modal shop-modal">
        <h2 className="modal-title">
          <TitleIcon src={Assets.icons.gold.url} fallback="🛒" /> {t('shop.title')}
        </h2>
        <p className="shop-gold">{t('ui.owned', { n: fmtNum(save.gold) })}</p>
        <p className="shop-space">{t('inventory.space', { n: slots, m: capacity })}</p>

        <div className="forge-tabs shop-tabs">
          <button className={`tab${tab === 'buy' ? ' active' : ''}`} onClick={() => setTab('buy')} data-ui>
            {t('shop.buyTab')}
          </button>
          <button className={`tab${tab === 'sell' ? ' active' : ''}`} onClick={() => setTab('sell')} data-ui>
            {t('shop.sellTab')}
          </button>
          <button className={`tab${tab === 'wholesale' ? ' active' : ''}`} onClick={() => setTab('wholesale')} data-ui>
            {wholesaleUnlocked(save) ? t('shop.wholesaleTab') : `🔒 ${t('shop.wholesaleTab')}`}
          </button>
        </div>

        {tab === 'sell' && (
          <div className="shop-body shop-sell">
            <div className="merchant-budget">
              <span>{t('merchant.budgetToday', { n: fmtNum(left), m: fmtNum(budget) })}</span>
              <div className="bar merchant-budget-bar">
                <div className="bar-fill xp-fill" style={{ width: `${budget > 0 ? Math.round((left / budget) * 100) : 0}%` }} />
              </div>
              <span className="stash-note">{t('merchant.explain')}</span>
            </div>
            {sellRows.length === 0 && <p className="stash-note">{t('merchant.nothing')}</p>}
            {sellRows.map((r) => {
              const def = r.kind === 'material' ? MATERIALS.find((m) => m.id === r.id)! : CONSUMABLES.find((c) => c.id === r.id)!;
              return (
                <div className="gear-row" key={`${r.kind}:${r.id}`}>
                  <div className="gear-info">
                    <span className="gear-name">
                      <span className="gear-name-text">
                        {r.kind === 'material' ? <MaterialIcon item={def as (typeof MATERIALS)[number]} className="inline-icon" /> : <ConsumableIcon item={def as (typeof CONSUMABLES)[number]} className="inline-icon" />}{' '}
                        {r.kind === 'material' ? t(`materials.${def.nameKey}`) : conText(def.nameKey)}
                      </span>
                      <span className="gear-count">{t('shop.youHave', { n: fmtNum(r.qty) })}</span>
                    </span>
                    <span className="gear-cost">
                      <img className="inline-icon" src={Assets.icons.gold.url} alt="" />
                      <span className="cost-value">{t('shop.sellEach', { n: r.price })}</span>
                    </span>
                  </div>
                  <div className="sell-buttons">
                    {QTY_MODES.map((m) => {
                      const units = unitsFor(r.qty, m);
                      const q = merchantQuote(save, r.kind, r.id, units, now);
                      const key = `${r.kind}:${r.id}:${m}`;
                      const whole = units >= r.qty;
                      return (
                        <button
                          key={String(m)}
                          className={`gear-action sell${armed === key ? ' confirm' : ''}`}
                          disabled={q.units <= 0}
                          title={t('merchant.sell', { n: fmtNum(q.units), g: fmtNum(q.gold) })}
                          onClick={() => {
                            if (whole && armed !== key) {
                              setArmed(key);
                              return;
                            }
                            setArmed(null);
                            onSell(r.kind, r.id, m === 'all' ? 'all' : units);
                          }}
                          data-ui
                        >
                          {armed === key ? t('merchant.confirmShort') : `${modeLabel(m)} · ${fmtNum(q.gold)}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'wholesale' && <WholesalePanel save={save} onSell={onSellWholesale} />}

        {tab === 'buy' && (
        <div className="shop-body">
          {CONSUMABLES.filter((c) => c.purchasable).map((c) => {
            const qty = save.consumables?.[c.id] ?? 0;
            const bagFull = qty === 0 && slots >= capacity;
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
        )}

        <button className="modal-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
