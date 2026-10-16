import { useEffect, useRef, useState } from 'react';
import { MarketApi } from '../../game/market/api';
import { paymentDone, payReservationFromWallet, submitWithPolling } from '../../game/market/payFlow';
import { explorerTxUrl } from '../../game/market/wallet';
import { mt } from '../../locales/market';
import type { ReservationView } from '../../../supabase/functions/_shared/market/types';
import { SolIcon } from './icons';
import { clock, copyText, fmtSol, fmtUsdAround, msLeft, shortAddress } from './format';
import { Warnings } from './WalletPanel';

interface PayState {
  signature: string;
  busy: boolean;
  message: string | null;
  error: boolean;
}
const blank = (): PayState => ({ signature: '', busy: false, message: null, error: false });

const failText = (reason: string): string => {
  const key = `pay.fail.${reason}`;
  const text = mt(key);
  return text === key ? mt('pay.fail.generic') : text;
};

const PAY_FAILURE_KEY = { noProvider: 'wallet.noProvider', rejected: 'wallet.rejected', wrongAccount: 'pay.wrongAccount', unsupported: 'pay.unsupported', unreachable: 'unreachable', blockhash: 'pay.fail.rpc_error', failed: 'pay.sendFailed' } as const;

// The payment of a reservation: ONE transaction from the player's wallet with two SOL transfers, the seller's share and the game's fee (so a failure halfway cannot leave a half payment). The wallet
// signs and sends it (the amounts and addresses are the server's); or he pastes the signature of a transaction he already made. The server verifies; this screen only shows where the payment stands.
export default function ReservationPanel({
  api,
  reservation: initial,
  walletAddress,
  solUsd,
  onChanged,
  onClose,
  bagFull,
}: {
  api: MarketApi;
  reservation: ReservationView;
  walletAddress: string | null;
  solUsd: number | null;
  onChanged: () => void;
  onClose: () => void;
  bagFull: boolean;
}) {
  const [res, setRes] = useState<ReservationView>(initial);
  const [pay, setPay] = useState<PayState>(blank());
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => setRes(initial), [initial]);

  const patch = (p: Partial<PayState>) => alive.current && setPay((s) => ({ ...s, ...p }));

  const verify = async (signature: string) => {
    patch({ busy: true, message: mt('pay.checking'), error: false });
    const out = await submitWithPolling(api, res.id, signature, {
      isCancelled: () => !alive.current,
      onPending: (p) => patch({ message: p.reason === 'unconfirmed' ? mt('pay.confirming') : mt('pay.fail.not_found_tx'), error: false }),
    }).catch(() => ({ kind: 'unreachable' as const }));
    if (!alive.current) return;
    if (out.kind === 'recorded') {
      if (out.reservation) setRes(out.reservation);
      patch({ busy: false, message: null, error: false });
      if (out.status === 'refund_due') setNote(mt('pay.refundDue'));
      onChanged();
    } else if (out.kind === 'refused') patch({ busy: false, message: failText(out.reason), error: true });
    else if (out.kind === 'pending') patch({ busy: false, message: failText(out.reason), error: false });
    else if (out.kind === 'unreachable') patch({ busy: false, message: mt('unreachable'), error: true });
    else patch({ busy: false });
  };

  const payFromWallet = async () => {
    if (!walletAddress) return;
    patch({ busy: true, message: null, error: false });
    const r = await payReservationFromWallet(api, res, walletAddress);
    if ('failure' in r) {
      patch({ busy: false, message: mt(PAY_FAILURE_KEY[r.failure]), error: true });
      return;
    }
    patch({ signature: r.signature, message: mt('pay.sentHash') });
    await verify(r.signature);
  };

  const cancel = async () => {
    const r = await api.cancelReservation(res.id).catch(() => null);
    if (r && 'reason' in r && r.reason === 'has_payment') {
      setNote(mt('pay.cancelBlocked'));
      return;
    }
    onChanged();
    onClose();
  };

  const left = msLeft(res.expiresAt, now);
  const { m, s } = clock(left);
  const sold = res.status === 'paid';
  const refund = res.status === 'refund_due';
  const graceH = Math.round((Date.parse(res.graceUntil) - Date.parse(res.expiresAt)) / 3_600_000);
  const done = paymentDone(res);
  const tx = res.payments.find((p) => p.leg === 'sale' && p.status === 'applied');
  const around = fmtUsdAround(res.priceLamports, solUsd);
  const lines: { key: string; label: string; to: string; lamports: number }[] = [
    { key: 'seller', label: mt('pay.toSeller'), to: res.sellerAddress, lamports: res.sellerLamports },
    { key: 'fee', label: mt('pay.toGame', { pct: res.chain.feePercent }), to: res.feeAddress, lamports: res.feeLamports },
  ];

  return (
    <div className="mk-panel">
      <h3 className="mk-h">{mt('pay.title')}</h3>
      <Warnings chain={res.chain} />
      <div className="mk-summary">
        <div>
          <span>{mt('pay.total')}</span>
          <b>
            <SolIcon /> {fmtSol(res.priceLamports)} SOL
          </b>
        </div>
        {lines.map((l) => (
          <div key={l.key}>
            <span>{l.label}</span>
            <b>{fmtSol(l.lamports)} SOL</b>
          </div>
        ))}
      </div>
      {around && <p className="mk-note mk-usd">{mt('browse.around', { a: around })}</p>}

      <p className="mk-note">{mt('rules.feeExplain', { pct: res.chain.feePercent })}</p>

      {sold ? (
        <p className="mk-status ok" role="status">
          {bagFull ? mt('pay.soldWaiting') : mt('pay.sold')}
          {tx && (
            <>
              {' '}
              <a href={explorerTxUrl(res.chain.cluster, tx.signature)} target="_blank" rel="noopener noreferrer">
                {shortAddress(tx.signature)}
              </a>
            </>
          )}
        </p>
      ) : refund ? (
        <p className="mk-status error" role="alert">
          {mt('pay.refundDue')}
        </p>
      ) : (
        <>
          <p className={`mk-timer${left <= 0 ? ' over' : ''}`}>{left > 0 ? mt('pay.timeLeft', { m, s }) : mt('pay.expired', { h: graceH })}</p>
          <div className={`mk-leg${done ? ' done' : ''}`}>
            <h4>{mt('pay.oneTx')}</h4>
            <p className="mk-note">{mt('pay.oneTxHelp')}</p>
            {lines.map((l) => (
              <div className="mk-kv" key={l.key}>
                <span>
                  {l.label}: <b>{fmtSol(l.lamports)} SOL</b>
                </span>
                <code className="mk-address" title={l.to}>
                  {shortAddress(l.to)}
                </code>
                <button className="mk-btn small" onClick={() => void copyText(l.to)} data-ui>
                  {mt('copy')}
                </button>
              </div>
            ))}
            {done ? (
              <p className="mk-status ok">
                {mt('pay.done')}
                {tx && (
                  <>
                    {' '}
                    <a href={explorerTxUrl(res.chain.cluster, tx.signature)} target="_blank" rel="noopener noreferrer">
                      {shortAddress(tx.signature)}
                    </a>
                  </>
                )}
              </p>
            ) : (
              <>
              <p className="mk-note">{mt('pay.checkWallet')}</p>
              <button className="mk-btn primary" disabled={pay.busy || !walletAddress} onClick={() => void payFromWallet()} data-ui>
                {pay.busy ? mt('pay.checking') : mt('pay.payFromWallet')}
              </button>
              <label className="mk-hash">
                <span>{mt('pay.orPaste')}</span>
                <input value={pay.signature} onChange={(e) => patch({ signature: e.target.value.trim() })} placeholder={mt('pay.hashPlaceholder')} maxLength={100} autoComplete="off" spellCheck={false} />
              </label>
              <button className="mk-btn" disabled={pay.busy || pay.signature.length < 40} onClick={() => void verify(pay.signature)} data-ui>
                {pay.busy ? mt('pay.checking') : mt('pay.submit')}
              </button>
              </>
            )}
            {pay.message && (
              <p className={`mk-status${pay.error ? ' error' : ''}`} role="status">
                {pay.message}
              </p>
            )}
          </div>
        </>
      )}
      {note && (
        <p className="mk-status" role="status">
          {note}
        </p>
      )}
      <div className="mk-row">
        {!sold && !refund && (
          <button className="mk-btn" onClick={() => void cancel()} data-ui>
            {mt('pay.cancel')}
          </button>
        )}
        {(sold || refund) && (
          <button className="mk-btn primary" onClick={onClose} data-ui>
            {mt('close')}
          </button>
        )}
      </div>
    </div>
  );
}
