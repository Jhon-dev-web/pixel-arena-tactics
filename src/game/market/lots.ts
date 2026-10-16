import { isMaterialTotalLamports, isUnitPriceMicro, materialTotalLamports, parseUnitPrice } from '../../../supabase/functions/_shared/chain/solMoney';
import { MARKET_RULES } from '../../../supabase/functions/_shared/market/rules';
import type { SaveData } from '../engine';
import { newRequestId } from '../itemServer';
import { MaterialId } from '../materials';
import { clearIntent, intentRequestId } from '../mintIntents';
import { listTradeable, removeTradeableUnits, tradeableOf } from '../tradeableMaterials';
import { MarketApi } from './api';

// Lots of tradeable materials on the market (docs/MARKET_FOUNDATION.md "Materiais negociaveis"). One listing = a quantity of ONE material, bought WHOLE (never in parts), priced per unit in SOL with up to
// 6 decimals; the whole lot has to be at least 0.001 SOL. The SERVER moves the units from the account's balance into the listing first (escrow); only then do they leave the save. If the game closes in
// between, the next reconcile (tradeableActions.planSync) clamps the stack to the balance, so a unit is never sellable twice.

/** A tradeable stack the player can put up as a lot, capped at the most one lot may hold. */
export interface SellableLot {
  materialId: MaterialId;
  /** units in the bag */
  stack: number;
  /** the most units one lot can hold */
  max: number;
}

export function sellableLots(save: SaveData): SellableLot[] {
  return listTradeable(save).map((x) => ({ materialId: x.id, stack: x.qty, max: Math.min(x.qty, MARKET_RULES.maxMaterialQtyPerListing) }));
}

export interface LotQuote {
  unitPriceMicro: number;
  quantity: number;
  /** the whole lot in lamports */
  totalLamports: number;
}

/** What a typed unit price and a quantity make: null when the price is not a price (more than 6 decimals, zero, text) or the lot is outside 0.001 to 50 SOL. */
export function lotQuote(priceText: string, quantity: number): LotQuote | null {
  const unitPriceMicro = parseUnitPrice(priceText.trim().replace(',', '.'));
  if (unitPriceMicro === null || !isUnitPriceMicro(unitPriceMicro) || !Number.isInteger(quantity) || quantity < 1 || quantity > MARKET_RULES.maxMaterialQtyPerListing) return null;
  const totalLamports = materialTotalLamports(unitPriceMicro, quantity);
  return isMaterialTotalLamports(totalLamports) ? { unitPriceMicro, quantity, totalLamports } : null;
}

export type LotOutcome = { ok: true; listingId: string } | { ok: false; reason: string };

/**
 * Puts a lot on the market: the server lists it first (checks the balance, the wallet, the limits and moves the units into escrow), and only then the units leave the bag. The request id outlives a
 * lost answer (mintIntents.ts), so asking again for the SAME lot returns the listing that already exists instead of listing a second one. A thrown MarketUnreachable keeps the id for the retry.
 */
export async function listLot(d: { api: MarketApi; getSave: () => SaveData; applySave: (s: SaveData) => void }, materialId: MaterialId, quantity: number, unitPriceMicro: number): Promise<LotOutcome> {
  const key = `lot:${materialId}:${quantity}:${unitPriceMicro}`;
  const requestId = intentRequestId(key, newRequestId);
  const r = await d.api.listMaterial(requestId, materialId, quantity, unitPriceMicro);
  if ('reason' in r) {
    clearIntent(key); // a refusal is final: nothing was stored
    return { ok: false, reason: r.reason };
  }
  // The units are in escrow on the server now. Take them out of the bag (as many as it holds: a stack that shrank meanwhile cannot be removed twice).
  const save = d.getSave();
  const take = Math.min(quantity, tradeableOf(save, materialId));
  const next = take > 0 ? removeTradeableUnits(save, materialId, take) : null;
  if (next) d.applySave(next);
  clearIntent(key);
  return { ok: true, listingId: r.listingId };
}
