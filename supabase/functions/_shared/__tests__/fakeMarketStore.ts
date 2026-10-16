import { splitPrice } from '../chain/money.ts';
import type { CertificateView } from '../items/types.ts';
import { MARKET_RULES } from '../market/rules.ts';
import type { CancelReservationOutcome, MarketStore, OverviewRows, PassCryptoStore, PassGrantOutcome, PaymentRow, RecordOutcome, RecordPaymentArgs, ReservationRow, ReserveOutcome } from '../market/store.ts';
import type { ListRefusal, MyListingView, ReservationPayment, SaleView } from '../market/types.ts';

// An in-memory MarketStore that follows migration 0011 / 0012 step by step. Every method is one atomic step (JS is single threaded between awaits and none of the bodies below has an await in the middle
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
  certificateId: string;
  sellerId: string;
  sellerAddress: string;
  priceCents: number;
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
  certificateId: string;
  newCertificateId: string;
  sellerId: string;
  buyerId: string;
  priceCents: number;
  feeCents: number;
  sellerCents: number;
  sellerTxHash: string;
  feeTxHash: string;
  livemode: boolean;
  soldAtMs: number;
  itemKind: CertificateView['kind'];
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
    this.wallets.set(userId, { address, chainId: 97, linkedAtMs: this.nowMs });
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
      const c = this.certs.get(l.certificateId);
      if (c && c.status === 'listed') {
        c.status = 'held';
        this.certEvent(c.id, 'unlist');
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
  async list(userId: string, certificateId: string, priceCents: number) {
    const refuse = (reason: Exclude<ListRefusal, 'bad_request' | 'unavailable'>) => ({ status: 'refused' as const, reason });
    const w = this.wallets.get(userId);
    if (!w) return refuse('no_wallet');
    if (this.flagged.has(userId)) return refuse('flagged');
    if (priceCents < MARKET_RULES.minPriceCents || priceCents > MARKET_RULES.maxPriceCents) return refuse('price');
    const c = this.certs.get(certificateId);
    if (!c || c.userId !== userId) return refuse('not_found');
    if (c.status === 'listed') return refuse('already_listed');
    if (c.status !== 'held') return refuse('not_held');
    if (c.bound) return refuse('bound');
    if (!c.inSave) return refuse('not_in_save');
    const mine = [...this.listings.values()].filter((l) => l.sellerId === userId);
    if (mine.filter((l) => l.status === 'open' || l.status === 'reserved').length >= MARKET_RULES.maxActiveListings) return refuse('limit_active');
    if (mine.filter((l) => l.createdAtMs > this.nowMs - DAY).length >= MARKET_RULES.maxListingsPerDay) return refuse('limit_day');
    c.status = 'listed';
    c.inSave = false;
    const l: FakeListing = { id: this.id(), certificateId, sellerId: userId, sellerAddress: w.address, priceCents, status: 'open', createdAtMs: this.nowMs, expiresAtMs: this.nowMs + MARKET_RULES.listingTtlDays * DAY };
    this.listings.set(l.id, l);
    this.certEvent(c.id, 'list');
    this.log('listed', userId, l.id, null);
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
    const c = this.certs.get(l.certificateId);
    if (c && c.status === 'listed') c.status = 'held';
    this.certEvent(l.certificateId, 'unlist');
    this.log('listing_cancelled', userId, listingId, null);
    return { status: 'cancelled' as const, certificateId: l.certificateId };
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
    const split = splitPrice(l.priceCents);
    const res: ReservationRow = {
      id: this.id(),
      listingId: l.id,
      buyerId: a.buyerId,
      buyerAddress: w.address,
      sellerAddress: l.sellerAddress,
      feeAddress: a.feeAddress,
      priceCents: l.priceCents,
      feeCents: split.feeCents,
      sellerCents: split.sellerCents,
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
    return { status: 'reserved', reservation: { id: res.id, listingId: l.id, sellerAddress: l.sellerAddress, feeAddress: a.feeAddress, priceCents: l.priceCents, feeCents: split.feeCents, sellerCents: split.sellerCents, expiresAtMs: res.expiresAtMs, graceUntilMs: res.graceUntilMs } };
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
    return [...this.paid.values()].filter((p) => p.reservationId === reservationId).map((p) => ({ leg: p.leg as ReservationPayment['leg'], txHash: p.txHash, status: p.status }));
  }

  // ---- market_record_payment ----
  async recordPayment(a: RecordPaymentArgs): Promise<RecordOutcome> {
    const res0 = this.reservations.get(a.reservationId);
    if (!res0 || res0.buyerId !== a.buyerId) return { status: 'not_found' };
    const res = res0;
    this.releaseStale(res.listingId);
    const listing = this.listings.get(res.listingId) as FakeListing;

    // 1. the numbers must be the reservation's own
    const expectedTo = a.leg === 'seller' ? res.sellerAddress : res.feeAddress;
    const expectedUnits = BigInt(a.leg === 'seller' ? res.sellerCents : res.feeCents) * 10_000_000_000_000_000n;
    if (a.from !== res.buyerAddress || a.to !== expectedTo || a.amountUnits < expectedUnits) throw new Error('MARKET_PAYMENT_MISMATCH');

    // 3. a leg already paid: this transfer is an extra
    let leg: FakePayment['leg'] = a.leg;
    let status: FakePayment['status'] = 'applied';
    if ([...this.paid.values()].some((p) => p.reservationId === res.id && p.leg === a.leg)) {
      leg = 'extra';
      status = 'refund_due';
    }

    // 2. the hash is consumed first
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

    // 5. both legs in: the sale
    const applied = (l: 'seller' | 'fee') => [...this.paid.values()].find((p) => p.reservationId === res.id && p.leg === l && p.status === 'applied');
    const sellerPay = applied('seller');
    const feePay = applied('fee');
    if (!sellerPay || !feePay) return { status: 'recorded', missing: sellerPay ? 'fee' : 'seller' };

    const cert = this.certs.get(listing.certificateId);
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
      priceCents: res.priceCents,
      feeCents: res.feeCents,
      sellerCents: res.sellerCents,
      sellerTxHash: sellerPay.txHash,
      feeTxHash: feePay.txHash,
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
        const c = this.certs.get(l.certificateId) as FakeCert;
        return { id: l.id, certificateId: l.certificateId, priceCents: l.priceCents, status: l.status, createdAt: new Date(l.createdAtMs).toISOString(), expiresAt: new Date(l.expiresAtMs).toISOString(), item: { kind: c.kind, templateId: c.templateId, rarity: c.rarity, tier: c.tier, substats: c.substats, goldAmount: c.goldAmount } };
      });
    const reservation = [...this.reservations.values()].find((r) => r.buyerId === userId && r.status === 'pending') ?? null;
    const sales: SaleView[] = this.sales
      .filter((s) => s.sellerId === userId || s.buyerId === userId)
      .map((s) => ({ id: s.id, role: s.sellerId === userId ? ('seller' as const) : ('buyer' as const), soldAt: new Date(s.soldAtMs).toISOString(), priceCents: s.priceCents, feeCents: s.feeCents, sellerCents: s.sellerCents, livemode: s.livemode, sellerTxHash: s.sellerTxHash, feeTxHash: s.feeTxHash, item: { kind: s.itemKind, templateId: s.itemTemplate } }));
    const refundsDue = [...this.reservations.values()]
      .filter((r) => r.buyerId === userId && r.status === 'refund_due')
      .map((r) => ({ reservationId: r.id, txHashes: [...this.paid.values()].filter((p) => p.reservationId === r.id && p.status === 'refund_due').map((p) => p.txHash) }));
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

  // ---- the USDT Pass (pass_crypto_start / pass_crypto_grant) ----
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
    this.entitlements.push({ userId: a.userId, source: 'crypto_bsc', providerRef: a.txHash, status: 'active', livemode: a.livemode });
    return 'granted';
  }
}
