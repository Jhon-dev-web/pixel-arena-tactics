import type { CertificateView, CertKind } from '../items/types.ts';
import type { RarityId } from '../items/tables.ts';

// The wire format of the market functions, shared by the Edge Functions and the game (the client imports this file for its types; no Deno API is used here).

/** What the client may know about the chain. Public by nature: every value here is visible on solscan. */
export interface ChainPublic {
  network: 'solana';
  cluster: 'mainnet-beta' | 'devnet';
  /** the internal tag of the cluster stored with each payment (501 mainnet-beta, 502 devnet): not a protocol value */
  chainId: number;
  /** the USDC mint of this cluster (the Adventurer Pass is paid in it) */
  usdcMint: string;
  /** true only on mainnet-beta; devnet is a test network and its money is worth nothing */
  livemode: boolean;
  feePercent: number;
}

export type ListRefusal = 'bad_request' | 'no_wallet' | 'flagged' | 'price' | 'not_found' | 'already_listed' | 'not_held' | 'bound' | 'not_in_save' | 'limit_active' | 'limit_day' | 'not_enough' | 'unavailable';
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
  | 'wrong_mint'
  | 'wrong_recipient'
  | 'wrong_sender'
  | 'short_amount'
  | 'too_early'
  | 'bad_signature';

/** The payment of a reservation is ONE transaction that carries both transfers ('sale'); a second transaction for the same reservation is kept as an 'extra' owed back. */
export interface ReservationPayment {
  leg: 'sale' | 'extra';
  /** the transaction signature (base58) */
  signature: string;
  status: 'applied' | 'refund_due' | 'refunded';
}

export type ReservationStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refund_due' | 'refunded';

/** The reservation as the BUYER sees it: the amounts and the two addresses he must pay. */
export interface ReservationView {
  id: string;
  listingId: string;
  status: ReservationStatus;
  priceLamports: number;
  feeLamports: number;
  sellerLamports: number;
  /** the seller's payout address: shown ONLY to the buyer who reserved the listing */
  sellerAddress: string;
  feeAddress: string;
  buyerAddress: string;
  expiresAt: string;
  graceUntil: string;
  payments: ReservationPayment[];
  chain: ChainPublic;
}

/** What a listing holds: a certified item, or a lot of one tradeable material (kind 'material': templateId is the material id). */
export type MarketItemKind = CertKind | 'material';

export interface MarketItemView {
  kind: MarketItemKind;
  templateId: string;
  rarity: RarityId | null;
  tier: number | null;
  substats: CertificateView['substats'];
  goldAmount: number | null;
  /** a lot of a tradeable material: how many units, and the price of one unit in micro-SOL (the listing's priceLamports is the whole lot: unit x quantity x 1,000) */
  quantity?: number;
  unitPriceMicro?: number;
}

export interface MyListingView {
  id: string;
  /** null for a lot of materials */
  certificateId: string | null;
  priceLamports: number;
  status: 'open' | 'reserved' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  item: MarketItemView;
}

export interface SaleView {
  id: string;
  role: 'buyer' | 'seller';
  soldAt: string;
  priceLamports: number;
  feeLamports: number;
  sellerLamports: number;
  livemode: boolean;
  /** the signature of the one transaction that paid the seller and the game */
  signature: string;
  item: Pick<MarketItemView, 'kind' | 'templateId' | 'quantity'>;
}

export interface MarketOverview {
  wallet: { address: string; chainId: number } | null;
  chain: ChainPublic | null;
  listings: MyListingView[];
  reservation: ReservationView | null;
  /** purchases and sales, newest first */
  sales: SaleView[];
  /** reservations that ended in refund_due: the money is owed back by hand (docs/MARKET_SOLANA.md) */
  refundsDue: { reservationId: string; signatures: string[] }[];
  /** certificates the account owns that are NOT in the save yet (a purchase, a cancelled or expired listing): the game adds them from the certificate and acks */
  pending: CertificateView[];
  /** US dollars per SOL, read by the SERVER from the optional SOL_USD_PRICE_URL (cached 5 minutes), or null when none is configured: then the game shows no dollar line */
  solUsd: number | null;
}

export const LISTING_ITEM_COLUMNS = 'kind,template_id,rarity,tier,substats,gold_amount';
