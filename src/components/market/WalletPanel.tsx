import { useState } from 'react';
import { mt } from '../../locales/market';
import { MarketApi } from '../../game/market/api';
import { runLinkFlow } from '../../game/market/linkFlow';
import { explorerAddressUrl, listSolWallets } from '../../game/market/wallet';
import type { ChainPublic } from '../../../supabase/functions/_shared/market/types';
import { copyText } from './format';
import { LINK_MESSAGE_KEY } from './linkMessages';

/** The warning every money screen carries. */
export function Warnings({ chain, custody = true }: { chain: ChainPublic | null; custody?: boolean }) {
  return (
    <div className="mk-warnings">
      {chain && !chain.livemode && <p className="mk-warn test">{mt('rules.testnet')}</p>}
      <p className="mk-warn key">{mt('rules.neverKey')}</p>
      {custody && <p className="mk-note">{mt('rules.nonCustodial')}</p>}
    </div>
  );
}

export default function WalletPanel({ api, chain, wallet, onChanged }: { api: MarketApi; chain: ChainPublic | null; wallet: { address: string } | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<null | 'connecting' | 'signing'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [choices, setChoices] = useState<string[] | null>(null);

  const link = async (preferred?: string) => {
    if (!chain || busy) return;
    setMessage(null);
    setChoices(null);
    const r = await runLinkFlow(api, preferred, undefined, setBusy);
    setBusy(null);
    if ('failure' in r) setMessage(mt(LINK_MESSAGE_KEY[r.failure]));
    else {
      setMessage(mt('wallet.done'));
      onChanged();
    }
  };

  // Phantom and Solflare announce themselves to the page: with one wallet the button goes straight to it, with several the player picks (no wallet: the message says what to install).
  const start = async () => {
    if (!chain || busy) return;
    setMessage(null);
    const names = await listSolWallets().catch(() => []);
    if (names.length === 0) setMessage(mt('wallet.noProvider'));
    else if (names.length === 1) await link(names[0]);
    else setChoices(names);
  };

  const picker = choices && (
    <div className="mk-wallet-choices" role="group" aria-label={mt('wallet.choose')}>
      <span className="mk-note">{mt('wallet.choose')}</span>
      {choices.map((name) => (
        <button key={name} className="mk-btn" onClick={() => void link(name)} disabled={busy !== null} data-ui>
          {name}
        </button>
      ))}
    </div>
  );

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
            {chain && (
              <a className="mk-note" href={explorerAddressUrl(chain.cluster, wallet.address)} target="_blank" rel="noopener noreferrer">
                {mt('wallet.explorer')}
              </a>
            )}
            {chain && <span className="mk-note">{mt('wallet.network', { name: chain.livemode ? 'Solana' : mt('wallet.devnet') })}</span>}
          </div>
          <p className="mk-note">{mt('wallet.changeHint')}</p>
          <button className="mk-btn" onClick={() => void start()} disabled={!chain || busy !== null} data-ui>
            {busy === 'signing' ? mt('wallet.signing') : mt('wallet.change')}
          </button>
          {picker}
        </div>
      ) : (
        <div className="mk-wallet">
          <p className="mk-text">{mt('wallet.none')}</p>
          <button className="mk-btn primary" onClick={() => void start()} disabled={!chain || busy !== null} data-ui>
            {busy === 'signing' ? mt('wallet.signing') : mt('wallet.connect')}
          </button>
          {picker}
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
