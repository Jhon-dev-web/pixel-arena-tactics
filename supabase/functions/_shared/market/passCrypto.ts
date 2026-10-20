import type { AuthConfig } from '../auth.ts';
import { associatedTokenAddress } from '../chain/ata.ts';
import { RpcClient } from '../chain/rpc.ts';
import { SolanaConfig, SolanaEnv, cleanSolAddress, fetchRecentBlockhash, inspectUsdcTransfer, loadPassPriceUnits, loadSolanaConfig, normalizeSolSignature } from '../chain/solana.ts';
import { isGameMemo, passMemo, passRefOf } from '../chain/memo.ts';
import { USDC_DECIMALS, formatUsdc } from '../chain/solMoney.ts';
import { json } from '../http.ts';
import { chainPublic, rpcFor } from './chainEnv.ts';
import { isPaused, pausedResponse, type OpsFlagReader } from '../ops/flags.ts';
import { prelude } from './prelude.ts';
import type { ExceptionReason, PassCryptoStore } from './store.ts';

// pass-crypto: the Adventurer Pass bought with USDC on Solana, in addition to Stripe. A logged-in player with a LINKED wallet sends the price in USDC (an SPL token transfer) to the game's receiving
// wallet FROM that wallet and submits the transaction signature; the server verifies it on chain and grants the entitlement (source 'crypto_sol', provider_ref = the signature, livemode = mainnet-beta).
// The existing entitlement rules are untouched: one active Pass per user, only livemode counts toward the goal. The game never holds funds or keys.
//
// HOW A PAYMENT IS RECOGNISED. The transaction the game builds carries an SPL Memo "pa1:pass:<ref>", <ref> being a random reference of THIS player that only the server knows and only 'start' hands to its owner.
//   * memo = the player's reference: the payment is his, from ANY wallet (the linked address is then only a soft signal: logged, never a refusal). Safe because the reference is bound to the player on the
//     server, the signature is consumed once (primary key of chain_payments), and a memo selects nothing but the purchase of the player it names: copying it from the chain gains an attacker nothing.
//   * no memo, but the ONLY wallet that paid is the player's linked one (a payment made by hand): matched as before.
//   * anything else that reached the receiving wallet (another player's memo, no memo from an unknown wallet, less than the price, made before the intent) is NOT lost: it is written to payment_exceptions
//     (migration 0022) for the owner and the player gets the signature as a code. Only a payment that never reached the receiving wallet, or that nets zero (paying oneself), is simply refused.
//
// The wallet needs the USDC token accounts of both sides: the buyer's and the receiver's (associated token accounts, derived here). The OWNER creates the receiving one ONCE (docs/MARKET_SOLANA.md);
// 'start' checks that it exists so a player is never asked to pay into an account that would reject the transfer.

export interface PassCryptoChain {
  config: SolanaConfig;
  rpc: RpcClient;
  /** PASS_RECEIVE_ADDRESS if set, else MARKET_FEE_ADDRESS: a wallet the owner controls (the OWNER of the receiving USDC token account) */
  receiveAddress: string;
  /** the price in USDC base units (6 decimals) */
  priceUnits: number;
}

export function loadPassCrypto(env: SolanaEnv, fetchFn?: typeof fetch): PassCryptoChain | null {
  const loaded = loadSolanaConfig(env);
  if (!loaded.ok) return null;
  const receiveAddress = cleanSolAddress(env.PASS_RECEIVE_ADDRESS) ?? cleanSolAddress(env.MARKET_FEE_ADDRESS);
  if (!receiveAddress) return null;
  const priceUnits = loadPassPriceUnits(env.PASS_PRICE_USDC);
  if (priceUnits === null) return null; // a malformed price is "not configured", never a free Pass
  return { config: loaded.config, rpc: rpcFor(loaded.rpcUrl, fetchFn), receiveAddress, priceUnits };
}

export interface PassCryptoDeps {
  auth: AuthConfig;
  allowedOrigins: string[];
  store: PassCryptoStore;
  nowMs: () => number;
  pass: () => PassCryptoChain | null;
  /** The operations flags (migration 0021). `pass_sales_paused` makes start / prepare / submit answer 503; 'price' (a read) stays open. */
  opsFlags?: OpsFlagReader;
}

/** Does this token account exist on the cluster? Resolves true/false, or null when the node could not say. */
async function accountExists(rpc: RpcClient, address: string): Promise<boolean | null> {
  try {
    const r = (await rpc.call('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }])) as { value?: unknown } | null;
    if (!r || typeof r !== 'object' || !('value' in r)) return null;
    return r.value !== null && r.value !== undefined;
  } catch {
    return null;
  }
}

/** Why an unmatched payment could not be matched (the code the screen shows in words). */
const EXCEPTION_FOR: Record<string, ExceptionReason> = { no_memo: 'no_memo', wrong_memo: 'wrong_memo', short_amount: 'short_amount', too_early: 'too_early' };

/** { action: 'price' } | { action: 'exceptions' } | { action: 'start' } | { action: 'prepare', payer? } | { action: 'submit', signature } */
export async function handlePassCrypto(req: Request, deps: PassCryptoDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    const pass = deps.pass();
    if (!pass) return json({ ok: false, reason: 'unavailable' }, 503, cors);

    // { action: 'price' }: what the Pass costs in USDC, so the buy screen can say it up front. Public by nature (the same number the 'start' answer carries); no intent is opened, no wallet is needed.
    if (body.action === 'price') return json({ ok: true, priceUnits: pass.priceUnits, priceUsdc: formatUsdc(pass.priceUnits), chain: chainPublic(pass.config) }, 200, cors);

    // { action: 'exceptions' }: the payments of this player that reached the game but could not be matched yet, so the screen can show the code again after a reload.
    if (body.action === 'exceptions') return json({ ok: true, exceptions: await deps.store.openExceptions(userId) }, 200, cors);

    // Pass sales are paused: no new intent, no verification. A payment that was already sent stays on chain and is picked up by a later 'submit' once the owner clears the flag.
    if ((body.action === 'start' || body.action === 'prepare' || body.action === 'submit') && (await isPaused(deps.opsFlags, 'pass_sales_paused'))) return pausedResponse('pass_sales_paused', cors);

    // (a 'submit' goes on even then: money that reached the game for a Pass he already has must be recorded as owed back, not turned away)
    if (body.action !== 'submit' && (await deps.store.hasActivePass(userId))) return json({ ok: false, reason: 'already_owned' }, 409, cors);
    const wallet = await deps.store.wallet(userId);
    if (!wallet) return json({ ok: false, reason: 'no_wallet' }, 409, cors);

    if (body.action === 'start') {
      if (!(await deps.store.takeVerifyBudget(userId))) return json({ ok: false, reason: 'rate_limited' }, 429, { ...cors, 'retry-after': '30' });
      const receiverTokenAccount = associatedTokenAddress(pass.receiveAddress, pass.config.usdcMint);
      const buyerTokenAccount = associatedTokenAddress(wallet.address, pass.config.usdcMint);
      const ready = await accountExists(pass.rpc, receiverTokenAccount);
      if (ready === null) return json({ ok: false, reason: 'rpc_error' }, 503, { ...cors, 'retry-after': '10' });
      if (!ready) return json({ ok: false, reason: 'receiver_account_missing' }, 503, cors);
      const intentMs = await deps.store.startIntent(userId);
      const ref = await deps.store.passRef(userId);
      return json(
        {
          ok: true,
          memo: passMemo(ref),
          priceUnits: pass.priceUnits,
          priceUsdc: formatUsdc(pass.priceUnits),
          decimals: USDC_DECIMALS,
          receiveAddress: pass.receiveAddress,
          receiverTokenAccount,
          buyerAddress: wallet.address,
          buyerTokenAccount,
          intentAt: new Date(intentMs).toISOString(),
          chain: chainPublic(pass.config),
        },
        200,
        cors,
      );
    }

    // { action: 'prepare' }: a recent blockhash for the transaction the wallet signs (see market-buy 'prepare').
    if (body.action === 'prepare') {
      // The wallet that is about to pay (optional; the linked one otherwise). Paying from the game's own receiving address nets zero: refused before a blockhash is asked.
      const payer = body.payer === undefined ? wallet.address : cleanSolAddress(typeof body.payer === 'string' ? body.payer : null);
      if (!payer) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      if (payer === pass.receiveAddress) return json({ ok: false, reason: 'self_payment' }, 409, cors);
      if (!(await deps.store.takeVerifyBudget(userId))) return json({ ok: false, reason: 'rate_limited' }, 429, { ...cors, 'retry-after': '30' });
      const bh = await fetchRecentBlockhash(pass.rpc);
      if (!bh) return json({ ok: false, reason: 'rpc_error' }, 503, { ...cors, 'retry-after': '10' });
      return json({ ok: true, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 200, cors);
    }

    if (body.action === 'submit') {
      const signature = normalizeSolSignature(body.signature);
      if (!signature) return json({ ok: false, reason: 'bad_signature' }, 400, cors);

      const known = await deps.store.payment(signature);
      if (known) {
        // the same player submitting the same signature again: the Pass is already his (or already owed back), never a second grant
        if (known.userId === userId && known.leg === 'pass') return json({ ok: true, status: 'granted', replay: true }, 200, cors);
        return json({ ok: false, reason: 'tx_reused' }, 409, cors);
      }

      const intentMs = await deps.store.startIntent(userId);
      const myRef = await deps.store.passRef(userId);
      if (!(await deps.store.takeVerifyBudget(userId))) return json({ ok: false, reason: 'rate_limited' }, 429, { ...cors, 'retry-after': '30' });

      const got = await inspectUsdcTransfer(pass.rpc, pass.config, { signature, receiver: pass.receiveAddress });
      if ('reason' in got) {
        const status = got.reason === 'rpc_error' || got.reason === 'wrong_network' ? 503 : got.reason === 'bad_signature' ? 400 : 409;
        const reason = got.reason === 'not_found' ? 'not_found_tx' : got.reason;
        return json({ ok: false, reason }, status, status === 503 ? { ...cors, 'retry-after': '10' } : cors);
      }
      const ins = got.inspection;

      const memoMine = ins.memos.includes(passMemo(myRef));
      const memoTexts = ins.memos.filter(isGameMemo);
      // a memo that names ANOTHER player's reference: that player's payment. It is not mine to submit (and no row is written in my name): he submits it himself.
      for (const m of memoTexts) {
        const theirRef = passRefOf(m);
        if (!memoMine && theirRef && theirRef !== myRef && (await deps.store.passRefOwner(theirRef)) !== null) return json({ ok: false, reason: 'not_your_payment' }, 409, cors);
      }

      // nothing reached the receiving wallet, or it nets zero: paying oneself (the receiving address as the payer) moves no money. Refused, not queued: there is nothing to give back.
      if (ins.receivedUnits <= 0n) return json({ ok: false, reason: memoMine ? 'self_payment' : 'no_transfer' }, 409, cors);

      const biggest = ins.payers.reduce<{ owner: string; units: bigint } | null>((best, p) => (best === null || p.units > best.units ? p : best), null);
      // the old way, still honoured: no memo, and the ONLY wallet that paid is the player's linked one
      const byLinkedWallet = !memoMine && ins.payers.length === 1 && ins.payers[0].owner === wallet.address;
      const matched = memoMine || byLinkedWallet;

      let why: string | null = null;
      if (!matched) why = memoTexts.length > 0 ? 'wrong_memo' : 'no_memo';
      else if (ins.receivedUnits < BigInt(pass.priceUnits)) why = 'short_amount';
      else if (ins.blockTime < Math.floor(intentMs / 1000)) why = 'too_early';

      if (why) {
        await deps.store.recordException({
          signature,
          chainId: pass.config.chainId,
          livemode: pass.config.livemode,
          purpose: 'pass',
          reason: EXCEPTION_FOR[why],
          userId,
          reservationId: null,
          payer: biggest?.owner ?? null,
          receiver: pass.receiveAddress,
          amountUnits: ins.receivedUnits,
          memo: memoTexts[0] ?? null,
          blockTimeMs: ins.blockTime * 1000,
        });
        return json({ ok: false, reason: 'payment_unmatched', code: signature, why }, 409, cors);
      }

      const from = biggest?.owner ?? wallet.address;
      const outcome = await deps.store.grant({
        userId,
        txHash: ins.signature,
        from,
        to: pass.receiveAddress,
        amountUnits: ins.receivedUnits,
        requiredUnits: BigInt(pass.priceUnits),
        blockNumber: ins.slot,
        blockTimeMs: ins.blockTime * 1000,
        chainId: pass.config.chainId,
        livemode: pass.config.livemode,
      });
      if (outcome === 'granted' || outcome === 'replayed') {
        await deps.store.closeException(ins.signature); // it may have been queued by an earlier try
        // A soft signal, not a refusal: the player paid from another account of his (the memo is his). Logged in the audit trail with the payer.
        if (from !== wallet.address && outcome === 'granted') await deps.store.notePayer(ins.signature, from);
        return json({ ok: true, status: 'granted', livemode: pass.config.livemode }, 200, cors);
      }
      if (outcome === 'already_owned') {
        // valid money for a Pass he already has: owed back, and in the owner's queue with the rest
        await deps.store.recordException({
          signature,
          chainId: pass.config.chainId,
          livemode: pass.config.livemode,
          purpose: 'pass',
          reason: 'already_owned',
          userId,
          reservationId: null,
          payer: from,
          receiver: pass.receiveAddress,
          amountUnits: ins.receivedUnits,
          memo: memoTexts[0] ?? null,
          blockTimeMs: ins.blockTime * 1000,
        });
        return json({ ok: false, reason: 'already_owned', refundDue: true }, 409, cors);
      }
      if (outcome === 'no_intent') return json({ ok: false, reason: 'no_intent' }, 409, cors);
      return json({ ok: false, reason: 'tx_reused' }, 409, cors);
    }
    return json({ ok: false, reason: 'bad_request' }, 400, cors);
  } catch (err) {
    console.error('[pass-crypto] failed', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'pass_failed' }, 502, cors);
  }
}
