import { useCallback, useEffect, useState } from 'react';
import type { MarketOverview, ReservationView } from '../../supabase/functions/_shared/market/types';
import type { SaveData } from '../game/engine';
import { MarketUnreachable, PublicListing, fetchPublicListings, marketApi } from '../game/market/api';
import { syncMarket } from '../game/market/sync';
import { syncMaterials } from '../game/market/materialSync';
import { activeLocale } from '../locales';
import { mt } from '../locales/market';
import BrowsePanel from './market/BrowsePanel';
import HistoryPanel from './market/HistoryPanel';
import { MarketHost, syncDepsFor } from './market/marketDeps';
import Notices from './market/Notices';
import ReservationPanel from './market/ReservationPanel';
import { MarketSummary, MyOffers, OfferForm, SellPicker, useSellFlow } from './market/SellPanel';
import WalletPanel from './market/WalletPanel';
import { ScaleIcon } from './market/icons';
import { shortAddress } from './market/format';
import '../market.css';

type Tab = 'buy' | 'sell' | 'offers' | 'history' | 'wallet';
const TABS: { id: Exclude<Tab, 'wallet'>; icon: string }[] = [
  { id: 'buy', icon: '🛒' },
  { id: 'sell', icon: '🏷️' },
  { id: 'offers', icon: '📦' },
  { id: 'history', icon: '🕒' },
];

// The player market as a main screen of the game shell (web only, behind VITE_MARKET_ENABLED; this whole module, its text and its styles are a lazy chunk the desktop / Steam build never contains).
// Buy: browse the public listings, reserve one, pay ONE SOL transaction (the seller and the game fee) from your own wallet. Sell: pick an item and publish an offer (the form is the right column). My offers, History: receipts
// and refunds. The wallet link is a chip in the header. On a phone it is one column: the offer form shows under the Sell tab and the summary under My offers.
export default function MarketScreen({ save, host, pick = null, onPickUsed }: { save: SaveData; host: MarketHost; pick?: string | null; onPickUsed?: () => void }) {
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
      await syncMaterials(host).catch(() => undefined); // (a failure is retried by the background pass)
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
  const flow = useSellFlow({ api: marketApi, save, overview, feePercent: chain?.feePercent ?? 5, solUsd: overview?.solUsd ?? null, host, onChanged: () => void afterChange() });

  // "Vender no Mercado" from the inventory: open the Sell tab with that tradeable material picked
  useEffect(() => {
    if (!pick) return;
    setTab('sell');
    flow.setPicked(`mat:${pick}`);
    onPickUsed?.();
    // flow is recreated every render; the input is the pick itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  return (
    <div className="desktop-home mk-screen" data-tab={tab} aria-label={mt('title')} lang={activeLocale === 'en' ? 'en' : 'pt-BR'}>
      <section className="dh-card mk-main">
        <header className="mk-head">
          <ScaleIcon />
          <div className="mk-head-text">
            <h2 className="mk-title">{mt('title')}</h2>
            <p className="mk-subtitle">{mt('subtitle')}</p>
          </div>
          <div className="mk-head-actions">
            <button className={`mk-wallet-chip${wallet ? '' : ' none'}${tab === 'wallet' ? ' active' : ''}`} onClick={() => setTab('wallet')} data-ui>
              {wallet ? (
                <>
                  <span className="mk-chip-label">{mt('header.walletLabel')}: </span>
                  {shortAddress(wallet.address)}
                </>
              ) : (
                mt('header.connect')
              )}
            </button>
            <button className="mk-btn small mk-refresh" onClick={() => void refresh()} aria-label={mt('refresh')} title={mt('refresh')} data-ui>
              {'↻'}
            </button>
          </div>
        </header>

        <div className="mk-tabs" role="tablist">
          {TABS.map(({ id, icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)} data-ui>
              <span className="mk-tab-ico" aria-hidden>
                {icon}
              </span>
              {mt(`tabs.${id}`)}
            </button>
          ))}
        </div>

        {/* one compact line; the wallet-link and payment steps carry the full key warning instead */}
        {tab !== 'wallet' && !(tab === 'buy' && active) && <Notices chain={chain} />}

        <div className="mk-content">
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
              {!wallet && overview && !active && (
                <p className="mk-status">
                  {mt('wallet.needLink')}{' '}
                  <button className="mk-btn small" onClick={() => setTab('wallet')} data-ui>
                    {mt('header.connect')}
                  </button>
                </p>
              )}
              {active ? (
                <ReservationPanel
                  api={marketApi}
                  reservation={active}
                  walletAddress={wallet?.address ?? null}
                  solUsd={overview?.solUsd ?? null}
                  bagFull={bagFull}
                  onChanged={() => void afterChange()}
                  onClose={() => {
                    setActive(null);
                    void refresh();
                  }}
                />
              ) : (
                <BrowsePanel listings={listings} feePercent={chain?.feePercent ?? 5} solUsd={overview?.solUsd ?? null} busyId={busyId} failure={failure} onReserve={(l) => void reserve(l)} />
              )}
            </>
          )}
          {tab === 'sell' && <SellPicker flow={flow} />}
          {tab === 'offers' && <MyOffers flow={flow} />}
          {tab === 'history' && <HistoryPanel overview={overview} cluster={chain?.cluster ?? 'mainnet-beta'} />}
          {tab === 'wallet' && <WalletPanel api={marketApi} chain={chain} wallet={wallet} onChanged={() => void refresh()} />}
        </div>
      </section>

      <aside className="mk-side">
        <section className="dh-card mk-create">
          <h3 className="dh-card-title">{mt('sell.form.title')}</h3>
          <OfferForm flow={flow} />
        </section>
        <section className="dh-card mk-summary-card">
          <h3 className="dh-card-title">{mt('summary.title')}</h3>
          <MarketSummary overview={overview} feePercent={chain?.feePercent ?? 5} />
        </section>
      </aside>
    </div>
  );
}
