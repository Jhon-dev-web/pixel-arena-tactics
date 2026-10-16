import type { AuthConfig } from '../auth.ts';
import { associatedTokenAddress } from '../chain/ata.ts';
import { RpcClient } from '../chain/rpc.ts';
import { SolanaConfig, SolanaEnv, cleanSolAddress, fetchRecentBlockhash, loadPassPriceUnits, loadSolanaConfig, normalizeSolSignature, verifyUsdcPayment } from '../chain/solana.ts';
import { USDC_DECIMALS, formatUsdc } from '../chain/solMoney.ts';
import { json } from '../http.ts';
import { chainPublic, rpcFor } from './chainEnv.ts';
import { prelude } from './prelude.ts';
import type { PassCryptoStore } from './store.ts';

// pass-crypto: the Adventurer Pass bought with USDC on Solana, in addition to Stripe. A logged-in player with a LINKED wallet sends the price in USDC (an SPL token transfer) to the game's receiving
// wallet FROM that wallet and submits the transaction signature; the server verifies it on chain and grants the entitlement (source 'crypto_sol', provider_ref = the signature, livemode = mainnet-beta).
// The existing entitlement rules are untouched: one active Pass per user, only livemode counts toward the goal. The game never holds funds or keys.
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

/** { action: 'price' } | { action: 'start' } | { action: 'prepare' } | { action: 'submit', signature } */
export async function handlePassCrypto(req: Request, deps: PassCryptoDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    const pass = deps.pass();
    if (!pass) return json({ ok: false, reason: 'unavailable' }, 503, cors);

    // { action: 'price' }: what the Pass costs in USDC, so the buy screen can say it up front. Public by nature (the same number the 'start' answer carries); no intent is opened, no wallet is needed.
    if (body.action === 'price') return json({ ok: true, priceUnits: pass.priceUnits, priceUsdc: formatUsdc(pass.priceUnits), chain: chainPublic(pass.config) }, 200, cors);

    if (await deps.store.hasActivePass(userId)) return json({ ok: false, reason: 'already_owned' }, 409, cors);
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
      return json(
        {
          ok: true,
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
      if (!(await deps.store.takeVerifyBudget(userId))) return json({ ok: false, reason: 'rate_limited' }, 429, { ...cors, 'retry-after': '30' });

      const verified = await verifyUsdcPayment(pass.rpc, pass.config, {
        signature,
        buyer: wallet.address,
        receiver: pass.receiveAddress,
        minUnits: BigInt(pass.priceUnits),
        notBeforeMs: intentMs,
      });
      if ('reason' in verified) {
        const status = verified.reason === 'rpc_error' || verified.reason === 'wrong_network' ? 503 : verified.reason === 'bad_signature' ? 400 : 409;
        const reason = verified.reason === 'not_found' ? 'not_found_tx' : verified.reason;
        return json({ ok: false, reason }, status, status === 503 ? { ...cors, 'retry-after': '10' } : cors);
      }
      const p = verified.payment;
      const outcome = await deps.store.grant({
        userId,
        txHash: p.signature,
        from: wallet.address,
        to: pass.receiveAddress,
        amountUnits: p.paid.reduce((n, x) => n + x.amount, 0n),
        requiredUnits: BigInt(pass.priceUnits),
        blockNumber: p.slot,
        blockTimeMs: p.blockTime * 1000,
        chainId: pass.config.chainId,
        livemode: pass.config.livemode,
      });
      if (outcome === 'granted' || outcome === 'replayed') return json({ ok: true, status: 'granted', livemode: pass.config.livemode }, 200, cors);
      if (outcome === 'already_owned') return json({ ok: false, reason: 'already_owned', refundDue: true }, 409, cors);
      if (outcome === 'no_intent') return json({ ok: false, reason: 'no_intent' }, 409, cors);
      return json({ ok: false, reason: 'tx_reused' }, 409, cors);
    }
    return json({ ok: false, reason: 'bad_request' }, 400, cors);
  } catch (err) {
    console.error('[pass-crypto] failed', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'pass_failed' }, 502, cors);
  }
}
