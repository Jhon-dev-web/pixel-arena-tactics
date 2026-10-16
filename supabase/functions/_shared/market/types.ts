import type { CertificateView, CertKind } from '../items/types.ts';
import type { RarityId } from '../items/tables.ts';

// The wire format of the market functions, shared by the Edge Functions and the game (the client imports this file for its types; no Deno API is used here).

/** What the client may know about the chain. Public by nature: every number here is visible on bscscan. */
export interface ChainPublic {
  chainId: number;
  usdtContract: string;
  minConfirmations: number;
  /** true only on BSC mainnet */
  livemode: boolean;
  feePercent: number;
}

export type ListRefusal = 'bad_request' | 'no_wallet' | 'flagged' | 'price' | 'not_found' | 'already_listed' | 'not_held' | 'bound' | 'not_in_save' | 'limit_active' | 'limit_day' | 'unavailable';
export type ReserveRefusal = 'bad_request' | 'no_wallet' | 'reservation_exists' | 'rate_limited' | 'not_found' | 'reserved' | 'not_open' | 'own_listing' | 'unavailable';
export type SubmitRefusal =
  | 'bad_request'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'wrong_network'
  | 'chain_changed'
  | 'tx_reused'
  | 'rpc_error'
  | 'not_found_tx'
  | 'tx_failed'
  | 'unconfirmed'
  | 'no_transfer'
  | 'wrong_contract'
  | 'wrong_recipient'
  | 'wrong_sender'
  | 'short_amount'
  | 'too_early'
  | 'bad_hash';

export interface ReservationPayment {
  leg: 'seller' | 'fee' | 'extra';
  txHash: string;
  status: 'applied' | 'refund_due' | 'refunded';
}

export type ReservationStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refund_due' | 'refunded';

/** The reservation as the BUYER sees it: the amounts and the two addresses he must pay. */
export interface ReservationView {
  id: string;
  listingId: string;
  status: ReservationStatus;
  priceCents: number;
  feeCents: number;
  sellerCents: number;
  /** the seller's payout address: shown ONLY to the buyer who reserved the listing */
  sellerAddress: string;
  feeAddress: string;
  buyerAddress: string;
  expiresAt: string;
  graceUntil: string;
  payments: ReservationPayment[];
  chain: ChainPublic;
}

export interface MarketItemView {
  kind: CertKind;
  templateId: string;
  rarity: RarityId | null;
  tier: number | null;
  substats: CertificateView['substats'];
  goldAmount: number | null;
}

export interface MyListingView {
  id: string;
  certificateId: string;
  priceCents: number;
  status: 'open' | 'reserved' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  item: MarketItemView;
}

export interface SaleView {
  id: string;
  role: 'buyer' | 'seller';
  soldAt: string;
  priceCents: number;
  feeCents: number;
  sellerCents: number;
  livemode: boolean;
  sellerTxHash: string;
  feeTxHash: string;
  item: Pick<MarketItemView, 'kind' | 'templateId'>;
}

export interface MarketOverview {
  wallet: { address: string; chainId: number } | null;
  chain: ChainPublic | null;
  listings: MyListingView[];
  reservation: ReservationView | null;
  /** purchases and sales, newest first */
  sales: SaleView[];
  /** reservations that ended in refund_due: the money is owed back by hand (docs/MARKET_USDT.md) */
  refundsDue: { reservationId: string; txHashes: string[] }[];
  /** certificates the account owns that are NOT in the save yet (a purchase, a cancelled or expired listing): the game adds them from the certificate and acks */
  pending: CertificateView[];
}

export const LISTING_ITEM_COLUMNS = 'kind,template_id,rarity,tier,substats,gold_amount';
