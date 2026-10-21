import { useEffect, useRef, useState } from 'react';
import { MarketApi } from '../../game/market/api';
import { elapsedSeconds, paymentDone, payReservationFromWallet, submitWithPolling } from '../../game/market/payFlow';
import type { MarketChange } from '../../game/market/liveState';
import { PAUSED_RETRY_MS, clearPending, isHeldReason, isPausedReason, loadPending, marketPendingKey, savePending } from '../../game/market/pendingPayment';
import { explorerTxUrl } from '../../game/market/wallet';
import { mt } from '../../locales/market';
import type { ReservationView } from '../../../supabase/functions/_shared/market/types';
import { SolIcon } from './icons';
import { clock, copyText, fmtSol, msLeft, shortAddress } from './format';
import UsdLine from './UsdLine';
import { Warnings } from './WalletPanel';
import { AccountMismatch } from './AccountMismatch';
import { mismatchText, useOpenAccount } from './openAccount';
import { Button, Panel, StatList, StatRow, TextField } from '../ui';

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

const PAY_FAILURE_KEY = { noProvider: 'wallet.noProvider', rejected: 'wallet.rejected', wrongAccount: 'pay.wrongAccount', unsupported: 'pay.unsupported', unreachable: 'unreachable', blockhash: 'pay.fail.rpc_error', selfPayment: 'pay.selfPayment', failed: 'pay.sendFailed' } as const;

// The payment of a reservation: ONE transaction from the player's wallet with two SOL transfers, the seller's share and the game's fee (so a failure halfway cannot leave a half payment). The wallet
// signs and sends it (the amounts and addresses are the server's); or he pastes the signature of a transaction he already made. The server verifies; this screen only shows where the payment stands.
export default function ReservationPanel({
  api,
  reservation: initial,
  walletAddress,
  solUsd,
  onApplied,
  onChanged,
  onClose,
  bagFull,
}: {
  api: MarketApi;
  reservation: ReservationView;
  walletAddress: string | null;
  solUsd: number | null;
  /** the server's answer, to show on the screen at once */
  onApplied?: (change: MarketChange) => void;
  /** reads the changed lists from the server and brings a bought item into the bag; the buttons stay blocked until it is done */
  onChanged: () => void | Promise<void>;
  onClose: () => void;
  bagFull: boolean;
}) {
  const [res, setRes] = useState<ReservationView>(initial);
  const [pay, setPay] = useState<PayState>(blank());
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState<string | null>(null);
  // set while the signature is being confirmed on the network: the "Confirmando o pagamento na rede... N s" line (the clock above ticks every second)
  const [confirmSince, setConfirmSince] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const alive = useRef(true);
  const retryTimer = useRef<number | null>(null);
  const resumed = useRef<string | null>(null);
  const watched = useOpenAccount(walletAddress !== null);

  useEffect(() => {
    alive.current = true;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive.current = false;
      window.clearInterval(id);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, []);
  useEffect(() => setRes(initial), [initial]);

  // A signature remembered from before (the page was reloaded or the screen closed while the payment was being confirmed): the verification resumes by itself.
  useEffect(() => {
    if (resumed.current === res.id) return;
    const key = marketPendingKey(res.id);
    const saved = loadPending(key);
    if (!saved) return;
    if (res.status === 'paid' || res.status === 'refund_due' || res.status === 'refunded' || res.status === 'cancelled' || paymentDone(res)) {
      clearPending(key);
      return;
    }
    resumed.current = res.id;
    setPay((s) => ({ ...s, signature: saved.signature }));
    void verify(saved.signature);
    // verify is recreated every render; the resume is keyed by the reservation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.id]);

  const patch = (p: Partial<PayState>) => alive.current && setPay((s) => ({ ...s, ...p }));

  const verify = async (signature: string): Promise<void> => {
    // the wallet already sent it (or the player pasted it): keep the signature until the server gives a final answer, so a reload or a pause never loses it
    const pendingKey = marketPendingKey(res.id);
    savePending(pendingKey, signature, walletAddress ?? undefined);
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    // the signature goes to the server NOW (no delay); while the network says "not yet" it is asked again every 2 s (payFlow.confirmRetryDelayMs)
    patch({ busy: true, message: null, error: false });
    if (alive.current) setConfirmSince(Date.now());
    const out = await submitWithPolling(api, res.id, signature, {
      isCancelled: () => !alive.current,
    }).catch(() => ({ kind: 'unreachable' as const }));
    if (!alive.current) return;
    setConfirmSince(null);
    if (out.kind === 'recorded' || (out.kind === 'refused' && !isHeldReason(out.reason))) clearPending(pendingKey);
    if (out.kind === 'refused' && isPausedReason(out.reason)) {
      // the payment is on the network and saved here: ask again later, on its own
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = null;
        if (alive.current) void verify(signature);
      }, PAUSED_RETRY_MS);
    }
    if (out.kind === 'recorded') {
      if (out.reservation) {
        setRes(out.reservation);
        onApplied?.({ kind: 'paid', reservation: out.reservation }); // sold: the offer leaves the browse list and the panel says so at once
      }
      patch({ message: mt('processing'), error: false });
      if (out.status === 'refund_due') setNote(mt('pay.refundDue'));
      await onChanged(); // the bought item comes into the bag and the lists are read again; the panel stays blocked until then
      patch({ busy: false, message: null, error: false });
    } else if (out.kind === 'refused') patch({ busy: false, message: out.code ? `${failText(out.reason)} ${mt('pay.unmatched', { code: out.code })}` : failText(out.reason), error: true });
    else if (out.kind === 'pending') patch({ busy: false, message: failText(out.reason), error: false });
    else if (out.kind === 'unreachable') patch({ busy: false, message: mt('unreachable'), error: true });
    else patch({ busy: false });
  };

  const payFromWallet = async () => {
    if (!walletAddress) return;
    patch({ busy: true, message: mt('processing'), error: false });
    const r = await payReservationFromWallet(api, res, walletAddress);
    if ('failure' in r) {
      patch({ busy: false, message: r.failure === 'wrongAccount' && walletAddress ? mismatchText(walletAddress, r.open, watched.walletName) : mt(PAY_FAILURE_KEY[r.failure]), error: true });
      return;
    }
    savePending(marketPendingKey(res.id), r.signature, walletAddress);
    patch({ signature: r.signature, message: mt('pay.sentHash') });
    await verify(r.signature);
  };

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    const r = await api.cancelReservation(res.id).catch(() => null);
    if (r && 'reason' in r && r.reason === 'has_payment') {
      setNote(mt('pay.cancelBlocked'));
      if (alive.current) setCancelling(false);
      return;
    }
    if (r && !('reason' in r)) onApplied?.({ kind: 'reservationReleased', reservation: res }); // the offer is open again in the browse list at once
    await onChanged();
    onClose();
  };

  const left = msLeft(res.expiresAt, now);
  const { m, s } = clock(left);
  const sold = res.status === 'paid';
  const refund = res.status === 'refund_due';
  const graceH = Math.round((Date.parse(res.graceUntil) - Date.parse(res.expiresAt)) / 3_600_000);
  const done = paymentDone(res);
  const tx = res.payments.find((p) => p.leg === 'sale' && p.status === 'applied');
  const lines: { key: string; label: string; to: string; lamports: number }[] = [
    { key: 'seller', label: mt('pay.toSeller'), to: res.sellerAddress, lamports: res.sellerLamports },
    { key: 'fee', label: mt('pay.toGame', { pct: res.chain.feePercent }), to: res.feeAddress, lamports: res.feeLamports },
  ];

  return (
    <Panel className="mk-panel" title={mt('pay.title')}>
      <Warnings chain={res.chain} />
      <StatList className="mk-summary">
        <StatRow label={mt('pay.total')} value={<><SolIcon /> {fmtSol(res.priceLamports)} SOL</>} tone="gold" />
        {lines.map((l) => (
          <StatRow key={l.key} label={l.label} value={`${fmtSol(l.lamports)} SOL`} />
        ))}
      </StatList>
      <UsdLine lamports={res.priceLamports} solUsd={solUsd} />

      <p className="ui-note">{mt('rules.feeExplain', { pct: res.chain.feePercent })}</p>

      {sold ? (
        <p className="ui-alert good" role="status">
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
        <p className="ui-alert bad" role="alert">
          {mt('pay.refundDue')}
        </p>
      ) : (
        <>
          <p className={`mk-timer${left <= 0 ? ' over' : ''}`}>{left > 0 ? mt('pay.timeLeft', { m, s }) : mt('pay.expired', { h: graceH })}</p>
          <Panel tone="inset" className={`mk-leg${done ? ' done' : ''}`} title={mt('pay.oneTx')}>
            <p className="ui-note">{mt('pay.oneTxHelp')}</p>
            {lines.map((l) => (
              <div className="mk-kv" key={l.key}>
                <span>
                  {l.label}: <b>{fmtSol(l.lamports)} SOL</b>
                </span>
                <code className="mk-address" title={l.to}>
                  {shortAddress(l.to)}
                </code>
                <Button size="sm" onClick={() => void copyText(l.to)}>
                  {mt('copy')}
                </Button>
              </div>
            ))}
            {done ? (
              <p className="ui-alert good">
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
                {/* a reservation is open: the server does not change the linked wallet meanwhile, so the way out is the linked account, or cancelling */}
                <AccountMismatch linked={walletAddress} open={watched.open} walletName={watched.walletName} locked />
                <p className="ui-note">{mt('pay.checkWallet')}</p>
                <Button variant="primary" block disabled={pay.busy || !walletAddress || (watched.open !== null && watched.open !== walletAddress)} onClick={() => void payFromWallet()}>
                  {pay.busy ? mt('processing') : mt('pay.payFromWallet')}
                </Button>
                <TextField
                  label={mt('pay.orPaste')}
                  value={pay.signature}
                  onChange={(e) => patch({ signature: e.target.value.trim() })}
                  placeholder={mt('pay.hashPlaceholder')}
                  maxLength={100}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button block disabled={pay.busy || pay.signature.length < 40} onClick={() => void verify(pay.signature)}>
                  {pay.busy ? mt('processing') : mt('pay.submit')}
                </Button>
              </>
            )}
            {confirmSince !== null ? (
              <p className="ui-alert" role="status" data-testid="pay-confirming">
                {mt('pay.confirmingTimer', { s: elapsedSeconds(confirmSince, now) })}
              </p>
            ) : (
              pay.message && (
                <p className={`ui-alert${pay.error ? ' bad' : ''}`} role="status">
                  {pay.message}
                </p>
              )
            )}
          </Panel>
        </>
      )}
      {note && (
        <p className="ui-alert" role="status">
          {note}
        </p>
      )}
      <div className="mk-row">
        {!sold && !refund && (
          <Button disabled={cancelling || pay.busy} onClick={() => void cancel()}>
            {cancelling ? mt('processing') : mt('pay.cancel')}
          </Button>
        )}
        {(sold || refund) && (
          <Button variant="primary" onClick={onClose}>
            {mt('close')}
          </Button>
        )}
      </div>
    </Panel>
  );
}
