import { HUNTING_ZONES, isZoneUnlocked } from './huntingZones';
import { EXPEDITION_TICKET_SKIP_MS, ConsumableId } from './consumables';
import { MAX_LEVEL, playerLevel, SaveData } from './engine';
import { PLANTS } from './garden';
import { hasMaterials, MaterialId } from './materials';
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
//  - What an order asks for is sized by an "economic weight" per material: a production-scarcity index in scrap
//    equivalents, NOT a Gold price. It only keeps one Flor from being asked for as if it were one Farrapo.
//  - Everything is decided when an offer is generated (the only place RNG is used) and then frozen. Accepting consumes
//    the materials at once and snapshots the offer; claiming reads that snapshot, so it is deterministic and idempotent.
//  - One active delivery for everybody. The Battle Pass only adds convenience (one more visible offer, one more reroll).

export type Rng = () => number;

// ---- economic weights (scrap equivalents). Derived from units/day of a dedicated active day, so a scarcer material weighs more.
const BASE_WEIGHT: Partial<Record<MaterialId, number>> = {
  leather_scrap: 1,
  bone_fragment: 1.12,
  demon_claw: 1.01,
  concentrated_blood: 1.01,
  demon_core: 5.3, // x1.5 rarity premium
  corrupted_crystal: 4.97,
  common_herb: 13.25,
  energy_herb: 8.83,
  uncommon_root: 26.5,
  crimson_mushroom: 26.5,
  rare_flower: 53, // x2 rarity premium (scarce, and gates the Strength Elixir)
  copper: 0.66,
  iron: 0.86,
  silver: 1.06,
  gold_ore: 1.26,
  obsidian: 1.46,
  common_wood: 0.66,
  oak_wood: 0.86,
  ebony_wood: 1.06,
  elven_wood: 1.26,
  ancient_wood: 1.46,
};
const PROCESSING_PREMIUM = 1.1;

// Cost in Gold of one unit of a processed material (its cheapest real recipe), from the refining table.
function recipeFor(m: MaterialId) {
  return REFINING_RECIPES.find((r) => r.output === m && r.station !== 'dust');
}
export function processingFee(m: MaterialId): number {
  const r = recipeFor(m);
  return r ? r.cost / r.outputQty : 0;
}
export function materialWeight(m: MaterialId): number {
  const base = BASE_WEIGHT[m];
  if (base !== undefined) return base;
  const r = recipeFor(m);
  if (!r) return 1;
  let w = 0;
  for (const [k, q] of Object.entries(r.input) as [MaterialId, number][]) w += q * materialWeight(k);
  return (w * PROCESSING_PREMIUM) / r.outputQty + processingFee(m) * T.deliveries.processedFeeWeight;
}

// ---- archetypes
interface ArchetypeDef {
  classes: DeliveryClass[];
  tiers: number[];
  weight: number;
  comp: Partial<Record<MaterialId, number>> | 'raw'; // share of the order's weight budget
  processed?: boolean;
}
const ARCHETYPES: Record<DeliveryArchetype, ArchetypeDef> = {
  medicinal: { classes: ['simple', 'mid'], tiers: [0, 1, 2, 3], weight: 2.4, comp: { common_herb: 0.7, energy_herb: 0.3 } },
  alquimico: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 0.7, comp: { energy_herb: 0.7, uncommon_root: 0.15, crimson_mushroom: 0.15 } },
  alq_raro: { classes: ['hard'], tiers: [3], weight: 0.6, comp: { energy_herb: 0.55, rare_flower: 0.25, crimson_mushroom: 0.2 } },
  militar: { classes: ['simple', 'mid', 'hard'], tiers: [0, 1, 2, 3], weight: 3, comp: { leather_scrap: 0.3, bone_fragment: 0.1, demon_claw: 0.6 } },
  armadura: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 2.4, comp: { bone_fragment: 0.3, leather_scrap: 0.15, concentrated_blood: 0.45, corrupted_crystal: 0.15 } },
  raro: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 3.6, comp: { leather_scrap: 0.2, bone_fragment: 0.1, demon_claw: 0.2, concentrated_blood: 0.1, demon_core: 0.2, corrupted_crystal: 0.2 } },
  forja: { classes: ['simple', 'mid', 'hard'], tiers: [0, 1, 2, 3], weight: 1.5, comp: 'raw' },
  comercial: { classes: ['mid', 'hard'], tiers: [1, 2, 3], weight: 1, comp: { leather: 0.45, steel: 0.3, silver_ingot: 0.25 }, processed: true },
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
function weightPerHour(tier: number): number {
  const D = T.deliveries;
  return [D.weightPerHourT1, D.weightPerHourT2, D.weightPerHourT3, D.weightPerHourT4][tier] ?? D.weightPerHourT1;
}
function quantityCap(m: MaterialId): number {
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
  return caps[m] ?? (recipeFor(m) ? D.capProcessed : D.capRawMaterial);
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
  processed: boolean;
}
function buildContext(save: SaveData): Context {
  const available = new Set<MaterialId>();
  for (const z of HUNTING_ZONES) if (isZoneUnlocked(z, save.highestDungeonFloor)) for (const d of z.drops) available.add(d.material);
  const garden = skillLevel(save.skillXp.gardening);
  for (const p of PLANTS) if (garden >= p.requiredLevel) available.add(p.material);
  const mining = skillLevel(save.skillXp.mining);
  const wood = skillLevel(save.skillXp.woodcutting);
  const ore = [...ORE_TIERS].reverse().find((o) => mining >= o.requiredLevel)?.id ?? ORE_TIERS[0].id;
  const tree = [...WOOD_TIERS].reverse().find((w) => wood >= w.requiredLevel)?.id ?? WOOD_TIERS[0].id;
  available.add(ore);
  available.add(tree);
  const processed = playerLevel(save.xp) >= T.deliveries.processedMinLevel;
  if (processed) for (const m of ['leather', 'steel', 'silver_ingot'] as MaterialId[]) available.add(m);
  return { tier: deliveryTier(save), available, ore, wood: tree, processed };
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

function composition(arch: DeliveryArchetype, ctx: Context): Partial<Record<MaterialId, number>> | null {
  const def = ARCHETYPES[arch];
  if (def.processed && !ctx.processed) return null;
  const comp: Partial<Record<MaterialId, number>> = def.comp === 'raw' ? { [ctx.ore]: 0.6, [ctx.wood]: 0.4 } : { ...def.comp };
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
  const budget = hours * weightPerHour(ctx.tier);
  const items: Partial<Record<MaterialId, number>> = {};
  for (const [m, share] of Object.entries(comp) as [MaterialId, number][]) {
    const factor = dist === 'especial' ? (isBulk(m) ? D.bulkSpecialFactor : 1) : dist === 'longa' ? 1 : D.shortCapFactor;
    const q = Math.round((budget * share) / materialWeight(m));
    items[m] = Math.max(1, Math.min(Math.max(1, Math.round(quantityCap(m) * factor)), q));
  }
  const goldPerHour = D.goldPerHourBase + D.goldPerHourTier * ctx.tier + distGoldBonus(dist);
  const gold = Math.round(hours * goldPerHour);
  // Processing costs Gold: shave processed units until the fee is at most a fixed share of what the order pays.
  const fee = () => (Object.entries(items) as [MaterialId, number][]).reduce((t, [m, q]) => t + q * processingFee(m), 0);
  while (fee() > D.processedFeeMaxShare * gold) {
    const worst = (Object.keys(items) as MaterialId[]).filter((m) => processingFee(m) > 0).sort((a, b) => items[b]! * processingFee(b) - items[a]! * processingFee(a))[0];
    if (!worst) break;
    items[worst] = items[worst]! - 1;
    if (items[worst]! <= 0) delete items[worst];
  }
  if (Object.keys(items).length === 0) return null;
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
export function applyDeliveryAccept(save: SaveData, offerId: string, now: number, rng: Rng): SaveData | null {
  if (typeof now !== 'number' || !Number.isFinite(now) || now <= 0) return null;
  const d = save.deliveries;
  if (d.active) return null;
  const index = d.offers.findIndex((o) => o.id === offerId);
  if (index < 0) return null;
  const offer = d.offers[index];
  if (isOfferExpired(offer, now) || !hasMaterials(save.materials, offer.items)) return null;
  const materials = { ...save.materials };
  for (const [m, q] of Object.entries(offer.items) as [MaterialId, number][]) materials[m] = (materials[m] ?? 0) - q;
  const active: ActiveDelivery = { offer, startedAt: now, endsAt: now + offer.durationMs };
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
