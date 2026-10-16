import { supabase } from '../../lib/supabaseClient';
import type { ChainPublic, MarketOverview, ReservationView } from '../../../supabase/functions/_shared/market/types';

// The game's calls to the market Edge Functions (supabase/functions/market-*, pass-crypto). The user id is NEVER sent: the JWT supabase-js attaches is the only identity. Money amounts and
// addresses come FROM the server (a reservation); the game never decides what a payment must be. If the server cannot be reached the call throws MarketUnreachable and nothing changes.

export class MarketUnreachable extends Error {
  constructor(detail: string) {
    super(`market_unreachable:${detail}`);
    this.name = 'MarketUnreachable';
  }
}

export interface MarketAnswer {
  status: number;
  body: Record<string, unknown>;
}
export type MarketFn = 'market-wallet' | 'market-list' | 'market-buy' | 'market-my' | 'pass-crypto';
export type MarketTransport = (fn: MarketFn, body: object) => Promise<MarketAnswer>;

export const supabaseMarketTransport: MarketTransport = async (fn, body) => {
  if (!supabase) throw new MarketUnreachable('not_configured');
  const { data, error } = await supabase.functions.invoke(fn, { method: 'POST', body });
  if (!error) return { status: 200, body: (data ?? {}) as Record<string, unknown> };
  const ctx = (error as { context?: unknown }).context;
  if (typeof Response !== 'undefined' && ctx instanceof Response) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = ((await ctx.json()) ?? {}) as Record<string, unknown>;
    } catch {
      /* no JSON body */
    }
    return { status: ctx.status, body: parsed };
  }
  throw new MarketUnreachable('network');
};

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string; status: number; extra?: Record<string, unknown> };

/** What the Pass payment needs: the price in USDC units, the receiving wallet and both USDC token accounts (the server derives them). */
export interface PassPlan {
  priceUnits: number;
  priceUsdc: string;
  decimals: number;
  receiveAddress: string;
  receiverTokenAccount: string;
  buyerAddress: string;
  buyerTokenAccount: string;
  intentAt: string;
  chain: ChainPublic;
}

export interface MarketApi {
  walletStatus(): Promise<Result<{ enabled: boolean; wallet: { address: string; chainId: number } | null; chain: ChainPublic | null }>>;
  walletNonce(address: string): Promise<Result<{ nonce: string; message: string }>>;
  walletLink(address: string, nonce: string, signature: string): Promise<Result<{ wallet: { address: string; chainId: number } }>>;
  list(certificateId: string, priceLamports: number): Promise<Result<{ listingId: string; expiresAt: string }>>;
  /** A LOT of one tradeable material (bought whole): the server moves the units from the account's balance into the listing. `requestId` makes a retry return the same listing. */
  listMaterial(requestId: string, materialId: string, quantity: number, unitPriceMicro: number): Promise<Result<{ listingId: string; expiresAt: string }>>;
  cancelListing(listingId: string): Promise<Result<{ certificateId: string | null; materialId?: string; quantity?: number }>>;
  reserve(listingId: string): Promise<Result<{ reservation: ReservationView }>>;
  cancelReservation(reservationId: string): Promise<Result>;
  reservationStatus(reservationId: string): Promise<Result<{ reservation: ReservationView }>>;
  /** a recent blockhash for the transaction the wallet signs (the browser never calls the node) */
  prepare(reservationId: string): Promise<Result<{ blockhash: string; lastValidBlockHeight: number }>>;
  submitPayment(reservationId: string, signature: string): Promise<Result<{ status: string; reservation: ReservationView | null; certificateId?: string | null; materialId?: string; quantity?: number }>>;
  overview(): Promise<Result<MarketOverview>>;
  ack(certificateIds: string[]): Promise<Result<{ acked: number }>>;
  passPrice(): Promise<Result<{ priceUnits: number; priceUsdc: string; chain: ChainPublic }>>;
  passStart(): Promise<Result<PassPlan>>;
  passPrepare(): Promise<Result<{ blockhash: string; lastValidBlockHeight: number }>>;
  passSubmit(signature: string): Promise<Result<{ status: string; livemode?: boolean }>>;
}

export function createMarketApi(transport: MarketTransport = supabaseMarketTransport): MarketApi {
  // A network error throws MarketUnreachable (the screens say "no connection, nothing changed"); the server's own refusals (including 5xx with a JSON body) come back as { ok: false, reason }.
  async function call<T extends object>(fn: MarketFn, body: object): Promise<Result<T>> {
    let answer: MarketAnswer;
    try {
      answer = await transport(fn, body);
    } catch (err) {
      if (err instanceof MarketUnreachable) throw err;
      throw new MarketUnreachable('network');
    }
    const b = answer.body;
    if (b && b.ok === true) return b as unknown as { ok: true } & T;
    const reason = typeof b?.reason === 'string' ? b.reason : typeof b?.error === 'string' ? b.error : `status_${answer.status}`;
    const { ok: _ok, reason: _reason, error: _error, ...extra } = (b ?? {}) as Record<string, unknown>;
    void _ok;
    void _reason;
    void _error;
    return { ok: false, reason, status: answer.status, ...(Object.keys(extra).length > 0 ? { extra } : {}) };
  }
  return {
    walletStatus: () => call('market-wallet', { action: 'status' }),
    walletNonce: (address) => call('market-wallet', { action: 'nonce', address }),
    walletLink: (address, nonce, signature) => call('market-wallet', { action: 'link', address, nonce, signature }),
    list: (certificateId, priceLamports) => call('market-list', { action: 'list', certificateId, priceLamports }),
    listMaterial: (requestId, materialId, quantity, unitPriceMicro) => call('market-list', { action: 'list_material', requestId, materialId, quantity, unitPriceMicro }),
    cancelListing: (listingId) => call('market-list', { action: 'cancel', listingId }),
    reserve: (listingId) => call('market-buy', { action: 'reserve', listingId }),
    cancelReservation: (reservationId) => call('market-buy', { action: 'cancel', reservationId }),
    reservationStatus: (reservationId) => call('market-buy', { action: 'status', reservationId }),
    prepare: (reservationId) => call('market-buy', { action: 'prepare', reservationId }),
    submitPayment: (reservationId, signature) => call('market-buy', { action: 'submit', reservationId, signature }),
    overview: () => call('market-my', { action: 'overview' }),
    ack: (certificateIds) => call('market-my', { action: 'ack', certificateIds }),
    passPrice: () => call('pass-crypto', { action: 'price' }),
    passStart: () => call('pass-crypto', { action: 'start' }),
    passPrepare: () => call('pass-crypto', { action: 'prepare' }),
    passSubmit: (signature) => call('pass-crypto', { action: 'submit', signature }),
  };
}

export const marketApi: MarketApi = createMarketApi();

// ---- browsing: the ONE public view (migration 0011): the listed item and its price in lamports, never a seller or an address ----------------------------------------------------------------

export interface PublicListing {
  id: string;
  kind: 'gear' | 'unique' | 'gold_pouch' | 'material';
  template_id: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | null;
  tier: number | null;
  substats: { type: string; value: number }[];
  gold_amount: number | null;
  content_hash: string;
  price_lamports: number;
  status: 'open' | 'reserved';
  created_at: string;
  expires_at: string;
  /** a lot of a tradeable material: how many units, and the price of one unit in micro-SOL (null for an item) */
  material_qty?: number | null;
  unit_price_micro?: number | null;
}

export async function fetchPublicListings(limit = 200): Promise<PublicListing[]> {
  if (!supabase) throw new MarketUnreachable('not_configured');
  const { data, error } = await supabase.from('market_listings_public').select('id,kind,template_id,rarity,tier,substats,gold_amount,content_hash,price_lamports,status,created_at,expires_at,material_qty,unit_price_micro').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new MarketUnreachable('read_failed');
  return (data ?? []) as PublicListing[];
}
