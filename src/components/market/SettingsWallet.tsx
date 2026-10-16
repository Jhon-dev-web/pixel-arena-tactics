import { useCallback, useEffect, useState } from 'react';
import type { MarketOverview } from '../../../supabase/functions/_shared/market/types';
import { marketApi } from '../../game/market/api';
import { runLinkFlow } from '../../game/market/linkFlow';
import { listSolWallets } from '../../game/market/wallet';
import { mt } from '../../locales/market';
import { Button, Panel } from '../ui';
import { shortAddress } from './format';
import { LINK_MESSAGE_KEY } from './linkMessages';

// Settings > Carteira Solana: the wallet linked to the account (masked) and the button to link or change it. It runs the SAME link flow as the Market's wallet tab (runLinkFlow: the wallet signs one
// message, nothing moves). Web only and behind the market flag: App.tsx loads this file lazily and only there, so the desktop bundle never carries it.
export default function SettingsWallet() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'down'>('loading');
  const [busy, setBusy] = useState<null | 'connecting' | 'signing'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const ov = await marketApi.overview();
      if ('reason' in ov) setState('down');
      else {
        setOverview(ov);
        setState('ready');
      }
    } catch {
      setState('down');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const wallet = overview?.wallet ?? null;
  const chain = overview?.chain ?? null;

  const link = async (preferred?: string) => {
    if (!chain || busy) return;
    setMessage(null);
    setChoices(null);
    const r = await runLinkFlow(marketApi, preferred, undefined, setBusy);
    setBusy(null);
    if ('failure' in r) setMessage(mt(LINK_MESSAGE_KEY[r.failure]));
    else {
      setMessage(mt('wallet.done'));
      void load();
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

  return (
    <Panel title={mt('wallet.settingsTitle')} className="st-panel" data-settings="wallet">
      <p className="st-hint">{mt('wallet.settingsHint')}</p>
      {state === 'loading' && <p className="st-hint">{mt('loading')}</p>}
      {state === 'down' && <p className="st-hint">{mt('unreachable')}</p>}
      {state === 'ready' && (
        <>
          <div className="st-row">
            <div className="st-row-text">
              <span className="st-label">{wallet ? mt('wallet.linked') : mt('wallet.none')}</span>
            </div>
            {wallet && (
              <div className="st-row-ctl">
                <code className="st-value" data-testid="masked-wallet" title={mt('wallet.linked')}>
                  {shortAddress(wallet.address)}
                </code>
              </div>
            )}
          </div>
          {wallet && <p className="st-hint">{mt('wallet.changeHint')}</p>}
          <div className="st-actions">
            <Button size="sm" variant={wallet ? 'secondary' : 'primary'} onClick={() => void start()} disabled={!chain || busy !== null}>
              {busy === 'signing' ? mt('wallet.signing') : wallet ? mt('wallet.change') : mt('wallet.connect')}
            </Button>
          </div>
          {choices && (
            <div className="st-actions" role="group" aria-label={mt('wallet.choose')}>
              <span className="st-hint">{mt('wallet.choose')}</span>
              {choices.map((name) => (
                <Button key={name} size="sm" onClick={() => void link(name)} disabled={busy !== null}>
                  {name}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
      {message && (
        <p className="st-hint" role="status">
          {message}
        </p>
      )}
    </Panel>
  );
}
