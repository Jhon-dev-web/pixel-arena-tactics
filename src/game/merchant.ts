import { playerLevel, SaveData } from './engine';
import { baseGoldValue } from './economy';
import { ConsumableId, getConsumable } from './consumables';
import { getMaterial, MaterialId } from './materials';
import T from './tunables';

// Vender ao mercador: surplus materials and consumables for a LOW price, with a daily Gold budget. The merchant is a safety valve for the bag, not an
// income: prices are a small share of the economic reference (economy.ts), and once the day's budget is spent he buys nothing more until local midnight
// (the same day boundary as the Dungeon sessions). Only the inventory is sold from (never the stash). Gear instances and unique pieces are never sold here:
// they are for salvage and, later, the player market.
//
//   material price   = max(1, floor(priceRate x baseGoldValue)), or the legacy catalog sellValue when that is lower
//   consumable price = its sellValue (0 = cannot be sold: Pass-only items, tickets, catalysts), lowered by MERCHANT_CONSUMABLE_PRICE where a recipe would
//                      otherwise turn Gold into more Gold (the arbitrage test scans every recipe)
//   daily budget     = baseBudget + budgetPerLevel x character level   (tunables.ts merchant)

export type SellKind = 'material' | 'consumable';

export interface MerchantState {
  day: string; // toDateString() of the local day `earned` belongs to
  earned: number; // Gold paid out that day
}

export const emptyMerchant = (): MerchantState => ({ day: '', earned: 0 });

export const merchantDayKey = (now: number): string => new Date(now).toDateString();

// Saved state of any source: only today's earnings survive a load; a different day (or garbage) starts at zero.
export function sanitizeMerchant(raw: unknown, now: number): MerchantState {
  const r = (raw ?? {}) as Partial<MerchantState>;
  const today = merchantDayKey(now);
  const earned = Math.floor(Number(r.earned));
  return r.day === today && Number.isFinite(earned) && earned > 0 ? { day: today, earned: Math.min(earned, 1e9) } : emptyMerchant();
}

// Where a consumable's recipe would pay more than the merchant's price breaks the "craft cost + inputs >= output" rule (merchant test), its price goes here.
export const MERCHANT_CONSUMABLE_PRICE: Partial<Record<ConsumableId, number>> = {};

export function merchantPrice(kind: SellKind, id: string): number {
  if (kind === 'consumable') {
    const def = getConsumable(id);
    if (!def) return 0;
    return Math.max(0, MERCHANT_CONSUMABLE_PRICE[id as ConsumableId] ?? def.sellValue);
  }
  const def = getMaterial(id as MaterialId);
  if (!def) return 0;
  const share = Math.max(1, Math.floor(T.merchant.priceRate * baseGoldValue(def.id)));
  return def.sellValue > 0 && def.sellValue < share ? def.sellValue : share;
}

export const merchantBuys = (kind: SellKind, id: string): boolean => merchantPrice(kind, id) > 0;

export const merchantBudget = (level: number): number => Math.max(0, Math.round(T.merchant.baseBudget + T.merchant.budgetPerLevel * level));

export function merchantEarnedToday(save: Pick<SaveData, 'merchant'>, now: number): number {
  const m = save.merchant;
  return m && m.day === merchantDayKey(now) ? m.earned : 0;
}

export const merchantRemaining = (save: SaveData, now: number): number => Math.max(0, merchantBudget(playerLevel(save.xp)) - merchantEarnedToday(save, now));

const have = (save: SaveData, kind: SellKind, id: string): number => ((kind === 'material' ? save.materials : save.consumables) as Record<string, number>)[id] ?? 0;

export interface SellQuote {
  price: number;
  units: number; // what would actually be sold
  gold: number;
  capped: boolean; // fewer than asked because the day's budget runs out
}

// What selling `qty` ('all' = the whole stack) would do right now.
export function merchantQuote(save: SaveData, kind: SellKind, id: string, qty: number | 'all', now: number): SellQuote {
  const price = merchantPrice(kind, id);
  const asked = Math.min(have(save, kind, id), qty === 'all' ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(qty)));
  if (price <= 0 || asked <= 0) return { price, units: 0, gold: 0, capped: false };
  const byBudget = Math.floor(merchantRemaining(save, now) / price);
  const units = Math.min(asked, byBudget);
  return { price, units, gold: units * price, capped: units < asked };
}

export type SellFailure = 'unsellable' | 'none' | 'budget';
export interface SellResult {
  ok: boolean;
  reason?: SellFailure;
  save?: SaveData;
  units?: number;
  gold?: number;
  capped?: boolean;
}

// One sale, all-or-nothing on the units it reports: sells as many as the budget pays for. 'budget' = nothing sold because the day's budget is spent.
export function applyMerchantSell(save: SaveData, kind: SellKind, id: string, qty: number | 'all', now: number): SellResult {
  const q = merchantQuote(save, kind, id, qty, now);
  if (q.price <= 0) return { ok: false, reason: 'unsellable' };
  if (have(save, kind, id) <= 0) return { ok: false, reason: 'none' };
  if (q.units <= 0) return { ok: false, reason: 'budget' };
  const today = merchantDayKey(now);
  const next: SaveData = {
    ...save,
    gold: save.gold + q.gold,
    merchant: { day: today, earned: merchantEarnedToday(save, now) + q.gold },
  };
  if (kind === 'material') next.materials = { ...save.materials, [id]: have(save, kind, id) - q.units };
  else next.consumables = { ...save.consumables, [id]: have(save, kind, id) - q.units };
  return { ok: true, save: next, units: q.units, gold: q.gold, capped: q.capped };
}
