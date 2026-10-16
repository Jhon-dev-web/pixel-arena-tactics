import { useState } from 'react';
import { mt } from '../locales/market';
import { MarketUnreachable, marketApi } from '../game/market/api';
import { runLinkFlow } from '../game/market/linkFlow';
import { RETRY_REASONS } from '../game/market/payFlow';
import { sendUsdt } from '../game/market/wallet';
import { centsToUnits } from '../../supabase/functions/_shared/chain/money';
import type { ChainPublic } from '../../supabase/functions/_shared/market/types';
import { LINK_MESSAGE_KEY } from './market/linkMessages';
import { copyText, fmtUsdt } from './market/format';
import '../market.css';

interface Plan {
  priceCents: number;
  receiveAddress: string;
  buyerAddress: string;
  chain: ChainPublic;
}

// The second way to buy the Adventurer Pass: USDT (BEP-20) on BNB Smart Chain, from the player's own wallet to the game's receiving address, verified on chain by the pass-crypto function.
// Lives in the market chunk (web only, VITE_MARKET_ENABLED). The Stripe button next to it is untouched.
export default function PassUsdt({ onGranted }: { onGranted: () => void }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');

  const say = (text: string, error = false) => setMessage({ text, error });

  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      let r = await marketApi.passStart();
      if ('reason' in r && r.reason === 'no_wallet') {
        // link the wallet first (a signed message, no key), then ask again
        const status = await marketApi.walletStatus();
        const chain = !('reason' in status) ? status.chain : null;
        if (!chain) {
          say(mt('unavailable'), true);
          setBusy(false);
          return;
        }
        say(mt('pass.needWallet'));
        const linked = await runLinkFlow(marketApi, chain.chainId);
        if ('failure' in linked) {
          say(mt(LINK_MESSAGE_KEY[linked.failure]), true);
          setBusy(false);
          return;
        }
        r = await marketApi.passStart();
      }
      if ('reason' in r) {
        say(r.reason === 'already_owned' ? mt('pass.already') : r.reason === 'unavailable' ? mt('unavailable') : mt('pass.fail.generic'), r.reason !== 'already_owned');
      } else {
        setPlan({ priceCents: r.priceCents, receiveAddress: r.receiveAddress, buyerAddress: r.buyerAddress, chain: r.chain });
        setMessage(null);
      }
    } catch (err) {
      say(err instanceof MarketUnreachable ? mt('unreachable') : mt('pass.fail.generic'), true);
    }
    setBusy(false);
  };

  const submit = async (txHash: string) => {
    setBusy(true);
    say(mt('pay.checking'));
    try {
      for (let i = 0; i < 45; i++) {
        const r = await marketApi.passSubmit(txHash);
        if (!('reason' in r)) {
          say(mt('pass.granted'));
          onGranted();
          setBusy(false);
          return;
        }
        if (r.reason === 'already_owned') {
          say((r.extra as { refundDue?: boolean } | undefined)?.refundDue ? mt('pass.alreadyRefund') : mt('pass.already'), !!(r.extra as { refundDue?: boolean } | undefined)?.refundDue);
          setBusy(false);
          return;
        }
        if (!RETRY_REASONS.has(r.reason)) {
          const key = `pay.fail.${r.reason}`;
          const text = mt(key);
          say(r.reason === 'no_intent' ? mt('pass.noIntent') : text === key ? mt('pass.fail.generic') : text, true);
          setBusy(false);
          return;
        }
        const extra = (r.extra ?? {}) as { confirmations?: number; needed?: number };
        say(r.reason === 'unconfirmed' ? mt('pay.confirming', { n: extra.confirmations ?? 0, m: extra.needed ?? plan?.chain.minConfirmations ?? 0 }) : mt('pay.fail.not_found_tx'));
        await new Promise((res) => setTimeout(res, 4000));
      }
    } catch {
      say(mt('unreachable'), true);
    }
    setBusy(false);
  };

  const payFromWallet = async () => {
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    try {
      const tx = await sendUsdt(plan.buyerAddress, plan.chain.usdtContract, plan.receiveAddress, centsToUnits(plan.priceCents));
      setHash(tx);
      await submit(tx);
    } catch {
      say(mt('pay.sendFailed'), true);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        className="battle-btn ap-buy-btn mk-pass-btn"
        onClick={() => {
          setOpen(true);
          void start();
        }}
        data-ui
      >
        {mt('pass.usdtButton')}
      </button>
    );
  }

  return (
    <div className="mk-pass">
      <h4 className="mk-h">{mt('pass.title')}</h4>
      {plan && (
        <>
          <p className="mk-warn key">{mt('rules.neverKey')}</p>
          {!plan.chain.livemode && <p className="mk-warn test">{mt('rules.testnet')}</p>}
          <p>{mt('pass.price', { a: fmtUsdt(plan.priceCents) })}</p>
          <p className="mk-note">{mt('pass.pay', { a: fmtUsdt(plan.priceCents) })}</p>
          <div className="mk-kv">
            <span>{mt('pass.receive')}</span>
            <code className="mk-address">{plan.receiveAddress}</code>
            <button className="mk-btn small" onClick={() => void copyText(plan.receiveAddress)} data-ui>
              {mt('copy')}
            </button>
          </div>
          <button className="mk-btn primary" disabled={busy} onClick={() => void payFromWallet()} data-ui>
            {mt('pay.payFromWallet')}
          </button>
          <label className="mk-hash">
            <span>{mt('pass.hash')}</span>
            <input value={hash} onChange={(e) => setHash(e.target.value.trim())} placeholder={mt('pay.hashPlaceholder')} maxLength={80} autoComplete="off" spellCheck={false} />
          </label>
          <button className="mk-btn" disabled={busy || hash.length < 10} onClick={() => void submit(hash)} data-ui>
            {mt('pay.submit')}
          </button>
          {!plan.chain.livemode && <p className="mk-note">{mt('pass.testNote')}</p>}
        </>
      )}
      {message && (
        <p className={`mk-status${message.error ? ' error' : ''}`} role="status">
          {message.text}
        </p>
      )}
      {!plan && !busy && (
        <button className="mk-btn" onClick={() => void start()} data-ui>
          {mt('pass.start')}
        </button>
      )}
    </div>
  );
}
