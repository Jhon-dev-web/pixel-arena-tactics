import { CERT_COLUMNS, CertRow, toCertificateView } from '../items/view.ts';
import { MARKET_RULES, MARKET_VERIFY_BUCKET } from './rules.ts';
import type { CancelReservationOutcome, MarketStore, OverviewRows, PassCryptoStore, PassGrantOutcome, PaymentExceptionStore, PaymentRow, RecordExceptionArgs, RecordOutcome, ReservationRow, ReserveOutcome, UserException } from './store.ts';
import { LISTING_ITEM_COLUMNS } from './types.ts';
import type { ListRefusal, MyListingView, ReservationPayment, ReservationStatus, ReserveRefusal, SaleView } from './types.ts';

// The real MarketStore / PassCryptoStore (migrations 0011 / 0012 / 0013; the chain_payments.tx_hash column holds the Solana transaction SIGNATURE): PostgREST over fetch with the SERVICE ROLE key (injected by the Supabase Edge runtime; never logged, never returned). Values go through
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
  price_lamports: number;
  fee_lamports: number;
  seller_lamports: number;
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
  priceLamports: r.price_lamports,
  feeLamports: r.fee_lamports,
  sellerLamports: r.seller_lamports,
  chainId: r.chain_id,
  livemode: r.livemode,
  status: r.status,
  createdAtMs: Date.parse(r.created_at),
  expiresAtMs: Date.parse(r.expires_at),
  graceUntilMs: Date.parse(r.grace_until),
});

const RESERVATION_COLUMNS = 'id,listing_id,buyer_id,buyer_address,seller_address,fee_address,price_lamports,fee_lamports,seller_lamports,chain_id,livemode,status,created_at,expires_at,grace_until';

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
  const rows = await d.rows<{ tx_hash: string; leg: string; status: ReservationPayment['status'] }>('chain_payments', q, 'payments_read');
  return rows.map((r) => ({ leg: r.leg === 'extra' ? ('extra' as const) : ('sale' as const), signature: r.tx_hash, status: r.status }));
}

/** The two calls both stores share: write an unmatched payment to the owner's queue (migration 0022), and close the row when the payment is matched after all. */
function exceptionFns(d: Db): PaymentExceptionStore {
  return {
    async recordException(a: RecordExceptionArgs) {
      const r = await d.rpc<{ status?: unknown }>(
        'payment_exception_record',
        {
          p_signature: a.signature,
          p_chain_id: a.chainId,
          p_livemode: a.livemode,
          p_purpose: a.purpose,
          p_reason: a.reason,
          p_user_id: a.userId,
          p_reservation_id: a.reservationId,
          p_payer: a.payer,
          p_receiver: a.receiver,
          p_amount_units: a.amountUnits.toString(),
          p_memo: a.memo,
          p_block_time: a.blockTimeMs === null ? null : new Date(a.blockTimeMs).toISOString(),
        },
        'exception_record',
      );
      if (r.status === 'recorded' || r.status === 'exists' || r.status === 'applied') return r.status;
      throw new Error('exception_record_bad_answer');
    },
    async closeException(signature: string) {
      return (await d.rpc<unknown>('payment_exception_close', { p_signature: signature }, 'exception_close')) === true;
    },
    async notePayer(signature: string, payer: string) {
      await d.rpc<unknown>('chain_payment_set_payer', { p_tx_hash: signature, p_payer: payer }, 'payer_note');
    },
  };
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
    ...exceptionFns(d),
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

    async list(userId, certificateId, priceLamports) {
      const r = await d.rpc<{ status?: unknown; reason?: unknown; listing_id?: unknown; expires_at?: unknown }>(
        'market_list',
        {
          p_user_id: userId,
          p_certificate_id: certificateId,
          p_price_lamports: priceLamports,
          p_ttl_days: MARKET_RULES.listingTtlDays,
          p_max_active: MARKET_RULES.maxActiveListings,
          p_max_per_day: MARKET_RULES.maxListingsPerDay,
          p_min_lamports: MARKET_RULES.minPriceLamports,
          p_max_lamports: MARKET_RULES.maxPriceLamports,
        },
        'market_list',
      );
      if (r.status === 'listed' && typeof r.listing_id === 'string' && typeof r.expires_at === 'string') return { status: 'listed', listingId: r.listing_id, expiresAtMs: Date.parse(r.expires_at) };
      if (r.status === 'refused' && typeof r.reason === 'string') return { status: 'refused', reason: r.reason as Exclude<ListRefusal, 'bad_request' | 'unavailable'> };
      throw new Error('market_list_bad_answer');
    },

    async listMaterial(userId, a) {
      const r = await d.rpc<{ status?: unknown; reason?: unknown; listing_id?: unknown; expires_at?: unknown }>(
        'market_list_material',
        {
          p_user_id: userId,
          p_request_id: a.requestId,
          p_material_id: a.materialId,
          p_qty: a.quantity,
          p_unit_price_micro: a.unitPriceMicro,
          p_ttl_days: MARKET_RULES.listingTtlDays,
          p_max_active: MARKET_RULES.maxActiveListings,
          p_max_per_day: MARKET_RULES.maxListingsPerDay,
          p_min_lamports: MARKET_RULES.minPriceLamports,
          p_max_lamports: MARKET_RULES.maxPriceLamports,
          p_max_qty: MARKET_RULES.maxMaterialQtyPerListing,
        },
        'market_list_material',
      );
      if (r.status === 'listed' && typeof r.listing_id === 'string' && typeof r.expires_at === 'string') return { status: 'listed', listingId: r.listing_id, expiresAtMs: Date.parse(r.expires_at) };
      if (r.status === 'refused' && typeof r.reason === 'string') return { status: 'refused', reason: r.reason as Exclude<ListRefusal, 'bad_request' | 'unavailable'> };
      throw new Error('market_list_material_bad_answer');
    },

    async cancelListing(userId, listingId) {
      const r = await d.rpc<{ status?: unknown; certificate_id?: unknown; material_id?: unknown; material_qty?: unknown }>('market_cancel_listing', { p_user_id: userId, p_listing_id: listingId }, 'market_cancel_listing');
      if (r.status === 'cancelled' && typeof r.material_id === 'string') return { status: 'cancelled', certificateId: null, materialId: r.material_id, quantity: Number(r.material_qty) };
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
            priceLamports: Number(r.price_lamports),
            feeLamports: Number(r.fee_lamports),
            sellerLamports: Number(r.seller_lamports),
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
          return typeof r.material_id === 'string'
            ? { status: 'sold', saleId: String(r.sale_id), certificateId: null, materialId: r.material_id, quantity: Number(r.material_qty) }
            : { status: 'sold', saleId: String(r.sale_id), certificateId: String(r.certificate_id) };
        case 'recorded':
          return { status: 'recorded', ...(r.extra === true ? { extra: true } : {}) };
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
        select: `id,certificate_id,material_id,material_qty,unit_price_micro,price_lamports,status,created_at,expires_at,item_certificates(${LISTING_ITEM_COLUMNS})`,
        seller_id: `eq.${userId}`,
        order: 'created_at.desc',
        limit: '100',
      });
      const listingRows = await d.rows<{
        id: string;
        certificate_id: string | null;
        material_id: string | null;
        material_qty: number | null;
        unit_price_micro: number | null;
        price_lamports: number;
        status: MyListingView['status'];
        created_at: string;
        expires_at: string;
        item_certificates: { kind: MyListingView['item']['kind']; template_id: string; rarity: MyListingView['item']['rarity']; tier: number | null; substats: MyListingView['item']['substats']; gold_amount: number | null } | null;
      }>('market_listings', lq, 'listings_read');
      const listings: MyListingView[] = listingRows.map((l) => ({
        id: l.id,
        certificateId: l.certificate_id,
        priceLamports: l.price_lamports,
        status: l.status,
        createdAt: l.created_at,
        expiresAt: l.expires_at,
        // a lot of materials has no certificate: its item is the material, the quantity and the price of one unit
        item: l.item_certificates
          ? { kind: l.item_certificates.kind, templateId: l.item_certificates.template_id, rarity: l.item_certificates.rarity, tier: l.item_certificates.tier, substats: l.item_certificates.substats ?? [], goldAmount: l.item_certificates.gold_amount }
          : { kind: 'material', templateId: l.material_id ?? '', rarity: null, tier: null, substats: [], goldAmount: null, quantity: l.material_qty ?? 0, unitPriceMicro: l.unit_price_micro ?? 0 },
      }));

      const rq = new URLSearchParams({ select: RESERVATION_COLUMNS, buyer_id: `eq.${userId}`, status: 'eq.pending', limit: '1' });
      const pendingRows = await d.rows<ReservationDbRow>('market_reservations', rq, 'reservation_read');
      const reservation = pendingRows[0] ? toReservation(pendingRows[0]) : null;
      const reservationPayments = reservation ? await paymentsOf(d, reservation.id) : [];

      const sq = new URLSearchParams({
        select: 'id,seller_id,buyer_id,price_lamports,fee_lamports,seller_lamports,livemode,sold_at,tx_signature,item_kind,item_template,material_qty',
        or: `(seller_id.eq.${userId},buyer_id.eq.${userId})`,
        order: 'sold_at.desc',
        limit: '100',
      });
      const saleRows = await d.rows<{ id: string; seller_id: string; buyer_id: string; price_lamports: number; fee_lamports: number; seller_lamports: number; livemode: boolean; sold_at: string; tx_signature: string; item_kind: MyListingView['item']['kind']; item_template: string; material_qty: number | null }>(
        'market_sales',
        sq,
        'sales_read',
      );
      const sales: SaleView[] = saleRows.map((s) => ({
        id: s.id,
        role: s.seller_id === userId ? 'seller' : 'buyer',
        soldAt: s.sold_at,
        priceLamports: s.price_lamports,
        feeLamports: s.fee_lamports,
        sellerLamports: s.seller_lamports,
        livemode: s.livemode,
        signature: s.tx_signature,
        item: { kind: s.item_kind, templateId: s.item_template, ...(s.item_kind === 'material' ? { quantity: s.material_qty ?? 0 } : {}) },
      }));

      const fq = new URLSearchParams({ select: 'id', buyer_id: `eq.${userId}`, status: 'eq.refund_due', order: 'created_at.desc', limit: '20' });
      const due = await d.rows<{ id: string }>('market_reservations', fq, 'refunds_read');
      const refundsDue = await Promise.all(due.map(async (x) => ({ reservationId: x.id, signatures: (await paymentsOf(d, x.id)).filter((p) => p.status === 'refund_due').map((p) => p.signature) })));

      const cq = new URLSearchParams({ select: CERT_COLUMNS, user_id: `eq.${userId}`, in_save: 'eq.false', status: 'eq.held', order: 'created_at.asc', limit: '100' });
      const pending = (await d.rows<CertRow>('item_certificates', cq, 'pending_read')).map(toCertificateView);

      return { wallet, listings, reservation, reservationPayments, sales, refundsDue, pending };
    },

    async ackDelivered(userId, ids) {
      return d.rpc<number>('market_deliver_ack', { p_user_id: userId, p_ids: ids }, 'deliver_ack');
    },
  };
}

// ---- the USDC Pass ------------------------------------------------------------------------------------------------------------------------------------------------

export function createPassCryptoStore(cfg: MarketDbConfig): PassCryptoStore {
  const d = db(cfg);
  return {
    ...exceptionFns(d),
    async passRef(userId) {
      const ref = await d.rpc<unknown>('pass_crypto_ref', { p_user_id: userId }, 'pass_ref');
      if (typeof ref !== 'string' || !/^[0-9a-f]{32}$/.test(ref)) throw new Error('pass_ref_bad_answer');
      return ref;
    },
    async passRefOwner(ref) {
      const q = new URLSearchParams({ select: 'user_id', ref: `eq.${ref}`, limit: '1' });
      const rows = await d.rows<{ user_id: string }>('pass_payment_refs', q, 'pass_ref_read');
      return rows[0]?.user_id ?? null;
    },
    async openExceptions(userId) {
      const q = new URLSearchParams({ select: 'signature,reason,purpose,amount_units,created_at', user_id: `eq.${userId}`, status: 'eq.open', order: 'created_at.desc', limit: '20' });
      const rows = await d.rows<{ signature: string; reason: UserException['reason']; purpose: UserException['purpose']; amount_units: string | number; created_at: string }>('payment_exceptions', q, 'exceptions_read');
      return rows.map((r) => ({ signature: r.signature, reason: r.reason, purpose: r.purpose, amountUnits: String(r.amount_units), createdAt: r.created_at }));
    },
    async hasActivePass(userId) {
      // Migration 0025: a Pass counts only while it covers the current season (an ended one can be bought again).
      return (await d.rpc<unknown>('pass_owned_now', { p_user_id: userId }, 'entitlement_read')) === true;
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
