import { useMemo, useState } from 'react';
import { MARKET_MAX_PRICE_LAMPORTS, MARKET_MIN_PRICE_LAMPORTS, SOL_PRICE_STEP_LAMPORTS, splitLamports } from '../../../supabase/functions/_shared/chain/solMoney';
import type { MarketOverview } from '../../../supabase/functions/_shared/market/types';
import type { SaveData } from '../../game/engine';
import { MarketApi } from '../../game/market/api';
import { SellableEntry, sellableEntries, socketedButCertified } from '../../game/market/items';
import { getCertificate, useCertificatesVersion } from '../../game/itemCerts';
import { listForSale } from '../../game/market/sync';
import { rarityDef } from '../../game/rarity';
import { t } from '../../locales';
import { mt } from '../../locales/market';
import ItemCard, { ItemArt, ItemLike } from './ItemCard';
import { SolIcon } from './icons';
import { fmtSol, fmtUsdAround, parsePriceInput } from './format';
import { itemName } from './names';

const itemOf = (e: SellableEntry): ItemLike => {
  const cert = getCertificate(e.certificateId);
  if (e.kind === 'gold_pouch') return { kind: 'gold_pouch', templateId: e.pouchId, rarity: null, tier: null, substats: [], goldAmount: e.goldAmount };
  return { kind: e.kind, templateId: e.instance.templateId, rarity: e.instance.rarity, tier: cert?.tier ?? null, substats: e.instance.substats, goldAmount: null };
};

/** What the player can pick: one piece of gear / a unique, or ALL the Gold Pouches of one size together (the quantity says how many to list). */
export interface SellGroup {
  key: string;
  entries: SellableEntry[];
  item: ItemLike;
}

export function groupEntries(entries: SellableEntry[]): SellGroup[] {
  const groups: SellGroup[] = [];
  const pouches = new Map<string, SellGroup>();
  for (const e of entries) {
    if (e.kind === 'gold_pouch') {
      const g = pouches.get(e.pouchId);
      if (g) g.entries.push(e);
      else {
        const made = { key: e.pouchId, entries: [e], item: itemOf(e) };
        pouches.set(e.pouchId, made);
        groups.push(made);
      }
    } else groups.push({ key: e.certificateId, entries: [e], item: itemOf(e) });
  }
  return groups;
}

export interface SellFlowProps {
  api: MarketApi;
  save: SaveData;
  overview: MarketOverview | null;
  feePercent: number;
  solUsd: number | null;
  host: { getSave: () => SaveData; applySave: (s: SaveData) => void };
  onChanged: () => void;
}

// The state of the "create offer" flow, shared by the item picker (main area), the offer form (side) and the list of my offers. Only the server's certificates decide what is sellable; the price is
// checked here for the form (the server checks it again), and publishing is two steps (the item leaves the inventory: it is asked once).
export function useSellFlow({ api, save, overview, feePercent, solUsd, host, onChanged }: SellFlowProps) {
  const [picked, setPickedRaw] = useState<string | null>(null);
  const [priceText, setPriceText] = useState('');
  const [qty, setQty] = useState(1);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const certVersion = useCertificatesVersion(); // the server's list changed: what is sellable may have too
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => sellableEntries(save), [save, certVersion]);
  const groups = useMemo(() => groupEntries(entries), [entries]);
  const socketed = socketedButCertified(save).length;
  const group = groups.find((g) => g.key === picked) ?? null;
  const maxQty = group ? group.entries.length : 1;
  const count = group?.entries[0]?.kind === 'gold_pouch' ? Math.min(Math.max(1, qty), maxQty) : 1;
  const unitLamports = parsePriceInput(priceText);
  const valid = unitLamports !== null && unitLamports >= MARKET_MIN_PRICE_LAMPORTS && unitLamports <= MARKET_MAX_PRICE_LAMPORTS && unitLamports % SOL_PRICE_STEP_LAMPORTS === 0;
  const split = valid ? splitLamports(unitLamports) : null;
  const hasWallet = !!overview?.wallet;

  const setPicked = (key: string | null) => {
    setPickedRaw(key);
    setQty(1);
    setArmed(false);
    setMessage(null);
  };

  const publish = async () => {
    if (!group || !valid || busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    let done = 0;
    try {
      for (const entry of group.entries.slice(0, count)) {
        const cert = getCertificate(entry.certificateId);
        const r = await listForSale({ api, getSave: host.getSave, applySave: host.applySave }, entry, cert ?? { id: entry.certificateId, kind: entry.kind, templateId: entry.kind === 'gold_pouch' ? entry.pouchId : entry.instance.templateId }, unitLamports as number);
        if ('reason' in r) {
          const key = `sell.fail.${r.reason}`;
          const text = mt(key);
          setMessage({ text: text === key ? mt('sell.fail.generic') : text, error: true });
          break;
        }
        done += 1;
      }
      if (done === count) {
        setMessage({ text: mt('sell.listed'), error: false });
        setPickedRaw(null);
        setPriceText('');
        setQty(1);
      }
      if (done > 0) onChanged();
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
  return { groups, picked, setPicked, group, priceText, setPriceText: (v: string) => { setPriceText(v); setArmed(false); }, qty: count, maxQty, setQty: (n: number) => { setQty(Math.min(Math.max(1, n), maxQty)); setArmed(false); }, armed, busy, message, socketed, valid, split, hasWallet, feePercent, solUsd, publish, cancel, live };
}
export type SellFlow = ReturnType<typeof useSellFlow>;

const optionLabel = (g: SellGroup): string => {
  const name = itemName(g.item);
  if (g.item.kind === 'gold_pouch') return `${name} x${g.entries.length}`;
  const rar = g.item.rarity ? t(`rarity.${rarityDef(g.item.rarity).nameKey}`) : '';
  return [name, rar, g.item.tier ? mt('browse.tierN', { n: g.item.tier }) : ''].filter(Boolean).join(' · ');
};

/** The main area of the Sell tab: everything the server's certificates say can be sold, as tiles to pick from. */
export function SellPicker({ flow }: { flow: SellFlow }) {
  return (
    <div className="mk-panel">
      <h3 className="mk-h">{mt('sell.yourItems')}</h3>
      <p className="mk-note">{mt('rules.certified')}</p>
      {!flow.hasWallet && <p className="mk-status error">{mt('sell.needWallet')}</p>}
      {flow.socketed > 0 && <p className="mk-note">{mt('sell.takeGemsOut', { n: flow.socketed })}</p>}
      {flow.groups.length === 0 && <p className="mk-note">{mt('sell.empty')}</p>}
      <ul className="mk-grid mk-tiles">
        {flow.groups.map((g) => {
          const on = flow.picked === g.key;
          const rar = g.item.kind === 'gold_pouch' ? 'common' : g.item.rarity ?? 'common';
          return (
            <li key={g.key}>
              <button className={`mk-card mk-tile${on ? ' picked' : ''}`} onClick={() => flow.setPicked(on ? null : g.key)} aria-pressed={on} data-ui>
                <span className="mk-card-top">
                  <ItemArt item={g.item} qty={g.entries.length} />
                  <span className="mk-card-id">
                    <span className={`mk-item-name r-${rar}`}>{itemName(g.item)}</span>
                    {g.item.kind !== 'gold_pouch' && g.item.rarity ? <span className={`rarity-line r-${rar}`}>{t(`rarity.${rarityDef(g.item.rarity).nameKey}`)}</span> : null}
                  </span>
                  {g.item.tier ? (
                    <span className="mk-card-tags">
                      <span className="mk-tag">{mt('browse.tierN', { n: g.item.tier })}</span>
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The "Criar oferta" box: the item, the quantity (Gold Pouches only), the unit price in SOL, the market fee and what the seller receives, computed live. */
export function OfferForm({ flow }: { flow: SellFlow }) {
  const total = flow.split ? { fee: flow.split.feeLamports * flow.qty, get: flow.split.sellerLamports * flow.qty } : null;
  const aroundGet = total ? fmtUsdAround(total.get, flow.solUsd) : null;
  const pouch = flow.group?.item.kind === 'gold_pouch';
  return (
    <div className="mk-form">
      <label className="mk-field">
        <span>{mt('sell.form.item')}</span>
        <select value={flow.picked ?? ''} onChange={(e) => flow.setPicked(e.target.value || null)} disabled={flow.busy}>
          <option value="">{mt('sell.form.choose')}</option>
          {flow.groups.map((g) => (
            <option key={g.key} value={g.key}>
              {optionLabel(g)}
            </option>
          ))}
        </select>
      </label>
      {flow.group && <ItemCard item={flow.group.item} compact />}
      {pouch && (
        <div className="mk-field">
          <span>{mt('sell.form.quantity')}</span>
          <span className="mk-qty-row">
            <button className="mk-btn small" onClick={() => flow.setQty(flow.qty - 1)} disabled={flow.qty <= 1 || flow.busy} aria-label="-" data-ui>
              {'−'}
            </button>
            <b>{flow.qty}</b>
            <button className="mk-btn small" onClick={() => flow.setQty(flow.qty + 1)} disabled={flow.qty >= flow.maxQty || flow.busy} aria-label="+" data-ui>
              {'+'}
            </button>
            <span className="mk-note">{mt('sell.form.max', { n: flow.maxQty })}</span>
          </span>
        </div>
      )}
      <label className="mk-field">
        <span>
          {mt('sell.form.unit')} <small>(SOL)</small>
        </span>
        <span className="mk-price-input">
          <SolIcon />
          <input inputMode="decimal" value={flow.priceText} onChange={(e) => flow.setPriceText(e.target.value)} placeholder="0,000" maxLength={9} autoComplete="off" disabled={flow.busy} />
        </span>
      </label>
      <p className="mk-note">{mt('sell.priceHint', { min: fmtSol(MARKET_MIN_PRICE_LAMPORTS), max: fmtSol(MARKET_MAX_PRICE_LAMPORTS) })}</p>
      <div className="mk-calc">
        <span>{mt('sell.form.fee', { pct: flow.feePercent })}</span>
        <b>
          <SolIcon /> {fmtSol(total?.fee ?? 0)}
        </b>
        <span className="mk-receive">{mt('sell.form.receive')}</span>
        <b className="mk-receive">
          <SolIcon /> {fmtSol(total?.get ?? 0)}
        </b>
        {aroundGet && <small className="mk-usd mk-receive">{mt('browse.around', { a: aroundGet })}</small>}
      </div>
      {!flow.hasWallet && <p className="mk-status error">{mt('sell.needWallet')}</p>}
      {flow.armed && <p className="mk-status">{mt('sell.confirmHint')}</p>}
      <button className="mk-btn primary mk-publish" disabled={!flow.group || !flow.valid || flow.busy || !flow.hasWallet} onClick={() => void flow.publish()} data-ui>
        {flow.busy ? mt('loading') : flow.armed ? mt('sell.confirm') : mt('sell.form.publish')}
      </button>
      {flow.message && (
        <p className={`mk-status${flow.message.error ? ' error' : ''}`} role="status">
          {flow.message.text}
        </p>
      )}
    </div>
  );
}

/** My live offers, each with its price, status, expiry and a cancel button. */
export function MyOffers({ flow }: { flow: SellFlow }) {
  return (
    <div className="mk-panel">
      <h3 className="mk-h">{mt('tabs.offers')}</h3>
      {flow.message && (
        <p className={`mk-status${flow.message.error ? ' error' : ''}`} role="status">
          {flow.message.text}
        </p>
      )}
      {flow.live.length === 0 && <p className="mk-note">{mt('sell.noListings')}</p>}
      <ul className="mk-list">
        {flow.live.map((l) => (
          <li key={l.id} className="mk-listing">
            <div className="mk-listing-head static">
              <ItemCard item={l.item} compact />
              <span className="mk-price">
                <span>
                  <SolIcon /> {fmtSol(l.priceLamports)} <small>SOL</small>
                </span>
                <span className={`mk-tag${l.status === 'reserved' ? ' warn' : ''}`}>{mt(`sell.status.${l.status}`)}</span>
              </span>
            </div>
            <div className="mk-listing-more">
              <span className="mk-note">{mt('sell.expires', { d: Math.max(0, Math.ceil((Date.parse(l.expiresAt) - Date.now()) / 86_400_000)) })}</span>
              <button className="mk-btn" disabled={flow.busy || l.status === 'reserved'} onClick={() => void flow.cancel(l.id)} data-ui>
                {mt('sell.cancel')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Resumo do mercado": my active offers and what I sold today, from the server's overview. */
export function MarketSummary({ overview, feePercent }: { overview: MarketOverview | null; feePercent: number }) {
  const today = new Date().toDateString();
  const soldToday = (overview?.sales ?? []).filter((s) => s.role === 'seller' && new Date(s.soldAt).toDateString() === today);
  const volume = soldToday.reduce((n, s) => n + s.priceLamports, 0);
  const active = (overview?.listings ?? []).filter((l) => l.status === 'open' || l.status === 'reserved').length;
  return (
    <dl className="mk-stats">
      <div>
        <dt>{mt('summary.active')}</dt>
        <dd>{active}</dd>
      </div>
      <div>
        <dt>{mt('summary.soldToday')}</dt>
        <dd>{soldToday.length}</dd>
      </div>
      <div>
        <dt>{mt('summary.volume')}</dt>
        <dd>
          <SolIcon /> {fmtSol(volume)}
        </dd>
      </div>
      <div>
        <dt>{mt('summary.fee')}</dt>
        <dd>{feePercent}%</dd>
      </div>
    </dl>
  );
}
