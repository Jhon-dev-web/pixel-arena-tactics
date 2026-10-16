import { useState } from 'react';
import { mt } from '../../locales/market';
import { MarketApi } from '../../game/market/api';
import { runLinkFlow } from '../../game/market/linkFlow';
import { explorerAddressUrl, listSolWallets } from '../../game/market/wallet';
import type { ChainPublic } from '../../../supabase/functions/_shared/market/types';
import { copyText } from './format';
import { LINK_MESSAGE_KEY } from './linkMessages';
import { Button, Panel } from '../ui';

/** The warning every money screen carries. */
export function Warnings({ chain, custody = true }: { chain: ChainPublic | null; custody?: boolean }) {
  return (
    <div className="mk-warnings">
      {chain && !chain.livemode && <p className="ui-alert info">{mt('rules.testnet')}</p>}
      <p className="ui-alert bad">{mt('rules.neverKey')}</p>
      {custody && <p className="ui-note">{mt('rules.nonCustodial')}</p>}
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
      <span className="ui-note">{mt('wallet.choose')}</span>
      {choices.map((name) => (
        <Button key={name} onClick={() => void link(name)} disabled={busy !== null}>
          {name}
        </Button>
      ))}
    </div>
  );

  return (
    <Panel className="mk-panel" title={mt('wallet.title')}>
      <Warnings chain={chain} />
      {wallet ? (
        <div className="mk-wallet">
          <span className="mk-label">{mt('wallet.linked')}</span>
          <code className="mk-address">{wallet.address}</code>
          <div className="mk-row">
            <Button
              size="sm"
              onClick={async () => {
                setCopied(await copyText(wallet.address));
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? mt('copied') : mt('copy')}
            </Button>
            {chain && (
              <a className="ui-note" href={explorerAddressUrl(chain.cluster, wallet.address)} target="_blank" rel="noopener noreferrer">
                {mt('wallet.explorer')}
              </a>
            )}
            {chain && <span className="ui-note">{mt('wallet.network', { name: chain.livemode ? 'Solana' : mt('wallet.devnet') })}</span>}
          </div>
          <p className="ui-note">{mt('wallet.changeHint')}</p>
          <Button onClick={() => void start()} disabled={!chain || busy !== null}>
            {busy === 'signing' ? mt('wallet.signing') : mt('wallet.change')}
          </Button>
          {picker}
        </div>
      ) : (
        <div className="mk-wallet">
          <p className="mk-text">{mt('wallet.none')}</p>
          <Button variant="primary" onClick={() => void start()} disabled={!chain || busy !== null}>
            {busy === 'signing' ? mt('wallet.signing') : mt('wallet.connect')}
          </Button>
          {picker}
        </div>
      )}
      {message && (
        <p className="ui-alert" role="status">
          {message}
        </p>
      )}
    </Panel>
  );
}
