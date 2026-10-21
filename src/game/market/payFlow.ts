import type { ReservationView } from '../../../supabase/functions/_shared/market/types';
import { buildSolTransfersTx } from './solTx';
import { MarketApi, MarketUnreachable } from './api';
import { WalletError, assertOpenAccount, connectSolWallet } from './wallet';

// Paying a reservation: the player's wallet signs ONE transaction with two SOL transfers (the seller's share and the game's fee), or he pastes the signature of one he made. The SERVER verifies it on
// chain (confirmed: about 1 to 2 seconds) and keeps asking until the network has confirmed it. Nothing here decides whether a payment is good: only the server does.

/** Reasons that mean "not yet / try again" (the transaction exists or will; nothing was consumed), as opposed to a final refusal. */
export const RETRY_REASONS = new Set(['unconfirmed', 'not_found_tx', 'rpc_error']);

export type SubmitOutcome =
  | { kind: 'recorded'; reservation: ReservationView | null; status: string; certificateId?: string }
  | { kind: 'refused'; reason: string; /** the signature to quote when the payment reached the game but could not be matched (it is queued for the owner) */ code?: string }
  | { kind: 'pending'; reason: string }
  | { kind: 'unreachable' }
  | { kind: 'stopped' };

/**
 * How long to wait before asking the server about the payment AGAIN, after the `attempt`-th answer (0 = the first) said "not yet". The first question is sent the moment the wallet returns the
 * signature (no delay at all); the schedule only paces the retries: every 2 s for the first 30 s (15 questions), every 4 s up to about 1.5 minutes, then every 8 s up to about 3.5 minutes (45
 * questions in all, about 60 an hour for a slow network: the server budget is 240 an hour per account). Pure, so the schedule is tested.
 */
export function confirmRetryDelayMs(attempt: number): number {
  if (attempt < 15) return 2000;
  if (attempt < 30) return 4000;
  return 8000;
}
/** The most questions one verification asks before it gives the screen back to the player (the signature stays saved and "verify" asks again). */
export const CONFIRM_MAX_TRIES = 45;

/** Whole seconds since `startedAt`, never negative: what the "Confirmando o pagamento na rede... 12 s" line shows. */
export const elapsedSeconds = (startedAt: number, now: number): number => Math.max(0, Math.floor((now - startedAt) / 1000));

export interface PollOptions {
  /** milliseconds between tries: a fixed pace (tests pass 0); by default the confirmRetryDelayMs schedule */
  intervalMs?: number;
  maxTries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** called with the latest "not yet" answer while waiting */
  onPending?: (p: { reason: string }) => void;
  isCancelled?: () => boolean;
}

/** Submits a signature and keeps asking while the network is not ready. Resolves with the final outcome. */
export async function submitWithPolling(api: MarketApi, reservationId: string, signature: string, opts: PollOptions = {}): Promise<SubmitOutcome> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // The first question goes out at once, then the confirmRetryDelayMs schedule (every 2 s at first: Solana confirms in 1 to 2 seconds).
  const tries = opts.maxTries ?? CONFIRM_MAX_TRIES;
  let last: SubmitOutcome = { kind: 'pending', reason: 'not_found_tx' };
  for (let i = 0; i < tries; i++) {
    if (opts.isCancelled?.()) return { kind: 'stopped' };
    let r;
    try {
      r = await api.submitPayment(reservationId, signature);
    } catch (err) {
      if (err instanceof MarketUnreachable) return { kind: 'unreachable' };
      throw err;
    }
    if (!('reason' in r)) return { kind: 'recorded', reservation: r.reservation, status: r.status, ...(r.certificateId ? { certificateId: r.certificateId } : {}) };
    if (!RETRY_REASONS.has(r.reason)) return { kind: 'refused', reason: r.reason, ...(typeof r.extra?.code === 'string' ? { code: r.extra.code } : {}) };
    last = { kind: 'pending', reason: r.reason };
    opts.onPending?.({ reason: r.reason });
    if (i < tries - 1) await sleep(opts.intervalMs ?? confirmRetryDelayMs(i));
  }
  return last; // still not ready after the patience: the player can press "verify" again, nothing was consumed
}

export type PayFailure = 'noProvider' | 'rejected' | 'wrongAccount' | 'unsupported' | 'unreachable' | 'blockhash' | 'selfPayment' | 'failed';

/**
 * Asks the wallet to pay the reservation: the SERVER hands over a fresh blockhash, the transaction is built here from the reservation's own amounts and addresses (the seller's share and the game's
 * fee, in ONE transaction), and the wallet signs and sends it after the player approves on its own screen. Resolves with the signature.
 */
export async function payReservationFromWallet(api: MarketApi, reservation: ReservationView, walletAddress: string): Promise<{ ok: true; signature: string } | { ok: false; failure: PayFailure; open?: string }> {
  // Paying from the game's own address (or as the seller) nets zero: refused here and by the server's prepare, before the wallet is even opened.
  if (walletAddress === reservation.feeAddress || walletAddress === reservation.sellerAddress) return { ok: false, failure: 'selfPayment' };
  try {
    const session = await connectSolWallet(undefined, walletAddress);
    const prepared = await api.prepare(reservation.id, walletAddress);
    if ('reason' in prepared) return { ok: false, failure: prepared.reason === 'self_payment' ? 'selfPayment' : 'blockhash' };
    const tx = buildSolTransfersTx({
      payer: walletAddress,
      blockhash: prepared.blockhash,
      memo: reservation.memo,
      transfers: [
        { to: reservation.sellerAddress, lamports: reservation.sellerLamports },
        { to: reservation.feeAddress, lamports: reservation.feeLamports },
      ],
    });
    // the player may have switched account in the wallet since connecting: never send from an account that is not the linked one
    assertOpenAccount(session, walletAddress);
    const signature = await session.signAndSend(tx, reservation.chain.cluster);
    return { ok: true, signature };
  } catch (err) {
    if (err instanceof MarketUnreachable) return { ok: false, failure: 'unreachable' };
    if (err instanceof WalletError) {
      const failure = err.kind === 'no_provider' ? 'noProvider' : err.kind === 'rejected' ? 'rejected' : err.kind === 'wrong_account' ? 'wrongAccount' : err.kind === 'unsupported' ? 'unsupported' : 'failed';
      return { ok: false, failure, ...(err.open ? { open: err.open } : {}) };
    }
    return { ok: false, failure: 'failed' };
  }
}

/** The payment already counted on the server (so the screen shows it done). */
export const paymentDone = (r: ReservationView): boolean => r.payments.some((p) => p.leg === 'sale' && p.status === 'applied');
