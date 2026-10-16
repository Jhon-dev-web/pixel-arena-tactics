import { cleanSolAddress } from '../chain/solana.ts';
import { linkMessage, verifySolanaSignature } from '../chain/solWallet.ts';
import { json } from '../http.ts';
import { chainPublic } from './chainEnv.ts';
import type { MarketDeps } from './deps.ts';
import { prelude } from './prelude.ts';

// market-wallet: the only market function that touches the signature library (@noble/curves, see chain/solWallet.ts), so only its folder needs the npm import map.
const isStr = (v: unknown): v is string => typeof v === 'string';
const iso = (ms: number): string => new Date(ms).toISOString();
const toMs = (iso0: string): number => Date.parse(iso0);

// ---- market-wallet --------------------------------------------------------------------------------------------------------------------------------------------------------

/** { action: 'status' } | { action: 'nonce', address } | { action: 'link', address, nonce, signature } */
export async function handleMarketWallet(req: Request, deps: MarketDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    const chain = deps.chain();
    if (body.action === 'status') {
      const wallet = await deps.store.wallet(userId);
      return json({ ok: true, enabled: chain !== null, wallet, chain: chain ? chainPublic(chain.config) : null }, 200, cors);
    }
    if (!chain) return json({ ok: false, reason: 'unavailable' }, 503, cors);

    if (body.action === 'nonce') {
      const address = cleanSolAddress(isStr(body.address) ? body.address : null);
      if (!address) return json({ ok: false, reason: 'bad_address' }, 400, cors);
      const nonce = deps.nonce();
      const issued = await deps.store.issueNonce(userId, nonce);
      if (issued.status === 'rate_limited') return json({ ok: false, reason: 'rate_limited' }, 429, cors);
      const issuedAtIso = iso(toMs(issued.issuedAtIso));
      return json({ ok: true, nonce, message: linkMessage({ userId, address, nonce, issuedAtIso, cluster: chain.config.cluster }) }, 200, cors);
    }

    if (body.action === 'link') {
      const address = cleanSolAddress(isStr(body.address) ? body.address : null);
      if (!address || !isStr(body.nonce) || body.nonce.length > 128 || !isStr(body.signature)) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      // The nonce is consumed FIRST, in one atomic statement: a replay (or a second try with the same signature) finds nothing. A failed signature burns it, so he asks for a new one.
      const issuedAt = await deps.store.takeNonce(userId, body.nonce);
      if (issuedAt === null) return json({ ok: false, reason: 'nonce_invalid' }, 400, cors);
      const message = linkMessage({ userId, address, nonce: body.nonce, issuedAtIso: iso(toMs(issuedAt)), cluster: chain.config.cluster });
      if (!verifySolanaSignature(message, body.signature, address)) return json({ ok: false, reason: 'bad_signature' }, 400, cors);
      const status = await deps.store.setWallet(userId, address, chain.config.chainId);
      if (status === 'busy' || status === 'address_taken') return json({ ok: false, reason: status }, 409, cors);
      return json({ ok: true, status, wallet: { address, chainId: chain.config.chainId } }, 200, cors);
    }
    return json({ ok: false, reason: 'bad_request' }, 400, cors);
  } catch (err) {
    console.error('[market-wallet] failed', err instanceof Error ? err.message : 'unknown'); // message only: never a key, a token, the RPC url or a body
    return json({ error: 'market_failed' }, 502, cors);
  }
}

