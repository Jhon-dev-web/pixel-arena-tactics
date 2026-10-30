import PixelIcon from './PixelIcon';
import { ReactNode, useState } from 'react';
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
import WholesalePanel from './WholesalePanel';
import PouchPanel from './PouchPanel';
import { PouchId } from '../game/goldPouch';
import { WholesaleLine, wholesaleUnlocked } from '../game/wholesale';
import { Button, ItemCard, Meter, ModalShell, Panel, Tabs } from './ui';
import type { TabItem } from './ui';

const conText = (k: string): string => t(`consumables.${k}`);
const gemText = (k: string): string => t(`gems.${k}`);

type ShopTab = 'buy' | 'sell' | 'wholesale' | 'pouch';

// A price: the currency icon, the number and the currency's NAME (the icon alone is not enough to tell Ouro from Éter, for a screen reader or at a glance).
function Price({ icon, n, currency }: { icon: string; n: number | string; currency: string }) {
  return (
    <span className="shop-price" aria-label={`${n} ${currency}`}>
      <img className="inline-icon" src={icon} alt="" />
      <span aria-hidden="true">
        {n} <span className="shop-cur">{currency}</span>
      </span>
    </span>
  );
}

// One line of the buy list: the icon with the stack it holds, the name and what it does, the price and the Comprar button. (It was a 194 px card per item, so the gems sat on the second screen.)
function ShopRow({ icon, qty, name, have, desc, price, action }: { icon: ReactNode; qty?: string; name: string; have: string; desc: string; price: ReactNode; action: ReactNode }) {
  return (
    <article className="shop-row">
      <span className="shop-row-icon">
        {icon}
        {qty && <span className="shop-row-qty">{qty}</span>}
      </span>
      <span className="shop-row-name">
        {name} <span className="shop-have">{have}</span>
      </span>
      <span className="shop-row-buy">
        {price}
        {action}
      </span>
      <span className="shop-row-desc">{desc}</span>
    </article>
  );
}

export default function ShopModal({
  save,
  onBuyConsumable,
  onBuyGem,
  onSell,
  onSellWholesale,
  onCreatePouch,
  onOpenPouch,
  initialTab,
  onClose,
}: {
  save: SaveData;
  onBuyConsumable: (id: ConsumableId) => void;
  onBuyGem: (id: GemId) => void;
  onSell: (kind: SellKind, id: string, qty: number | 'all') => void;
  onSellWholesale: (lines: WholesaleLine[]) => void;
  onCreatePouch: (id: PouchId) => void;
  onOpenPouch: (id: PouchId) => void;
  initialTab?: ShopTab;
  onClose: () => void;
}) {
  const slots = inventorySlotsUsed(save);
  const capacity = inventoryCapacity(save);
  const [tab, setTab] = useState<ShopTab>(initialTab ?? 'buy');
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

  const tabs: TabItem<ShopTab>[] = [
    { id: 'buy', label: t('shop.buyTab') },
    { id: 'sell', label: t('shop.sellTab') },
    { id: 'wholesale', label: wholesaleUnlocked(save) ? t('shop.wholesaleTab') : <><PixelIcon name="lock" className="sm" /> {t('shop.wholesaleTab')}</> },
    { id: 'pouch', label: t('shop.pouchTab') },
  ];

  return (
    <ModalShell
      className="shop-modal"
      icon={<img className="pixel-icon" src={Assets.icons.gold.url} alt="" />}
      title={t('shop.title')}
      subtitle={`${t('ui.owned', { n: fmtNum(save.gold) })} · ${t('inventory.space', { n: slots, m: capacity })}`}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="ui-cq shop-root">
        <Tabs<ShopTab> items={tabs} value={tab} onChange={setTab} label={t('shop.title')} />

        {tab === 'sell' && (
          <>
            <Panel tone="inset" className="shop-budget">
              <span>{t('merchant.budgetToday', { n: fmtNum(left), m: fmtNum(budget) })}</span>
              <Meter pct={budget > 0 ? Math.round((left / budget) * 100) : 0} tone="xp" thin label={t('merchant.budgetToday', { n: fmtNum(left), m: fmtNum(budget) })} />
              <span className="ui-note">{t('merchant.explain')}</span>
            </Panel>
            {sellRows.length === 0 && <p className="ui-note">{t('merchant.nothing')}</p>}
            <div className="ui-grid shop-grid">
              {sellRows.map((r) => {
                const def = r.kind === 'material' ? MATERIALS.find((m) => m.id === r.id)! : CONSUMABLES.find((c) => c.id === r.id)!;
                return (
                  <ItemCard
                    key={`${r.kind}:${r.id}`}
                    icon={r.kind === 'material' ? <MaterialIcon item={def as (typeof MATERIALS)[number]} className="pixel-icon" /> : <ConsumableIcon item={def as (typeof CONSUMABLES)[number]} className="pixel-icon" />}
                    qty={fmtNum(r.qty)}
                    name={r.kind === 'material' ? t(`materials.${def.nameKey}`) : conText(def.nameKey)}
                    tag={<span className="shop-have">{t('shop.youHave', { n: fmtNum(r.qty) })}</span>}
                    action={
                      <div className="shop-sell-buttons">
                        {QTY_MODES.map((m) => {
                          const units = unitsFor(r.qty, m);
                          const q = merchantQuote(save, r.kind, r.id, units, now);
                          const key = `${r.kind}:${r.id}:${m}`;
                          const whole = units >= r.qty;
                          return (
                            <Button
                              key={String(m)}
                              size="sm"
                              variant={armed === key ? 'primary' : 'secondary'}
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
                            >
                              {armed === key ? t('merchant.confirmShort') : `${modeLabel(m)} · ${fmtNum(q.gold)}`}
                            </Button>
                          );
                        })}
                      </div>
                    }
                  >
                    <p className="shop-each">
                      <img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {t('shop.sellEach', { n: r.price })}
                    </p>
                  </ItemCard>
                );
              })}
            </div>
          </>
        )}

        {tab === 'wholesale' && <WholesalePanel save={save} onSell={onSellWholesale} />}
        {tab === 'pouch' && <PouchPanel save={save} onCreate={onCreatePouch} onOpen={onOpenPouch} />}

        {tab === 'buy' && (
          <>
            <Panel title={t('shop.consumables')}>
              <div className="shop-rows">
                {CONSUMABLES.filter((c) => c.purchasable).map((c) => {
                  const qty = save.consumables?.[c.id] ?? 0;
                  const bagFull = qty === 0 && slots >= capacity;
                  const disabled = save.gold < c.cost || qty >= CONSUMABLE_STACK || bagFull;
                  return (
                    <ShopRow
                      key={c.id}
                      icon={<ConsumableIcon item={c} className="pixel-icon" />}
                      qty={qty > 0 ? fmtNum(qty) : undefined}
                      name={conText(c.nameKey)}
                      have={t('shop.youHave', { n: qty })}
                      desc={conText(c.descKey)}
                      price={<Price icon={Assets.icons.gold.url} n={fmtNum(c.cost)} currency={t('quests.goldWord')} />}
                      action={
                        <Button size="sm" variant="primary" onClick={() => onBuyConsumable(c.id)} disabled={disabled}>
                          {bagFull ? t('shop.bagFull') : t('gear.buy')}
                        </Button>
                      }
                    />
                  );
                })}
              </div>
            </Panel>

            <Panel title={t('shop.gems')} icon={<img src="/assets/icons/gem_ruby.png" alt="" />}>
              <div className="shop-rows">
                {GEMS.map((g) => {
                  const owned = save.gems?.[g.id] ?? 0;
                  const disabled = save.shards < g.shardCost;
                  return (
                    <ShopRow
                      key={g.id}
                      icon={<GemIcon item={g} className="pixel-icon" />}
                      qty={owned > 0 ? fmtNum(owned) : undefined}
                      name={gemText(g.nameKey)}
                      have={t('shop.youOwn', { n: owned })}
                      desc={gemText(g.descKey)}
                      price={<Price icon="/assets/icons/shards.png" n={fmtNum(g.shardCost)} currency={t('quests.shardsWord')} />}
                      action={
                        <Button size="sm" variant="primary" onClick={() => onBuyGem(g.id)} disabled={disabled}>
                          {t('gear.buy')}
                        </Button>
                      }
                    />
                  );
                })}
              </div>
            </Panel>
          </>
        )}
      </div>
    </ModalShell>
  );
}
