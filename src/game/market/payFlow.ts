import type { ReservationView } from '../../../supabase/functions/_shared/market/types';
import { centsToUnits } from '../../../supabase/functions/_shared/chain/money';
import { MarketApi, MarketUnreachable } from './api';
import { WalletError, sendUsdt } from './wallet';

// Paying a reservation: the player's wallet makes the USDT transfer (or he pastes the hash of one he made), the SERVER verifies it on chain. Both are polled until the network has enough
// confirmations. Nothing here decides whether a payment is good: only the server does.

/** Reasons that mean "not yet / try again" (the transaction exists or will; nothing was consumed), as opposed to a final refusal. */
export const RETRY_REASONS = new Set(['unconfirmed', 'not_found_tx', 'rpc_error']);

export type SubmitOutcome =
  | { kind: 'recorded'; reservation: ReservationView | null; status: string; certificateId?: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'pending'; reason: string; confirmations?: number; needed?: number }
  | { kind: 'unreachable' }
  | { kind: 'stopped' };

export interface PollOptions {
  /** seconds-between-tries in ms (tests pass 0) */
  intervalMs?: number;
  maxTries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** called with the latest "not yet" answer while waiting */
  onPending?: (p: { reason: string; confirmations?: number; needed?: number }) => void;
  isCancelled?: () => boolean;
}

/** Submits a hash and keeps asking while the network is not ready. Resolves with the final outcome. */
export async function submitWithPolling(api: MarketApi, reservationId: string, leg: 'seller' | 'fee', txHash: string, opts: PollOptions = {}): Promise<SubmitOutcome> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tries = opts.maxTries ?? 45;
  const interval = opts.intervalMs ?? 4000;
  let last: SubmitOutcome = { kind: 'pending', reason: 'not_found_tx' };
  for (let i = 0; i < tries; i++) {
    if (opts.isCancelled?.()) return { kind: 'stopped' };
    let r;
    try {
      r = await api.submitPayment(reservationId, leg, txHash);
    } catch (err) {
      if (err instanceof MarketUnreachable) return { kind: 'unreachable' };
      throw err;
    }
    if (!('reason' in r)) return { kind: 'recorded', reservation: r.reservation, status: r.status, ...(r.certificateId ? { certificateId: r.certificateId } : {}) };
    if (!RETRY_REASONS.has(r.reason)) return { kind: 'refused', reason: r.reason };
    const extra = (r.extra ?? {}) as { confirmations?: number; needed?: number };
    const progress = { reason: r.reason, ...(extra.confirmations !== undefined ? { confirmations: extra.confirmations, needed: extra.needed } : {}) };
    last = { kind: 'pending', ...progress };
    opts.onPending?.(progress);
    await sleep(interval);
  }
  return last; // still not ready after the patience: the player can press "verify" again, nothing was consumed
}

/** Asks the wallet to pay one leg of the reservation (the amount and the address are the SERVER's), then returns the hash. */
export async function payLegFromWallet(reservation: ReservationView, leg: 'seller' | 'fee', from: string): Promise<{ ok: true; txHash: string } | { ok: false; failure: 'noProvider' | 'rejected' | 'failed' }> {
  try {
    const to = leg === 'seller' ? reservation.sellerAddress : reservation.feeAddress;
    const cents = leg === 'seller' ? reservation.sellerCents : reservation.feeCents;
    const txHash = await sendUsdt(from, reservation.chain.usdtContract, to, centsToUnits(cents));
    return { ok: true, txHash };
  } catch (err) {
    if (err instanceof WalletError) return { ok: false, failure: err.kind === 'no_provider' ? 'noProvider' : err.kind === 'rejected' ? 'rejected' : 'failed' };
    return { ok: false, failure: 'failed' };
  }
}

/** The leg already counted on the server (so the screen shows it done). */
export const legDone = (r: ReservationView, leg: 'seller' | 'fee'): boolean => r.payments.some((p) => p.leg === leg && p.status === 'applied');
