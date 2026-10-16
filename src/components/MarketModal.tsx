import { useCallback, useEffect, useState } from 'react';
import type { MarketOverview, ReservationView } from '../../supabase/functions/_shared/market/types';
import type { SaveData } from '../game/engine';
import { MarketUnreachable, PublicListing, fetchPublicListings, marketApi } from '../game/market/api';
import { syncMarket } from '../game/market/sync';
import { mt } from '../locales/market';
import BrowsePanel from './market/BrowsePanel';
import HistoryPanel from './market/HistoryPanel';
import { MarketHost, syncDepsFor } from './market/marketDeps';
import ReservationPanel from './market/ReservationPanel';
import SellPanel from './market/SellPanel';
import WalletPanel, { Warnings } from './market/WalletPanel';
import '../market.css';

type Tab = 'buy' | 'sell' | 'history' | 'wallet';

// The player market (web only, behind VITE_MARKET_ENABLED; this whole module, its text and its styles are a lazy chunk the desktop / Steam build never contains).
// Buy: browse the public listings, reserve one, pay the two USDT transfers from your own wallet. Sell: list a certified item. History: receipts and refunds. Wallet: link your address.
export default function MarketModal({ save, host, onClose }: { save: SaveData; host: MarketHost; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('buy');
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ReservationView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bagFull, setBagFull] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, pub] = await Promise.all([marketApi.overview(), fetchPublicListings()]);
      if ('reason' in ov) setError(ov.reason === 'unavailable' ? mt('unavailable') : mt('unreachable'));
      else {
        setError(null);
        setOverview(ov);
        // a reservation that is still open (the player closed the screen, or reloaded) is resumed
        setActive((cur) => cur ?? ov.reservation);
      }
      setListings(pub);
    } catch (err) {
      setError(err instanceof MarketUnreachable ? mt('unreachable') : mt('unreachable'));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const afterChange = useCallback(async () => {
    try {
      const r = await syncMarket(syncDepsFor(host));
      setBagFull(r.waitingForRoom > 0);
    } catch {
      /* the background pass tries again */
    }
    await refresh();
  }, [host, refresh]);

  const reserve = async (listing: PublicListing) => {
    setBusyId(listing.id);
    setFailure(null);
    try {
      const r = await marketApi.reserve(listing.id);
      if ('reason' in r) {
        const extra = (r.extra ?? {}) as { reservationId?: string };
        if (r.reason === 'reservation_exists' && extra.reservationId) {
          const st = await marketApi.reservationStatus(extra.reservationId);
          if (!('reason' in st)) setActive(st.reservation);
        }
        const key = `browse.fail.${r.reason}`;
        const text = mt(key);
        setFailure(text === key ? mt('browse.fail.generic') : text);
      } else setActive(r.reservation);
    } catch {
      setFailure(mt('unreachable'));
    }
    setBusyId(null);
    void refresh();
  };

  const wallet = overview?.wallet ?? null;
  const chain = overview?.chain ?? null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shop-modal market-modal" role="dialog" aria-modal="true" aria-label={mt('title')} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{mt('title')}</h2>
        <p className="mk-note">{mt('subtitle')}</p>

        <div className="forge-tabs shop-tabs">
          {(['buy', 'sell', 'history', 'wallet'] as const).map((id) => (
            <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)} data-ui>
              {mt(`tabs.${id}`)}
            </button>
          ))}
        </div>

        <div className="shop-body mk-body">
          {error && (
            <p className="mk-status error" role="alert">
              {error}{' '}
              <button className="mk-btn small" onClick={() => void refresh()} data-ui>
                {mt('retry')}
              </button>
            </p>
          )}
          {loading && !overview && <p className="mk-note">{mt('loading')}</p>}

          {tab === 'buy' && (
            <>
              {!wallet && overview && (
                <p className="mk-status">
                  {mt('wallet.none')}{' '}
                  <button className="mk-btn small" onClick={() => setTab('wallet')} data-ui>
                    {mt('tabs.wallet')}
                  </button>
                </p>
              )}
              {active ? (
                <ReservationPanel
                  api={marketApi}
                  reservation={active}
                  walletAddress={wallet?.address ?? null}
                  bagFull={bagFull}
                  onChanged={() => void afterChange()}
                  onClose={() => {
                    setActive(null);
                    void refresh();
                  }}
                />
              ) : (
                <>
                  <Warnings chain={chain} />
                  <BrowsePanel listings={listings} feePercent={chain?.feePercent ?? 5} busyId={busyId} failure={failure} onReserve={(l) => void reserve(l)} />
                </>
              )}
            </>
          )}
          {tab === 'sell' && <SellPanel api={marketApi} save={save} overview={overview} feePercent={chain?.feePercent ?? 5} host={host} onChanged={() => void afterChange()} />}
          {tab === 'history' && <HistoryPanel overview={overview} chainId={chain?.chainId ?? 56} />}
          {tab === 'wallet' && <WalletPanel api={marketApi} chain={chain} wallet={wallet} onChanged={() => void refresh()} />}
        </div>

        <div className="mk-footer">
          <button className="mk-btn small" onClick={() => void refresh()} data-ui>
            {mt('refresh')}
          </button>
          <p className="mk-note">{mt('rules.feeExplain', { pct: chain?.feePercent ?? 5 })}</p>
        </div>
        <button className="modal-x" onClick={onClose} aria-label={mt('close')} data-ui>
          {'✕'}
        </button>
      </div>
    </div>
  );
}
