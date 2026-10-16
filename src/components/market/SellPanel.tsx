import { useMemo, useState } from 'react';
import { MARKET_MAX_PRICE_CENTS, MARKET_MIN_PRICE_CENTS, splitPrice } from '../../../supabase/functions/_shared/chain/money';
import type { MarketOverview } from '../../../supabase/functions/_shared/market/types';
import type { SaveData } from '../../game/engine';
import { MarketApi } from '../../game/market/api';
import { SellableEntry, sellableEntries, socketedButCertified } from '../../game/market/items';
import { getCertificate, useCertificatesVersion } from '../../game/itemCerts';
import { listForSale } from '../../game/market/sync';
import { mt } from '../../locales/market';
import ItemCard, { ItemLike } from './ItemCard';
import { fmtUsdt, parsePriceInput } from './format';

const itemOf = (e: SellableEntry): ItemLike => {
  const cert = getCertificate(e.certificateId);
  if (e.kind === 'gold_pouch') return { kind: 'gold_pouch', templateId: e.pouchId, rarity: null, tier: null, substats: [], goldAmount: e.goldAmount };
  return { kind: e.kind, templateId: e.instance.templateId, rarity: e.instance.rarity, tier: cert?.tier ?? null, substats: e.instance.substats, goldAmount: null };
};

// Sell: what the SERVER's certificates say can be sold, a price in USDT, a confirmation (the item leaves the save), and my live listings with a cancel button.
export default function SellPanel({
  api,
  save,
  overview,
  feePercent,
  host,
  onChanged,
}: {
  api: MarketApi;
  save: SaveData;
  overview: MarketOverview | null;
  feePercent: number;
  host: { getSave: () => SaveData; applySave: (s: SaveData) => void };
  onChanged: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [priceText, setPriceText] = useState('');
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const certVersion = useCertificatesVersion(); // the server's list changed: what is sellable may have too
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => sellableEntries(save), [save, certVersion]);
  const socketed = socketedButCertified(save).length;
  const entry = entries.find((e) => e.certificateId === picked) ?? null;
  const cents = parsePriceInput(priceText);
  const valid = cents !== null && cents >= MARKET_MIN_PRICE_CENTS && cents <= MARKET_MAX_PRICE_CENTS;
  const split = valid ? splitPrice(cents) : null;
  const hasWallet = !!overview?.wallet;

  const list = async () => {
    if (!entry || !valid || busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    const cert = getCertificate(entry.certificateId);
    try {
      const r = await listForSale({ api, getSave: host.getSave, applySave: host.applySave }, entry, cert ?? { id: entry.certificateId, kind: entry.kind, templateId: entry.kind === 'gold_pouch' ? entry.pouchId : entry.instance.templateId }, cents as number);
      if ('reason' in r) {
        const key = `sell.fail.${r.reason}`;
        const text = mt(key);
        setMessage({ text: text === key ? mt('sell.fail.generic') : text, error: true });
      } else {
        setMessage({ text: mt('sell.listed'), error: false });
        setPicked(null);
        setPriceText('');
        onChanged();
      }
    } catch {
      setMessage({ text: mt('unreachable'), error: true });
    }
    setArmed(false);
    setBusy(false);
  };

  const cancel = async (listingId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.cancelListing(listingId);
      if ('reason' in r) setMessage({ text: r.reason === 'reserved' ? mt('sell.cancelReserved') : mt('sell.fail.generic'), error: true });
      else {
        setMessage({ text: mt('sell.cancelled'), error: false });
        onChanged();
      }
    } catch {
      setMessage({ text: mt('unreachable'), error: true });
    }
    setBusy(false);
  };

  const live = (overview?.listings ?? []).filter((l) => l.status === 'open' || l.status === 'reserved');

  return (
    <div className="mk-panel">
      <h3 className="mk-h">{mt('sell.title')}</h3>
      <p className="mk-note">{mt('rules.certified')}</p>
      {!hasWallet && <p className="mk-status error">{mt('sell.needWallet')}</p>}
      {socketed > 0 && <p className="mk-note">{mt('sell.takeGemsOut', { n: socketed })}</p>}
      {entries.length === 0 && <p className="mk-note">{mt('sell.empty')}</p>}
      <ul className="mk-list">
        {entries.map((e) => (
          <li key={e.certificateId} className={`mk-listing${picked === e.certificateId ? ' picked' : ''}`}>
            <button
              className="mk-listing-head"
              onClick={() => {
                setPicked(picked === e.certificateId ? null : e.certificateId);
                setArmed(false);
                setMessage(null);
              }}
              aria-pressed={picked === e.certificateId}
              data-ui
            >
              <ItemCard item={itemOf(e)} compact={picked !== e.certificateId} />
            </button>
            {picked === e.certificateId && (
              <div className="mk-listing-more">
                <label className="mk-hash">
                  <span>{mt('sell.price')}</span>
                  <input
                    inputMode="decimal"
                    value={priceText}
                    onChange={(ev) => {
                      setPriceText(ev.target.value);
                      setArmed(false);
                    }}
                    placeholder="0,00"
                    maxLength={10}
                    autoComplete="off"
                  />
                </label>
                <p className="mk-note">{mt('sell.priceHint', { min: fmtUsdt(MARKET_MIN_PRICE_CENTS), max: fmtUsdt(MARKET_MAX_PRICE_CENTS) })}</p>
                {split && (
                  <p className="mk-note">
                    {mt('sell.youGet', { a: fmtUsdt(split.sellerCents), f: fmtUsdt(split.feeCents) })} ({mt('rules.fee', { pct: feePercent })})
                  </p>
                )}
                {armed && <p className="mk-status">{mt('sell.confirmHint')}</p>}
                <button className="mk-btn primary" disabled={!valid || busy || !hasWallet} onClick={() => void list()} data-ui>
                  {busy ? mt('loading') : armed ? mt('sell.confirm') : mt('sell.list')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {message && (
        <p className={`mk-status${message.error ? ' error' : ''}`} role="status">
          {message.text}
        </p>
      )}

      <h3 className="mk-h">{mt('sell.myListings')}</h3>
      {live.length === 0 && <p className="mk-note">{mt('sell.noListings')}</p>}
      <ul className="mk-list">
        {live.map((l) => (
          <li key={l.id} className="mk-listing">
            <div className="mk-listing-head static">
              <ItemCard item={l.item} compact />
              <span className="mk-price">
                {fmtUsdt(l.priceCents)} <small>USDT</small>
                <span className={`mk-tag${l.status === 'reserved' ? ' warn' : ''}`}>{mt(`sell.status.${l.status}`)}</span>
              </span>
            </div>
            <div className="mk-listing-more">
              <span className="mk-note">{mt('sell.expires', { d: Math.max(0, Math.ceil((Date.parse(l.expiresAt) - Date.now()) / 86_400_000)) })}</span>
              <button className="mk-btn" disabled={busy || l.status === 'reserved'} onClick={() => void cancel(l.id)} data-ui>
                {mt('sell.cancel')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
