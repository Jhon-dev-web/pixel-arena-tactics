import { useCallback, useEffect, useRef, useState } from 'react';
import PixelIcon from './PixelIcon';
import type { UiIconName } from './uiIcons';
import type { MarketOverview, ReservationView } from '../../supabase/functions/_shared/market/types';
import { playerLevel, type SaveData } from '../game/engine';
import { PublicListing, fetchPublicListings, marketApi } from '../game/market/api';
import { MarketChange, applyMarketChange, makeReadSequence } from '../game/market/liveState';
import { syncMarket } from '../game/market/sync';
import { syncMaterials } from '../game/market/materialSync';
import { activeLocale, t } from '../locales';
import { useOpsState } from '../lib/opsStatus';
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
import { Button, PageHeader, Panel, Screen, ScreenLayout, Tabs } from './ui';
import type { TabItem } from './ui';
import '../market.css';

type Tab = 'buy' | 'sell' | 'offers' | 'history' | 'wallet';
const TABS: { id: Exclude<Tab, 'wallet'>; icon: UiIconName }[] = [
  { id: 'buy', icon: 'marketBuy' },
  { id: 'sell', icon: 'marketSell' },
  { id: 'offers', icon: 'marketOffers' },
  { id: 'history', icon: 'marketHistory' },
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
  const ops = useOpsState(); // the owner / watchdog can pause the market: say so plainly instead of letting every button fail

  // Every read is numbered: an older answer that arrives after a newer one never overwrites it (the screen would flash back to a list from before the click).
  const reads = useRef(makeReadSequence());

  const refresh = useCallback(async () => {
    setLoading(true);
    const n = reads.current.next();
    try {
      const [ov, pub] = await Promise.all([marketApi.overview(), fetchPublicListings()]);
      if (!reads.current.isLatest(n)) return;
      if ('reason' in ov) setError(ov.reason === 'unavailable' ? mt('unavailable') : mt('unreachable'));
      else {
        setError(null);
        setOverview(ov);
        // a reservation that is still open (the player closed the screen, or reloaded) is resumed
        setActive((cur) => cur ?? ov.reservation);
      }
      setListings(pub);
    } catch {
      setError(mt('unreachable')); // any failure of the two reads (network, parsing) reads the same to the player: nothing changed, try again
    }
    if (reads.current.isLatest(n)) setLoading(false);
  }, []);

  // A server answer is applied to the lists on screen at once (liveState.ts); the read that follows replaces this local view with the server's.
  const apply = useCallback((change: MarketChange) => {
    reads.current.next(); // a read that is still on its way was asked BEFORE this answer: its lists are older, so it must not land on top
    setOverview((o) => applyMarketChange({ overview: o, listings: [] }, change).overview);
    setListings((l) => applyMarketChange({ overview: null, listings: l }, change).listings);
    if (change.kind === 'reserved') setActive(change.reservation);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // After an action: read the lists it changed from the server (once, no cache) and bring what the server holds for this account into the bag (a bought item, a cancelled offer's item or units), both
  // at the same time. The caller keeps its button blocked until this resolves. Never throws.
  const afterChange = useCallback(async () => {
    const deliver = async () => {
      try {
        const r = await syncMarket(syncDepsFor(host));
        await syncMaterials(host).catch(() => undefined); // (a failure is retried by the background safety-net pass)
        setBagFull(r.waitingForRoom > 0);
      } catch {
        /* the background pass tries again */
      }
    };
    await Promise.all([refresh(), deliver()]);
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
      } else apply({ kind: 'reserved', reservation: r.reservation });
    } catch {
      setFailure(mt('unreachable'));
    }
    setBusyId(null);
    await refresh();
  };

  const wallet = overview?.wallet ?? null;
  const chain = overview?.chain ?? null;
  const flow = useSellFlow({ api: marketApi, save, overview, feePercent: chain?.feePercent ?? 5, solUsd: overview?.solUsd ?? null, host, onApplied: apply, onChanged: afterChange });

  // "Vender no Mercado" from the inventory: open the Sell tab with that tradeable material picked
  useEffect(() => {
    if (!pick) return;
    setTab('sell');
    flow.setPicked(`mat:${pick}`);
    onPickUsed?.();
    // flow is recreated every render; the input is the pick itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  const tabs: TabItem<Tab>[] = TABS.map(({ id, icon }) => ({
    id,
    label: mt(`tabs.${id}`),
    icon: <PixelIcon name={icon} />,
  }));

  const main = (
    <>
      <Tabs<Tab> items={tabs} value={tab} onChange={setTab} label={mt('title')} className="mk-tabs" />

      {/* one compact line; the wallet-link and payment steps carry the full key warning instead */}
      {tab !== 'wallet' && !(tab === 'buy' && active) && <Notices chain={chain} />}

      <div className="mk-content">
        {error && (
          <p className="ui-alert bad" role="alert">
            {error}{' '}
            <Button size="sm" onClick={() => void refresh()}>
              {mt('retry')}
            </Button>
          </p>
        )}
        {loading && !overview && <p className="ui-note">{mt('loading')}</p>}

        {tab === 'buy' && (
          <>
            {!wallet && overview && !active && (
              <p className="ui-alert">
                {mt('wallet.needLink')}{' '}
                <Button size="sm" variant="primary" onClick={() => setTab('wallet')}>
                  {mt('header.connect')}
                </Button>
              </p>
            )}
            {active ? (
              <ReservationPanel
                api={marketApi}
                reservation={active}
                walletAddress={wallet?.address ?? null}
                solUsd={overview?.solUsd ?? null}
                bagFull={bagFull}
                onApplied={apply}
                onChanged={afterChange}
                onClose={() => setActive(null)}
              />
            ) : (
              <BrowsePanel listings={listings} feePercent={chain?.feePercent ?? 5} solUsd={overview?.solUsd ?? null} busyId={busyId} failure={failure} onReserve={(l) => void reserve(l)} heroLevel={playerLevel(save.xp)} />
            )}
          </>
        )}
        {tab === 'sell' && <SellPicker flow={flow} />}
        {tab === 'offers' && <MyOffers flow={flow} />}
        {tab === 'history' && <HistoryPanel overview={overview} cluster={chain?.cluster ?? 'mainnet-beta'} />}
        {tab === 'wallet' && <WalletPanel api={marketApi} chain={chain} wallet={wallet} onChanged={refresh} />}
      </div>
    </>
  );

  const side = (
    <>
      <Panel className="mk-create" title={mt('sell.form.title')}>
        <OfferForm flow={flow} />
      </Panel>
      <Panel className="mk-summary-card" title={mt('summary.title')}>
        <MarketSummary overview={overview} feePercent={chain?.feePercent ?? 5} />
      </Panel>
    </>
  );

  return (
    <Screen label={mt('title')} className="mk-screen" lang={activeLocale === 'en' ? 'en' : 'pt-BR'} data-tab={tab}>
      <PageHeader
        icon={<ScaleIcon />}
        title={mt('title')}
        subtitle={mt('subtitle')}
        actions={
          <>
            <Button size="sm" variant={wallet ? 'secondary' : 'primary'} className={`mk-wallet-chip${tab === 'wallet' ? ' active' : ''}`} onClick={() => setTab('wallet')}>
              {wallet ? (
                <>
                  <span className="mk-chip-label">{mt('header.walletLabel')}: </span>
                  {shortAddress(wallet.address)}
                </>
              ) : (
                mt('header.connect')
              )}
            </Button>
            <Button size="sm" className="mk-refresh" onClick={() => void refresh()} aria-label={mt('refresh')} title={mt('refresh')}>
              {'↻'}
            </Button>
          </>
        }
      />
      {ops.marketPaused && (
        <p className="ops-note" role="status" data-testid="ops-market-paused">
          {t('ops.marketPaused')}
        </p>
      )}
      <ScreenLayout className="mk-layout" data-tab={tab} main={main} side={side} />
    </Screen>
  );
}
