import { HUNTING_ZONES, isZoneUnlocked } from './huntingZones';
import { EXPEDITION_TICKET_SKIP_MS, ConsumableId } from './consumables';
import { MAX_LEVEL, playerLevel, SaveData } from './engine';
import { PLANTS } from './garden';
import { hasMaterials, MaterialId } from './materials';
import { baseGoldValue, cargoReferenceValue } from './economy';
import { ORE_TIERS } from './ores';
import { REFINING_RECIPES } from './refining';
import { skillLevel } from './skills';
import { WOOD_TIERS } from './woodcutting';
import {
  ActiveDelivery,
  DELIVERY_DESTINATIONS,
  DeliveryArchetype,
  DeliveryClass,
  DeliveryDistance,
  DeliveryOffer,
  DeliveryState,
} from './deliveryState';
import T from './tunables';

// Delivery orders: the Expedition's job (idle time -> Gold + XP), now paid for with materials.
//
//   materials + time  ->  Gold + XP (+ shards on Long / Special)
//
// Design rules (docs/DELIVERY_ORDERS.md has the numbers behind them):
//  - Gold, XP and shards are a function of TIER x DISTANCE (i.e. time). They never depend on how valuable the delivered
//    materials are, so nobody delivers expensive material just for XP. Materials are the price of admission.
//  - What an order asks for is sized from the reward, in the ONE economic reference the game has (economy.ts baseGoldValue):
//    reward Gold (tier x time) -> desired cargo reference value = Gold / rewardRatio(distance) -> quantities. The archetype
//    says WHAT to ask for, baseGoldValue says HOW MUCH. baseGoldValue is only used to size cargo; it never pays anything.
//  - Everything is decided when an offer is generated (the only place RNG is used) and then frozen. Accepting consumes
//    the materials at once and snapshots the offer; claiming reads that snapshot, so it is deterministic and idempotent.
//  - One active delivery for everybody. The Battle Pass only adds convenience (one more visible offer, one more reroll).

export type Rng = () => number;

// Cost in Gold of one unit of a processed material (its cheapest real recipe), from the refining table.
function recipeFor(m: MaterialId) {
  return REFINING_RECIPES.find((r) => r.output === m && r.station !== 'dust');
}
export function processingFee(m: MaterialId): number {
  const r = recipeFor(m);
  return r ? r.cost / r.outputQty : 0;
}

// ---- archetypes
interface ArchetypeDef {
  classes: DeliveryClass[];
  tiers: number[];
  weight: number;
  comp: Partial<Record<MaterialId, number>> | 'raw'; // share of the order's CARGO REFERENCE VALUE (what it asks for)
  signature?: MaterialId[]; // at least one unit of each of these (when the player can have it): what makes the order this archetype
  processed?: boolean;
}
const ARCHETYPES: Record<DeliveryArchetype, ArchetypeDef> = {
  medicinal: { classes: ['simple', 'mid'], tiers: [0, 1, 2, 3], weight: 1.6, comp: { common_herb: 0.2, energy_herb: 0.2, leather_scrap: 0.3, bone_fragment: 0.3 }, signature: ['common_herb'] },
  alquimico: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 0.9, comp: { energy_herb: 0.2, uncommon_root: 0.15, crimson_mushroom: 0.15, concentrated_blood: 0.3, bone_fragment: 0.2 }, signature: ['energy_herb'] },
  alq_raro: { classes: ['hard'], tiers: [3], weight: 0.6, comp: { rare_flower: 0.3, energy_herb: 0.1, crimson_mushroom: 0.1, corrupted_crystal: 0.2, concentrated_blood: 0.2, bone_fragment: 0.1 }, signature: ['rare_flower'] },
  militar: { classes: ['simple', 'mid', 'hard'], tiers: [0, 1, 2, 3], weight: 3.6, comp: { leather_scrap: 0.2, bone_fragment: 0.05, demon_claw: 0.75 }, signature: ['demon_claw'] },
  armadura: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 3, comp: { bone_fragment: 0.2, leather_scrap: 0.05, concentrated_blood: 0.55, corrupted_crystal: 0.2 }, signature: ['concentrated_blood'] },
  raro: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 7, comp: { leather_scrap: 0.1, bone_fragment: 0.05, demon_claw: 0.2, concentrated_blood: 0.1, demon_core: 0.275, corrupted_crystal: 0.275 }, signature: ['demon_core', 'corrupted_crystal'] },
  forja: { classes: ['simple', 'mid', 'hard'], tiers: [0, 1, 2, 3], weight: 1.5, comp: 'raw' },
  comercial: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 1, comp: { leather: 0.4, steel: 0.3, silver_ingot: 0.3 }, processed: true },
};

const CLASS_DISTANCES: Record<DeliveryClass, { dists: DeliveryDistance[]; weights: number[] }> = {
  simple: { dists: ['local', 'curta'], weights: [0.45, 0.55] },
  mid: { dists: ['curta', 'regional'], weights: [0.3, 0.7] },
  hard: { dists: ['longa', 'especial'], weights: [0.75, 0.25] },
};
const RARITY: Record<DeliveryDistance, 'common' | 'uncommon' | 'rare' | 'epic'> = { local: 'common', curta: 'common', regional: 'uncommon', longa: 'rare', especial: 'epic' };
export const deliveryRarity = (d: DeliveryDistance) => RARITY[d];

// ---- tunable lookups (read at call time so the debug panel keeps working)
function distHours(d: DeliveryDistance): number {
  const D = T.deliveries;
  return { local: D.hoursLocal, curta: D.hoursCurta, regional: D.hoursRegional, longa: D.hoursLonga, especial: D.hoursEspecial }[d];
}
function distGoldBonus(d: DeliveryDistance): number {
  const D = T.deliveries;
  return { local: D.goldBonusLocal, curta: D.goldBonusCurta, regional: D.goldBonusRegional, longa: D.goldBonusLonga, especial: D.goldBonusEspecial }[d];
}
function distXpPerHour(d: DeliveryDistance): number {
  const D = T.deliveries;
  return { local: D.xpPerHourLocal, curta: D.xpPerHourCurta, regional: D.xpPerHourRegional, longa: D.xpPerHourLonga, especial: D.xpPerHourEspecial }[d];
}
function tierShards(d: DeliveryDistance, tier: number): number {
  const D = T.deliveries;
  if (d === 'longa') return [D.shardsLongaT1, D.shardsLongaT2, D.shardsLongaT3, D.shardsLongaT4][tier] ?? 0;
  if (d === 'especial') return [D.shardsEspecialT1, D.shardsEspecialT2, D.shardsEspecialT3, D.shardsEspecialT4][tier] ?? 0;
  return 0;
}
// Reward ratio target: reward Gold / cargo reference value. A longer trip ties the slot up longer, so it pays slightly more per unit of cargo.
export function rewardRatioTarget(d: DeliveryDistance): number {
  const D = T.deliveries;
  return { local: D.ratioLocal, curta: D.ratioCurta, regional: D.ratioRegional, longa: D.ratioLonga, especial: D.ratioEspecial }[d];
}
// Most units of a material one order may ask for. The fit below sizes quantities from reference value; this ceiling keeps it
// coherent with what a player can actually produce (whatever a capped material cannot cover is moved to the archetype's
// other materials, so the order stays worth what it should).
function quantityCap(m: MaterialId, dist: DeliveryDistance): number {
  const D = T.deliveries;
  const caps: Partial<Record<MaterialId, number>> = {
    leather_scrap: D.capScrap,
    bone_fragment: D.capBone,
    demon_claw: D.capClaw,
    concentrated_blood: D.capBlood,
    demon_core: D.capNoble,
    corrupted_crystal: D.capNoble,
    common_herb: D.capCommonHerb,
    energy_herb: D.capEnergyHerb,
    uncommon_root: D.capRoot,
    crimson_mushroom: D.capMushroom,
    rare_flower: D.capFlower,
  };
  const base = caps[m] ?? (recipeFor(m) ? D.capProcessed : D.capRawMaterial);
  const agro = m === 'common_herb' || m === 'energy_herb' || m === 'uncommon_root' || m === 'crimson_mushroom' || m === 'rare_flower';
  const factor = dist === 'especial' ? (isBulk(m) ? D.bulkSpecialFactor : agro ? D.agroSpecialFactor : 1) : dist === 'longa' ? 1 : D.shortCapFactor;
  return Math.max(1, Math.round(base * factor));
}
const isBulk = (m: MaterialId) => m === 'leather_scrap' || m === 'bone_fragment' || m === 'demon_claw' || m === 'concentrated_blood' || !!ORE_TIERS.find((o) => o.id === m) || !!WOOD_TIERS.find((w) => w.id === m);

// ---- what this player can be asked for
export function deliveryTier(save: Pick<SaveData, 'highestDungeonFloor'>): number {
  const f = save.highestDungeonFloor;
  const D = T.deliveries;
  return f >= D.tier4Floor ? 3 : f >= D.tier3Floor ? 2 : f >= D.tier2Floor ? 1 : 0;
}

interface Context {
  tier: number;
  available: Set<MaterialId>;
  ore: MaterialId;
  wood: MaterialId;
  // Every T3+ ore/wood tier the player has already unlocked (silver/gold_ore/obsidian,
  // ebony_wood/elven_wood/ancient_wood) — not just the current one. Without this, a "forja" order
  // could only ever ask for the single highest-unlocked tier, so silver stopped being requestable
  // for good the moment gold_ore unlocked, even though the player still holds (and keeps mining)
  // plenty of it. T1/T2 (copper/iron/common_wood/oak_wood) are deliberately NOT included here — they
  // keep following `ore`/`wood` exactly as before.
  oreTiersUnlocked: MaterialId[];
  woodTiersUnlocked: MaterialId[];
  processed: boolean;
}
const HIGHER_TIER_MIN_LEVEL = 25; // matches ORE_TIERS/WOOD_TIERS' 3rd entry (silver/ebony_wood)
function buildContext(save: SaveData): Context {
  const available = new Set<MaterialId>();
  for (const z of HUNTING_ZONES) if (isZoneUnlocked(z, save.highestDungeonFloor)) for (const d of z.drops) available.add(d.material);
  const garden = skillLevel(save.skillXp.gardening, 'gardening');
  for (const p of PLANTS) if (garden >= p.requiredLevel) available.add(p.material);
  const mining = skillLevel(save.skillXp.mining, 'mining');
  const wood = skillLevel(save.skillXp.woodcutting, 'woodcutting');
  const ore = [...ORE_TIERS].reverse().find((o) => mining >= o.requiredLevel)?.id ?? ORE_TIERS[0].id;
  const tree = [...WOOD_TIERS].reverse().find((w) => wood >= w.requiredLevel)?.id ?? WOOD_TIERS[0].id;
  const oreTiersUnlocked =
    mining >= HIGHER_TIER_MIN_LEVEL ? ORE_TIERS.filter((o) => o.requiredLevel >= HIGHER_TIER_MIN_LEVEL && mining >= o.requiredLevel).map((o) => o.id) : [ore];
  const woodTiersUnlocked =
    wood >= HIGHER_TIER_MIN_LEVEL ? WOOD_TIERS.filter((w) => w.requiredLevel >= HIGHER_TIER_MIN_LEVEL && wood >= w.requiredLevel).map((w) => w.id) : [tree];
  available.add(ore);
  available.add(tree);
  for (const id of oreTiersUnlocked) available.add(id);
  for (const id of woodTiersUnlocked) available.add(id);
  const processed = playerLevel(save.xp) >= T.deliveries.processedMinLevel;
  if (processed) for (const m of ['leather', 'steel', 'silver_ingot'] as MaterialId[]) available.add(m);
  return { tier: deliveryTier(save), available, ore, wood: tree, oreTiersUnlocked, woodTiersUnlocked, processed };
}

function pickWeighted<X>(items: X[], weights: number[], rng: Rng): X {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// "raw" archetype composition: 60% ore share / 40% wood share, split evenly across every T3+ tier the
// player has already unlocked (see Context.oreTiersUnlocked/woodTiersUnlocked) — same total share as
// before, just no longer collapsed onto a single material once a later tier unlocks.
function composition(arch: DeliveryArchetype, ctx: Context): Partial<Record<MaterialId, number>> | null {
  const def = ARCHETYPES[arch];
  if (def.processed && !ctx.processed) return null;
  let comp: Partial<Record<MaterialId, number>>;
  if (def.comp === 'raw') {
    comp = {};
    for (const id of ctx.oreTiersUnlocked) comp[id] = 0.6 / ctx.oreTiersUnlocked.length;
    for (const id of ctx.woodTiersUnlocked) comp[id] = 0.4 / ctx.woodTiersUnlocked.length;
  } else {
    comp = { ...def.comp };
  }
  const kept = (Object.entries(comp) as [MaterialId, number][]).filter(([m]) => ctx.available.has(m));
  if (kept.length === 0) return null;
  // The archetype's signature material must be there (a "rare alchemy" order without the Flor is just an ordinary one).
  if (arch === 'alq_raro' && !ctx.available.has('rare_flower')) return null;
  if (arch === 'alquimico' && !ctx.available.has('uncommon_root') && !ctx.available.has('crimson_mushroom')) return null;
  const total = kept.reduce((s, [, v]) => s + v, 0);
  return Object.fromEntries(kept.map(([m, v]) => [m, v / total]));
}

const HOUR = 3600 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

// Sizes the cargo of an order: which quantities of the archetype's materials add up to (about) the wanted reference value.
// Shares are of VALUE, so quantity = value share x target / baseGoldValue. A material that hits its ceiling is fixed there and
// the rest of the value is spread over the others; then single units are added/removed until the total is as close to the target
// as whole units allow. null = this archetype cannot make a worthwhile order of this size (the caller tries another).
function fitCargo(comp: [MaterialId, number][], signature: MaterialId[], target: number, capOf: (m: MaterialId) => number): Partial<Record<MaterialId, number>> | null {
  const items: Partial<Record<MaterialId, number>> = {};
  let free = comp.slice();
  let remaining = target;
  for (;;) {
    const totalW = free.reduce((sum, [, w]) => sum + w, 0);
    const over = totalW > 0 ? free.find(([m, w]) => (Math.max(0, remaining) * w) / totalW / baseGoldValue(m) > capOf(m)) : undefined;
    if (!over) break;
    items[over[0]] = capOf(over[0]);
    remaining -= capOf(over[0]) * baseGoldValue(over[0]);
    free = free.filter((x) => x !== over);
  }
  const totalW = free.reduce((sum, [, w]) => sum + w, 0);
  for (const [m, w] of free) {
    const q = totalW > 0 ? Math.round((Math.max(0, remaining) * w) / totalW / baseGoldValue(m)) : 0;
    const qty = q < 1 && signature.includes(m) ? 1 : q;
    if (qty > 0) items[m] = Math.min(qty, capOf(m));
  }
  const materials = comp.map(([m]) => m);
  const locked = new Set(signature);
  for (let guard = 0; guard < 400; guard++) {
    const gap = Math.abs(target - cargoReferenceValue(items));
    let best: { m: MaterialId; q: number; gap: number } | null = null;
    for (const m of materials) {
      const cur = items[m] ?? 0;
      for (const q of [cur + 1, cur - 1]) {
        if (q < 0 || q > capOf(m) || (q === 0 && locked.has(m))) continue;
        const next = { ...items, [m]: q };
        const g = Math.abs(target - cargoReferenceValue(next));
        if (g < gap - 1e-9 && (!best || g < best.gap)) best = { m, q, gap: g };
      }
    }
    if (!best) break;
    if (best.q === 0) delete items[best.m];
    else items[best.m] = best.q;
  }
  for (const m of signature) if (materials.includes(m) && !items[m]) return null;
  const cargo = cargoReferenceValue(items);
  const tol = T.deliveries.ratioTolerance;
  if (Object.keys(items).length === 0 || cargo < target * (1 - tol) || cargo > target * (1 + tol)) return null;
  return items;
}

function buildOffer(ctx: Context, arch: DeliveryArchetype, cls: DeliveryClass, id: string, now: number, rng: Rng): DeliveryOffer | null {
  const comp = composition(arch, ctx);
  if (!comp) return null;
  const D = T.deliveries;
  const def = ARCHETYPES[arch];
  const table = CLASS_DISTANCES[cls];
  let dist = pickWeighted(table.dists, table.weights, rng);
  if (def.processed && (dist === 'local' || dist === 'curta')) dist = 'regional'; // a fee-carrying order is never worth a short trip
  const hoursRef = distHours(dist) * (1 + D.durationJitter * (2 * rng() - 1));
  const durationMs = Math.max(FIVE_MIN, Math.round((hoursRef * HOUR) / FIVE_MIN) * FIVE_MIN);
  const hours = durationMs / HOUR;
  // 1) the reward: a function of tier x time only.
  const goldPerHour = D.goldPerHourBase + D.goldPerHourTier * ctx.tier + distGoldBonus(dist);
  const gold = Math.round(hours * goldPerHour);
  // 2) the cargo: sized so that its reference value is gold / rewardRatio(distance), whatever the archetype.
  const target = gold / rewardRatioTarget(dist);
  const signature = (def.signature ?? []).filter((m) => m in comp);
  const items = fitCargo(Object.entries(comp) as [MaterialId, number][], signature, target, (m) => quantityCap(m, dist));
  if (!items) return null;
  // Processing costs Gold: an order that asks for processed units may never let that fee eat more than a set share of what it pays.
  const fee = (Object.entries(items) as [MaterialId, number][]).reduce((t, [m, q]) => t + q * processingFee(m), 0);
  if (fee > D.processedFeeMaxShare * gold) return null;
  return {
    id,
    arch,
    dist,
    cls,
    tier: ctx.tier,
    items,
    gold,
    xp: Math.round(hours * distXpPerHour(dist)),
    shards: tierShards(dist, ctx.tier),
    durationMs,
    bornAt: now,
    dest: Math.min(DELIVERY_DESTINATIONS - 1, Math.floor(rng() * DELIVERY_DESTINATIONS)),
  };
}

// One offer for a class, never repeating an archetype already on the board when there is any other choice.
function generateOffer(ctx: Context, cls: DeliveryClass, avoid: DeliveryArchetype[], id: string, now: number, rng: Rng, strict = false): DeliveryOffer | null {
  const all = (Object.keys(ARCHETYPES) as DeliveryArchetype[]).filter((a) => ARCHETYPES[a].classes.includes(cls) && ARCHETYPES[a].tiers.includes(ctx.tier));
  for (const pool of strict ? [all.filter((a) => !avoid.includes(a))] : [all.filter((a) => !avoid.includes(a)), all]) {
    let left = [...pool];
    while (left.length > 0) {
      const arch = pickWeighted(left, left.map((a) => ARCHETYPES[a].weight), rng);
      const offer = buildOffer(ctx, arch, cls, id, now, rng);
      if (offer) return offer;
      left = left.filter((a) => a !== arch);
    }
  }
  return null;
}

const DELIVERY_CLASSES_ORDER: DeliveryClass[] = ['simple', 'mid', 'hard'];

// Slots 0-2 are always simple / mid / hard. Any extra slot (Battle Pass) is a variable one: a random class among those that
// still have an archetype the board is not using, so four offers never repeat an archetype when that can be avoided.
function generateSlot(ctx: Context, index: number, avoid: DeliveryArchetype[], id: string, now: number, rng: Rng, keepClass?: DeliveryClass): DeliveryOffer | null {
  if (keepClass) return generateOffer(ctx, keepClass, avoid, id, now, rng);
  if (index < 3) return generateOffer(ctx, DELIVERY_CLASSES_ORDER[index], avoid, id, now, rng);
  const order = [...DELIVERY_CLASSES_ORDER].sort(() => rng() - 0.5);
  for (const cls of order) {
    const fresh = generateOffer(ctx, cls, avoid, id, now, rng, true);
    if (fresh) return fresh;
  }
  return generateOffer(ctx, order[0], avoid, id, now, rng);
}

export function offerCount(passActive: boolean): number {
  return passActive ? T.deliveries.offersPass : T.deliveries.offersBase;
}
export function rerollCap(passActive: boolean): number {
  return passActive ? T.deliveries.rerollsPass : T.deliveries.rerollsBase;
}
export const deliveryDayKey = (now: number): string => new Date(now).toDateString();
export function rerollsLeft(d: DeliveryState, now: number, passActive: boolean): number {
  const used = d.rerollDay === deliveryDayKey(now) ? d.rerollsUsed : 0;
  return Math.max(0, rerollCap(passActive) - used);
}
// XP an order pays when accepted by a player with (or without) the Battle Pass. Gold, shards, materials and time never change.
export function deliveryXp(offer: Pick<DeliveryOffer, 'xp'>, passActive: boolean): number {
  return passActive ? Math.round(offer.xp * (1 + T.deliveries.passXpBonus)) : offer.xp;
}
export const isOfferExpired = (o: DeliveryOffer, now: number): boolean => now - o.bornAt >= T.deliveries.offerTtlHours * HOUR;

function nextSeq(d: DeliveryState): number {
  let m = d.seq;
  for (const o of [...d.offers, ...(d.active ? [d.active.offer] : [])]) m = Math.max(m, Number(o.id.slice(1)) || 0);
  return m;
}

// Fills the board up to the target size and swaps out offers older than the TTL (same slot, same class). Returns the SAME
// object when nothing changed. Call it whenever the board is about to be shown or after the player acts on it.
export function ensureDeliveryOffers(save: SaveData, now: number, rng: Rng, passActive: boolean): SaveData {
  const d = save.deliveries;
  const target = offerCount(passActive);
  const ctx = buildContext(save);
  let seq = nextSeq(d);
  let changed = false;
  const offers: DeliveryOffer[] = d.offers.slice(0, target);
  if (offers.length !== d.offers.length) changed = true;
  for (let i = 0; i < target; i++) {
    const cur = offers[i];
    if (cur && !isOfferExpired(cur, now)) continue;
    const others = offers.filter((_, j) => j !== i).map((o) => o.arch);
    const fresh = generateSlot(ctx, i, others, `d${seq + 1}`, now, rng, cur?.cls);
    if (!fresh) continue;
    seq++;
    offers[i] = fresh;
    changed = true;
  }
  const compact = offers.filter(Boolean);
  if (!changed) return save;
  return { ...save, deliveries: { ...d, seq, offers: compact } };
}

// Accepting: everything or nothing. Needs the slot free, a live offer and every material in the bag; takes the materials at once,
// snapshots the offer as the active delivery and puts a fresh offer of the same class in its place.
export function applyDeliveryAccept(save: SaveData, offerId: string, now: number, rng: Rng, passActive = false): SaveData | null {
  if (typeof now !== 'number' || !Number.isFinite(now) || now <= 0) return null;
  const d = save.deliveries;
  if (d.active) return null;
  const index = d.offers.findIndex((o) => o.id === offerId);
  if (index < 0) return null;
  const offer = d.offers[index];
  if (isOfferExpired(offer, now) || !hasMaterials(save.materials, offer.items)) return null;
  const materials = { ...save.materials };
  for (const [m, q] of Object.entries(offer.items) as [MaterialId, number][]) materials[m] = (materials[m] ?? 0) - q;
  // The Pass XP bonus is decided here and frozen in the snapshot: later Pass expiry or tunable changes do not touch it.
  const active: ActiveDelivery = { offer: { ...offer, xp: deliveryXp(offer, passActive) }, startedAt: now, endsAt: now + offer.durationMs };
  const others = d.offers.filter((_, j) => j !== index).map((o) => o.arch);
  const seq = nextSeq(d);
  const fresh = generateOffer(buildContext(save), offer.cls, others, `d${seq + 1}`, now, rng);
  const offers = d.offers.filter((_, j) => j !== index);
  if (fresh) offers.splice(Math.min(index, offers.length), 0, fresh);
  return { ...save, materials, deliveries: { ...d, seq: fresh ? seq + 1 : seq, offers, active } };
}

export interface DeliveryClaim {
  save: SaveData;
  offer: DeliveryOffer;
  xpGained: number;
}

// Idempotent: the active delivery is cleared by the same transition that pays it, so a second call finds nothing to claim.
// Not ready (or clock before the end) -> null and nothing changes. No RNG: everything comes from the frozen snapshot.
export function applyDeliveryClaim(save: SaveData, now: number): DeliveryClaim | null {
  const a = save.deliveries.active;
  if (!a || typeof now !== 'number' || !Number.isFinite(now) || now < a.endsAt) return null;
  const atCap = playerLevel(save.xp) >= MAX_LEVEL;
  const xpGained = atCap ? 0 : a.offer.xp;
  return {
    offer: a.offer,
    xpGained,
    save: {
      ...save,
      gold: save.gold + a.offer.gold,
      xp: save.xp + xpGained,
      shards: save.shards + a.offer.shards,
      deliveries: { ...save.deliveries, active: null },
      // The daily "Explorer" quest keeps counting under its old counter name (saves stay compatible).
      quests: { ...save.quests, daily: { ...save.quests.daily, expeditions: (save.quests.daily.expeditions ?? 0) + 1 } },
    },
  };
}

// Reroll: replaces every offer on the board (the active delivery is untouched). Free, limited per local calendar day.
export function applyDeliveryReroll(save: SaveData, now: number, rng: Rng, passActive: boolean): SaveData | null {
  const d = save.deliveries;
  if (rerollsLeft(d, now, passActive) <= 0) return null;
  const ctx = buildContext(save);
  let seq = nextSeq(d);
  const offers: DeliveryOffer[] = [];
  const target = offerCount(passActive);
  for (let i = 0; i < target; i++) {
    const fresh = generateSlot(ctx, i, offers.map((o) => o.arch), `d${seq + 1}`, now, rng);
    if (!fresh) continue;
    seq++;
    offers.push(fresh);
  }
  if (offers.length === 0) return null;
  const day = deliveryDayKey(now);
  return { ...save, deliveries: { ...d, seq, offers, rerollDay: day, rerollsUsed: (d.rerollDay === day ? d.rerollsUsed : 0) + 1 } };
}

// Express ticket: takes a fixed number of hours off the active delivery (never past "now"). One call spends one ticket.
export function applyDeliveryTicket(save: SaveData, ticketId: ConsumableId, now: number): SaveData | null {
  const a = save.deliveries.active;
  const skip = EXPEDITION_TICKET_SKIP_MS[ticketId];
  if (!a || !skip || !(a.endsAt > now) || (save.consumables[ticketId] ?? 0) < 1) return null;
  return {
    ...save,
    consumables: { ...save.consumables, [ticketId]: (save.consumables[ticketId] ?? 0) - 1 },
    deliveries: { ...save.deliveries, active: { ...a, endsAt: Math.max(now, a.endsAt - skip) } },
  };
}

export const isDeliveryReady = (save: Pick<SaveData, 'deliveries'>, now: number): boolean => !!save.deliveries.active && now >= save.deliveries.active.endsAt;
export function canAffordOffer(save: Pick<SaveData, 'materials'>, offer: DeliveryOffer): boolean {
  return hasMaterials(save.materials, offer.items);
}
