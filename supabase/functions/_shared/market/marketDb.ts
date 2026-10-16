import { CERT_COLUMNS, CertRow, toCertificateView } from '../items/view.ts';
import { MARKET_RULES, MARKET_VERIFY_BUCKET } from './rules.ts';
import type { CancelReservationOutcome, MarketStore, OverviewRows, PassCryptoStore, PassGrantOutcome, PaymentRow, RecordOutcome, ReservationRow, ReserveOutcome } from './store.ts';
import { LISTING_ITEM_COLUMNS } from './types.ts';
import type { ListRefusal, MyListingView, ReservationPayment, ReservationStatus, ReserveRefusal, SaleView } from './types.ts';

// The real MarketStore / PassCryptoStore: PostgREST over fetch with the SERVICE ROLE key (injected by the Supabase Edge runtime; never logged, never returned). Values go through
// URLSearchParams / JSON, never concatenated into a filter by hand (the ids in the one `or` filter are UUIDs the handlers validated). Errors carry the status only. Every state change is
// ONE rpc = one locked transaction (migrations 0011 / 0012).
export interface MarketDbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

interface ReservationDbRow {
  id: string;
  listing_id: string;
  buyer_id: string;
  buyer_address: string;
  seller_address: string;
  fee_address: string;
  price_cents: number;
  fee_cents: number;
  seller_cents: number;
  chain_id: number;
  livemode: boolean;
  status: ReservationStatus;
  created_at: string;
  expires_at: string;
  grace_until: string;
}

const toReservation = (r: ReservationDbRow): ReservationRow => ({
  id: r.id,
  listingId: r.listing_id,
  buyerId: r.buyer_id,
  buyerAddress: r.buyer_address,
  sellerAddress: r.seller_address,
  feeAddress: r.fee_address,
  priceCents: r.price_cents,
  feeCents: r.fee_cents,
  sellerCents: r.seller_cents,
  chainId: r.chain_id,
  livemode: r.livemode,
  status: r.status,
  createdAtMs: Date.parse(r.created_at),
  expiresAtMs: Date.parse(r.expires_at),
  graceUntilMs: Date.parse(r.grace_until),
});

const RESERVATION_COLUMNS = 'id,listing_id,buyer_id,buyer_address,seller_address,fee_address,price_cents,fee_cents,seller_cents,chain_id,livemode,status,created_at,expires_at,grace_until';

function db(cfg: MarketDbConfig) {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const headers = () => ({ apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' });
  const failure = (what: string, res: Response): Error => new Error(`${what}_${res.status}`);
  return {
    async rows<T>(path: string, params: URLSearchParams, what: string): Promise<T[]> {
      const res = await doFetch(`${base}/${path}?${params}`, { headers: headers() });
      if (!res.ok) throw failure(what, res);
      return (await res.json()) as T[];
    },
    async rpc<T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> {
      const res = await doFetch(`${base}/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
      if (!res.ok) throw failure(what, res);
      return (await res.json()) as T;
    },
  };
}

type Db = ReturnType<typeof db>;

async function walletOf(d: Db, userId: string): Promise<{ address: string; chainId: number } | null> {
  const q = new URLSearchParams({ select: 'address,chain_id', user_id: `eq.${userId}`, limit: '1' });
  const rows = await d.rows<{ address: string; chain_id: number }>('market_wallets', q, 'wallet_read');
  return rows[0] ? { address: rows[0].address, chainId: rows[0].chain_id } : null;
}

async function paymentOf(d: Db, txHash: string): Promise<PaymentRow | null> {
  const q = new URLSearchParams({ select: 'tx_hash,user_id,reservation_id,leg,status', tx_hash: `eq.${txHash}`, limit: '1' });
  const rows = await d.rows<{ tx_hash: string; user_id: string; reservation_id: string | null; leg: PaymentRow['leg']; status: PaymentRow['status'] }>('chain_payments', q, 'payment_read');
  const r = rows[0];
  return r ? { txHash: r.tx_hash, userId: r.user_id, reservationId: r.reservation_id, leg: r.leg, status: r.status } : null;
}

async function paymentsOf(d: Db, reservationId: string): Promise<ReservationPayment[]> {
  const q = new URLSearchParams({ select: 'tx_hash,leg,status', reservation_id: `eq.${reservationId}`, order: 'created_at.asc' });
  const rows = await d.rows<{ tx_hash: string; leg: 'seller' | 'fee' | 'extra'; status: ReservationPayment['status'] }>('chain_payments', q, 'payments_read');
  return rows.map((r) => ({ leg: r.leg, txHash: r.tx_hash, status: r.status }));
}

async function takeBudget(d: Db, userId: string): Promise<boolean> {
  // the generic atomic bucket of migration 0010: the first look starts with an hour of refill, capped at the capacity
  const r = await d.rpc<{ ok?: unknown }>(
    'item_take_tokens',
    {
      p_user_id: userId,
      p_start_at: new Date(Date.now() - 3_600_000).toISOString(),
      p_takes: [{ bucket: MARKET_VERIFY_BUCKET, cost: 1, rate_per_hour: MARKET_RULES.verifyPerHour, capacity: MARKET_RULES.verifyCapacity, partial: false }],
    },
    'verify_budget',
  );
  return r.ok === true;
}

export function createMarketStore(cfg: MarketDbConfig): MarketStore {
  const d = db(cfg);
  return {
    async expireDue() {
      await d.rpc('market_expire_due', { p_limit: 50 }, 'expire_due');
    },
    takeVerifyBudget: (userId) => takeBudget(d, userId),
    wallet: (userId) => walletOf(d, userId),

    async issueNonce(userId, nonce) {
      const r = await d.rpc<{ status?: unknown; issued_at?: unknown }>(
        'market_wallet_nonce',
        { p_user_id: userId, p_nonce: nonce, p_ttl_seconds: MARKET_RULES.nonceTtlSeconds, p_max: MARKET_RULES.nonceMax, p_window_seconds: MARKET_RULES.nonceWindowSeconds },
        'nonce_issue',
      );
      if (r.status === 'ok' && typeof r.issued_at === 'string') return { status: 'ok', issuedAtIso: r.issued_at };
      if (r.status === 'rate_limited') return { status: 'rate_limited' };
      throw new Error('nonce_issue_bad_answer');
    },

    async takeNonce(userId, nonce) {
      const r = await d.rpc<{ status?: unknown; issued_at?: unknown }>('market_wallet_take_nonce', { p_user_id: userId, p_nonce: nonce }, 'nonce_take');
      return r.status === 'ok' && typeof r.issued_at === 'string' ? r.issued_at : null;
    },

    async setWallet(userId, address, chainId) {
      const r = await d.rpc<{ status?: unknown }>('market_wallet_set', { p_user_id: userId, p_address: address, p_chain_id: chainId }, 'wallet_set');
      if (r.status === 'linked' || r.status === 'unchanged' || r.status === 'busy' || r.status === 'address_taken') return r.status;
      throw new Error('wallet_set_bad_answer');
    },

    async list(userId, certificateId, priceCents) {
      const r = await d.rpc<{ status?: unknown; reason?: unknown; listing_id?: unknown; expires_at?: unknown }>(
        'market_list',
        {
          p_user_id: userId,
          p_certificate_id: certificateId,
          p_price_cents: priceCents,
          p_ttl_days: MARKET_RULES.listingTtlDays,
          p_max_active: MARKET_RULES.maxActiveListings,
          p_max_per_day: MARKET_RULES.maxListingsPerDay,
          p_min_cents: MARKET_RULES.minPriceCents,
          p_max_cents: MARKET_RULES.maxPriceCents,
        },
        'market_list',
      );
      if (r.status === 'listed' && typeof r.listing_id === 'string' && typeof r.expires_at === 'string') return { status: 'listed', listingId: r.listing_id, expiresAtMs: Date.parse(r.expires_at) };
      if (r.status === 'refused' && typeof r.reason === 'string') return { status: 'refused', reason: r.reason as Exclude<ListRefusal, 'bad_request' | 'unavailable'> };
      throw new Error('market_list_bad_answer');
    },

    async cancelListing(userId, listingId) {
      const r = await d.rpc<{ status?: unknown; certificate_id?: unknown }>('market_cancel_listing', { p_user_id: userId, p_listing_id: listingId }, 'market_cancel_listing');
      if (r.status === 'cancelled' && typeof r.certificate_id === 'string') return { status: 'cancelled', certificateId: r.certificate_id };
      if (r.status === 'not_found' || r.status === 'reserved' || r.status === 'not_open') return { status: r.status };
      throw new Error('market_cancel_listing_bad_answer');
    },

    async reserve(a): Promise<ReserveOutcome> {
      const r = await d.rpc<Record<string, unknown>>(
        'market_reserve',
        {
          p_buyer_id: a.buyerId,
          p_listing_id: a.listingId,
          p_fee_address: a.feeAddress,
          p_chain_id: a.chainId,
          p_livemode: a.livemode,
          p_fee_percent: MARKET_RULES.feePercent,
          p_ttl_minutes: MARKET_RULES.reservationTtlMinutes,
          p_grace_minutes: MARKET_RULES.graceMinutes,
          p_rate_max: MARKET_RULES.reserveRateMax,
          p_rate_window_seconds: MARKET_RULES.reserveRateWindowSeconds,
        },
        'market_reserve',
      );
      if (r.status === 'reserved' && typeof r.reservation_id === 'string') {
        return {
          status: 'reserved',
          reservation: {
            id: r.reservation_id,
            listingId: String(r.listing_id),
            sellerAddress: String(r.seller_address),
            feeAddress: String(r.fee_address),
            priceCents: Number(r.price_cents),
            feeCents: Number(r.fee_cents),
            sellerCents: Number(r.seller_cents),
            expiresAtMs: Date.parse(String(r.expires_at)),
            graceUntilMs: Date.parse(String(r.grace_until)),
          },
        };
      }
      if (r.status === 'refused' && typeof r.reason === 'string') {
        return { status: 'refused', reason: r.reason as Exclude<ReserveRefusal, 'bad_request' | 'unavailable'>, ...(typeof r.reservation_id === 'string' ? { reservationId: r.reservation_id } : {}), ...(typeof r.listing_id === 'string' ? { listingId: r.listing_id } : {}) };
      }
      throw new Error('market_reserve_bad_answer');
    },

    async cancelReservation(buyerId, reservationId): Promise<CancelReservationOutcome> {
      const r = await d.rpc<{ status?: unknown }>('market_cancel_reservation', { p_buyer_id: buyerId, p_reservation_id: reservationId }, 'market_cancel_reservation');
      if (r.status === 'cancelled' || r.status === 'not_found' || r.status === 'not_pending' || r.status === 'has_payment') return r.status;
      throw new Error('market_cancel_reservation_bad_answer');
    },

    async reservation(buyerId, reservationId) {
      const q = new URLSearchParams({ select: RESERVATION_COLUMNS, id: `eq.${reservationId}`, buyer_id: `eq.${buyerId}`, limit: '1' });
      const rows = await d.rows<ReservationDbRow>('market_reservations', q, 'reservation_read');
      return rows[0] ? toReservation(rows[0]) : null;
    },

    payment: (txHash) => paymentOf(d, txHash),
    payments: (reservationId) => paymentsOf(d, reservationId),

    async recordPayment(a): Promise<RecordOutcome> {
      const r = await d.rpc<Record<string, unknown>>(
        'market_record_payment',
        {
          p_buyer_id: a.buyerId,
          p_reservation_id: a.reservationId,
          p_leg: a.leg,
          p_tx_hash: a.txHash,
          p_from: a.from,
          p_to: a.to,
          p_amount_units: a.amountUnits.toString(),
          p_block_number: a.blockNumber,
          p_block_time: new Date(a.blockTimeMs).toISOString(),
        },
        'market_record_payment',
      );
      switch (r.status) {
        case 'sold':
          return { status: 'sold', saleId: String(r.sale_id), certificateId: String(r.certificate_id) };
        case 'recorded':
          return { status: 'recorded', ...(r.missing === 'seller' || r.missing === 'fee' ? { missing: r.missing } : {}), ...(r.extra === true ? { extra: true } : {}) };
        case 'replayed':
          return { status: 'replayed', reservationStatus: r.reservation_status as ReservationStatus };
        case 'refund_due':
        case 'already_sold':
        case 'tx_reused':
        case 'not_found':
          return { status: r.status };
        default:
          throw new Error('market_record_payment_bad_answer');
      }
    },

    async overview(userId): Promise<OverviewRows> {
      const wallet = await walletOf(d, userId);

      const lq = new URLSearchParams({
        select: `id,certificate_id,price_cents,status,created_at,expires_at,item_certificates(${LISTING_ITEM_COLUMNS})`,
        seller_id: `eq.${userId}`,
        order: 'created_at.desc',
        limit: '100',
      });
      const listingRows = await d.rows<{
        id: string;
        certificate_id: string;
        price_cents: number;
        status: MyListingView['status'];
        created_at: string;
        expires_at: string;
        item_certificates: { kind: MyListingView['item']['kind']; template_id: string; rarity: MyListingView['item']['rarity']; tier: number | null; substats: MyListingView['item']['substats']; gold_amount: number | null };
      }>('market_listings', lq, 'listings_read');
      const listings: MyListingView[] = listingRows.map((l) => ({
        id: l.id,
        certificateId: l.certificate_id,
        priceCents: l.price_cents,
        status: l.status,
        createdAt: l.created_at,
        expiresAt: l.expires_at,
        item: { kind: l.item_certificates.kind, templateId: l.item_certificates.template_id, rarity: l.item_certificates.rarity, tier: l.item_certificates.tier, substats: l.item_certificates.substats ?? [], goldAmount: l.item_certificates.gold_amount },
      }));

      const rq = new URLSearchParams({ select: RESERVATION_COLUMNS, buyer_id: `eq.${userId}`, status: 'eq.pending', limit: '1' });
      const pendingRows = await d.rows<ReservationDbRow>('market_reservations', rq, 'reservation_read');
      const reservation = pendingRows[0] ? toReservation(pendingRows[0]) : null;
      const reservationPayments = reservation ? await paymentsOf(d, reservation.id) : [];

      const sq = new URLSearchParams({
        select: 'id,seller_id,buyer_id,price_cents,fee_cents,seller_cents,livemode,sold_at,seller_tx_hash,fee_tx_hash,item_kind,item_template',
        or: `(seller_id.eq.${userId},buyer_id.eq.${userId})`,
        order: 'sold_at.desc',
        limit: '100',
      });
      const saleRows = await d.rows<{ id: string; seller_id: string; buyer_id: string; price_cents: number; fee_cents: number; seller_cents: number; livemode: boolean; sold_at: string; seller_tx_hash: string; fee_tx_hash: string; item_kind: MyListingView['item']['kind']; item_template: string }>(
        'market_sales',
        sq,
        'sales_read',
      );
      const sales: SaleView[] = saleRows.map((s) => ({
        id: s.id,
        role: s.seller_id === userId ? 'seller' : 'buyer',
        soldAt: s.sold_at,
        priceCents: s.price_cents,
        feeCents: s.fee_cents,
        sellerCents: s.seller_cents,
        livemode: s.livemode,
        sellerTxHash: s.seller_tx_hash,
        feeTxHash: s.fee_tx_hash,
        item: { kind: s.item_kind, templateId: s.item_template },
      }));

      const fq = new URLSearchParams({ select: 'id', buyer_id: `eq.${userId}`, status: 'eq.refund_due', order: 'created_at.desc', limit: '20' });
      const due = await d.rows<{ id: string }>('market_reservations', fq, 'refunds_read');
      const refundsDue = await Promise.all(due.map(async (x) => ({ reservationId: x.id, txHashes: (await paymentsOf(d, x.id)).filter((p) => p.status === 'refund_due').map((p) => p.txHash) })));

      const cq = new URLSearchParams({ select: CERT_COLUMNS, user_id: `eq.${userId}`, in_save: 'eq.false', status: 'eq.held', order: 'created_at.asc', limit: '100' });
      const pending = (await d.rows<CertRow>('item_certificates', cq, 'pending_read')).map(toCertificateView);

      return { wallet, listings, reservation, reservationPayments, sales, refundsDue, pending };
    },

    async ackDelivered(userId, ids) {
      return d.rpc<number>('market_deliver_ack', { p_user_id: userId, p_ids: ids }, 'deliver_ack');
    },
  };
}

// ---- the USDT Pass ------------------------------------------------------------------------------------------------------------------------------------------------

export function createPassCryptoStore(cfg: MarketDbConfig): PassCryptoStore {
  const d = db(cfg);
  return {
    async hasActivePass(userId) {
      const q = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, kind: 'eq.adventurer_pass', status: 'eq.active', limit: '1' });
      return (await d.rows<unknown>('entitlements', q, 'entitlement_read')).length > 0;
    },
    wallet: (userId) => walletOf(d, userId),
    async startIntent(userId) {
      const at = await d.rpc<string>('pass_crypto_start', { p_user_id: userId, p_ttl_hours: MARKET_RULES.passIntentTtlHours }, 'pass_start');
      const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN;
      if (!Number.isFinite(ms)) throw new Error('pass_start_bad_answer');
      return ms;
    },
    takeVerifyBudget: (userId) => takeBudget(d, userId),
    payment: (txHash) => paymentOf(d, txHash),
    async grant(a): Promise<PassGrantOutcome> {
      const r = await d.rpc<{ status?: unknown }>(
        'pass_crypto_grant',
        {
          p_user_id: a.userId,
          p_tx_hash: a.txHash,
          p_from: a.from,
          p_to: a.to,
          p_amount_units: a.amountUnits.toString(),
          p_required_units: a.requiredUnits.toString(),
          p_block_number: a.blockNumber,
          p_block_time: new Date(a.blockTimeMs).toISOString(),
          p_chain_id: a.chainId,
          p_livemode: a.livemode,
        },
        'pass_grant',
      );
      if (r.status === 'granted' || r.status === 'already_owned' || r.status === 'tx_reused' || r.status === 'replayed' || r.status === 'no_intent') return r.status;
      throw new Error('pass_grant_bad_answer');
    },
  };
}
