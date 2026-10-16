import type { MarketOverview } from '../../../supabase/functions/_shared/market/types';
import { explorerTxUrl } from '../../game/market/wallet';
import { mt } from '../../locales/market';
import { itemName } from './names';
import { fmtSol, shortAddress } from './format';
import { Chip, Panel } from '../ui';

// Purchases and sales with the game's fee on each (a receipt), and the payments that arrived valid but whose purchase did not complete (to be refunded by hand).
export default function HistoryPanel({ overview, cluster }: { overview: MarketOverview | null; cluster: 'mainnet-beta' | 'devnet' }) {
  const sales = overview?.sales ?? [];
  const refunds = overview?.refundsDue ?? [];
  return (
    <Panel className="mk-panel" title={mt('history.title')}>
      {(overview?.pending.length ?? 0) > 0 && <p className="ui-note">{mt('history.pending', { n: overview?.pending.length ?? 0 })}</p>}
      {sales.length === 0 && <p className="ui-note">{mt('history.empty')}</p>}
      <ul className="mk-list">
        {sales.map((s) => (
          <li key={s.id} className="mk-listing ui-item">
            <div className="mk-listing-head">
              <span className="mk-item-body">
                <span className="mk-item-name">
                  {itemName(s.item)}
                  {s.item.kind === 'material' && s.item.quantity ? ` x${s.item.quantity}` : ''}
                </span>
                <span className="mk-item-meta">
                  <Chip>{s.role === 'buyer' ? mt('history.bought') : mt('history.sold')}</Chip>
                  {!s.livemode && <Chip tone="gold">{mt('history.test')}</Chip>}
                  <span className="ui-note">{new Date(s.soldAt).toLocaleString()}</span>
                </span>
              </span>
              <span className="mk-price">
                {fmtSol(s.priceLamports)} <small>SOL</small>
              </span>
            </div>
            <div className="mk-listing-more">
              <span className="ui-note">{mt('history.fee', { f: fmtSol(s.feeLamports) })}</span>
              {s.role === 'seller' && <span className="ui-note">{mt('history.youGot', { a: fmtSol(s.sellerLamports) })}</span>}
              <span className="ui-note">
                {mt('history.tx')}:{' '}
                <a href={explorerTxUrl(cluster, s.signature)} target="_blank" rel="noopener noreferrer">
                  {shortAddress(s.signature)}
                </a>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {refunds.length > 0 && (
        <>
          <h4 className="mk-h">{mt('history.refunds')}</h4>
          <p className="ui-note">{mt('history.refundHelp')}</p>
          <ul className="mk-list">
            {refunds.map((r) => (
              <li key={r.reservationId} className="mk-listing ui-item">
                {r.signatures.map((h) => (
                  <a key={h} className="ui-note mk-sig" href={explorerTxUrl(cluster, h)} target="_blank" rel="noopener noreferrer">
                    {h}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
