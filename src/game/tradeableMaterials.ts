import type { SaveData } from './engine';
import { PLANTS } from './garden';
import { HUNTING_ZONES } from './huntingZones';
import { fitsBag } from './inventory';
import { MATERIALS, MaterialId } from './materials';
import { ORE_TIERS } from './ores';
import { WOOD_TIERS } from './woodcutting';

// TRADEABLE MATERIALS ("negociaveis"). Every material that Hunting, Mining, Woodcutting or the Garden produces exists in two variants that are IDENTICAL in use: the normal one (never sold to
// players, as always) and an occasional drop of the same material that can be sold on the player market. A recipe, a refine step, a delivery order and the NPC merchants treat them as one
// material; the only difference is the market, and a small gold badge on the tile.
//
// REPRESENTATION. `save.materials[id]` stays the TOTAL of both variants, so every "has enough" check, every recipe, order, refine and merchant in the game keeps working untouched.
// `save.tradeableMaterials[id]` is the part of that total that is the tradeable variant (always <= the total). The two variants are separate STACKS in the bag (inventory.ts stockSlots:
// they take slots of their own), which is the one place the split shows. Tradeable units live in the bag only: the Bau does not take them (they are for selling, not for storing).
//
// WHO CREATES THEM. Only the SERVER. The offline / desktop build has no server, so it never has a tradeable unit (stripTradeable on load). In the web build the client reports each claim
// (materialClaims.ts) and the server rolls how many of those units are tradeable and credits a per-account balance; the client then marks that many of its units (convertToTradeable).
// The tradeable stack can never exceed the server balance (reconcile on load, tradeableActions.ts): the excess simply becomes normal units.
//
// CONSUMING THEM. Reducers do not know about the split. After any change of the save, reconcileTradeable() works out how many tradeable units it spent: normal units go first (so nobody burns
// sellable stock by accident) unless the player flipped the setting, and the units spent are queued in `tradeableBurns` for the server (burn). Everything here is pure.

/** Units of each material that are the tradeable variant. */
export type TradeableMap = Partial<Record<MaterialId, number>>;

/** The materials a claim can produce (ores, woods, plants, Hunting drops): the only ones that can have a tradeable variant. Bars, handles, dust and the shop materials never do. */
export const TRADEABLE_MATERIALS: readonly MaterialId[] = (() => {
  const ids = new Set<MaterialId>();
  for (const o of ORE_TIERS) ids.add(o.id);
  for (const w of WOOD_TIERS) ids.add(w.id);
  for (const p of PLANTS) ids.add(p.material);
  for (const z of HUNTING_ZONES) for (const d of z.drops) ids.add(d.material);
  return MATERIALS.map((m) => m.id).filter((id) => ids.has(id));
})();

const ELIGIBLE = new Set<string>(TRADEABLE_MATERIALS);
export const isTradeableMaterial = (id: string): id is MaterialId => ELIGIBLE.has(id);

const MAX_UNITS = 1e9;
const whole = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_UNITS) : 0;
};

type Holder = Pick<SaveData, 'materials'> & Partial<Pick<SaveData, 'tradeableMaterials'>>;

/** Tradeable units of a material in the bag. */
export const tradeableOf = (save: Holder, id: MaterialId): number => Math.min(whole(save.materials?.[id]), whole(save.tradeableMaterials?.[id]));
/** Normal units of a material in the bag (the total minus the tradeable ones). */
export const normalOf = (save: Holder, id: MaterialId): number => Math.max(0, whole(save.materials?.[id]) - tradeableOf(save, id));
/** Every tradeable stack the bag holds, in catalog order. */
export function listTradeable(save: Holder): { id: MaterialId; qty: number }[] {
  return TRADEABLE_MATERIALS.map((id) => ({ id, qty: tradeableOf(save, id) })).filter((x) => x.qty > 0);
}
export const totalTradeable = (save: Holder): number => listTradeable(save).reduce((a, x) => a + x.qty, 0);

const sameMap = (a: TradeableMap, b: TradeableMap): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k as MaterialId] === b[k as MaterialId]);
};

/** A saved map of any source: eligible materials only, whole positive numbers, never more than the total the save holds. */
export function sanitizeTradeable(raw: unknown, materials: Partial<Record<string, number>> | undefined): TradeableMap {
  const out: TradeableMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isTradeableMaterial(id)) continue;
    const n = Math.min(whole(v), whole(materials?.[id]));
    if (n > 0) out[id] = n;
  }
  return out;
}

/** The save with the tradeable portion clamped to what the totals allow (the same object when nothing changes). */
export function clampTradeable(save: SaveData): SaveData {
  if (!save.tradeableMaterials) return save;
  const next = sanitizeTradeable(save.tradeableMaterials, save.materials);
  if (sameMap(next, save.tradeableMaterials)) return save;
  const { tradeableMaterials: _old, ...rest } = save;
  void _old;
  return Object.keys(next).length > 0 ? { ...rest, tradeableMaterials: next } : (rest as SaveData);
}

/** Every unit becomes a normal unit: the offline / desktop build (no server) has no tradeable variant, whatever an imported save says. */
export function stripTradeable(save: SaveData): SaveData {
  if (!save.tradeableMaterials && !save.tradeableBurns && !save.materialClaims) return save;
  const { tradeableMaterials: _a, tradeableBurns: _b, materialClaims: _c, ...rest } = save;
  void _a;
  void _b;
  void _c;
  return rest as SaveData;
}

// ---- preferences -------------------------------------------------------------------------------------------------------------------------------------------------------

export interface MaterialPrefs {
  /** false (default): a recipe spends normal units first and tradeable ones only when the normal ones run out. true: the other way round. */
  useTradeableFirst: boolean;
  /** The one-time question "this will spend N tradeable ..." was answered with yes. */
  useAcked: boolean;
}

export const DEFAULT_MATERIAL_PREFS: MaterialPrefs = { useTradeableFirst: false, useAcked: false };

export const materialPrefs = (save: Partial<Pick<SaveData, 'materialPrefs'>>): MaterialPrefs => ({ ...DEFAULT_MATERIAL_PREFS, ...(save.materialPrefs ?? {}) });

export function sanitizeMaterialPrefs(raw: unknown): MaterialPrefs | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<MaterialPrefs>;
  const prefs: MaterialPrefs = { useTradeableFirst: r.useTradeableFirst === true, useAcked: r.useAcked === true };
  return prefs.useTradeableFirst || prefs.useAcked ? prefs : undefined;
}

export function withMaterialPrefs(save: SaveData, patch: Partial<MaterialPrefs>): SaveData {
  return { ...save, materialPrefs: { ...materialPrefs(save), ...patch } };
}

// ---- spending ----------------------------------------------------------------------------------------------------------------------------------------------------------

export interface ConsumptionResult {
  save: SaveData;
  /** the tradeable units this change spent, by material */
  used: TradeableMap;
}

const addMaps = (a: TradeableMap | undefined, b: TradeableMap): TradeableMap => {
  const out: TradeableMap = { ...(a ?? {}) };
  for (const [id, n] of Object.entries(b) as [MaterialId, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
};

const subMaps = (a: TradeableMap | undefined, b: TradeableMap): TradeableMap => {
  const out: TradeableMap = { ...(a ?? {}) };
  for (const [id, n] of Object.entries(b) as [MaterialId, number][]) {
    const left = (out[id] ?? 0) - n;
    if (left > 0) out[id] = left;
    else delete out[id];
  }
  return out;
};

const withMap = (save: SaveData, key: 'tradeableMaterials' | 'tradeableBurns', map: TradeableMap): SaveData => {
  if (Object.keys(map).length > 0) return { ...save, [key]: map };
  const copy = { ...save } as SaveData;
  delete copy[key];
  return copy;
};

/**
 * Works out what `next` (a save produced from `prev` by any reducer) did to the tradeable stacks. A reducer that MOVES tradeable units on purpose (a listing, a delivery, a conversion) sets
 * `tradeableMaterials` to a new object itself and is only clamped. Any other change that lowers a material's total is a SPEND (a recipe, a refine, an order, a sale to a merchant, a discard):
 * normal units go first, so the tradeable stack only shrinks by what the normal units cannot cover (or, with the player's setting, tradeable units go first). The units spent are queued for
 * the server's burn (`tradeableBurns`).
 */
export function reconcileTradeable(prev: SaveData, next: SaveData, opts: { first?: boolean } = {}): ConsumptionResult {
  const before = prev.tradeableMaterials;
  if (next.tradeableMaterials !== before) return { save: clampTradeable(next), used: {} };
  if (!before) return { save: next, used: {} };
  // (`opts.first`: the player picked the TRADEABLE stack itself to sell or discard from, so those units go first whatever the preference says)
  const first = opts.first ?? materialPrefs(next).useTradeableFirst;
  const kept: TradeableMap = {};
  const used: TradeableMap = {};
  for (const [id, had] of Object.entries(before) as [MaterialId, number][]) {
    const total = whole(next.materials?.[id]);
    const spent = Math.max(0, whole(prev.materials?.[id]) - total);
    const now = first && spent > 0 ? Math.min(total, Math.max(0, had - spent)) : Math.min(had, total);
    if (now > 0) kept[id] = now;
    if (had - now > 0) used[id] = had - now;
  }
  if (Object.keys(used).length === 0 && sameMap(kept, before)) return { save: next, used: {} };
  let out = withMap(next, 'tradeableMaterials', kept);
  if (Object.keys(used).length > 0) out = withMap(out, 'tradeableBurns', addMaps(next.tradeableBurns, used));
  return { save: out, used };
}

export type UseGate = 'free' | 'confirm' | 'blocked';

export interface UseContext {
  /** The web build with a server (itemAuthority 'server'): the only place tradeable units exist. */
  server: boolean;
  /** The server answered the last time we asked (tradeableActions.ts). */
  reachable: boolean;
  /** The one-time question was answered. */
  acked: boolean;
  /** The change is a sale to an NPC merchant: always asks, because other players would pay more. */
  npc: boolean;
}

/** What to do about a change that spends `used` tradeable units: just do it, ask first, or refuse (the server could not record the burn). */
export function gateTradeableUse(used: TradeableMap, ctx: UseContext): UseGate {
  if (Object.values(used).every((n) => !(n && n > 0))) return 'free';
  if (!ctx.server) return 'free';
  if (!ctx.reachable) return 'blocked';
  return ctx.npc || !ctx.acked ? 'confirm' : 'free';
}

// ---- moving units on purpose -------------------------------------------------------------------------------------------------------------------------------------------

/** Marks `n` of the normal units of a material as tradeable (what the server rolled for a claim). Limited by the normal units that exist and by the one extra slot the split can need. */
export function convertToTradeable(save: SaveData, id: MaterialId, n: number): { save: SaveData; converted: number } {
  if (!isTradeableMaterial(id)) return { save, converted: 0 };
  const want = Math.min(whole(n), normalOf(save, id));
  const make = (k: number): SaveData => ({ ...save, tradeableMaterials: { ...(save.tradeableMaterials ?? {}), [id]: tradeableOf(save, id) + k } });
  // The split of a stack can cost one slot. If the bag has no room for it, the most that fits is tried (a count that empties the normal stack, or fills the tradeable one).
  for (let k = want; k > 0; k--) if (fitsBag(save, make(k))) return { save: make(k), converted: k };
  return { save, converted: 0 };
}

/** Adds `n` tradeable units (delivered by the market) as far as the bag has room. */
export function addTradeableUnits(save: SaveData, id: MaterialId, n: number): { save: SaveData; added: number } {
  if (!isTradeableMaterial(id)) return { save, added: 0 };
  const want = whole(n);
  if (want <= 0) return { save, added: 0 };
  const make = (k: number): SaveData => ({
    ...save,
    materials: { ...save.materials, [id]: whole(save.materials?.[id]) + k },
    tradeableMaterials: { ...(save.tradeableMaterials ?? {}), [id]: tradeableOf(save, id) + k },
  });
  if (fitsBag(save, make(want))) return { save: make(want), added: want };
  // the most that fits (slots never shrink as units are added, so a binary search is exact)
  let lo = 0;
  let hi = want;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fitsBag(save, make(mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? { save: make(lo), added: lo } : { save, added: 0 };
}

/** Takes `n` tradeable units out of the bag on purpose (a market listing): the total and the tradeable portion both drop. null = the bag does not hold that many tradeable units. */
export function removeTradeableUnits(save: SaveData, id: MaterialId, n: number): SaveData | null {
  const k = whole(n);
  if (k <= 0 || tradeableOf(save, id) < k) return null;
  const left = tradeableOf(save, id) - k;
  const tradeable: TradeableMap = { ...(save.tradeableMaterials ?? {}) };
  if (left > 0) tradeable[id] = left;
  else delete tradeable[id];
  const next: SaveData = { ...save, materials: { ...save.materials, [id]: whole(save.materials?.[id]) - k }, tradeableMaterials: tradeable };
  if (Object.keys(tradeable).length === 0) delete next.tradeableMaterials;
  return next;
}

// ---- the burn queue ----------------------------------------------------------------------------------------------------------------------------------------------------

/** The burns the server has confirmed leave the queue. */
export function settleBurns(save: SaveData, done: TradeableMap): SaveData {
  if (!save.tradeableBurns) return save;
  return withMap(save, 'tradeableBurns', subMaps(save.tradeableBurns, done));
}

export function sanitizeBurns(raw: unknown): TradeableMap {
  const out: TradeableMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = whole(v);
    if (isTradeableMaterial(id) && n > 0) out[id] = n;
  }
  return out;
}

/** How many units of the stack a player picked (`variant` 'tradeable' = the tradeable stack, anything else = the normal one) a request for `qty` ('all' = the whole stack) means. */
export function stackQty(save: Holder, id: MaterialId, variant: 'tradeable' | undefined, qty: number | 'all'): number {
  const stack = variant === 'tradeable' ? tradeableOf(save, id) : normalOf(save, id);
  return qty === 'all' ? stack : Math.min(stack, Math.max(0, Math.floor(qty)));
}
