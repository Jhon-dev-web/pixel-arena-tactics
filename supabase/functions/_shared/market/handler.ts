import { TransferExpectation, VerifyFailure, normalizeTxHash, verifyUsdtTransfer } from '../chain/bsc.ts';
import { centsToUnits, isPriceCents } from '../chain/money.ts';
import { UUID_RE, json } from '../http.ts';
import { chainPublic, MarketChain } from './chainEnv.ts';
import type { MarketDeps } from './deps.ts';
import { prelude } from './prelude.ts';
import type { ReservationRow } from './store.ts';
import type { ListRefusal, MarketOverview, ReservationView, ReserveRefusal, SubmitRefusal } from './types.ts';

// The four market functions (market-wallet, market-list, market-buy, market-my). The user id comes ONLY from the verified JWT. Nothing in a body is trusted except as the thing being asked
// for: an address to link, a listing id, a price, a transaction hash. Amounts and addresses a payment is checked against come from the RESERVATION stored on the server, never from the request.
// NON-CUSTODIAL: nothing here holds, sends or signs money; the chain is only read.

const isStr = (v: unknown): v is string => typeof v === 'string';
const isUuid = (v: unknown): v is string => isStr(v) && UUID_RE.test(v);
const iso = (ms: number): string => new Date(ms).toISOString();

const LIST_STATUS: Record<Exclude<ListRefusal, 'bad_request' | 'unavailable'>, number> = {
  no_wallet: 409,
  flagged: 403,
  price: 400,
  not_found: 404,
  already_listed: 409,
  not_held: 409,
  bound: 409,
  not_in_save: 409,
  limit_active: 429,
  limit_day: 429,
};

const RESERVE_STATUS: Record<Exclude<ReserveRefusal, 'bad_request' | 'unavailable'>, number> = {
  no_wallet: 409,
  reservation_exists: 409,
  rate_limited: 429,
  not_found: 404,
  reserved: 409,
  not_open: 409,
  own_listing: 409,
};

// A payment that is not acceptable. 'rpc_error' is the node's fault (503: try again, nothing was consumed); 'unconfirmed' / 'not_found_tx' are "not yet" (the game keeps asking); the rest are final.
const SUBMIT_REFUSAL: Record<VerifyFailure, { reason: SubmitRefusal; status: number }> = {
  bad_hash: { reason: 'bad_hash', status: 400 },
  rpc_error: { reason: 'rpc_error', status: 503 },
  wrong_network: { reason: 'wrong_network', status: 503 },
  not_found: { reason: 'not_found_tx', status: 409 },
  tx_failed: { reason: 'tx_failed', status: 409 },
  unconfirmed: { reason: 'unconfirmed', status: 409 },
  no_transfer: { reason: 'no_transfer', status: 409 },
  wrong_contract: { reason: 'wrong_contract', status: 409 },
  wrong_recipient: { reason: 'wrong_recipient', status: 409 },
  wrong_sender: { reason: 'wrong_sender', status: 409 },
  short_amount: { reason: 'short_amount', status: 409 },
  too_early: { reason: 'too_early', status: 409 },
};

function reservationView(r: ReservationRow, payments: ReservationView['payments'], chain: MarketChain): ReservationView {
  return {
    id: r.id,
    listingId: r.listingId,
    status: r.status,
    priceCents: r.priceCents,
    feeCents: r.feeCents,
    sellerCents: r.sellerCents,
    sellerAddress: r.sellerAddress,
    feeAddress: r.feeAddress,
    buyerAddress: r.buyerAddress,
    expiresAt: iso(r.expiresAtMs),
    graceUntil: iso(r.graceUntilMs),
    payments,
    chain: chainPublic(chain.config),
  };
}

const failed = (what: string, err: unknown): void => {
  console.error(`[${what}] failed`, err instanceof Error ? err.message : 'unknown'); // message only: never a key, a token, the RPC url or a body
};

// ---- market-list ----------------------------------------------------------------------------------------------------------------------------------------------------------

/** { action: 'list', certificateId, priceCents } | { action: 'cancel', listingId } */
export async function handleMarketList(req: Request, deps: MarketDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    if (deps.chain() === null) return json({ ok: false, reason: 'unavailable' satisfies ListRefusal }, 503, cors);
    if (body.action === 'list') {
      if (!isUuid(body.certificateId) || !isPriceCents(body.priceCents)) return json({ ok: false, reason: (isUuid(body.certificateId) ? 'price' : 'bad_request') satisfies ListRefusal }, 400, cors);
      const r = await deps.store.list(userId, body.certificateId.toLowerCase(), body.priceCents);
      if (r.status === 'refused') return json({ ok: false, reason: r.reason }, LIST_STATUS[r.reason], cors);
      return json({ ok: true, listingId: r.listingId, expiresAt: iso(r.expiresAtMs) }, 200, cors);
    }
    if (body.action === 'cancel') {
      if (!isUuid(body.listingId)) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      const r = await deps.store.cancelListing(userId, body.listingId.toLowerCase());
      if (r.status === 'cancelled') return json({ ok: true, certificateId: r.certificateId }, 200, cors);
      return json({ ok: false, reason: r.status }, r.status === 'not_found' ? 404 : 409, cors);
    }
    return json({ ok: false, reason: 'bad_request' }, 400, cors);
  } catch (err) {
    failed('market-list', err);
    return json({ error: 'market_failed' }, 502, cors);
  }
}

// ---- market-buy -----------------------------------------------------------------------------------------------------------------------------------------------------------

/** { action: 'reserve', listingId } | { action: 'cancel', reservationId } | { action: 'status', reservationId } | { action: 'submit', reservationId, leg, txHash } */
export async function handleMarketBuy(req: Request, deps: MarketDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    const chain = deps.chain();
    if (!chain) return json({ ok: false, reason: 'unavailable' }, 503, cors);

    if (body.action === 'reserve') {
      if (!isUuid(body.listingId)) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      const r = await deps.store.reserve({ buyerId: userId, listingId: body.listingId.toLowerCase(), feeAddress: chain.feeAddress, chainId: chain.config.chainId, livemode: chain.config.livemode });
      if (r.status === 'refused') return json({ ok: false, reason: r.reason, ...(r.reservationId ? { reservationId: r.reservationId } : {}) }, RESERVE_STATUS[r.reason], cors);
      const row = await deps.store.reservation(userId, r.reservation.id);
      if (!row) return json({ ok: false, reason: 'not_found' }, 404, cors);
      return json({ ok: true, reservation: reservationView(row, [], chain) }, 200, cors);
    }

    if (body.action === 'cancel') {
      if (!isUuid(body.reservationId)) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      const r = await deps.store.cancelReservation(userId, body.reservationId.toLowerCase());
      return r === 'cancelled' ? json({ ok: true }, 200, cors) : json({ ok: false, reason: r }, r === 'not_found' ? 404 : 409, cors);
    }

    if (body.action === 'status') {
      if (!isUuid(body.reservationId)) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      await deps.store.expireDue().catch(() => undefined);
      const row = await deps.store.reservation(userId, body.reservationId.toLowerCase());
      if (!row) return json({ ok: false, reason: 'not_found' }, 404, cors);
      return json({ ok: true, reservation: reservationView(row, await deps.store.payments(row.id), chain) }, 200, cors);
    }

    if (body.action === 'submit') {
      const txHash = normalizeTxHash(body.txHash);
      if (!isUuid(body.reservationId) || (body.leg !== 'seller' && body.leg !== 'fee')) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      if (!txHash) return json({ ok: false, reason: 'bad_hash' satisfies SubmitRefusal }, 400, cors);
      const leg = body.leg;
      const reservation = await deps.store.reservation(userId, body.reservationId.toLowerCase());
      if (!reservation) return json({ ok: false, reason: 'not_found' satisfies SubmitRefusal }, 404, cors);
      if (reservation.chainId !== chain.config.chainId) return json({ ok: false, reason: 'chain_changed' satisfies SubmitRefusal }, 409, cors);

      // A hash the server already holds costs no node call: the same reservation = the same answer (a double submit), anything else = used.
      const known = await deps.store.payment(txHash);
      if (known) {
        if (known.userId === userId && known.reservationId === reservation.id) {
          const fresh = await deps.store.reservation(userId, reservation.id);
          return json({ ok: true, status: 'replayed', reservation: fresh ? reservationView(fresh, await deps.store.payments(reservation.id), chain) : null }, 200, cors);
        }
        return json({ ok: false, reason: 'tx_reused' satisfies SubmitRefusal }, 409, cors);
      }

      if (!(await deps.store.takeVerifyBudget(userId))) return json({ ok: false, reason: 'rate_limited' satisfies SubmitRefusal }, 429, { ...cors, 'retry-after': '30' });

      const exp: TransferExpectation = {
        txHash,
        from: reservation.buyerAddress,
        to: leg === 'seller' ? reservation.sellerAddress : reservation.feeAddress,
        minAmountUnits: centsToUnits(leg === 'seller' ? reservation.sellerCents : reservation.feeCents),
        // a payment mined before the reservation began cannot be for it
        notBeforeMs: reservation.createdAtMs,
      };
      const verified = await verifyUsdtTransfer(chain.rpc, chain.config, exp);
      if ('reason' in verified) {
        // (`in`, not `.ok`: the game's tests compile this file without strict null checks, where the discriminant does not narrow)
        const map = SUBMIT_REFUSAL[verified.reason];
        return json({ ok: false, reason: map.reason, ...(verified.confirmations !== undefined ? { confirmations: verified.confirmations, needed: chain.config.minConfirmations } : {}) }, map.status, map.status === 503 ? { ...cors, 'retry-after': '10' } : cors);
      }

      const t = verified.transfer;
      const outcome = await deps.store.recordPayment({ buyerId: userId, reservationId: reservation.id, leg, txHash: t.txHash, from: t.from, to: t.to, amountUnits: t.amountUnits, blockNumber: t.blockNumber, blockTimeMs: t.blockTime * 1000 });
      if (outcome.status === 'tx_reused') return json({ ok: false, reason: 'tx_reused' satisfies SubmitRefusal }, 409, cors);
      if (outcome.status === 'not_found') return json({ ok: false, reason: 'not_found' satisfies SubmitRefusal }, 404, cors);
      const fresh = await deps.store.reservation(userId, reservation.id);
      return json(
        { ok: true, status: outcome.status, ...(outcome.status === 'sold' ? { certificateId: outcome.certificateId } : {}), reservation: fresh ? reservationView(fresh, await deps.store.payments(reservation.id), chain) : null },
        200,
        cors,
      );
    }
    return json({ ok: false, reason: 'bad_request' }, 400, cors);
  } catch (err) {
    failed('market-buy', err);
    return json({ error: 'market_failed' }, 502, cors);
  }
}

// ---- market-my ------------------------------------------------------------------------------------------------------------------------------------------------------------

/** { action: 'overview' } | { action: 'ack', certificateIds } */
export async function handleMarketMy(req: Request, deps: MarketDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    if (body.action === 'overview') {
      const chain = deps.chain();
      await deps.store.expireDue().catch(() => undefined); // best effort: the reads below also tidy what they touch
      const o = await deps.store.overview(userId);
      const view: MarketOverview = {
        wallet: o.wallet,
        chain: chain ? chainPublic(chain.config) : null,
        listings: o.listings,
        reservation: o.reservation && chain ? reservationView(o.reservation, o.reservationPayments, chain) : null,
        sales: o.sales,
        refundsDue: o.refundsDue,
        pending: o.pending,
      };
      return json({ ok: true, ...view }, 200, cors);
    }
    if (body.action === 'ack') {
      const ids = body.certificateIds;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 || !ids.every(isUuid)) return json({ ok: false, reason: 'bad_request' }, 400, cors);
      const acked = await deps.store.ackDelivered(userId, Array.from(new Set((ids as string[]).map((i) => i.toLowerCase()))));
      return json({ ok: true, acked }, 200, cors);
    }
    return json({ ok: false, reason: 'bad_request' }, 400, cors);
  } catch (err) {
    failed('market-my', err);
    return json({ error: 'market_failed' }, 502, cors);
  }
}
