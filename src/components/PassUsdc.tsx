import { useEffect, useState } from 'react';
import { mt } from '../locales/market';
import { MarketUnreachable, PassPlan, UnmatchedPayment, marketApi } from '../game/market/api';
import { runLinkFlow } from '../game/market/linkFlow';
import { RETRY_REASONS } from '../game/market/payFlow';
import { payPassFromWallet } from '../game/market/passPay';
import { listSolWallets } from '../game/market/wallet';
import { AccountMismatch } from './market/AccountMismatch';
import { mismatchText, useOpenAccount } from './market/openAccount';
import { LINK_MESSAGE_KEY } from './market/linkMessages';
import { Warnings } from './market/WalletPanel';
import { copyText, fmtUsdc, shortAddress } from './market/format';
import { Button, Panel, TextField } from './ui';
import '../market.css';

// The way to buy the Adventurer Pass: USDC (an SPL token on Solana), sent from the player's own wallet (Phantom, Solflare) to the game's receiving wallet, verified on chain by the
// pass-crypto function. Lives in the market chunk (web only, VITE_MARKET_ENABLED). The Pass is sold with USDC only; the dormant Stripe button is hidden by BattlePassModal while VITE_PASS_PURCHASE_ENABLED is off.
export default function PassUsdc({ onGranted, autoOpen = false }: { onGranted: () => void; autoOpen?: boolean }) {
  // autoOpen (the website's ?comprar=passe link): the payment panel is already open, but nothing starts (no wallet prompt) until the player taps.
  const [open, setOpen] = useState(autoOpen);
  const [plan, setPlan] = useState<PassPlan | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState('');
  // payments of this player that reached the game but could not be matched to his purchase: queued for the owner, the signature is the code he keeps
  const [waiting, setWaiting] = useState<UnmatchedPayment[]>([]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    marketApi
      .passExceptions()
      .then((r) => {
        if (alive && !('reason' in r)) setWaiting(r.exceptions);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);
  // the price comes from the server (the same number the payment step shows), asked once when the Pass screen opens, so the button can say it before anything is tapped
  const [priceUnits, setPriceUnits] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    marketApi
      .passPrice()
      .then((r) => {
        if (alive && !('reason' in r)) setPriceUnits(r.priceUnits);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

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
        const names = await listSolWallets().catch(() => []);
        if (names.length === 0) {
          say(mt('wallet.noProvider'), true);
          setBusy(false);
          return;
        }
        const linked = await runLinkFlow(marketApi, names[0]);
        if ('failure' in linked) {
          say(mt(LINK_MESSAGE_KEY[linked.failure]), true);
          setBusy(false);
          return;
        }
        r = await marketApi.passStart();
      }
      if ('reason' in r) {
        say(r.reason === 'already_owned' ? mt('pass.already') : r.reason === 'unavailable' ? mt('unavailable') : r.reason === 'receiver_account_missing' ? mt('pass.receiverMissing') : mt('pass.fail.generic'), r.reason !== 'already_owned');
      } else {
        setPlan(r);
        setMessage(null);
      }
    } catch (err) {
      say(err instanceof MarketUnreachable ? mt('unreachable') : mt('pass.fail.generic'), true);
    }
    setBusy(false);
  };

  const submit = async (sig: string) => {
    setBusy(true);
    say(mt('pay.checking'));
    try {
      for (let i = 0; i < 36; i++) {
        const r = await marketApi.passSubmit(sig);
        if (!('reason' in r)) {
          say(mt('pass.granted'));
          onGranted();
          setBusy(false);
          return;
        }
        if (r.reason === 'payment_unmatched') {
          // it reached the game's wallet but could not be linked to this purchase: recorded for the owner, the signature is the code
          const code = typeof (r.extra as { code?: unknown } | undefined)?.code === 'string' ? String((r.extra as { code: string }).code) : sig;
          setMessage(null); // the waiting list below shows the code
          setWaiting((w) => (w.some((x) => x.signature === code) ? w : [{ signature: code, reason: 'unmatched', purpose: 'pass', amountUnits: '0', createdAt: '' }, ...w]));
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
        say(r.reason === 'unconfirmed' ? mt('pay.confirming') : mt('pay.fail.not_found_tx'));
        await new Promise((res) => setTimeout(res, 5000));
      }
    } catch {
      say(mt('unreachable'), true);
    }
    setBusy(false);
  };

  const watched = useOpenAccount(plan !== null);

  // The account open in the wallet is not the linked one: link THIS one (a new signature; the server accepts the change), then ask for the payment details again for the new address.
  const relink = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const names = await listSolWallets().catch(() => []);
    const linked = await runLinkFlow(marketApi, names[0]);
    if ('failure' in linked) {
      say(mt(LINK_MESSAGE_KEY[linked.failure]), true);
      setBusy(false);
      return;
    }
    setPlan(null);
    setBusy(false);
    await start();
  };

  const payFromWallet = async () => {
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    const paid = await payPassFromWallet(marketApi, plan);
    if ('failure' in paid) {
      const f = paid.failure;
      say(
        f === 'rejected' ? mt('wallet.rejected') : f === 'noProvider' ? mt('wallet.noProvider') : f === 'wrongAccount' ? mismatchText(plan.buyerAddress, paid.open, watched.walletName) : f === 'unsupported' ? mt('pay.unsupported') : f === 'selfPayment' ? mt('pay.selfPayment') : f === 'blockhash' ? mt('pay.fail.rpc_error') : f === 'unreachable' ? mt('unreachable') : mt('pay.sendFailed'),
        true,
      );
      setBusy(false);
      return;
    }
    setSignature(paid.signature);
    await submit(paid.signature);
  };

  if (!open) {
    return (
      <Button
        variant="primary"
        className="pa-usdc-btn"
        onClick={() => {
          setOpen(true);
          void start();
        }}
      >
        {priceUnits !== null ? mt('pass.usdcButtonPrice', { a: fmtUsdc(priceUnits) }) : mt('pass.usdcButton')}
      </Button>
    );
  }

  return (
    <Panel tone="inset" className="pa-usdc" title={mt('pass.title')}>
      {plan && (
        <>
          <Warnings chain={plan.chain} custody={false} />
          <p className="ui-note">{mt('pass.nonCustodial')}</p>
          <p className="pa-usdc-pay">{mt('pass.pay', { a: fmtUsdc(plan.priceUnits) })}</p>
          <div className="pa-usdc-kv">
            <span>{mt('pass.receive')}</span>
            <code className="pa-usdc-address" title={plan.receiveAddress}>
              {shortAddress(plan.receiveAddress)}
            </code>
            <Button size="sm" onClick={() => void copyText(plan.receiveAddress)}>
              {mt('copy')}
            </Button>
          </div>
          {plan.buyerAddress === plan.receiveAddress && (
            <div className="ui-alert bad" role="alert">
              <p>{mt('pay.selfPayment')}</p>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void relink()}>
                {mt('wallet.change')}
              </Button>
            </div>
          )}
          <AccountMismatch linked={plan.buyerAddress} open={watched.open} walletName={watched.walletName} onRelink={() => void relink()} busy={busy} />
          <Button variant="primary" block disabled={busy || plan.buyerAddress === plan.receiveAddress || (watched.open !== null && watched.open !== plan.buyerAddress)} onClick={() => void payFromWallet()}>
            {mt('pay.payFromWallet')}
          </Button>
          <TextField
            label={mt('pass.hash')}
            value={signature}
            onChange={(e) => setSignature(e.target.value.trim())}
            placeholder={mt('pay.hashPlaceholder')}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
          />
          <Button block disabled={busy || signature.length < 40} onClick={() => void submit(signature)}>
            {mt('pay.submit')}
          </Button>
          {!plan.chain.livemode && <p className="ui-note">{mt('pass.testNote')}</p>}
        </>
      )}
      {waiting.length > 0 && (
        <div className="ui-alert" role="status" data-testid="pass-waiting">
          <strong>{mt('pass.waitingTitle')}</strong>
          {waiting.map((w) => (
            <p key={w.signature}>
              {mt('pay.unmatched', { code: w.signature })}
            </p>
          ))}
        </div>
      )}
      {message && (
        <p className={`ui-alert${message.error ? ' bad' : ''}`} role="status">
          {message.text}
        </p>
      )}
      {!plan && !busy && (
        <Button block onClick={() => void start()}>
          {mt('pass.start')}
        </Button>
      )}
    </Panel>
  );
}
