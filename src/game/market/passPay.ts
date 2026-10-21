import { MarketApi, MarketUnreachable, PassPlan } from './api';
import { CONFIRM_MAX_TRIES, PayFailure, PollOptions, RETRY_REASONS, confirmRetryDelayMs } from './payFlow';
import { isHeldReason } from './pendingPayment';
import { buildUsdcTransferTx } from './solTx';
import { WalletError, assertOpenAccount, connectSolWallet } from './wallet';

// Paying the Adventurer Pass in USDC from the player's wallet: the SERVER hands over a fresh blockhash, the transaction is built here from the plan's own amounts and token accounts, and the wallet signs
// and sends it after the player approves on its own screen, with the server's reference in an SPL Memo so the payment is recognised even when it is not made from the linked wallet. Before anything is built the account that is open in the wallet RIGHT NOW must be the linked one.

export type PassPayResult = { ok: true; signature: string } | { ok: false; failure: PayFailure; open?: string };

export async function payPassFromWallet(api: MarketApi, plan: PassPlan): Promise<PassPayResult> {
  // The receiving address is the game's: paying from it nets zero (the money would go from the game to the game). Refused here and by the server's prepare, before the wallet is opened.
  if (plan.buyerAddress === plan.receiveAddress) return { ok: false, failure: 'selfPayment' };
  try {
    const session = await connectSolWallet(undefined, plan.buyerAddress);
    const prepared = await api.passPrepare(plan.buyerAddress);
    if ('reason' in prepared) return { ok: false, failure: prepared.reason === 'self_payment' ? 'selfPayment' : 'blockhash' };
    const tx = buildUsdcTransferTx({
      payer: plan.buyerAddress,
      blockhash: prepared.blockhash,
      sourceTokenAccount: plan.buyerTokenAccount,
      destinationTokenAccount: plan.receiverTokenAccount,
      mint: plan.chain.usdcMint,
      units: plan.priceUnits,
      decimals: plan.decimals,
      memo: plan.memo,
    });
    // the player may have switched account in the wallet since connecting: never send from an account that is not the linked one
    assertOpenAccount(session, plan.buyerAddress);
    const signature = await session.signAndSend(tx, plan.chain.cluster);
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

// ---- confirming the payment -------------------------------------------------------------------------------------------------------------------------------------------------------

export type PassSubmitOutcome =
  | { kind: 'granted' }
  /** it reached the game's wallet but could not be matched to this purchase: queued for the owner, `code` is what the player keeps */
  | { kind: 'unmatched'; code: string }
  | { kind: 'alreadyOwned'; refundDue: boolean }
  /** the server cannot decide right now (paused, rate limited, a server error): the payment may be good, the signature stays saved */
  | { kind: 'held'; reason: string }
  /** a final refusal */
  | { kind: 'refused'; reason: string }
  /** still "not yet" after the patience */
  | { kind: 'pending'; reason: string }
  | { kind: 'unreachable' }
  | { kind: 'stopped' };

/**
 * Sends the signature of the Pass payment to the server AT ONCE (no initial delay) and keeps asking on the confirmRetryDelayMs schedule while the network answers "not yet". Every other answer is
 * final for this attempt. Nothing here decides whether the payment is good: only the server does.
 */
export async function submitPassWithPolling(api: MarketApi, signature: string, opts: PollOptions = {}): Promise<PassSubmitOutcome> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tries = opts.maxTries ?? CONFIRM_MAX_TRIES;
  let last: PassSubmitOutcome = { kind: 'pending', reason: 'not_found_tx' };
  for (let i = 0; i < tries; i++) {
    if (opts.isCancelled?.()) return { kind: 'stopped' };
    let r;
    try {
      r = await api.passSubmit(signature);
    } catch (err) {
      if (err instanceof MarketUnreachable) return { kind: 'unreachable' };
      throw err;
    }
    if (!('reason' in r)) return { kind: 'granted' };
    const extra = r.extra as { code?: unknown; refundDue?: unknown } | undefined;
    if (r.reason === 'payment_unmatched') return { kind: 'unmatched', code: typeof extra?.code === 'string' ? extra.code : signature };
    if (r.reason === 'already_owned') return { kind: 'alreadyOwned', refundDue: !!extra?.refundDue };
    if (!RETRY_REASONS.has(r.reason)) return isHeldReason(r.reason) ? { kind: 'held', reason: r.reason } : { kind: 'refused', reason: r.reason };
    last = { kind: 'pending', reason: r.reason };
    opts.onPending?.({ reason: r.reason });
    if (i < tries - 1) await sleep(opts.intervalMs ?? confirmRetryDelayMs(i));
  }
  return last;
}
