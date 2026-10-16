import type { MarketOverview } from '../../../supabase/functions/_shared/market/types';
import { explorerTxUrl } from '../../game/market/wallet';
import { mt } from '../../locales/market';
import { itemName } from './names';
import { fmtUsdt, shortAddress } from './format';

// Purchases and sales with the game's fee on each (a receipt), and the payments that arrived valid but whose purchase did not complete (to be refunded by hand).
export default function HistoryPanel({ overview, chainId }: { overview: MarketOverview | null; chainId: number }) {
  const sales = overview?.sales ?? [];
  const refunds = overview?.refundsDue ?? [];
  return (
    <div className="mk-panel">
      <h3 className="mk-h">{mt('history.title')}</h3>
      {(overview?.pending.length ?? 0) > 0 && <p className="mk-note">{mt('history.pending', { n: overview?.pending.length ?? 0 })}</p>}
      {sales.length === 0 && <p className="mk-note">{mt('history.empty')}</p>}
      <ul className="mk-list">
        {sales.map((s) => (
          <li key={s.id} className="mk-listing">
            <div className="mk-listing-head static">
              <span className="mk-item-body">
                <span className="mk-item-name">{itemName(s.item)}</span>
                <span className="mk-item-meta">
                  <span className="mk-tag">{s.role === 'buyer' ? mt('history.bought') : mt('history.sold')}</span>
                  {!s.livemode && <span className="mk-tag warn">{mt('history.test')}</span>}
                  <span className="mk-note">{new Date(s.soldAt).toLocaleString()}</span>
                </span>
              </span>
              <span className="mk-price">
                {fmtUsdt(s.priceCents)} <small>USDT</small>
              </span>
            </div>
            <div className="mk-listing-more">
              <span className="mk-note">{mt('history.fee', { f: fmtUsdt(s.feeCents) })}</span>
              {s.role === 'seller' && <span className="mk-note">{mt('history.youGot', { a: fmtUsdt(s.sellerCents) })}</span>}
              <span className="mk-note">
                {mt('history.tx')}:{' '}
                <a href={explorerTxUrl(chainId, s.feeTxHash)} target="_blank" rel="noopener noreferrer">
                  {shortAddress(s.feeTxHash)}
                </a>{' '}
                <a href={explorerTxUrl(chainId, s.sellerTxHash)} target="_blank" rel="noopener noreferrer">
                  {shortAddress(s.sellerTxHash)}
                </a>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {refunds.length > 0 && (
        <>
          <h3 className="mk-h">{mt('history.refunds')}</h3>
          <p className="mk-note">{mt('history.refundHelp')}</p>
          <ul className="mk-list">
            {refunds.map((r) => (
              <li key={r.reservationId} className="mk-listing">
                {r.txHashes.map((h) => (
                  <a key={h} className="mk-note" href={explorerTxUrl(chainId, h)} target="_blank" rel="noopener noreferrer">
                    {h}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
