import type { CertificateView } from '../items/types.ts';
import type { ListRefusal, MyListingView, ReservationPayment, ReservationStatus, ReserveRefusal, SaleView } from './types.ts';

// What the market handlers need from the database. The real one (marketDb.ts) calls the SQL functions of migrations 0011 / 0012 / 0013 with the service role; the tests use an in-memory fake
// that follows the same state machine. Every method that changes state is ONE call = ONE locked transaction in the database.

export interface ReservationRow {
  id: string;
  listingId: string;
  buyerId: string;
  buyerAddress: string;
  sellerAddress: string;
  feeAddress: string;
  priceLamports: number;
  feeLamports: number;
  sellerLamports: number;
  chainId: number;
  livemode: boolean;
  status: ReservationStatus;
  createdAtMs: number;
  expiresAtMs: number;
  graceUntilMs: number;
}

export interface PaymentRow {
  /** the transaction signature (stored in the chain_payments.tx_hash column, the primary key) */
  txHash: string;
  userId: string;
  reservationId: string | null;
  leg: ReservationPayment['leg'] | 'pass';
  status: ReservationPayment['status'];
}

export type ReserveOutcome =
  | {
      status: 'reserved';
      reservation: { id: string; listingId: string; sellerAddress: string; feeAddress: string; priceLamports: number; feeLamports: number; sellerLamports: number; expiresAtMs: number; graceUntilMs: number };
    }
  | { status: 'refused'; reason: Exclude<ReserveRefusal, 'bad_request' | 'unavailable'>; reservationId?: string; listingId?: string };

export type CancelReservationOutcome = 'cancelled' | 'not_found' | 'not_pending' | 'has_payment';

/** ONE verified transaction that carries both transfers (the seller's share and the game's fee). amountUnits = the lamports paid to the seller and to the fee address together. */
export interface RecordPaymentArgs {
  buyerId: string;
  reservationId: string;
  txHash: string;
  from: string;
  /** the seller's address */
  to: string;
  amountUnits: bigint;
  /** the slot */
  blockNumber: number;
  blockTimeMs: number;
}

export type RecordOutcome =
  | { status: 'recorded'; extra?: boolean }
  | { status: 'sold'; saleId: string; certificateId: string | null; materialId?: string; quantity?: number }
  | { status: 'refund_due' | 'already_sold' | 'tx_reused' | 'not_found' }
  | { status: 'replayed'; reservationStatus: ReservationStatus };

export interface OverviewRows {
  wallet: { address: string; chainId: number } | null;
  listings: MyListingView[];
  reservation: ReservationRow | null;
  reservationPayments: ReservationPayment[];
  sales: SaleView[];
  refundsDue: { reservationId: string; signatures: string[] }[];
  pending: CertificateView[];
}

export interface MarketStore {
  /** sweeps stale reservations and expired listings (best effort; every read path also tidies what it touches) */
  expireDue(): Promise<void>;
  /** the atomic verification budget (bucket market_verify): false = over it */
  takeVerifyBudget(userId: string): Promise<boolean>;

  wallet(userId: string): Promise<{ address: string; chainId: number } | null>;
  issueNonce(userId: string, nonce: string): Promise<{ status: 'ok'; issuedAtIso: string } | { status: 'rate_limited' }>;
  /** consumes the nonce (one atomic statement); the issue time of the nonce, or null when it is unknown, used, expired or another user's */
  takeNonce(userId: string, nonce: string): Promise<string | null>;
  setWallet(userId: string, address: string, chainId: number): Promise<'linked' | 'unchanged' | 'busy' | 'address_taken'>;

  list(userId: string, certificateId: string, priceLamports: number): Promise<{ status: 'listed'; listingId: string; expiresAtMs: number } | { status: 'refused'; reason: Exclude<ListRefusal, 'bad_request' | 'unavailable'> }>;
  /** Lists a LOT of one tradeable material: the units leave the seller's balance into escrow in the listing (migration 0015). `requestId` makes a retry return the same listing. */
  listMaterial(userId: string, args: { requestId: string; materialId: string; quantity: number; unitPriceMicro: number }): Promise<{ status: 'listed'; listingId: string; expiresAtMs: number } | { status: 'refused'; reason: Exclude<ListRefusal, 'bad_request' | 'unavailable'> }>;
  /** A cancelled listing returns an item (certificate) or the units of a lot of materials to the seller (as a delivery the game collects). */
  cancelListing(userId: string, listingId: string): Promise<{ status: 'cancelled'; certificateId: string | null; materialId?: string; quantity?: number } | { status: 'not_found' | 'reserved' | 'not_open' }>;

  reserve(args: { buyerId: string; listingId: string; feeAddress: string; chainId: number; livemode: boolean }): Promise<ReserveOutcome>;
  cancelReservation(buyerId: string, reservationId: string): Promise<CancelReservationOutcome>;
  reservation(buyerId: string, reservationId: string): Promise<ReservationRow | null>;
  payment(txHash: string): Promise<PaymentRow | null>;
  payments(reservationId: string): Promise<ReservationPayment[]>;
  recordPayment(args: RecordPaymentArgs): Promise<RecordOutcome>;

  overview(userId: string): Promise<OverviewRows>;
  /** marks the account's held, out-of-save certificates as collected into the save; returns how many changed */
  ackDelivered(userId: string, ids: string[]): Promise<number>;
}

// ---- the USDC Pass ------------------------------------------------------------------------------------------------------------------------------------------------

export type PassGrantOutcome = 'granted' | 'already_owned' | 'tx_reused' | 'replayed' | 'no_intent';

export interface PassCryptoStore {
  hasActivePass(userId: string): Promise<boolean>;
  wallet(userId: string): Promise<{ address: string; chainId: number } | null>;
  /** the moment payments are counted from (the existing intent while it is young, else a new one) */
  startIntent(userId: string): Promise<number>;
  takeVerifyBudget(userId: string): Promise<boolean>;
  payment(txHash: string): Promise<PaymentRow | null>;
  grant(args: { userId: string; txHash: string; from: string; to: string; amountUnits: bigint; requiredUnits: bigint; blockNumber: number; blockTimeMs: number; chainId: number; livemode: boolean }): Promise<PassGrantOutcome>;
}
