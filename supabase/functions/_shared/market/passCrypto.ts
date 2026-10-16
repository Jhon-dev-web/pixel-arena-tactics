import type { AuthConfig } from '../auth.ts';
import { RpcClient, createJsonRpc, normalizeTxHash, verifyUsdtTransfer } from '../chain/bsc.ts';
import { ChainConfig, ChainEnv, cleanAddress, loadChainConfig } from '../chain/config.ts';
import { centsToUnits, formatUsdt, parseUsdtAmount } from '../chain/money.ts';
import { json } from '../http.ts';
import { chainPublic } from './chainEnv.ts';
import { prelude } from './prelude.ts';
import type { PassCryptoStore } from './store.ts';

// pass-crypto: the Adventurer Pass bought with USDT (BEP-20, BNB Smart Chain), in addition to Stripe. A logged-in player with a LINKED wallet pays the price to the game's receiving address
// FROM that wallet and submits the transaction hash; the server verifies it on chain and grants the entitlement (source 'crypto_bsc', provider_ref = the hash, livemode = BSC mainnet).
// The existing entitlement rules are untouched: one active Pass per user, only livemode counts toward the goal. The game never holds funds or keys.

export const DEFAULT_PASS_PRICE_CENTS = 1000; // 10.00 USDT

export interface PassCryptoChain {
  config: ChainConfig;
  rpc: RpcClient;
  /** PASS_RECEIVE_ADDRESS if set, else MARKET_FEE_ADDRESS: a wallet the owner controls */
  receiveAddress: string;
  priceCents: number;
}

export function loadPassCrypto(env: ChainEnv, fetchFn?: typeof fetch): PassCryptoChain | null {
  const loaded = loadChainConfig(env);
  if (!loaded.ok) return null;
  const receiveAddress = cleanAddress(env.PASS_RECEIVE_ADDRESS) ?? cleanAddress(env.MARKET_FEE_ADDRESS);
  if (!receiveAddress) return null;
  let priceCents = DEFAULT_PASS_PRICE_CENTS;
  if (env.PASS_PRICE_USDT !== undefined && env.PASS_PRICE_USDT !== '') {
    const parsed = parseUsdtAmount(env.PASS_PRICE_USDT);
    if (parsed === null || parsed < 1) return null; // a malformed price is "not configured", never a free Pass
    priceCents = parsed;
  }
  return { config: loaded.config, rpc: createJsonRpc(loaded.rpcUrl, { fetchFn }), receiveAddress, priceCents };
}

export interface PassCryptoDeps {
  auth: AuthConfig;
  allowedOrigins: string[];
  store: PassCryptoStore;
  nowMs: () => number;
  pass: () => PassCryptoChain | null;
}

/** { action: 'start' } -> what to pay and to whom | { action: 'submit', txHash } */
export async function handlePassCrypto(req: Request, deps: PassCryptoDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    const pass = deps.pass();
    if (!pass) return json({ ok: false, reason: 'unavailable' }, 503, cors);

    if (await deps.store.hasActivePass(userId)) return json({ ok: false, reason: 'already_owned' }, 409, cors);
    const wallet = await deps.store.wallet(userId);
    if (!wallet) return json({ ok: false, reason: 'no_wallet' }, 409, cors);

    if (body.action === 'start') {
      const intentMs = await deps.store.startIntent(userId);
      return json(
        { ok: true, priceCents: pass.priceCents, priceUsdt: formatUsdt(pass.priceCents), receiveAddress: pass.receiveAddress, buyerAddress: wallet.address, intentAt: new Date(intentMs).toISOString(), chain: chainPublic(pass.config) },
        200,
        cors,
      );
    }

    if (body.action === 'submit') {
      const txHash = normalizeTxHash(body.txHash);
      if (!txHash) return json({ ok: false, reason: 'bad_hash' }, 400, cors);

      const known = await deps.store.payment(txHash);
      if (known) {
        // the same player submitting the same hash again: the Pass is already his (or already owed back), never a second grant
        if (known.userId === userId && known.leg === 'pass') return json({ ok: true, status: 'granted', replay: true }, 200, cors);
        return json({ ok: false, reason: 'tx_reused' }, 409, cors);
      }

      const intentMs = await deps.store.startIntent(userId);
      if (!(await deps.store.takeVerifyBudget(userId))) return json({ ok: false, reason: 'rate_limited' }, 429, { ...cors, 'retry-after': '30' });

      const verified = await verifyUsdtTransfer(pass.rpc, pass.config, {
        txHash,
        from: wallet.address,
        to: pass.receiveAddress,
        minAmountUnits: centsToUnits(pass.priceCents),
        notBeforeMs: intentMs,
      });
      if ('reason' in verified) {
        const status = verified.reason === 'rpc_error' || verified.reason === 'wrong_network' ? 503 : verified.reason === 'bad_hash' ? 400 : 409;
        const reason = verified.reason === 'not_found' ? 'not_found_tx' : verified.reason;
        return json({ ok: false, reason, ...(verified.confirmations !== undefined ? { confirmations: verified.confirmations, needed: pass.config.minConfirmations } : {}) }, status, cors);
      }
      const t = verified.transfer;
      const outcome = await deps.store.grant({
        userId,
        txHash: t.txHash,
        from: t.from,
        to: t.to,
        amountUnits: t.amountUnits,
        requiredUnits: centsToUnits(pass.priceCents),
        blockNumber: t.blockNumber,
        blockTimeMs: t.blockTime * 1000,
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
