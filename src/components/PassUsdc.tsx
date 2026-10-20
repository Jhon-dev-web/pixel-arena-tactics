import { useEffect, useState } from 'react';
import { mt } from '../locales/market';
import { MarketUnreachable, PassPlan, marketApi } from '../game/market/api';
import { runLinkFlow } from '../game/market/linkFlow';
import { RETRY_REASONS } from '../game/market/payFlow';
import { buildUsdcTransferTx } from '../game/market/solTx';
import { WalletError, connectSolWallet, listSolWallets } from '../game/market/wallet';
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

  const payFromWallet = async () => {
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    try {
      const session = await connectSolWallet(undefined, plan.buyerAddress);
      const prepared = await marketApi.passPrepare();
      if ('reason' in prepared) {
        say(mt('pay.fail.rpc_error'), true);
        setBusy(false);
        return;
      }
      const tx = buildUsdcTransferTx({
        payer: plan.buyerAddress,
        blockhash: prepared.blockhash,
        sourceTokenAccount: plan.buyerTokenAccount,
        destinationTokenAccount: plan.receiverTokenAccount,
        mint: plan.chain.usdcMint,
        units: plan.priceUnits,
        decimals: plan.decimals,
      });
      const sig = await session.signAndSend(tx, plan.chain.cluster);
      setSignature(sig);
      await submit(sig);
    } catch (err) {
      const kind = err instanceof WalletError ? err.kind : 'other';
      say(kind === 'rejected' ? mt('wallet.rejected') : kind === 'no_provider' ? mt('wallet.noProvider') : kind === 'wrong_account' ? mt('pay.wrongAccount') : kind === 'unsupported' ? mt('pay.unsupported') : mt('pay.sendFailed'), true);
      setBusy(false);
    }
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
          <Button variant="primary" block disabled={busy} onClick={() => void payFromWallet()}>
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
