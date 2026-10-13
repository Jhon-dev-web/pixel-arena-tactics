import { useEffect, useState } from 'react';
import { fmtNum, t } from '../locales';
import { SaveData, playerLevel } from '../game/engine';
import { QTY_MODES, QtyMode, unitsFor } from '../game/qty';
import { ItemUse, usesOf } from '../game/itemUses';
import { merchantPrice, merchantQuote, merchantBudget, merchantRemaining } from '../game/merchant';
import WholesaleLink from './WholesaleLink';
import { StackKind, applyStashMove, bagCount, stashCount, stashFreeSlots } from '../game/stash';

// What can be done with a stack of the inventory: move it to the Baú, sell it to the merchant, discard it, and see where it is consumed ("Usar em...").
// One quantity selector (1 / 10 / pilha / tudo) serves the three actions; selling or discarding a WHOLE type asks for a second tap.

const modeLabel = (m: QtyMode): string => (m === 'stack' ? t('inventory.qtyStack') : m === 'all' ? t('inventory.qtyAll') : String(m));

export default function StackActions({
  save,
  kind,
  id,
  onStash,
  onSell,
  onDiscard,
  onOpenUse,
}: {
  save: SaveData;
  kind: StackKind;
  id: string;
  onStash: (qty: number | 'all') => void;
  onSell: (qty: number | 'all') => void;
  onDiscard: (qty: number | 'all') => void;
  onOpenUse: (use: ItemUse) => void;
}) {
  const [mode, setMode] = useState<QtyMode>(1);
  const [armed, setArmed] = useState<'sell' | 'discard' | null>(null);
  const have = bagCount(save, kind, id);
  const units = unitsFor(have, mode);
  const now = Date.now();

  // an armed confirmation never survives a change of item or quantity
  useEffect(() => setArmed(null), [id, kind, mode, have]);

  const sellable = kind !== 'gear' && merchantPrice(kind, id) > 0;
  const quote = sellable ? merchantQuote(save, kind, id, units, now) : null;
  const remaining = merchantRemaining(save, now);
  const uses = kind === 'gear' ? [] : usesOf(kind, id, save);
  const wholeType = units >= have;
  const stashRoom = stashFreeSlots(save) > 0 || applyStashMove(save, 'store', kind, id, units).moved > 0;

  return (
    <div className="stack-actions">
      {uses.length > 0 && (
        <div className="item-uses">
          <span className="item-uses-title">{t('inventory.usedIn')}</span>
          <div className="item-uses-list">
            {uses.map((u) =>
              u.kind === 'auto' || u.kind === 'reforge' || u.kind === 'use' || u.kind === 'stash' ? (
                <span className="item-use note" key={u.kind}>
                  {t(`inventory.useIn_${u.kind}`)}
                </span>
              ) : (
                <button className="item-use" key={u.kind} onClick={() => onOpenUse(u)} data-ui>
                  {t(`inventory.useIn_${u.kind}`, { n: u.refs.length })}
                  {u.kind === 'delivery' && u.refs[0] !== 'board' && ` · ${t('inventory.onBoard')}`}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <div className="qty-picker" role="radiogroup" aria-label={t('inventory.qtyLabel')}>
        {QTY_MODES.map((m) => (
          <button key={String(m)} className={`qty-btn${mode === m ? ' active' : ''}`} onClick={() => setMode(m)} aria-pressed={mode === m} data-ui>
            {modeLabel(m)}
          </button>
        ))}
        <span className="qty-units">{t('inventory.qtyUnits', { n: fmtNum(units) })}</span>
      </div>

      <div className="inv-actions-row">
        <button className="inv-store" onClick={() => onStash(mode === 'all' ? 'all' : units)} disabled={units <= 0 || !stashRoom} data-ui>
          {stashRoom ? t('stash.store', { n: fmtNum(units) }) : t('stash.full')}
        </button>
        {sellable && quote && (
          <button
            className={`inv-sell${armed === 'sell' ? ' confirm' : ''}`}
            onClick={() => {
              if (wholeType && armed !== 'sell') {
                setArmed('sell');
                return;
              }
              setArmed(null);
              onSell(mode === 'all' ? 'all' : units);
            }}
            disabled={quote.units <= 0}
            data-ui
          >
            {armed === 'sell' ? t('merchant.confirmSellAll') : quote.units <= 0 ? t('merchant.noBudget') : t('merchant.sell', { n: fmtNum(quote.units), g: fmtNum(quote.gold) })}
          </button>
        )}
        <button
          className={`inv-discard${armed === 'discard' ? ' confirm' : ''}`}
          onClick={() => {
            if (armed !== 'discard') {
              setArmed('discard');
              return;
            }
            setArmed(null);
            onDiscard(mode === 'all' ? 'all' : units);
          }}
          disabled={units <= 0}
          data-ui
        >
          {armed === 'discard' ? t('inventory.confirmDiscardN', { n: fmtNum(units) }) : t('inventory.discardN', { n: fmtNum(units) })}
        </button>
      </div>

      {!stashRoom && kind === 'material' && <div className="merchant-line"><WholesaleLink hint /></div>}

      {sellable && quote && (
        <div className="merchant-line">
          {t('merchant.priceEach', { n: fmtNum(quote.price) })} · {t('merchant.budgetLeft', { n: fmtNum(remaining), m: fmtNum(merchantBudget(playerLevel(save.xp))) })}
          {quote.capped && quote.units > 0 && ` · ${t('merchant.capped')}`}
        </div>
      )}
      {!sellable && kind !== 'gear' && <div className="merchant-line">{t('merchant.notBought')}</div>}
    </div>
  );
}

// The same quantity selector for taking units out of the Baú into the inventory.
export function StashTake({ save, kind, id, onTake }: { save: SaveData; kind: StackKind; id: string; onTake: (qty: number | 'all') => void }) {
  const [mode, setMode] = useState<QtyMode>('all');
  const have = stashCount(save, kind, id);
  const units = unitsFor(have, mode);
  const room = applyStashMove(save, 'take', kind, id, units).moved;
  return (
    <div className="stack-actions">
      <div className="qty-picker" role="radiogroup" aria-label={t('inventory.qtyLabel')}>
        {QTY_MODES.map((m) => (
          <button key={String(m)} className={`qty-btn${mode === m ? ' active' : ''}`} onClick={() => setMode(m)} aria-pressed={mode === m} data-ui>
            {modeLabel(m)}
          </button>
        ))}
        <span className="qty-units">{t('inventory.qtyUnits', { n: fmtNum(units) })}</span>
      </div>
      <div className="inv-actions-row">
        <button className="inv-store" onClick={() => onTake(mode === 'all' ? 'all' : units)} disabled={units <= 0 || room <= 0} data-ui>
          {room <= 0 && units > 0 ? t('stash.bagFull') : room < units ? t('stash.takeSome', { n: fmtNum(room) }) : t('stash.take', { n: fmtNum(units) })}
        </button>
      </div>
    </div>
  );
}
