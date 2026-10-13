import type { SaveData } from './engine';
import { HUNTING_ZONES } from './huntingZones';
import { baseGoldValue } from './economy';
import { getMaterial, MaterialId } from './materials';
import { merchantDayKey, merchantPrice } from './merchant';
import { ORE_TIERS } from './ores';
import { recordWholesale } from './stats';
import { WOOD_TIERS } from './woodcutting';
import T from './tunables';

// MERCADOR ATACADISTA (round 18). A second, cruder buyer next to the normal merchant (merchant.ts), for the day the bag and the stash are full of surplus.
//
//   - It buys MATERIALS only (never gear, never consumables), from the bag only, like the normal merchant.
//   - NO daily Gold budget. The price is a share of the normal merchant's unit price (T.wholesale.priceRate, 25%), and it FALLS with every unit of the same material sold the
//     same local day: the first freeUnits units pay the full wholesale price, each further block of blockUnits pays blockDrop less, down to floorRate of the NORMAL price.
//     A material nobody has sold today starts at the top again at local midnight (the same day boundary as the merchant, the dungeon sessions and the pouch limit).
//   - It is always MANUAL. Nothing in the game calls applyWholesaleSell on its own: the player presses sell (one stack, or a list he ticked and confirmed). Selling a rare
//     material asks a second time, because other players will pay more for it once the market opens.
//   - It opens with the boss of floor T.wholesale.unlockFloor (75, the third biome boss): the dungeonCheckpoints the save already keeps.
//
// The unit price is fractional on purpose (a common material is worth 1 Gold to the normal merchant, so 25% of it is a quarter of a Gold): the payout of a sale is the SUM of
// the unit prices, rounded down once. A sale that pays less than 1 Gold in total is refused (it would only destroy the units).

export interface WholesaleState {
  day: string; // toDateString() of the local day `sold` belongs to
  sold: Partial<Record<MaterialId, number>>; // units sold today, by material
}

export const emptyWholesale = (): WholesaleState => ({ day: '', sold: {} });

// Saved state of any source: only today's counters survive a load; a different day (or garbage) starts clean.
export function sanitizeWholesale(raw: unknown, now: number): WholesaleState {
  const r = (raw ?? {}) as Partial<WholesaleState>;
  if (r.day !== merchantDayKey(now) || !r.sold || typeof r.sold !== 'object') return emptyWholesale();
  const sold: Partial<Record<MaterialId, number>> = {};
  for (const [id, v] of Object.entries(r.sold)) {
    const n = Math.floor(Number(v));
    if (getMaterial(id as MaterialId) && Number.isFinite(n) && n > 0) sold[id as MaterialId] = Math.min(n, 1e9);
  }
  return { day: r.day, sold };
}

// ---- unlock ------------------------------------------------------------------------------------------------------------

export const wholesaleUnlockFloor = (): number => Math.round(T.wholesale.unlockFloor);

export const wholesaleUnlocked = (save: Pick<SaveData, 'dungeonCheckpoints'>): boolean => (save.dungeonCheckpoints ?? []).some((f) => f >= wholesaleUnlockFloor());

// ---- rarity (only to decide who gets the "other players pay more" second confirmation) ----------------------------------------

const HUNT_RARITY: Partial<Record<MaterialId, 'common' | 'uncommon' | 'rare'>> = {};
for (const z of HUNTING_ZONES) for (const d of z.drops) HUNT_RARITY[d.material] = d.rarity;
const ORE_IDS = ORE_TIERS.map((o) => o.id as string);
const WOOD_IDS = WOOD_TIERS.map((w) => w.id as string);

// A hunting drop uses its own rarity, an ore or a wood its tier (tiers 1-2 common, 3-4 uncommon, 5 rare), and everything else (garden plants, bars, dust, handles) the
// economic reference value: from 20 Gold up it is rare, from 8 Gold uncommon.
export function materialRarity(id: MaterialId): 'common' | 'uncommon' | 'rare' {
  const h = HUNT_RARITY[id];
  if (h) return h;
  const idx = Math.max(ORE_IDS.indexOf(id), WOOD_IDS.indexOf(id));
  if (idx >= 0) return idx >= 4 ? 'rare' : idx >= 2 ? 'uncommon' : 'common';
  const v = baseGoldValue(id);
  return v >= 20 ? 'rare' : v >= 8 ? 'uncommon' : 'common';
}

export const isRareMaterial = (id: MaterialId): boolean => materialRarity(id) !== 'common';

// ---- price -------------------------------------------------------------------------------------------------------------

// The price one unit pays at the top of the curve (fractional): a share of what the normal merchant pays for it.
export const wholesaleUnitPrice = (id: MaterialId): number => merchantPrice('material', id) * T.wholesale.priceRate;

// The lowest unit price, as a share of the TOP wholesale price (the tunable is a share of the NORMAL merchant price).
function floorMultiplier(): number {
  return T.wholesale.priceRate > 0 ? Math.min(1, T.wholesale.floorRate / T.wholesale.priceRate) : 1;
}

// The share of the top price paid for the unit that is number `index` (0-based) among the units of that material sold today.
export function wholesaleMultiplier(index: number): number {
  const free = Math.max(0, Math.floor(T.wholesale.freeUnits));
  if (index < free) return 1;
  const block = 1 + Math.floor((index - free) / Math.max(1, Math.floor(T.wholesale.blockUnits)));
  return Math.max(floorMultiplier(), 1 - T.wholesale.blockDrop * block);
}

// Sum of the multipliers of units [from, from + units): what `units` more units are worth, in units of the top price.
export function wholesaleWeight(from: number, units: number): number {
  const free = Math.max(0, Math.floor(T.wholesale.freeUnits));
  const blockSize = Math.max(1, Math.floor(T.wholesale.blockUnits));
  let at = Math.max(0, Math.floor(from));
  let left = Math.max(0, Math.floor(units));
  let sum = 0;
  if (at < free) {
    const n = Math.min(left, free - at);
    sum += n;
    at += n;
    left -= n;
  }
  while (left > 0) {
    const mult = wholesaleMultiplier(at);
    const toBlockEnd = mult <= floorMultiplier() ? left : blockSize - ((at - free) % blockSize);
    const n = Math.min(left, toBlockEnd);
    sum += n * mult;
    at += n;
    left -= n;
  }
  return sum;
}

export function wholesaleSoldToday(save: Pick<SaveData, 'wholesale'>, id: MaterialId, now: number): number {
  const w = save.wholesale;
  return w && w.day === merchantDayKey(now) ? w.sold[id] ?? 0 : 0;
}

const have = (save: SaveData, id: MaterialId): number => save.materials?.[id] ?? 0;

export interface WholesaleQuote {
  units: number; // what would be sold
  gold: number; // what it pays
  perUnit: number; // average Gold per unit of this sale
  nextUnitPrice: number; // what the next single unit would pay right now (fractional)
}

// What selling `qty` ('all' = the whole stack) of one material would do right now.
export function wholesaleQuote(save: SaveData, id: MaterialId, qty: number | 'all', now: number): WholesaleQuote {
  const top = wholesaleUnitPrice(id);
  const sold = wholesaleSoldToday(save, id, now);
  const units = Math.min(have(save, id), qty === 'all' ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(qty)));
  const gold = top > 0 && units > 0 ? Math.floor(top * wholesaleWeight(sold, units) + 1e-9) : 0;
  return { units, gold, perUnit: units > 0 ? gold / units : 0, nextUnitPrice: top * wholesaleMultiplier(sold) };
}

export type WholesaleFailure = 'locked' | 'unsellable' | 'none' | 'worthless';
export interface WholesaleResult {
  ok: boolean;
  reason?: WholesaleFailure;
  save?: SaveData;
  units?: number;
  gold?: number;
}

// One sale of one material. Manual only: the caller is a button the player pressed. 'worthless' = the whole sale would pay less than 1 Gold (nothing is sold).
export function applyWholesaleSell(save: SaveData, id: MaterialId, qty: number | 'all', now: number): WholesaleResult {
  if (!wholesaleUnlocked(save)) return { ok: false, reason: 'locked' };
  if (merchantPrice('material', id) <= 0 || !getMaterial(id)) return { ok: false, reason: 'unsellable' };
  if (have(save, id) <= 0) return { ok: false, reason: 'none' };
  const q = wholesaleQuote(save, id, qty, now);
  if (q.units <= 0) return { ok: false, reason: 'none' };
  if (q.gold <= 0) return { ok: false, reason: 'worthless' };
  const today = merchantDayKey(now);
  const sold = save.wholesale && save.wholesale.day === today ? save.wholesale.sold : {};
  const next: SaveData = {
    ...save,
    gold: save.gold + q.gold,
    materials: { ...save.materials, [id]: have(save, id) - q.units },
    wholesale: { day: today, sold: { ...sold, [id]: (sold[id] ?? 0) + q.units } },
  };
  return { ok: true, save: recordWholesale(next, q.units, q.gold), units: q.units, gold: q.gold };
}

export interface WholesaleLine {
  id: MaterialId;
  qty: number | 'all';
}
export interface WholesalePlan {
  lines: { id: MaterialId; units: number; gold: number; rare: boolean }[];
  units: number;
  gold: number;
  hasRare: boolean;
}

// What a ticked list would do, in order, each line priced after the lines above it (the same material twice shares one daily counter). Pure: nothing is sold.
export function wholesalePlan(save: SaveData, lines: WholesaleLine[], now: number): WholesalePlan {
  let cur = save;
  const out: WholesalePlan['lines'] = [];
  for (const l of lines) {
    const r = applyWholesaleSell(cur, l.id, l.qty, now);
    if (!r.ok || !r.save) continue;
    cur = r.save;
    out.push({ id: l.id, units: r.units ?? 0, gold: r.gold ?? 0, rare: isRareMaterial(l.id) });
  }
  return { lines: out, units: out.reduce((a, l) => a + l.units, 0), gold: out.reduce((a, l) => a + l.gold, 0), hasRare: out.some((l) => l.rare) };
}

// The ticked list, sold: the SAME lines as wholesalePlan priced the confirmation, so what was shown is what is paid.
export function applyWholesaleBatch(save: SaveData, lines: WholesaleLine[], now: number): { save: SaveData; units: number; gold: number } {
  let cur = save;
  let units = 0;
  let gold = 0;
  for (const l of lines) {
    const r = applyWholesaleSell(cur, l.id, l.qty, now);
    if (!r.ok || !r.save) continue;
    cur = r.save;
    units += r.units ?? 0;
    gold += r.gold ?? 0;
  }
  return { save: cur, units, gold };
}
