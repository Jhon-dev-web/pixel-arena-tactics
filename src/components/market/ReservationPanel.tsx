import { useEffect, useRef, useState } from 'react';
import { MarketApi } from '../../game/market/api';
import { legDone, payLegFromWallet, submitWithPolling } from '../../game/market/payFlow';
import { explorerTxUrl } from '../../game/market/wallet';
import { mt } from '../../locales/market';
import type { ReservationView } from '../../../supabase/functions/_shared/market/types';
import { clock, copyText, fmtUsdt, msLeft, shortAddress } from './format';
import { Warnings } from './WalletPanel';

type Leg = 'seller' | 'fee';
interface LegState {
  hash: string;
  busy: boolean;
  message: string | null;
  error: boolean;
}
const blank = (): LegState => ({ hash: '', busy: false, message: null, error: false });

const failText = (reason: string, extra?: { confirmations?: number; needed?: number }): string => {
  const key = `pay.fail.${reason}`;
  const text = mt(key, { n: extra?.confirmations ?? 0, m: extra?.needed ?? 0 });
  return text === key ? mt('pay.fail.generic') : text;
};

// The two payments of a reservation: the game fee first (so that a failure halfway is refunded by the game, not by a stranger), then the seller. Each can be paid straight from the wallet
// (the amount and address are the server's) or by pasting the hash of a transfer already made. The server verifies; this screen only shows where each payment stands.
export default function ReservationPanel({
  api,
  reservation: initial,
  walletAddress,
  onChanged,
  onClose,
  bagFull,
}: {
  api: MarketApi;
  reservation: ReservationView;
  walletAddress: string | null;
  onChanged: () => void;
  onClose: () => void;
  bagFull: boolean;
}) {
  const [res, setRes] = useState<ReservationView>(initial);
  const [legs, setLegs] = useState<Record<Leg, LegState>>({ fee: blank(), seller: blank() });
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

  const patch = (leg: Leg, p: Partial<LegState>) => alive.current && setLegs((s) => ({ ...s, [leg]: { ...s[leg], ...p } }));

  const verify = async (leg: Leg, hash: string) => {
    patch(leg, { busy: true, message: mt('pay.checking'), error: false });
    const out = await submitWithPolling(api, res.id, leg, hash, {
      isCancelled: () => !alive.current,
      onPending: (p) => patch(leg, { message: p.reason === 'unconfirmed' ? mt('pay.confirming', { n: p.confirmations ?? 0, m: p.needed ?? res.chain.minConfirmations }) : mt('pay.fail.not_found_tx'), error: false }),
    }).catch(() => ({ kind: 'unreachable' as const }));
    if (!alive.current) return;
    if (out.kind === 'recorded') {
      if (out.reservation) setRes(out.reservation);
      patch(leg, { busy: false, message: null, error: false });
      if (out.status === 'refund_due') setNote(mt('pay.refundDue'));
      onChanged();
    } else if (out.kind === 'refused') patch(leg, { busy: false, message: failText(out.reason), error: true });
    else if (out.kind === 'pending') patch(leg, { busy: false, message: failText(out.reason, out), error: false });
    else if (out.kind === 'unreachable') patch(leg, { busy: false, message: mt('unreachable'), error: true });
    else patch(leg, { busy: false });
  };

  const payFromWallet = async (leg: Leg) => {
    if (!walletAddress) return;
    patch(leg, { busy: true, message: null, error: false });
    const r = await payLegFromWallet(res, leg, walletAddress);
    if ('failure' in r) {
      patch(leg, { busy: false, message: r.failure === 'rejected' ? mt('wallet.rejected') : r.failure === 'noProvider' ? mt('wallet.noProvider') : mt('pay.sendFailed'), error: true });
      return;
    }
    patch(leg, { hash: r.txHash, message: mt('pay.sentHash') });
    await verify(leg, r.txHash);
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
  const order: Leg[] = ['fee', 'seller'];

  return (
    <div className="mk-panel">
      <h3 className="mk-h">{mt('pay.title')}</h3>
      <Warnings chain={res.chain} />
      <div className="mk-summary">
        <div>
          <span>{mt('pay.total')}</span>
          <b>{fmtUsdt(res.priceCents)} USDT</b>
        </div>
        <div>
          <span>{mt('pay.toGame', { pct: res.chain.feePercent })}</span>
          <b>{fmtUsdt(res.feeCents)} USDT</b>
        </div>
        <div>
          <span>{mt('pay.toSeller')}</span>
          <b>{fmtUsdt(res.sellerCents)} USDT</b>
        </div>
      </div>

      {sold ? (
        <p className="mk-status ok" role="status">
          {bagFull ? mt('pay.soldWaiting') : mt('pay.sold')}
        </p>
      ) : refund ? (
        <p className="mk-status error" role="alert">
          {mt('pay.refundDue')}
        </p>
      ) : (
        <>
          <p className={`mk-timer${left <= 0 ? ' over' : ''}`}>{left > 0 ? mt('pay.timeLeft', { m, s }) : mt('pay.expired', { h: graceH })}</p>
          <p className="mk-note">{mt('pay.order')}</p>
          {order.map((leg) => {
            const done = legDone(res, leg);
            const st = legs[leg];
            const to = leg === 'seller' ? res.sellerAddress : res.feeAddress;
            const cents = leg === 'seller' ? res.sellerCents : res.feeCents;
            const tx = res.payments.find((p) => p.leg === leg && p.status === 'applied');
            return (
              <div className={`mk-leg${done ? ' done' : ''}`} key={leg}>
                <h4>{leg === 'fee' ? mt('pay.step1') : mt('pay.step2')}</h4>
                <div className="mk-kv">
                  <span>{mt('pay.amount')}</span>
                  <b>{fmtUsdt(cents)} USDT</b>
                </div>
                <div className="mk-kv">
                  <span>{mt('pay.to')}</span>
                  <code className="mk-address" title={to}>
                    {shortAddress(to)}
                  </code>
                  <button className="mk-btn small" onClick={() => void copyText(to)} data-ui>
                    {mt('copy')}
                  </button>
                </div>
                {done ? (
                  <p className="mk-status ok">
                    {mt('pay.done')}
                    {tx && (
                      <>
                        {' '}
                        <a href={explorerTxUrl(res.chain.chainId, tx.txHash)} target="_blank" rel="noopener noreferrer">
                          {shortAddress(tx.txHash)}
                        </a>
                      </>
                    )}
                  </p>
                ) : (
                  <>
                    <p className="mk-note">{mt('pay.thisIsAFeeNote')}</p>
                    <button className="mk-btn primary" disabled={st.busy || !walletAddress} onClick={() => void payFromWallet(leg)} data-ui>
                      {mt('pay.payFromWallet')}
                    </button>
                    <label className="mk-hash">
                      <span>{mt('pay.orPaste')}</span>
                      <input value={st.hash} onChange={(e) => patch(leg, { hash: e.target.value.trim() })} placeholder={mt('pay.hashPlaceholder')} maxLength={80} autoComplete="off" spellCheck={false} />
                    </label>
                    <button className="mk-btn" disabled={st.busy || st.hash.length < 10} onClick={() => void verify(leg, st.hash)} data-ui>
                      {st.busy ? mt('pay.checking') : mt('pay.submit')}
                    </button>
                    {st.message && (
                      <p className={`mk-status${st.error ? ' error' : ''}`} role="status">
                        {st.message}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
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
