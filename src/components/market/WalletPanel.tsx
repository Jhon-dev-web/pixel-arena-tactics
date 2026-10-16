import { useState } from 'react';
import { mt } from '../../locales/market';
import { MarketApi } from '../../game/market/api';
import { runLinkFlow } from '../../game/market/linkFlow';
import type { ChainPublic } from '../../../supabase/functions/_shared/market/types';
import { copyText } from './format';
import { LINK_MESSAGE_KEY } from './linkMessages';

/** The warning every money screen carries. */
export function Warnings({ chain }: { chain: ChainPublic | null }) {
  return (
    <div className="mk-warnings">
      {chain && !chain.livemode && <p className="mk-warn test">{mt('rules.testnet')}</p>}
      <p className="mk-warn key">{mt('rules.neverKey')}</p>
      <p className="mk-note">{mt('rules.nonCustodial')}</p>
    </div>
  );
}

export default function WalletPanel({ api, chain, wallet, onChanged }: { api: MarketApi; chain: ChainPublic | null; wallet: { address: string } | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<null | 'connecting' | 'signing'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = async () => {
    if (!chain || busy) return;
    setMessage(null);
    const r = await runLinkFlow(api, chain.chainId, undefined, setBusy);
    setBusy(null);
    if ('failure' in r) setMessage(mt(LINK_MESSAGE_KEY[r.failure]));
    else {
      setMessage(mt('wallet.done'));
      onChanged();
    }
  };

  return (
    <div className="mk-panel">
      <h3 className="mk-h">{mt('wallet.title')}</h3>
      <Warnings chain={chain} />
      {wallet ? (
        <div className="mk-wallet">
          <span className="mk-label">{mt('wallet.linked')}</span>
          <code className="mk-address">{wallet.address}</code>
          <div className="mk-row">
            <button
              className="mk-btn small"
              onClick={async () => {
                setCopied(await copyText(wallet.address));
                window.setTimeout(() => setCopied(false), 1500);
              }}
              data-ui
            >
              {copied ? mt('copied') : mt('copy')}
            </button>
            {chain && <span className="mk-note">{mt('wallet.network', { name: chain.livemode ? 'BNB Smart Chain' : 'BNB Smart Chain (teste)' })}</span>}
          </div>
          <p className="mk-note">{mt('wallet.changeHint')}</p>
          <button className="mk-btn" onClick={link} disabled={!chain || busy !== null} data-ui>
            {mt('wallet.change')}
          </button>
        </div>
      ) : (
        <div className="mk-wallet">
          <p>{mt('wallet.none')}</p>
          <button className="mk-btn primary" onClick={link} disabled={!chain || busy !== null} data-ui>
            {busy === 'signing' ? mt('wallet.signing') : mt('wallet.connect')}
          </button>
        </div>
      )}
      {message && (
        <p className="mk-status" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
