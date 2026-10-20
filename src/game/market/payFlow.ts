import type { ReservationView } from '../../../supabase/functions/_shared/market/types';
import { buildSolTransfersTx } from './solTx';
import { MarketApi, MarketUnreachable } from './api';
import { WalletError, assertOpenAccount, connectSolWallet } from './wallet';

// Paying a reservation: the player's wallet signs ONE transaction with two SOL transfers (the seller's share and the game's fee), or he pastes the signature of one he made. The SERVER verifies it on
// chain (finalized) and keeps asking until the network has finalized it. Nothing here decides whether a payment is good: only the server does.

/** Reasons that mean "not yet / try again" (the transaction exists or will; nothing was consumed), as opposed to a final refusal. */
export const RETRY_REASONS = new Set(['unconfirmed', 'not_found_tx', 'rpc_error']);

export type SubmitOutcome =
  | { kind: 'recorded'; reservation: ReservationView | null; status: string; certificateId?: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'pending'; reason: string }
  | { kind: 'unreachable' }
  | { kind: 'stopped' };

export interface PollOptions {
  /** milliseconds between tries (tests pass 0) */
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
  // about 10 questions a minute for up to 3 minutes (Solana finalizes in about 15 to 30 seconds): the server budget (240 an hour, 60 at once) covers a purchase with room to spare
  const tries = opts.maxTries ?? 36;
  const interval = opts.intervalMs ?? 5000;
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
    if (!RETRY_REASONS.has(r.reason)) return { kind: 'refused', reason: r.reason };
    last = { kind: 'pending', reason: r.reason };
    opts.onPending?.({ reason: r.reason });
    await sleep(interval);
  }
  return last; // still not ready after the patience: the player can press "verify" again, nothing was consumed
}

export type PayFailure = 'noProvider' | 'rejected' | 'wrongAccount' | 'unsupported' | 'unreachable' | 'blockhash' | 'failed';

/**
 * Asks the wallet to pay the reservation: the SERVER hands over a fresh blockhash, the transaction is built here from the reservation's own amounts and addresses (the seller's share and the game's
 * fee, in ONE transaction), and the wallet signs and sends it after the player approves on its own screen. Resolves with the signature.
 */
export async function payReservationFromWallet(api: MarketApi, reservation: ReservationView, walletAddress: string): Promise<{ ok: true; signature: string } | { ok: false; failure: PayFailure; open?: string }> {
  try {
    const session = await connectSolWallet(undefined, walletAddress);
    const prepared = await api.prepare(reservation.id);
    if ('reason' in prepared) return { ok: false, failure: 'blockhash' };
    const tx = buildSolTransfersTx({
      payer: walletAddress,
      blockhash: prepared.blockhash,
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
