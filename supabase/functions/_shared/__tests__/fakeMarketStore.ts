import { MARKET_MIN_PRICE_LAMPORTS, SOL_PRICE_STEP_LAMPORTS, splitLamports } from '../chain/solMoney.ts';
import type { CertificateView } from '../items/types.ts';
import { MARKET_RULES } from '../market/rules.ts';
import type { CancelReservationOutcome, MarketStore, OverviewRows, PassCryptoStore, PassGrantOutcome, PaymentRow, PouchFloorArgs, RecordExceptionArgs, RecordOutcome, RecordPaymentArgs, ReservationRow, ReserveOutcome, UserException } from '../market/store.ts';
import type { ListRefusal, MyListingView, ReservationPayment, SaleView } from '../market/types.ts';
import { FakeMaterialStore } from './fakeMaterialStore.ts';

// An in-memory MarketStore that follows migrations 0011 / 0012 / 0013 step by step. Every method is one atomic step (JS is single threaded between awaits and none of the bodies below has an await in the middle
// of its read-modify-write), the clock is the `nowMs` field, and each rule carries the name of the SQL function it mirrors. It is the executable specification the handler tests run against; the real
// SQL is pinned to the same shape by migration0011.test.ts.
export const MIN = 60_000;
export const DAY = 86_400_000;

export interface FakeCert extends CertificateView {
  userId: string;
  inSave: boolean;
  originCertificateId: string | null;
}

interface FakeListing {
  id: string;
  certificateId: string | null;
  /** a LOT of one tradeable material (migration 0015 part B): the units sit in the listing (escrow), not in any balance */
  materialId?: string;
  materialQty?: number;
  unitPriceMicro?: number;
  requestId?: string;
  sellerId: string;
  sellerAddress: string;
  priceLamports: number;
  status: 'open' | 'reserved' | 'sold' | 'cancelled' | 'expired';
  createdAtMs: number;
  expiresAtMs: number;
}

interface FakePayment extends PaymentRow {
  fromAddress: string;
  toAddress: string;
  amountUnits: bigint;
  blockTimeMs: number;
  chainId: number;
  livemode: boolean;
}

interface FakeSale {
  id: string;
  listingId: string;
  reservationId: string;
  certificateId: string | null;
  newCertificateId: string | null;
  materialId?: string;
  materialQty?: number;
  sellerId: string;
  buyerId: string;
  priceLamports: number;
  feeLamports: number;
  sellerLamports: number;
  signature: string;
  livemode: boolean;
  soldAtMs: number;
  itemKind: CertificateView['kind'] | 'material';
  itemTemplate: string;
}

export class FakeMarketStore implements MarketStore, PassCryptoStore {
  nowMs = Date.UTC(2026, 10, 2, 12, 0, 0);
  certs = new Map<string, FakeCert>();
  wallets = new Map<string, { address: string; chainId: number; linkedAtMs: number }>();
  walletHistory: { userId: string; address: string }[] = [];
  nonces: { userId: string; nonce: string; issuedAtMs: number; expiresAtMs: number; usedAtMs: number | null }[] = [];
  listings = new Map<string, FakeListing>();
  reservations = new Map<string, ReservationRow>();
  paid = new Map<string, FakePayment>();
  sales: FakeSale[] = [];
  events: { kind: string; userId: string | null; listingId?: string | null; reservationId?: string | null; detail?: Record<string, unknown> }[] = [];
  certEvents: { certificateId: string; event: string }[] = [];
  flagged = new Set<string>();
  verifyBudgetLeft = new Map<string, number>();
  verifyBudgetDefault = 1000;
  entitlements: { userId: string; source: string; providerRef: string; status: string; livemode: boolean }[] = [];
  intents = new Map<string, number>();
  /** the Pass references (migration 0022) */
  passRefs = new Map<string, string>();
  /** the owner's queue of unmatched payments (migration 0022): the same one-row-per-signature rule as the table */
  exceptions: (RecordExceptionArgs & { status: 'open' | 'granted' | 'refunded' | 'resolved'; claimedBy: string[] })[] = [];
  /** the balances of tradeable materials (migration 0015): the same object a test can run claim -> list -> buy on */
  materials = new FakeMaterialStore();
  private seq = 0;

  // ---- helpers ----
  private id(): string {
    this.seq++;
    const hex = (this.seq * 2654435761).toString(16).padStart(8, '0').slice(-8);
    return `${hex}-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  }

  /** Seeds a certificate for a user (held, unbound, in the save). */
  addCert(userId: string, over: Partial<FakeCert> = {}): FakeCert {
    const id = over.id ?? this.id();
    const c: FakeCert = {
      id,
      userId,
      kind: 'gear',
      templateId: 'iron_helm',
      rarity: 'epic',
      tier: 3,
      substats: [{ type: 'critRate', value: 4 }],
      upgrade: 0,
      goldAmount: null,
      source: 'forge',
      status: 'held',
      bound: false,
      createdAt: new Date(this.nowMs).toISOString(),
      contentHash: 'a'.repeat(64),
      inSave: true,
      originCertificateId: null,
      ...over,
    };
    this.certs.set(id, c);
    return c;
  }

  linkWallet(userId: string, address: string): void {
    this.wallets.set(userId, { address, chainId: 502, linkedAtMs: this.nowMs });
  }

  private view(c: FakeCert): CertificateView {
    const { userId: _u, inSave: _i, originCertificateId: _o, ...rest } = c;
    void _u;
    void _i;
    void _o;
    return rest;
  }

  private certEvent(certificateId: string, event: string): void {
    this.certEvents.push({ certificateId, event });
  }
  private log(kind: string, userId: string | null, listingId: string | null, reservationId: string | null, detail: Record<string, unknown> = {}): void {
    this.events.push({ kind, userId, listingId, reservationId, detail });
  }

  // ---- arena_private.market_release_stale (the caller holds the listing lock) ----
  private releaseStale(listingId: string): void {
    const l = this.listings.get(listingId);
    if (!l) return;
    if (l.status === 'reserved') {
      const res = [...this.reservations.values()].find((r) => r.listingId === listingId && r.status === 'pending');
      if (res) {
        const paid = [...this.paid.values()].filter((p) => p.reservationId === res.id).length;
        if (paid === 0 && res.expiresAtMs <= this.nowMs) {
          res.status = 'expired';
          l.status = 'open';
          this.log('reservation_expired', res.buyerId, listingId, res.id);
        } else if (paid > 0 && res.graceUntilMs <= this.nowMs) {
          res.status = 'refund_due';
          for (const p of this.paid.values()) if (p.reservationId === res.id && p.status === 'applied') p.status = 'refund_due';
          l.status = 'open';
          this.log('refund_due', res.buyerId, listingId, res.id, { why: 'incomplete_payment_after_grace' });
        }
      } else l.status = 'open';
    }
    if (l.status === 'open' && l.expiresAtMs <= this.nowMs) {
      l.status = 'expired';
      if (l.materialId) this.materials.deliver(l.sellerId, l.materialId, l.materialQty as number);
      else {
        const c = this.certs.get(l.certificateId as string);
        if (c && c.status === 'listed') {
          c.status = 'held';
          this.certEvent(c.id, 'unlist');
        }
      }
      this.log('listing_expired', l.sellerId, listingId, null);
    }
  }

  async expireDue(): Promise<void> {
    for (const l of [...this.listings.values()]) {
      const staleRes = l.status === 'reserved' && [...this.reservations.values()].some((r) => r.listingId === l.id && r.status === 'pending' && r.expiresAtMs <= this.nowMs);
      if ((l.status === 'open' && l.expiresAtMs <= this.nowMs) || staleRes) this.releaseStale(l.id);
    }
  }

  async takeVerifyBudget(userId: string): Promise<boolean> {
    const left = this.verifyBudgetLeft.get(userId) ?? this.verifyBudgetDefault;
    if (left < 1) return false;
    this.verifyBudgetLeft.set(userId, left - 1);
    return true;
  }

  async wallet(userId: string) {
    const w = this.wallets.get(userId);
    return w ? { address: w.address, chainId: w.chainId } : null;
  }

  // ---- market_wallet_nonce / take_nonce / set ----
  async issueNonce(userId: string, nonce: string) {
    const recent = this.nonces.filter((n) => n.userId === userId && n.issuedAtMs > this.nowMs - MARKET_RULES.nonceWindowSeconds * 1000).length;
    if (recent >= MARKET_RULES.nonceMax) return { status: 'rate_limited' as const };
    this.nonces.push({ userId, nonce, issuedAtMs: this.nowMs, expiresAtMs: this.nowMs + MARKET_RULES.nonceTtlSeconds * 1000, usedAtMs: null });
    return { status: 'ok' as const, issuedAtIso: new Date(this.nowMs).toISOString() };
  }

  async takeNonce(userId: string, nonce: string) {
    const n = this.nonces.find((x) => x.userId === userId && x.nonce === nonce && x.usedAtMs === null && x.expiresAtMs > this.nowMs);
    if (!n) return null;
    n.usedAtMs = this.nowMs;
    return new Date(n.issuedAtMs).toISOString();
  }

  async setWallet(userId: string, address: string, chainId: number) {
    const old = this.wallets.get(userId);
    if (old && old.address === address) return 'unchanged' as const;
    for (const [uid, w] of this.wallets) if (w.address === address && uid !== userId) return 'address_taken' as const;
    const busy = [...this.listings.values()].some((l) => l.sellerId === userId && (l.status === 'open' || l.status === 'reserved')) || [...this.reservations.values()].some((r) => r.buyerId === userId && r.status === 'pending');
    if (busy) return 'busy' as const;
    if (old) this.walletHistory.push({ userId, address: old.address });
    this.wallets.set(userId, { address, chainId, linkedAtMs: this.nowMs });
    return 'linked' as const;
  }

  // ---- market_list ----
  async list(userId: string, certificateId: string, priceLamports: number, pouch?: PouchFloorArgs) {
    const refuse = (reason: Exclude<ListRefusal, 'bad_request' | 'unavailable'>, floorLamports?: number) => ({ status: 'refused' as const, reason, ...(floorLamports !== undefined ? { floorLamports } : {}) });
    const w = this.wallets.get(userId);
    if (!w) return refuse('no_wallet');
    if (this.flagged.has(userId)) return refuse('flagged');
    if (priceLamports < MARKET_RULES.minPriceLamports || priceLamports > MARKET_RULES.maxPriceLamports) return refuse('price');
    const c = this.certs.get(certificateId);
    if (!c || c.userId !== userId) return refuse('not_found');
    if (c.status === 'listed') return refuse('already_listed');
    if (c.status !== 'held') return refuse('not_held');
    if (c.bound) return refuse('bound');
    if (!c.inSave) return refuse('not_in_save');
    // the Gold Pouch floor (migration 0036): the same sum as the SQL, with the numbers the handler passed in
    if (c.kind === 'gold_pouch' && pouch) {
      if (pouch.solUsdMicro === null || pouch.solUsdMicro < 1) return refuse('pouch_rate_unavailable');
      const floor = Math.max(MARKET_MIN_PRICE_LAMPORTS, Math.ceil(((c.goldAmount ?? 0) * pouch.usdMicroPer1000) / pouch.solUsdMicro) * SOL_PRICE_STEP_LAMPORTS);
      if (priceLamports < floor) return refuse('below_pouch_floor', floor);
    }
    const mine = [...this.listings.values()].filter((l) => l.sellerId === userId);
    if (mine.filter((l) => l.status === 'open' || l.status === 'reserved').length >= MARKET_RULES.maxActiveListings) return refuse('limit_active');
    if (mine.filter((l) => l.createdAtMs > this.nowMs - DAY).length >= MARKET_RULES.maxListingsPerDay) return refuse('limit_day');
    c.status = 'listed';
    c.inSave = false;
    const l: FakeListing = { id: this.id(), certificateId, sellerId: userId, sellerAddress: w.address, priceLamports, status: 'open', createdAtMs: this.nowMs, expiresAtMs: this.nowMs + MARKET_RULES.listingTtlDays * DAY };
    this.listings.set(l.id, l);
    this.certEvent(c.id, 'list');
    this.log('listed', userId, l.id, null);
    return { status: 'listed' as const, listingId: l.id, expiresAtMs: l.expiresAtMs };
  }

  // ---- market_list_material (migration 0015 part B): a LOT of one tradeable material ----
  async listMaterial(userId: string, a: { requestId: string; materialId: string; quantity: number; unitPriceMicro: number }) {
    const refuse = (reason: Exclude<ListRefusal, 'bad_request' | 'unavailable'>) => ({ status: 'refused' as const, reason });
    const old = [...this.listings.values()].find((l) => l.sellerId === userId && l.requestId === a.requestId);
    if (old) return { status: 'listed' as const, listingId: old.id, expiresAtMs: old.expiresAtMs };
    const total = a.unitPriceMicro * a.quantity * 1000;
    if (total < MARKET_RULES.minPriceLamports || total > MARKET_RULES.maxPriceLamports) return refuse('price');
    const w = this.wallets.get(userId);
    if (!w) return refuse('no_wallet');
    if (this.flagged.has(userId)) return refuse('flagged');
    const bal = this.materials.row(userId, a.materialId);
    if (bal.qty - bal.pending < a.quantity) return refuse('not_enough');
    const mine = [...this.listings.values()].filter((l) => l.sellerId === userId);
    if (mine.filter((l) => l.status === 'open' || l.status === 'reserved').length >= MARKET_RULES.maxActiveListings) return refuse('limit_active');
    if (mine.filter((l) => l.createdAtMs > this.nowMs - DAY).length >= MARKET_RULES.maxListingsPerDay) return refuse('limit_day');
    bal.qty -= a.quantity; // the escrow: the units leave the balance (pending never exceeds qty, since qty - pending >= quantity was checked)
    const l: FakeListing = { id: this.id(), certificateId: null, materialId: a.materialId, materialQty: a.quantity, unitPriceMicro: a.unitPriceMicro, requestId: a.requestId, sellerId: userId, sellerAddress: w.address, priceLamports: total, status: 'open', createdAtMs: this.nowMs, expiresAtMs: this.nowMs + MARKET_RULES.listingTtlDays * DAY };
    this.listings.set(l.id, l);
    this.log('listed', userId, l.id, null, { materialId: a.materialId, materialQty: a.quantity });
    return { status: 'listed' as const, listingId: l.id, expiresAtMs: l.expiresAtMs };
  }

  // ---- market_cancel_listing ----
  async cancelListing(userId: string, listingId: string) {
    const l = this.listings.get(listingId);
    if (!l || l.sellerId !== userId) return { status: 'not_found' as const };
    this.releaseStale(listingId);
    if (l.status === 'reserved') return { status: 'reserved' as const };
    if (l.status !== 'open') return { status: 'not_open' as const };
    l.status = 'cancelled';
    this.log('listing_cancelled', userId, listingId, null);
    if (l.materialId) {
      this.materials.deliver(userId, l.materialId, l.materialQty as number);
      return { status: 'cancelled' as const, certificateId: null, materialId: l.materialId, quantity: l.materialQty };
    }
    const c = this.certs.get(l.certificateId as string);
    if (c && c.status === 'listed') c.status = 'held';
    this.certEvent(l.certificateId as string, 'unlist');
    return { status: 'cancelled' as const, certificateId: l.certificateId as string };
  }

  // ---- market_reserve ----
  async reserve(a: { buyerId: string; listingId: string; feeAddress: string; chainId: number; livemode: boolean }): Promise<ReserveOutcome> {
    for (const r of [...this.reservations.values()]) if (r.buyerId === a.buyerId && r.status === 'pending' && r.expiresAtMs <= this.nowMs) this.releaseStale(r.listingId);
    const pending = [...this.reservations.values()].find((r) => r.buyerId === a.buyerId && r.status === 'pending');
    if (pending) return { status: 'refused', reason: 'reservation_exists', reservationId: pending.id, listingId: pending.listingId };
    const w = this.wallets.get(a.buyerId);
    if (!w) return { status: 'refused', reason: 'no_wallet' };
    const recent = [...this.reservations.values()].filter((r) => r.buyerId === a.buyerId && r.createdAtMs > this.nowMs - MARKET_RULES.reserveRateWindowSeconds * 1000).length;
    if (recent >= MARKET_RULES.reserveRateMax) return { status: 'refused', reason: 'rate_limited' };
    const l = this.listings.get(a.listingId);
    if (!l) return { status: 'refused', reason: 'not_found' };
    this.releaseStale(a.listingId);
    if (l.status === 'reserved') return { status: 'refused', reason: 'reserved' };
    if (l.status !== 'open') return { status: 'refused', reason: 'not_open' };
    if (l.sellerId === a.buyerId || l.sellerAddress === w.address) return { status: 'refused', reason: 'own_listing' };
    const split = splitLamports(l.priceLamports);
    const res: ReservationRow = {
      id: this.id(),
      listingId: l.id,
      buyerId: a.buyerId,
      buyerAddress: w.address,
      sellerAddress: l.sellerAddress,
      feeAddress: a.feeAddress,
      priceLamports: l.priceLamports,
      feeLamports: split.feeLamports,
      sellerLamports: split.sellerLamports,
      chainId: a.chainId,
      livemode: a.livemode,
      status: 'pending',
      createdAtMs: this.nowMs,
      expiresAtMs: this.nowMs + MARKET_RULES.reservationTtlMinutes * MIN,
      graceUntilMs: this.nowMs + (MARKET_RULES.reservationTtlMinutes + MARKET_RULES.graceMinutes) * MIN,
    };
    this.reservations.set(res.id, res);
    l.status = 'reserved';
    this.log('reserved', a.buyerId, l.id, res.id);
    return { status: 'reserved', reservation: { id: res.id, listingId: l.id, sellerAddress: l.sellerAddress, feeAddress: a.feeAddress, priceLamports: l.priceLamports, feeLamports: split.feeLamports, sellerLamports: split.sellerLamports, expiresAtMs: res.expiresAtMs, graceUntilMs: res.graceUntilMs } };
  }

  // ---- market_cancel_reservation ----
  async cancelReservation(buyerId: string, reservationId: string): Promise<CancelReservationOutcome> {
    const r = this.reservations.get(reservationId);
    if (!r || r.buyerId !== buyerId) return 'not_found';
    if (r.status !== 'pending') return 'not_pending';
    if ([...this.paid.values()].some((p) => p.reservationId === r.id)) return 'has_payment';
    r.status = 'cancelled';
    const l = this.listings.get(r.listingId);
    if (l && l.status === 'reserved') l.status = 'open';
    this.log('reservation_cancelled', buyerId, r.listingId, r.id);
    return 'cancelled';
  }

  async reservation(buyerId: string, reservationId: string) {
    const r = this.reservations.get(reservationId);
    return r && r.buyerId === buyerId ? { ...r } : null;
  }

  async payment(txHash: string) {
    const p = this.paid.get(txHash);
    return p ? { txHash: p.txHash, userId: p.userId, reservationId: p.reservationId, leg: p.leg, status: p.status } : null;
  }

  async payments(reservationId: string): Promise<ReservationPayment[]> {
    return [...this.paid.values()].filter((p) => p.reservationId === reservationId).map((p) => ({ leg: p.leg as ReservationPayment['leg'], signature: p.txHash, status: p.status }));
  }

  // ---- market_record_payment (migration 0013): ONE transaction pays both transfers ----
  async recordPayment(a: RecordPaymentArgs): Promise<RecordOutcome> {
    const res = this.reservations.get(a.reservationId);
    if (!res || res.buyerId !== a.buyerId) return { status: 'not_found' };
    this.releaseStale(res.listingId);
    const listing = this.listings.get(res.listingId) as FakeListing;

    // 1. the numbers must be the reservation's own: the buyer's address paid, to the seller (the fee is checked by the function), the whole price
    if (a.from !== res.buyerAddress || a.to !== res.sellerAddress || a.amountUnits < BigInt(res.priceLamports)) throw new Error('MARKET_PAYMENT_MISMATCH');

    // 3. a payment already counted for this reservation: this transaction is an extra
    let leg: FakePayment['leg'] = 'sale';
    let status: FakePayment['status'] = 'applied';
    if ([...this.paid.values()].some((p) => p.reservationId === res.id && p.leg === 'sale')) {
      leg = 'extra';
      status = 'refund_due';
    }

    // 2. the signature is consumed first
    const existing = this.paid.get(a.txHash);
    if (existing) return existing.reservationId === res.id && existing.userId === a.buyerId ? { status: 'replayed', reservationStatus: res.status } : { status: 'tx_reused' };
    const payment: FakePayment = { txHash: a.txHash, userId: a.buyerId, reservationId: res.id, leg, status, fromAddress: a.from, toAddress: a.to, amountUnits: a.amountUnits, blockTimeMs: a.blockTimeMs, chainId: res.chainId, livemode: res.livemode };
    this.paid.set(a.txHash, payment);

    if (leg === 'extra') {
      this.log('extra_payment', a.buyerId, res.listingId, res.id);
      return { status: res.status === 'paid' ? 'already_sold' : 'recorded', extra: true };
    }

    // 4. the state of the reservation
    if (res.status === 'paid') {
      payment.status = 'refund_due';
      return { status: 'already_sold' };
    }
    if (res.status === 'refund_due' || res.status === 'refunded') {
      payment.status = 'refund_due';
      this.log('refund_due', a.buyerId, res.listingId, res.id, { why: 'reservation_already_refund_due' });
      return { status: 'refund_due' };
    }
    if (res.status !== 'pending' || this.nowMs > res.expiresAtMs) {
      const hasOther = [...this.reservations.values()].some((r) => r.buyerId === a.buyerId && r.status === 'pending' && r.id !== res.id);
      if (this.nowMs <= res.graceUntilMs && (listing.status === 'open' || (listing.status === 'reserved' && res.status === 'pending')) && !hasOther) {
        res.status = 'pending';
        if (listing.status === 'open') listing.status = 'reserved';
        this.log('late_payment_accepted', a.buyerId, res.listingId, res.id);
      } else {
        // the listing goes back to 'open' ONLY if this very reservation was the one holding it
        if (res.status === 'pending' && listing.status === 'reserved') listing.status = 'open';
        res.status = 'refund_due';
        for (const p of this.paid.values()) if (p.reservationId === res.id && p.status === 'applied') p.status = 'refund_due';
        this.log('refund_due', a.buyerId, res.listingId, res.id, { why: 'late_payment_not_deliverable' });
        return { status: 'refund_due' };
      }
    }
    this.log('payment_recorded', a.buyerId, res.listingId, res.id);

    // 5. the payment is in: the sale
    if (listing.materialId) {
      const lotSale = this.id();
      this.materials.deliver(a.buyerId, listing.materialId, listing.materialQty as number);
      this.sales.push({
        id: lotSale,
        listingId: listing.id,
        reservationId: res.id,
        certificateId: null,
        newCertificateId: null,
        materialId: listing.materialId,
        materialQty: listing.materialQty,
        sellerId: listing.sellerId,
        buyerId: a.buyerId,
        priceLamports: res.priceLamports,
        feeLamports: res.feeLamports,
        sellerLamports: res.sellerLamports,
        signature: a.txHash,
        livemode: res.livemode,
        soldAtMs: this.nowMs,
        itemKind: 'material',
        itemTemplate: listing.materialId,
      });
      listing.status = 'sold';
      res.status = 'paid';
      this.log('sold', a.buyerId, listing.id, res.id, { saleId: lotSale });
      return { status: 'sold', saleId: lotSale, certificateId: null, materialId: listing.materialId, quantity: listing.materialQty };
    }
    const cert = this.certs.get(listing.certificateId as string);
    if (!cert || cert.status !== 'listed') throw new Error('MARKET_CERTIFICATE_NOT_LISTED');
    const saleId = this.id();
    cert.status = 'transferred';
    const fresh = this.addCert(a.buyerId, { kind: cert.kind, templateId: cert.templateId, rarity: cert.rarity, tier: cert.tier, substats: cert.substats, goldAmount: cert.goldAmount, source: cert.source, contentHash: cert.contentHash, inSave: false, originCertificateId: cert.id });
    this.certEvent(cert.id, 'transfer');
    this.certEvent(fresh.id, 'transfer');
    this.sales.push({
      id: saleId,
      listingId: listing.id,
      reservationId: res.id,
      certificateId: cert.id,
      newCertificateId: fresh.id,
      sellerId: listing.sellerId,
      buyerId: a.buyerId,
      priceLamports: res.priceLamports,
      feeLamports: res.feeLamports,
      sellerLamports: res.sellerLamports,
      signature: a.txHash,
      livemode: res.livemode,
      soldAtMs: this.nowMs,
      itemKind: cert.kind,
      itemTemplate: cert.templateId,
    });
    listing.status = 'sold';
    res.status = 'paid';
    this.log('sold', a.buyerId, listing.id, res.id, { saleId });
    return { status: 'sold', saleId, certificateId: fresh.id };
  }

  async overview(userId: string): Promise<OverviewRows> {
    const listings: MyListingView[] = [...this.listings.values()]
      .filter((l) => l.sellerId === userId)
      .map((l) => {
        const base = { id: l.id, certificateId: l.certificateId, priceLamports: l.priceLamports, status: l.status, createdAt: new Date(l.createdAtMs).toISOString(), expiresAt: new Date(l.expiresAtMs).toISOString() };
        if (l.materialId) return { ...base, item: { kind: 'material' as const, templateId: l.materialId, rarity: null, tier: null, substats: [], goldAmount: null, quantity: l.materialQty, unitPriceMicro: l.unitPriceMicro } };
        const c = this.certs.get(l.certificateId as string) as FakeCert;
        return { ...base, item: { kind: c.kind, templateId: c.templateId, rarity: c.rarity, tier: c.tier, substats: c.substats, goldAmount: c.goldAmount } };
      });
    const reservation = [...this.reservations.values()].find((r) => r.buyerId === userId && r.status === 'pending') ?? null;
    const sales: SaleView[] = this.sales
      .filter((s) => s.sellerId === userId || s.buyerId === userId)
      .map((s) => ({ id: s.id, role: s.sellerId === userId ? ('seller' as const) : ('buyer' as const), soldAt: new Date(s.soldAtMs).toISOString(), priceLamports: s.priceLamports, feeLamports: s.feeLamports, sellerLamports: s.sellerLamports, livemode: s.livemode, signature: s.signature, item: { kind: s.itemKind, templateId: s.itemTemplate, ...(s.itemKind === 'material' ? { quantity: s.materialQty } : {}) } }));
    const refundsDue = [...this.reservations.values()]
      .filter((r) => r.buyerId === userId && r.status === 'refund_due')
      .map((r) => ({ reservationId: r.id, signatures: [...this.paid.values()].filter((p) => p.reservationId === r.id && p.status === 'refund_due').map((p) => p.txHash) }));
    return {
      wallet: await this.wallet(userId),
      listings,
      reservation: reservation ? { ...reservation } : null,
      reservationPayments: reservation ? await this.payments(reservation.id) : [],
      sales,
      refundsDue,
      pending: [...this.certs.values()].filter((c) => c.userId === userId && !c.inSave && c.status === 'held').map((c) => this.view(c)),
    };
  }

  async ackDelivered(userId: string, ids: string[]): Promise<number> {
    let n = 0;
    for (const id of ids) {
      const c = this.certs.get(id);
      if (c && c.userId === userId && c.status === 'held' && !c.inSave) {
        c.inSave = true;
        this.certEvent(id, 'deliver');
        n++;
      }
    }
    return n;
  }

  // ---- the queue of unmatched payments (payment_exception_record / payment_exception_close) ----
  async recordException(a: RecordExceptionArgs): Promise<'recorded' | 'exists' | 'applied'> {
    if (this.paid.get(a.signature)?.status === 'applied') return 'applied';
    const had = this.exceptions.find((x) => x.signature === a.signature);
    if (had) {
      if (a.userId && had.userId !== a.userId && !had.claimedBy.includes(a.userId)) had.claimedBy.push(a.userId);
      return 'exists';
    }
    this.exceptions.push({ ...a, status: 'open', claimedBy: [] });
    return 'recorded';
  }

  async closeException(signature: string): Promise<boolean> {
    const x = this.exceptions.find((e) => e.signature === signature && e.status === 'open');
    if (!x) return false;
    x.status = 'resolved';
    return true;
  }

  async notePayer(signature: string, payer: string): Promise<void> {
    const p = this.paid.get(signature);
    if (p) p.fromAddress = payer;
  }

  async passRef(userId: string): Promise<string> {
    let ref = this.passRefs.get(userId);
    if (!ref) {
      ref = `${this.passRefs.size + 1}`.padStart(32, 'a');
      this.passRefs.set(userId, ref);
    }
    return ref;
  }

  async passRefOwner(ref: string): Promise<string | null> {
    for (const [userId, r] of this.passRefs) if (r === ref) return userId;
    return null;
  }

  async openExceptions(userId: string): Promise<UserException[]> {
    return this.exceptions.filter((x) => x.userId === userId && x.status === 'open').map((x) => ({ signature: x.signature, reason: x.reason, purpose: x.purpose, amountUnits: x.amountUnits.toString(), createdAt: new Date(this.nowMs).toISOString() }));
  }

  // ---- the USDC Pass (pass_crypto_start / pass_crypto_grant) ----
  async hasActivePass(userId: string): Promise<boolean> {
    return this.entitlements.some((e) => e.userId === userId && e.status === 'active');
  }

  async startIntent(userId: string): Promise<number> {
    const at = this.intents.get(userId);
    if (at === undefined || at < this.nowMs - MARKET_RULES.passIntentTtlHours * 3_600_000) this.intents.set(userId, this.nowMs);
    return this.intents.get(userId) as number;
  }

  async grant(a: { userId: string; txHash: string; from: string; to: string; amountUnits: bigint; requiredUnits: bigint; blockNumber: number; blockTimeMs: number; chainId: number; livemode: boolean }): Promise<PassGrantOutcome> {
    const intent = this.intents.get(a.userId);
    if (intent === undefined) return 'no_intent';
    if (a.amountUnits < a.requiredUnits || a.blockTimeMs < intent) throw new Error('PASS_CRYPTO_MISMATCH');
    const existing = this.paid.get(a.txHash);
    if (existing) return existing.userId === a.userId && existing.leg === 'pass' ? 'replayed' : 'tx_reused';
    const payment: FakePayment = { txHash: a.txHash, userId: a.userId, reservationId: null, leg: 'pass', status: 'applied', fromAddress: a.from, toAddress: a.to, amountUnits: a.amountUnits, blockTimeMs: a.blockTimeMs, chainId: a.chainId, livemode: a.livemode };
    this.paid.set(a.txHash, payment);
    if (this.entitlements.some((e) => e.userId === a.userId && e.status === 'active')) {
      payment.status = 'refund_due';
      return 'already_owned';
    }
    this.entitlements.push({ userId: a.userId, source: 'crypto_sol', providerRef: a.txHash, status: 'active', livemode: a.livemode });
    return 'granted';
  }
}
