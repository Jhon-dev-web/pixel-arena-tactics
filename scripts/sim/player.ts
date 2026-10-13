// The simulated player: a greedy, documented policy on top of the real game functions (see driver.ts for what is mirrored
// from the UI layer). One Player = one account; `checkIn` is one visit to the game.
import {
  applyEquipInstance,
  applyDiscardInstance,
  applyForge,
  applyRepair,
  applySocketGem,
  applyUpgrade,
  isInstanceEquipped,
  listGearInstances,
  resolveEquipped,
  GearInstance,
  createGearInstance,
} from '../../src/game/gearInstances';
import { computeCP, effectiveRepairCost, playerLevel, SaveData, defaultSave } from '../../src/game/engine';
import { GEAR, getGear, INSTANCED_SLOTS, MAX_REFINE, upgradeCost } from '../../src/game/gear';
import { GEMS, GemId, socketsForTier } from '../../src/game/gems';
import { MaterialId, MATERIALS } from '../../src/game/materials';
import { REFINING_RECIPES } from '../../src/game/refining';
import { PLANTS } from '../../src/game/garden';
import { applyHarvest, applyPlant, readySlots } from '../../src/game/gardenActions';
import { applyElixir, applyRepairKit, ElixirId } from '../../src/game/elixirs';
import { isBuffActive } from '../../src/game/buffs';
import { MILESTONE_FLOORS } from '../../src/game/dungeon';
import { deepestDepth, depthsUnlocked, nextDepthStage } from '../../src/game/depths';
import { paragonLevel } from '../../src/game/paragon';
import { POTION_RECIPES } from '../../src/game/potions';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import { skillLevel, skillXpToReachLevel, gatherPower, BASE_GATHER_POWER } from '../../src/game/skills';
import {
  HUNTING_ZONES,
  HuntingDepth,
  isDepthUnlocked,
  isZoneUnlocked,
} from '../../src/game/huntingZones';
import { applyHuntClaim, huntClaimBlocked, planHuntClaim, requestHuntStart, applyHuntStop } from '../../src/game/huntLifecycle';
import { applyDeliveryAccept, applyDeliveryClaim, canAffordOffer, ensureDeliveryOffers } from '../../src/game/deliveries';
import { bagFreeSlots, expandInventory, inventoryCapacity, inventorySlotsUsed, slotsForQty } from '../../src/game/inventory';
import { applyStashMove, applyStashUpgrade, nextStashUpgrade, stashFreeSlots, stashSlotsUsed } from '../../src/game/stash';
import { applyMerchantSell, merchantPrice, merchantRemaining } from '../../src/game/merchant';
import { applyDiscard } from '../../src/game/bagActions';
import { baseGoldValue } from '../../src/game/economy';
import { huntInventoryStatus } from '../../src/game/huntInventory';
import { computeMiningStatus, computeWoodcuttingStatus } from '../../src/game/engine';
import T from '../../src/game/tunables';
import {
  applyDungeonRun,
  buyConsumable,
  claimGathering,
  craftPotion,
  claimQuests,
  DungeonRun,
  enterDungeon,
  refineMaterial,
  reload,
  runDungeon,
  spendAttributePoints,
  spendSkillPoints,
  SkillBuild,
  startGathering,
} from './driver';

type Mats = Partial<Record<MaterialId, number>>;
export const HOUR = 3600 * 1000;

export const HUNT_MATS: MaterialId[] = ['leather_scrap', 'bone_fragment', 'demon_claw', 'concentrated_blood', 'demon_core', 'corrupted_crystal', 'rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart'];
const ORE_IDS = ORE_TIERS.map((o) => o.id as MaterialId);
const WOOD_IDS = WOOD_TIERS.map((w) => w.id as MaterialId);

// Rarity tier of a material for the "materials per day" table: Hunting uses the drop's own rarity; ore and wood use
// their tier (T1-T2 common, T3-T4 uncommon, T5 rare).
const HUNT_RARITY: Partial<Record<MaterialId, 'common' | 'uncommon' | 'rare'>> = {};
for (const z of HUNTING_ZONES) for (const d of z.drops) HUNT_RARITY[d.material] = d.rarity;
export function rarityOf(m: MaterialId): 'common' | 'uncommon' | 'rare' {
  const h = HUNT_RARITY[m];
  if (h) return h;
  const idx = Math.max(ORE_IDS.indexOf(m), WOOD_IDS.indexOf(m));
  return idx >= 4 ? 'rare' : idx >= 2 ? 'uncommon' : 'common';
}

// ---- per-day ledger -----------------------------------------------------------------------------------------------

export interface SessionRecord {
  day: number; // 1-based
  index: number; // 1-based among that day's sessions
  startFloor: number;
  endFloor: number; // floor the next session starts on (startFloor + stages)
  stages: number;
  seconds: number;
  outcome: 'retreat' | 'defeat';
  cpAtStart: number;
}

export interface DayLedger {
  xpIn: Record<string, number>; // character XP by source (masmorra / caça / pedido / missões)
  goldIn: Record<string, number>;
  goldOut: Record<string, number>;
  mats: { common: number; uncommon: number; rare: number };
  matsValue: number; // the same units at the economic reference value (economy.ts baseGoldValue)
  lost: number; // units a hunt claim left behind because the inventory had no room
  // Inventory bookkeeping of the day (units unless said otherwise): slots at the day's highest point and at its end, what gathering left behind, and what the
  // inventory policy did (stashed / sold / discarded).
  inv: { slotsMax: number; slotsEnd: number; capacity: number; lostGather: number; stashed: number; sold: number; discarded: number };
  hours: { hunt: number; mine: number; wood: number };
  units: Record<string, number>; // ore / wood / garden units that entered the bag today, by material id
  // Per-material flow of every Hunting material of the day (Rodada 9, docs/MATERIAL_FLOW.md): what the claims accepted, what they left behind for lack of room,
  // what each sink consumed (bag + stash together, so moving stock between them is not a sink) and the stock (bag + stash) at the end of the day.
  flow: Record<string, MatFlow>;
  // Runas (the `shards` currency) and gems earned / spent today, by source or use.
  // Hunting by place: hours and accepted units per material for each zone:depth the player hunted today.
  hunt: Record<string, { hours: number; units: Record<string, number> }>;
  // Unique pieces the hunts delivered today, by `zone:templateId:rarity`.
  uniques: Record<string, number>;
  currency: { shardsIn: Record<string, number>; shardsOut: Record<string, number>; gemsIn: Record<string, number>; gemsOut: Record<string, number> };
  // Materials the player threw away today, by material and by why nothing better was possible at that moment (see DiscardReason). Units a claim left behind for lack of
  // room (`flow[m].left`) are the fourth reason, 'bag', and are read from the flow.
  discards: Record<string, Record<DiscardReason, number>>;
}

// Why a unit was thrown away: the stash had no free slot ('stash'), the merchant's budget of the day was spent ('merchant'), or both had room and the policy still threw
// the cheap surplus ('policy'). 'bag' (not in this record) = the claim itself left it behind because the bag was full.
export type DiscardReason = 'stash' | 'merchant' | 'policy';

export type FlowSink = 'forge' | 'upgrade' | 'alchemy' | 'stash' | 'delivery' | 'workshop' | 'dust' | 'merchant' | 'discard' | 'other';
export const REAL_USE_SINKS: FlowSink[] = ['forge', 'upgrade', 'alchemy', 'stash', 'delivery', 'workshop'];
export const DISPOSAL_SINKS: FlowSink[] = ['dust', 'merchant', 'discard', 'other'];
export interface MatFlow {
  produced: number; // raw sources: hunting, mining, woodcutting, garden (what entered the inventory)
  refined: number; // made by a station (bars, ingots, leather, handles, essence, scales, dust)
  left: number; // raw units a claim left behind for lack of room
  residual: number; // stock change the ledger could not explain (should be 0)
  consumed: Record<FlowSink, number>;
  stockEnd: number;
}
const newFlow = (): Record<string, MatFlow> =>
  Object.fromEntries(MATERIALS.map((d) => [d.id, { produced: 0, refined: 0, left: 0, residual: 0, consumed: { forge: 0, upgrade: 0, alchemy: 0, stash: 0, delivery: 0, workshop: 0, dust: 0, merchant: 0, discard: 0, other: 0 }, stockEnd: 0 }]));

const newLedger = (): DayLedger => ({ xpIn: {}, goldIn: {}, goldOut: {}, mats: { common: 0, uncommon: 0, rare: 0 }, matsValue: 0, lost: 0, inv: { slotsMax: 0, slotsEnd: 0, capacity: 0, lostGather: 0, stashed: 0, sold: 0, discarded: 0 }, hours: { hunt: 0, mine: 0, wood: 0 }, units: {}, flow: newFlow(), hunt: {}, uniques: {}, currency: { shardsIn: {}, shardsOut: {}, gemsIn: {}, gemsOut: {} }, discards: {} });

export interface DaySnapshot {
  day: number;
  level: number;
  cp: number;
  floor: number; // highestDungeonFloor as the game stores it (the floor the next session starts on)
  weaponTier: number;
  armorTier: number;
  gold: number;
  shards: number; // Runas in hand at the end of the day
  // Profession levels at the end of the day (Gardening is 1 for a player who never plants).
  skills: { mining: number; woodcutting: number; gardening: number };
  // Best tier owned in each of the six slots at the end of the day (what the gear timeline is made of).
  tiers: Record<string, number>;
  stashLevel: number;
  stashSlots: number;
  ledger: DayLedger;
  sessions: SessionRecord[];
  // Long-horizon sim (longHaul.sim.ts): Profundezas depth reached, paragon level, the tier worn in each of the seven slots, and what stands between the hero and the next step.
  depth: number;
  paragon: number;
  wornTiers: number[];
  blockers: { gear: string; dungeon: string };
}

export type FirstEvent = 'firstCraft' | 'firstRelic' | 'firstRefine' | 'floor10' | 'floor24' | 'floor25' | 'floor50' | 'boss50' | 'zone2' | 'bagFull' | 'stash1' | 'stash2' | 'stash3';

// ---- planner ------------------------------------------------------------------------------------------------------

interface Plan {
  tpl: string;
  slot: string;
  crafts: string[];
  gold: number; // craft prices + refining-station fees
  shards: number;
  gems: Partial<Record<GemId, number>>;
  minLevel: number;
  batches: { recipeId: string; times: number }[];
  deficit: Mats; // raw units still missing after refining and what the bag (and the stash, for a stash-aware plan) already holds
  needs: Mats; // every unit the plan consumes, intermediate materials included (what must stay in the bag until the craft)
  blocked: boolean; // needs something no activity can fetch right now (level, gems, shards)
  impossible: boolean;
}

const recipeFor = (m: MaterialId) => REFINING_RECIPES.find((r) => r.output === m && r.station !== 'dust');

function unequippedCounts(s: SaveData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of Object.values(s.gearInstances)) if (!isInstanceEquipped(s, i.id)) out[i.templateId] = (out[i.templateId] ?? 0) + 1;
  return out;
}

// `bagOnly`: count only what the inventory holds (recipes consume nothing else); otherwise the stash counts as available (it can be brought over).
const owned = (s: SaveData, m: MaterialId, bagOnly: boolean): number => (s.materials[m] ?? 0) + (bagOnly ? 0 : s.stash?.materials[m] ?? 0);

export function planFor(s: SaveData, tpl: string, bagOnly = false): Plan {
  const item = getGear(tpl);
  const plan: Plan = {
    tpl,
    slot: item.slot,
    crafts: [],
    gold: 0,
    shards: 0,
    gems: {},
    minLevel: 0,
    batches: [],
    deficit: {},
    needs: {},
    blocked: false,
    impossible: false,
  };
  const haveItems = unequippedCounts(s);
  const need: Mats = {};
  const walk = (id: string, count: number) => {
    for (let i = 0; i < count; i++) {
      if ((haveItems[id] ?? 0) > 0) {
        haveItems[id]--;
        continue;
      }
      const it = getGear(id);
      const r = it?.recipe;
      if (!r) {
        plan.impossible = true;
        return;
      }
      plan.crafts.push(id);
      plan.gold += it.cost;
      plan.minLevel = Math.max(plan.minLevel, r.requiredLevel ?? 0);
      plan.shards += r.shards ?? 0;
      for (const [g, n] of Object.entries(r.gems ?? {})) plan.gems[g as GemId] = (plan.gems[g as GemId] ?? 0) + (n as number);
      for (const [m, n] of Object.entries(r.materials ?? {})) need[m as MaterialId] = (need[m as MaterialId] ?? 0) + (n as number);
      for (const [sub, n] of Object.entries(r.items ?? {})) walk(sub, n as number);
    }
  };
  walk(tpl, 1);
  // Lowest tier first. The recipe walk lists a piece before its ingredients, so on a tie in tier (the tier-4 dragon pieces are made from a tier-4 gilded one) the later entry,
  // the ingredient, goes first. The 21-day sim never reaches a tie.
  plan.crafts = plan.crafts.map((id, i) => ({ id, i })).sort((a, b) => (getGear(a.id).tier ?? 0) - (getGear(b.id).tier ?? 0) || b.i - a.i).map((x) => x.id);

  // Expand what the bag cannot cover through the refining stations (copper -> bar, scrap -> leather, ...), to a fixpoint.
  const made: Mats = {};
  const batches: Record<string, number> = {};
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const m of Object.keys(need) as MaterialId[]) {
      const short = (need[m] ?? 0) - owned(s, m, bagOnly) - (made[m] ?? 0);
      const rec = recipeFor(m);
      if (short > 0 && rec) {
        const b = Math.ceil(short / rec.outputQty);
        batches[rec.id] = (batches[rec.id] ?? 0) + b;
        made[m] = (made[m] ?? 0) + b * rec.outputQty;
        plan.gold += b * rec.cost;
        plan.minLevel = Math.max(plan.minLevel, rec.requiredLevel);
        for (const [im, q] of Object.entries(rec.input)) need[im as MaterialId] = (need[im as MaterialId] ?? 0) + (q as number) * b;
        changed = true;
      }
    }
    if (!changed) break;
  }
  plan.batches = Object.entries(batches).map(([recipeId, times]) => ({ recipeId, times }));
  for (const m of Object.keys(need) as MaterialId[]) {
    if (recipeFor(m)) continue;
    const short = (need[m] ?? 0) - owned(s, m, bagOnly);
    if (short > 0) plan.deficit[m] = short;
  }
  plan.needs = need;
  const lvl = playerLevel(s.xp);
  // A missing gem is bought with Runas (buyGemsForTarget), so it only blocks the plan when the Runas that the recipe and the missing gems need are not there.
  const gemShards = Object.entries(plan.gems).reduce((sum, [g, n]) => sum + Math.max(0, (n as number) - (s.gems[g as GemId] ?? 0)) * (GEMS.find((x) => x.id === g)?.shardCost ?? 0), 0);
  plan.blocked = lvl < plan.minLevel || s.shards < plan.shards + gemShards;
  return plan;
}

function bestTier(s: SaveData, slot: string): number {
  let best = 0;
  for (const i of Object.values(s.gearInstances)) {
    const it = getGear(i.templateId);
    if (it?.slot === slot) best = Math.max(best, it.tier ?? 0);
  }
  return best;
}

export function equippedTier(s: SaveData, slot: 'weapon' | 'armor'): number {
  return resolveEquipped(s)[slot].item.tier ?? 0;
}

// Crafting priority inside one tier: weapon > armor > gloves > helmet > shield > boots > ring (Rodada 3, shield added in Rodada 6). The extra slots only have
// one piece per tier and the "1 of the previous tier" chain, so a slot is simply the next tier above the best piece owned.
export const CRAFT_PRIORITY = ['weapon', 'armor', 'gloves', 'helmet', 'shield', 'boots', 'ring'] as const;

// The next thing worth crafting: the lowest tier first (slot priority on a tie), skipping a slot that is blocked on something
// no activity can fetch when another one is not.
export function chooseTarget(s: SaveData, bagOnly = false): Plan | null {
  const plans: Plan[] = [];
  for (const slot of CRAFT_PRIORITY) {
    const owned = bestTier(s, slot);
    const cands = GEAR.filter((g) => g.slot === slot && g.recipe && (g.tier ?? 0) > owned);
    if (cands.length === 0) continue;
    const minTier = Math.min(...cands.map((g) => g.tier ?? 0));
    const atTier = cands.filter((g) => (g.tier ?? 0) === minTier);
    // The cheapest piece of the tier; the sword and the axe of a tier cost the same (Rodada 6), so the weapon slot has two of them: the line already being
    // climbed first (its plan crafts fewer pieces), then the one that gives the better CP.
    const cheapest = Math.min(...atTier.map((g) => g.cost));
    const ties = atTier.filter((g) => g.cost === cheapest);
    const p = ties.length === 1 ? planFor(s, ties[0].id, bagOnly) : bestWeaponPlan(s, ties, bagOnly);
    if (!p.impossible) plans.push(p);
  }
  const priority = (p: Plan) => CRAFT_PRIORITY.indexOf(p.slot as (typeof CRAFT_PRIORITY)[number]);
  // Relic (Rodada 4): one stackable piece for the single relic slot, no tiers. Once none is owned, the one that adds the most CP is worth crafting after the
  // whole tier-2 set (RELIC_AFTER_TIER), so it never delays the weapon / armor of a tier but does not wait for tier 4 either.
  const relic = chooseRelic(s, bagOnly);
  if (relic) plans.push(relic);
  const owned = (p: Plan) => (p.slot === 'relic' ? RELIC_AFTER_TIER : bestTier(s, p.slot));
  plans.sort((a, b) => Number(a.blocked) - Number(b.blocked) || owned(a) - owned(b) || priority(a) - priority(b));
  return plans[0] ?? null;
}

// A weapon of one template worn in place of the current one, to compare lines by the game's own computeCP (refine +0, common).
function cpWith(s: SaveData, tpl: string): number {
  const inst = createGearInstance(tpl, { id: 'probe', origin: 'admin', rarity: 'common', substats: [] });
  const trial = applyEquipInstance({ ...s, gearInstances: { ...s.gearInstances, probe: inst } }, 'probe');
  return trial ? computeCP(trial) : 0;
}

function bestWeaponPlan(s: SaveData, items: { id: string }[], bagOnly: boolean): Plan {
  const scored = items.map((g) => ({ plan: planFor(s, g.id, bagOnly), cp: cpWith(s, g.id) }));
  scored.sort((a, b) => Number(a.plan.impossible) - Number(b.plan.impossible) || a.plan.crafts.length - b.plan.crafts.length || b.cp - a.cp);
  return scored[0].plan;
}

const RELIC_AFTER_TIER = 2.5;
// Craftable relics (the player forges one) and every relic that can be worn (the boss relics are drops: the policy wears whichever owned relic gives the best CP).
const relicIds = (): string[] => GEAR.filter((g) => g.slot === 'relic' && g.recipe).map((g) => g.id);
const withRelic = (s: SaveData, id: string | null): SaveData => ({ ...s, equipped: { ...s.equipped, relic: id } });
const ownedCraftedRelics = (s: SaveData): string[] => relicIds().filter((id) => (s.inventory[id] ?? 0) > 0);
const ownedRelics = (s: SaveData): string[] => GEAR.filter((g) => g.slot === 'relic' && (s.inventory[g.id] ?? 0) > 0).map((g) => g.id);

function chooseRelic(s: SaveData, bagOnly = false): Plan | null {
  if (ownedCraftedRelics(s).length > 0) return null;
  let best: Plan | null = null;
  let bestCp = -Infinity;
  for (const id of relicIds()) {
    const p = planFor(s, id, bagOnly);
    if (p.impossible) continue;
    const cp = computeCP(withRelic(s, id));
    if (cp > bestCp) {
      bestCp = cp;
      best = p;
    }
  }
  return best;
}

// ---- the player ---------------------------------------------------------------------------------------------------

const REFINE_DUST_SOURCES: MaterialId[] = ['bone_fragment', 'leather_scrap', 'copper', 'common_herb'];
const POTION_STOCK = 5;
const CHECKIN_HOURS = [9, 21]; // two visits a day, 12 hours apart
const JITTER_MS = 90 * 60 * 1000;

export interface PlayerOptions {
  // Diagnostic only (not a scenario of the report): never accept a delivery order, to isolate how much of the XP / gold comes from Hunting
  // and the Dungeon alone.
  noOrders?: boolean;
  // false = the policy never crafts or drinks the Garden 3.0 tonics (the control run of the tonic budget check).
  tonics?: boolean;
  // Profession scenarios (not part of the balance targets): `garden` plants / harvests the plots at every visit (what the next craft
  // needs first, otherwise the longest plant that fits the 12 h between visits); `balanced` is a player who spends the second visit of
  // the day gathering (mining on even days, woodcutting on odd ones, the best unlocked tier) instead of hunting.
  garden?: boolean;
  balanced?: boolean;
  // The same player who OWNS the Adventurer Pass from day 1 (perks only: longer storage, material yield, bag slots, repair discount, extra order and XP).
  // The track's rewards are not claimed (App.tsx drives them); the Pass track is measured separately by the premium-track value check.
  pass?: boolean;
  // Diagnostic: only the delivery perk of the Pass (extra offer + reroll + XP bonus), nothing else.
  deliveriesOnly?: boolean;
  // The hero skill path the policy buys down as the points are earned (heroSkills.ts); scenario A is 'warrior', 'none' is the control without any skill.
  skills?: SkillBuild;
  // Round 12 (only the material flow report turns it on, the progression guard does not): the player also keeps the new Alchemy consumables that the first 21 days can reach in the bag
  // (Repair Kit, Prospector's Tonic, Hunter Lure) crafted from surplus materials, repairs with a kit before paying Gold, and drinks the tonic / lure at the start of a gathering / hunting session.
  sinks?: boolean;
  // A player who ignores the inventory entirely: never stashes, sells, discards, expands or brings anything over (everything else as the baseline).
  careless?: boolean;
  // Long-horizon sim: once the floor-100 boss is down the Dungeon sessions go to the Profundezas (nextDepthStage), and the snapshots carry the depth, the paragon level and the blockers.
  long?: boolean;
}

// Garden 3.0 tonics the policy crafts (one of each in stock) and drinks on a boss attempt; gatherer_brew is drunk before a Mining / Woodcutting session.
const COMBAT_TONICS = ['stoneskin_tonic', 'precision_elixir', 'haste_tonic', 'fortune_tonic'] as const;
const TONIC_STOCK = 1;
const SINK_CONSUMABLES = ['repair_kit', 'prospector_tonic', 'hunter_lure'] as const;
const SINK_STOCK = 2;
const BOSS_APPROACH_FLOORS = 6; // a session that starts within this many floors of an unclaimed boss is a boss attempt

export class Player {
  S: SaveData;
  now = 0;
  day = 0; // 0-based
  dayKey = '';
  ledger: DayLedger = newLedger();
  sessions: SessionRecord[] = [];
  snapshots: DaySnapshot[] = [];
  first: Partial<Record<FirstEvent, number>> = {};
  private recentStages: number[] = []; // floors cleared by each Dungeon session so far
  private lastDone: Record<'hunt' | 'mine' | 'wood', number> = { hunt: -1, mine: -1, wood: -1 };
  private visits = 0;
  private huntHours = 2;
  private huntUnits: Mats = { leather_scrap: 50, bone_fragment: 50, demon_claw: 16, concentrated_blood: 16, demon_core: 3, corrupted_crystal: 3, rift_shard: 12, fiend_horn: 2, abyssal_marrow: 12, blood_heart: 2 };
  private sessionsToday = 0;
  private freeSessionsToday = 0;
  private dungeonPerDay = 0; // sessions played today (the last N entries of recentStages)
  private fake: (t: number) => void;
  private visit: 'first' | 'second' = 'first';
  private opts: PlayerOptions;
  trace: string[] = []; // one line per decision, for debugging a policy
  // The save the first time the hero is about to face the floor-25 boss (floors 1-24 cleared): the boss diagnostic replays it.
  atFloor25: { save: SaveData; day: number; now: number } | null = null;
  // The hero the moment the floor-25 boss is first beaten (milestone claimed).
  atBoss25: { day: number; cp: number; level: number; weaponTier: number; armorTier: number } | null = null;

  constructor(setClock: (t: number) => void, startAt: number, opts: PlayerOptions = {}) {
    this.opts = opts;
    this.fake = setClock;
    this.now = startAt;
    this.fake(startAt);
    this.S = defaultSave();
    this.S = { ...this.S, lastMiningClaim: startAt, lastWoodcuttingClaim: startAt, huntingOfflineStart: startAt, hasBattlePass: !!opts.pass };
  }

  // ---- material flow ledger (hunting materials only; bag + stash)
  private flowMark(s: SaveData = this.S): Mats {
    const out: Mats = {};
    for (const d of MATERIALS) out[d.id] = (s.materials[d.id] ?? 0) + (s.stash?.materials[d.id] ?? 0);
    return out;
  }
  private flowCount(sink: FlowSink, before: Mats) {
    const now = this.flowMark();
    for (const d of MATERIALS) {
      const x = (before[d.id] ?? 0) - (now[d.id] ?? 0);
      if (x > 0) this.ledger.flow[d.id].consumed[sink] += x;
    }
  }
  // One station conversion with its inputs charged to `sink` (the chain a craft / stash upgrade / dust need) and its output counted as refined.
  // The ledger entries wait in `pend` until the caller adopts the resulting save (commitPend); a chain that is abandoned half-way never reaches the ledger.
  private pend: (() => void)[] = [];
  private commitPend() {
    for (const f of this.pend) f();
    this.pend = [];
  }
  private refineT(s: SaveData, recipeId: string, sink: FlowSink): SaveData | null {
    const next = refineMaterial(s, recipeId);
    if (!next) return null;
    for (const d of MATERIALS) {
      const x = (s.materials[d.id] ?? 0) - (next.materials[d.id] ?? 0);
      if (x > 0) this.pend.push(() => (this.ledger.flow[d.id].consumed[sink] += x));
      else if (x < 0) this.pend.push(() => (this.ledger.flow[d.id].refined -= x));
    }
    return next;
  }
  // Runas and gems that moved between two states of the save.
  private acct(prev: SaveData, next: SaveData, tag: string) {
    const c = this.ledger.currency;
    const ds = next.shards - prev.shards;
    if (ds > 0) c.shardsIn[tag] = (c.shardsIn[tag] ?? 0) + ds;
    else if (ds < 0) c.shardsOut[tag] = (c.shardsOut[tag] ?? 0) - ds;
    for (const g of GEMS) {
      const dg = (next.gems[g.id] ?? 0) - (prev.gems[g.id] ?? 0);
      if (dg > 0) c.gemsIn[g.id + ':' + tag] = (c.gemsIn[g.id + ':' + tag] ?? 0) + dg;
      else if (dg < 0) c.gemsOut[g.id + ':' + tag] = (c.gemsOut[g.id + ':' + tag] ?? 0) - dg;
    }
  }

  // ---- bookkeeping
  private set(next: SaveData, tag: string) {
    const dx = next.xp - this.S.xp;
    if (dx > 0) this.ledger.xpIn[tag] = (this.ledger.xpIn[tag] ?? 0) + dx;
    const d = next.gold - this.S.gold;
    if (d > 0) this.ledger.goldIn[tag] = (this.ledger.goldIn[tag] ?? 0) + d;
    else if (d < 0) this.ledger.goldOut[tag] = (this.ledger.goldOut[tag] ?? 0) - d;
    this.acct(this.S, next, tag);
    this.S = next;
  }
  private mark(ev: FirstEvent) {
    if (this.first[ev] === undefined) this.first[ev] = this.day + 1;
  }
  private checkMarks() {
    if (this.S.highestDungeonFloor >= 11) this.mark('floor10');
    if (this.S.highestDungeonFloor >= 24) this.mark('floor24');
    if (this.S.highestDungeonFloor >= 50) this.mark('floor50');
    if (this.S.dungeonCheckpoints.includes(50)) this.mark('boss50');
    if (this.S.dungeonCheckpoints.includes(25) && !this.atBoss25) {
      this.atBoss25 = { day: this.day + 1, cp: computeCP(this.S), level: playerLevel(this.S.xp), weaponTier: equippedTier(this.S, 'weapon'), armorTier: equippedTier(this.S, 'armor') };
    }
    if (this.S.highestDungeonFloor >= 25 && !this.atFloor25) this.atFloor25 = { save: this.S, day: this.day + 1, now: this.now };
    if (this.S.dungeonCheckpoints.includes(25)) this.mark('floor25');
    if (this.S.unlockedHuntingZones.length >= 2) this.mark('zone2');
  }

  // The tier worn in each of the seven slots (what "gear tier worn" means in the long-horizon report).
  wornTiers(): number[] {
    const w = resolveEquipped(this.S);
    return CRAFT_PRIORITY.map((slot) => w[slot]?.item?.tier ?? 0);
  }

  // What stands between the hero and his next step, in words: the gear craft (level gate, Runas / gems, materials, Gold, or ready) and the Dungeon (the CP wall).
  private blockers(): { gear: string; dungeon: string } {
    const t = chooseTarget(this.S);
    let gear = 'tudo forjado';
    if (t) {
      const lvl = playerLevel(this.S.xp);
      const missing = Object.keys(t.deficit).length;
      if (lvl < t.minLevel) gear = `nível (${t.tpl} pede ${t.minLevel})`;
      else if (t.blocked) gear = 'runas/gemas';
      else if (missing > 0) gear = `materiais (${t.tpl})`;
      else if (this.S.gold < t.gold) gear = `ouro (${t.tpl})`;
      else gear = `pronto (${t.tpl})`;
    }
    const recent = this.recentStages.slice(-this.dungeonPerDay);
    const wall = recent.length > 0 && recent.every((n) => n <= 2);
    const where = this.opts.long && depthsUnlocked(this.S) ? `profundeza ${deepestDepth(this.S) + 1}` : `andar ${this.S.highestDungeonFloor}`;
    return { gear, dungeon: wall ? `CP (${where})` : `avança (${where})` };
  }

  // ---- a day = two visits
  playDay(day: number, jitter: () => number) {
    this.day = day;
    this.ledger = newLedger();
    const startStock = this.flowMark();
    this.sessions = [];
    CHECKIN_HOURS.forEach((h, i) => {
      const at = new Date(2026, 5, 1 + day, h, 0, 0).getTime() + Math.round((jitter() * 2 - 1) * JITTER_MS);
      this.now = Math.max(this.now, at);
      this.checkIn(i === 0 ? 'first' : 'second');
    });
    this.sample();
    this.ledger.inv.slotsEnd = inventorySlotsUsed(this.S);
    const endStock = this.flowMark();
    for (const d of MATERIALS) {
      const f = this.ledger.flow[d.id];
      const consumed = Object.values(f.consumed).reduce((a, b) => a + b, 0);
      f.stockEnd = endStock[d.id] ?? 0;
      f.residual = f.stockEnd - ((startStock[d.id] ?? 0) + f.produced + f.refined - consumed);
    }
    this.snapshots.push({
      day: day + 1,
      level: playerLevel(this.S.xp),
      cp: computeCP(this.S),
      floor: this.S.highestDungeonFloor,
      weaponTier: equippedTier(this.S, 'weapon'),
      armorTier: equippedTier(this.S, 'armor'),
      gold: this.S.gold,
      shards: this.S.shards,
      skills: { mining: skillLevel(this.S.skillXp.mining, 'mining'), woodcutting: skillLevel(this.S.skillXp.woodcutting, 'woodcutting'), gardening: skillLevel(this.S.skillXp.gardening, 'gardening') },
      tiers: Object.fromEntries(CRAFT_PRIORITY.map((slot) => [slot, bestTier(this.S, slot)])),
      stashLevel: this.S.stash.level,
      stashSlots: stashSlotsUsed(this.S),
      ledger: this.ledger,
      sessions: this.sessions,
      depth: deepestDepth(this.S),
      paragon: paragonLevel(this.S.xp),
      wornTiers: this.wornTiers(),
      blockers: this.opts.long ? this.blockers() : { gear: '', dungeon: '' },
    });
  }

  private checkIn(kind: 'first' | 'second') {
    this.visit = kind;
    this.fake(this.now);
    this.S = reload(this.S);
    this.dayKey = new Date(this.now).toDateString();
    if (kind === 'first') {
      this.sessionsToday = 0;
      this.freeSessionsToday = T.dungeon.freeSessionsPerDay;
    }
    this.collect();
    this.tendGarden();
    this.claimQuestsNow();
    this.maintain();
    this.spend();
    const first = Math.ceil(T.dungeon.freeSessionsPerDay / 2);
    const todo = kind === 'first' ? first : T.dungeon.freeSessionsPerDay - first;
    for (let i = 0; i < todo; i++) this.dungeonSession();
    this.acceptDelivery();
    this.startActivity();
  }

  // ---- 1. collect whatever has been running
  private collect() {
    const s = this.S;
    if (s.activeHuntingZone) {
      const huntKey = s.activeHuntingZone + ':' + s.activeHuntingDepth;
      const stopped = applyHuntStop(s, this.now);
      if (stopped && stopped.pendingHuntReward) {
        const p = stopped.pendingHuntReward;
        const hours = p.pendingMs / HOUR;
        this.ledger.hours.hunt += hours;
        const hz = (this.ledger.hunt[huntKey] ??= { hours: 0, units: {} });
        hz.hours += hours;
        this.huntHours += hours;
        for (const [m, q] of Object.entries(p.drops) as [MaterialId, number][]) this.huntUnits[m] = (this.huntUnits[m] ?? 0) + q;
        // The reward screen shows what the claim would leave behind (the very function the claim uses): a careful player makes room first.
        this.S = stopped;
        this.sample();
        let plan = planHuntClaim(this.S, p);
        if (plan.leftBehind.length > 0 && !this.opts.careless) {
          this.makeRoom(bagFreeSlots(this.S, this.now) + huntInventoryStatus(this.S, p.zoneId, p.drops, p.uniques).missingSlots);
          plan = planHuntClaim(this.S, p);
        }
        for (const [m, q] of Object.entries(plan.added) as [MaterialId, number][]) {
          if (this.ledger.flow[m]) this.ledger.flow[m].produced += q;
          hz.units[m] = (hz.units[m] ?? 0) + q;
          this.ledger.mats[rarityOf(m)] += q;
          this.ledger.matsValue += q * baseGoldValue(m);
        }
        for (const u of p.uniques) {
          const k = `${p.zoneId}:${u.templateId}:${u.rarity}`;
          this.ledger.uniques[k] = (this.ledger.uniques[k] ?? 0) + 1;
        }
        for (const l of plan.leftBehind) {
          this.ledger.lost += l.count;
          if (this.ledger.flow[l.itemId]) this.ledger.flow[l.itemId].left += l.count;
        }
        const claimed = applyHuntClaim(this.S, p.id);
        if (claimed) this.set(claimed, 'caça');
        else this.S = s;
        // A unique piece (or owed units) the bag had no room for stays pending and blocks the next hunt: the player at a full bag frees a slot and claims again (long horizon).
        for (let tries = 0; tries < 3 && this.opts.long && huntClaimBlocked(this.S); tries++) {
          this.makeRoom(bagFreeSlots(this.S, this.now) + 2 + (this.S.pendingHuntReward?.uniques.length ?? 0));
          const again = applyHuntClaim(this.S, this.S.pendingHuntReward!.id);
          if (again) this.S = again;
        }
      }
    } else if (s.activeOreId || s.activeWoodId) {
      const mine = !!s.activeOreId;
      // gathering leaves the excess behind: a careful player makes room for the session's units first
      const st = mine ? computeMiningStatus(s, this.now) : computeWoodcuttingStatus(s, this.now);
      const gathered = mine ? (st as ReturnType<typeof computeMiningStatus>).oreReady : (st as ReturnType<typeof computeWoodcuttingStatus>).woodReady;
      const id = mine ? (st as ReturnType<typeof computeMiningStatus>).oreId : (st as ReturnType<typeof computeWoodcuttingStatus>).woodId;
      this.sample();
      if (id && !this.opts.careless) this.makeRoom(slotsForQty((s.materials[id] ?? 0) + gathered) - slotsForQty(s.materials[id] ?? 0));
      const c = claimGathering(this.S, this.now);
      if (c) {
        this.ledger.mats[rarityOf(c.material)] += c.units - c.leftBehind;
        this.ledger.matsValue += (c.units - c.leftBehind) * baseGoldValue(c.material);
        this.ledger.inv.lostGather += c.leftBehind;
        this.ledger.units[c.material] = (this.ledger.units[c.material] ?? 0) + c.units - c.leftBehind;
        this.ledger.flow[c.material].produced += c.units - c.leftBehind;
        this.ledger.flow[c.material].left += c.leftBehind;
        this.ledger.hours[mine ? 'mine' : 'wood'] += c.hours;
        this.set(c.save, 'coleta');
      }
    }
    const done = applyDeliveryClaim(this.S, this.now);
    if (done) this.set(done.save, 'pedido');
    this.checkMarks();
  }

  // ---- inventory policy ---------------------------------------------------------------------------------------------------------------------------
  // The policy of a player who looks at the bag: records how full it is, keeps what the next craft (and the stash upgrade) needs, and makes room when a session is
  // about to bring more than fits: stash the valuable surplus, sell the surplus the merchant buys (bulkiest first), discard the junk that is left. A careless
  // player (opts.careless) does none of it.
  private sample() {
    const used = inventorySlotsUsed(this.S);
    const cap = inventoryCapacity(this.S, this.now);
    this.ledger.inv.slotsMax = Math.max(this.ledger.inv.slotsMax, used);
    this.ledger.inv.capacity = cap;
    if (used >= cap) this.mark('bagFull');
  }

  // Everything the next craft consumes (recipe + refining chain) and what the stash upgrade needs: never sold, stashed or discarded.
  private reservedMats(): Mats {
    const out: Mats = {};
    const add = (m: Mats) => {
      for (const [k, v] of Object.entries(m) as [MaterialId, number][]) out[k] = (out[k] ?? 0) + v;
    };
    const t = chooseTarget(this.S);
    if (t) add(t.needs);
    const sp = this.stashPlan();
    if (sp) add(sp.needs);
    return out;
  }

  // One material thrown away: records the amount in the ledger under why nothing better was possible right then.
  private noteDiscard(m: MaterialId, n: number) {
    if (n <= 0) return;
    const reason: DiscardReason = stashFreeSlots(this.S) <= 0 ? 'stash' : merchantRemaining(this.S, this.now) < merchantPrice('material', m) ? 'merchant' : 'policy';
    const row = (this.ledger.discards[m] ??= { stash: 0, merchant: 0, policy: 0 });
    row[reason] += n;
  }

  private makeRoom(want: number) {
    if (this.opts.careless) return;
    const free = () => bagFreeSlots(this.S, this.now);
    if (free() >= want) return;
    const reserved = this.reservedMats();
    const bag = () => (Object.keys(this.S.materials) as MaterialId[]).filter((m) => (this.S.materials[m] ?? 0) > 0);
    const junk = (m: MaterialId) => baseGoldValue(m) <= 4;
    const bulkiest = () => [...bag()].sort((a, b) => (this.S.materials[b] ?? 0) - (this.S.materials[a] ?? 0));
    // Each round is stricter about the working stock it keeps in the bag (what the next craft needs is never touched).
    // (orders ask for up to ~60 units of a cheap material at a time, so the first rounds keep that much of each)
    for (const [keepJunk, keepOther] of [[100, 40], [60, 20], [30, 10], [0, 0]]) {
      const surplus = (m: MaterialId) => Math.max(0, (this.S.materials[m] ?? 0) - (reserved[m] ?? 0) - (junk(m) ? keepJunk : keepOther));
      // 1) the valuable surplus goes to the stash (the junk is not worth a stash slot - until nothing else frees a slot)
      for (const m of [...bag()].sort((a, b) => baseGoldValue(b) - baseGoldValue(a))) {
        if (free() >= want) return;
        if ((junk(m) && keepJunk > 0) || surplus(m) <= 0) continue;
        const r = applyStashMove(this.S, 'store', 'material', m, surplus(m));
        if (r.moved > 0) {
          this.S = r.save;
          this.ledger.inv.stashed += r.moved;
        }
      }
      // 2) the merchant buys what he can today, the bulkiest stacks first
      for (const m of bulkiest()) {
        if (free() >= want) return;
        const n = surplus(m);
        if (n <= 0 || (keepJunk === 0 && !junk(m))) continue;
        const r = applyMerchantSell(this.S, 'material', m, n, this.now);
        if (r.ok && r.save) {
          this.set(r.save, 'mercador');
          this.ledger.inv.sold += r.units ?? 0;
          if (this.ledger.flow[m]) this.ledger.flow[m].consumed.merchant += r.units ?? 0;
        }
      }
      // 3) what is left of the cheap surplus is thrown away (never in the last round: that one only stashes and sells)
      for (const m of bulkiest()) {
        if (free() >= want) return;
        const n = surplus(m);
        if (n <= 0 || baseGoldValue(m) > 5 || keepJunk === 0) continue;
        const next = applyDiscard(this.S, 'material', m, n);
        if (next) {
          this.noteDiscard(m, n);
          this.ledger.inv.discarded += n;
          if (this.ledger.flow[m]) this.ledger.flow[m].consumed.discard += n;
          this.S = next;
        }
      }
    }
    if (this.opts.long) this.clearJunk(want, reserved);
  }

  // Long horizon only: the bag is still full after the stash / merchant rounds (the merchant buys a limited amount a day and the stash is 50 slots). A player at a full bag
  // throws away what he has no use for: first the stored pieces the next craft chain does not use, then the biggest stacks of materials beyond the working stock.
  private clearJunk(want: number, reserved: Mats) {
    const free = () => bagFreeSlots(this.S, this.now);
    if (free() >= want) return;
    const chain = new Set<string>();
    const t = chooseTarget(this.S);
    if (t) {
      for (const tpl of t.crafts) for (const sub of Object.keys(getGear(tpl).recipe?.items ?? {})) chain.add(sub);
    }
    for (const i of listGearInstances(this.S)) {
      if (free() >= want) return;
      if (isInstanceEquipped(this.S, i.id) || chain.has(i.templateId)) continue;
      const next = applyDiscardInstance(this.S, i.id);
      if (next) this.S = next;
    }
    for (const keep of [297, 198, 99, 0]) {
      for (const m of (Object.keys(this.S.materials) as MaterialId[]).sort((a, b) => (this.S.materials[b] ?? 0) - (this.S.materials[a] ?? 0))) {
        if (free() >= want) return;
        const n = (this.S.materials[m] ?? 0) - (reserved[m] ?? 0) - keep;
        if (n <= 0) continue;
        const next = applyDiscard(this.S, 'material', m, n);
        if (next) {
          this.noteDiscard(m, n);
          this.ledger.inv.discarded += n;
          if (this.ledger.flow[m]) this.ledger.flow[m].consumed.discard += n;
          this.S = next;
        }
      }
    }
  }

  // Slots a session of about `units` per material would need on top of what the bag holds.
  private slotsForecast(units: Mats): number {
    let extra = 0;
    for (const [m, n] of Object.entries(units) as [MaterialId, number][]) extra += slotsForQty((this.S.materials[m] ?? 0) + n) - slotsForQty(this.S.materials[m] ?? 0);
    return extra;
  }

  // Take from the stash whatever of `needs` the bag lacks (recipes consume only from the bag).
  private bring(needs: Mats) {
    if (this.opts.careless) return;
    for (const [m, n] of Object.entries(needs) as [MaterialId, number][]) {
      const short = n - (this.S.materials[m] ?? 0);
      if (short <= 0 || (this.S.stash.materials[m] ?? 0) <= 0) continue;
      if (bagFreeSlots(this.S, this.now) < slotsForQty(short)) this.makeRoom(slotsForQty(short));
      this.S = applyStashMove(this.S, 'take', 'material', m, short).save;
    }
  }

  // What the next stash upgrade needs, expanded through the refining stations like a gear plan (null: none left, or a careless player).
  private stashPlan(): { gold: number; minLevel: number; batches: { recipeId: string; times: number }[]; needs: Mats; deficit: Mats; blocked: boolean } | null {
    if (this.opts.careless) return null;
    const q = nextStashUpgrade(this.S);
    if (!q) return null;
    const need: Mats = { ...q.materials };
    const batches: Record<string, number> = {};
    const made: Mats = {};
    let gold = q.gold;
    let minLevel = 0;
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
      for (const m of Object.keys(need) as MaterialId[]) {
        const short = (need[m] ?? 0) - owned(this.S, m, false) - (made[m] ?? 0);
        const rec = recipeFor(m);
        if (short > 0 && rec) {
          const b = Math.ceil(short / rec.outputQty);
          batches[rec.id] = (batches[rec.id] ?? 0) + b;
          made[m] = (made[m] ?? 0) + b * rec.outputQty;
          gold += b * rec.cost;
          minLevel = Math.max(minLevel, rec.requiredLevel);
          for (const [im, iq] of Object.entries(rec.input)) need[im as MaterialId] = (need[im as MaterialId] ?? 0) + (iq as number) * b;
          changed = true;
        }
      }
      if (!changed) break;
    }
    const deficit: Mats = {};
    for (const m of Object.keys(need) as MaterialId[]) {
      if (recipeFor(m)) continue;
      const short = (need[m] ?? 0) - owned(this.S, m, false);
      if (short > 0) deficit[m] = short;
    }
    return { gold, minLevel, batches: Object.entries(batches).map(([recipeId, times]) => ({ recipeId, times })), needs: need, deficit, blocked: playerLevel(this.S.xp) < minLevel };
  }

  // Buy the next stash upgrade when its materials are on hand (or in the stash), the gold is beyond what the next craft needs, and the craft keeps its own materials.
  private tryStashUpgrade() {
    const q = nextStashUpgrade(this.S);
    const sp = this.stashPlan();
    if (!q || !sp || sp.blocked || Object.keys(sp.deficit).length > 0) return;
    // the first two upgrades are cheap and ignore the gold set aside for the next craft; later ones respect it
    if (this.S.gold - sp.gold < (this.S.stash.level < 2 ? 0 : this.goldReserve())) return;
    const t = chooseTarget(this.S);
    // the craft keeps what it needs: the upgrade only takes units beyond that
    for (const [m, n] of Object.entries(sp.needs) as [MaterialId, number][]) if ((t?.needs[m] ?? 0) > 0 && owned(this.S, m, false) - n < (t?.needs[m] ?? 0)) return;
    this.makeRoom(2);
    this.bring(sp.needs);
    let s = this.S;
    this.pend = [];
    for (const b of sp.batches) {
      for (let i = 0; i < b.times; i++) {
        const next = this.refineT(s, b.recipeId, 'stash');
        if (!next) return;
        this.ledger.goldOut['estações'] = (this.ledger.goldOut['estações'] ?? 0) + (s.gold - next.gold);
        s = next;
      }
    }
    const up = applyStashUpgrade(s);
    const flowBefore = this.flowMark(s);
    if (!up) {
      this.pend = [];
      return;
    }
    this.commitPend();
    this.set(up, 'baú');
    this.flowCount('stash', flowBefore);
    if (up.stash.level >= 1) this.mark('stash1');
    if (up.stash.level >= 2) this.mark('stash2');
    if (up.stash.level >= 3) this.mark('stash3');
  }

  // Garden upkeep of a visit: harvest what is ready, then fill every empty plot.
  private tendGarden() {
    if (this.opts.garden === false) return;
    const ready = readySlots(this.S, this.now);
    if (ready.length > 0) {
      this.makeRoom(ready.length); // each ready plot needs room for its yield
      const res = applyHarvest(this.S, ready, this.now);
      if (res) {
        for (const h of res.harvested) {
          this.ledger.units[h.material] = (this.ledger.units[h.material] ?? 0) + h.qty;
          this.ledger.flow[h.material].produced += h.qty;
        }
        this.S = res.save;
      }
    }
    const lvl = skillLevel(this.S.skillXp.gardening, 'gardening');
    const unlocked = PLANTS.filter((p) => p.requiredLevel <= lvl);
    const deficit: Mats = { ...(chooseTarget(this.S)?.deficit ?? {}) };
    // plants the tonic recipes need (the policy keeps TONIC_STOCK of each in the bag), asked for after the gear
    for (const id of [...COMBAT_TONICS, 'gatherer_brew'] as const) {
      const rec = POTION_RECIPES.find((r) => r.id === id)!;
      if ((this.S.consumables[id] ?? 0) >= TONIC_STOCK || playerLevel(this.S.xp) < rec.requiredLevel) continue;
      for (const [m, q] of Object.entries(rec.input) as [MaterialId, number][]) {
        const short = q - (this.S.materials[m] ?? 0);
        if (short > 0 && PLANTS.some((p) => p.material === m)) deficit[m] = Math.max(deficit[m] ?? 0, short);
      }
    }
    const wanted = unlocked.filter((p) => (deficit[p.material] ?? 0) > 0).sort((a, b) => (deficit[b.material] ?? 0) - (deficit[a.material] ?? 0))[0];
    const longest = [...unlocked].filter((p) => p.durationMs <= 10 * HOUR).sort((a, b) => b.durationMs - a.durationMs)[0];
    const pick = wanted ?? longest;
    if (!pick) return;
    const empty = this.S.gardenSlots.map((sl, i) => (sl.plantId ? -1 : i)).filter((i) => i >= 0);
    const next = applyPlant(this.S, pick.id, empty, this.now);
    if (next) this.S = next;
  }

  private claimQuestsNow() {
    const r = claimQuests(this.S);
    if (r.gold > 0 || r.save !== this.S) this.set(r.save, 'missões');
  }

  // ---- 2. upkeep: repair worn gear, throw the starter junk away
  private maintain() {
    if ((this.S.consumables.repair_kit ?? 0) > 0) {
      const worn = INSTANCED_SLOTS.some((slot) => {
        const eq = resolveEquipped(this.S)[slot];
        return !!eq?.instance && (eq.item.tier ?? 0) >= 1 && eq.instance.durability < 60;
      });
      const kit = worn ? applyRepairKit(this.S, 'repair_kit') : null;
      if (kit) this.S = kit;
    }
    for (const slot of INSTANCED_SLOTS) {
      const eq = resolveEquipped(this.S)[slot];
      if (!eq || !eq.instance || (eq.item.tier ?? 0) < 1) continue;
      if (eq.instance.durability >= 40) continue;
      const cost = effectiveRepairCost(this.S, eq.item.tier ?? 0);
      const next = applyRepair(this.S, eq.instance.id, false, cost);
      if (next) this.set(next, 'reparo');
    }
    for (const i of listGearInstances(this.S)) {
      if (i.origin === 'starter' && !isInstanceEquipped(this.S, i.id)) {
        const next = applyDiscardInstance(this.S, i.id);
        if (next) this.S = next;
      }
    }
  }

  // ---- 3. spend: craft -> equip -> attributes -> refine -> potions -> bag
  private spend() {
    for (let guard = 0; guard < 8; guard++) {
      if (!this.tryCraft()) break;
    }
    this.equipBest();
    this.buyGemsForTarget();
    this.S = spendAttributePoints(this.S);
    this.S = spendSkillPoints(this.S, this.opts.skills ?? 'warrior');
    this.socketSpareGems();
    const reserve = this.goldReserve();
    this.refineGear(reserve);
    this.buyPotions(reserve);
    const slotsFree = inventoryCapacity(this.S, this.now) - inventorySlotsUsed(this.S);
    if (slotsFree <= 3 && !this.opts.careless) {
      const next = expandInventory(this.S);
      if (next && next.gold >= reserve) this.set(next, 'mochila');
    }
    this.tryStashUpgrade();
    this.craftTonics(reserve);
    this.claimQuestsNow();
    this.checkMarks();
  }

  // Alchemy: keep one of each combat tonic (and the gathering brew) in the bag, only with gold beyond what the next gear craft needs.
  private craftTonics(reserve: number) {
    if (this.opts.tonics === false) return;
    for (const id of [...COMBAT_TONICS, 'gatherer_brew', ...(this.opts.sinks ? SINK_CONSUMABLES : [])] as const) {
      if ((this.S.consumables[id] ?? 0) >= ((SINK_CONSUMABLES as readonly string[]).includes(id) ? SINK_STOCK : TONIC_STOCK)) continue;
      const rec = POTION_RECIPES.find((r) => r.id === id)!;
      if (this.S.gold - rec.cost < reserve) continue;
      // plants the next craft is waiting for are not spent on a tonic
      const t = chooseTarget(this.S);
      if (t && Object.entries(rec.input).some(([m, q]) => (t.deficit[m as MaterialId] ?? 0) > 0 && (this.S.materials[m as MaterialId] ?? 0) - (q as number) < (t.deficit[m as MaterialId] ?? 0))) continue;
      const flowBefore = this.flowMark();
      const next = craftPotion(this.S, id);
      if (next) {
        this.set(next, 'alquimia');
        this.flowCount('alchemy', flowBefore);
      }
    }
  }

  // A session that starts close to an unclaimed boss floor: drink every combat tonic in the bag first.
  private drinkForBoss() {
    if (this.opts.tonics === false) return;
    const boss = MILESTONE_FLOORS.find((f) => f >= this.S.highestDungeonFloor && !this.S.dungeonCheckpoints.includes(f));
    if (boss === undefined || boss - this.S.highestDungeonFloor > BOSS_APPROACH_FLOORS) return;
    for (const id of COMBAT_TONICS) {
      if (isBuffActive(this.S, id === 'stoneskin_tonic' ? 'stoneskin' : id === 'precision_elixir' ? 'precision' : id === 'haste_tonic' ? 'haste' : 'fortune', this.now)) continue;
      const next = applyElixir(this.S, id as ElixirId, this.now);
      if (next) this.S = next;
    }
  }

  // Gold that is not up for grabs (potions, refining, bag): the price of the next craft, saved up from the start (not while
  // that craft is blocked on something gold cannot fix - level, gems, shards).
  private goldReserve(): number {
    const target = chooseTarget(this.S);
    return target && !target.blocked ? target.gold : 0;
  }

  private tryCraft(): boolean {
    // the stash is storage: what the craft needs comes over to the bag first, and only the bag counts from here on
    const wanted = chooseTarget(this.S);
    if (wanted && !wanted.blocked && this.S.gold >= wanted.gold) this.bring(wanted.needs);
    const target = chooseTarget(this.S, true);
    if (!target || target.blocked || Object.keys(target.deficit).length > 0 || this.S.gold < target.gold) return false;
    // refining stations first, then the crafts in tier order
    let s = this.S;
    this.pend = [];
    for (const b of target.batches) {
      for (let i = 0; i < b.times; i++) {
        const next = this.refineT(s, b.recipeId, 'forge');
        if (!next) return false;
        const fee = s.gold - next.gold;
        this.ledger.goldOut['estações'] = (this.ledger.goldOut['estações'] ?? 0) + fee;
        s = next;
      }
    }
    this.S = s;
    this.commitPend();
    let crafted = false;
    for (const tpl of target.crafts) {
      const res = applyForge(this.S, tpl, { level: playerLevel(this.S.xp), now: this.now });
      if (!res.ok || !res.save) break;
      const flowBefore = this.flowMark();
      this.set(res.save, 'forja');
      this.flowCount('forge', flowBefore);
      crafted = true;
      this.mark('firstCraft');
    }
    this.equipBest();
    return crafted;
  }

  // Wear whatever gives the best CP (the game's own computeCP) in each slot.
  private equipBest() {
    for (const slot of INSTANCED_SLOTS) {
      let best: GearInstance | null = null;
      let bestCp = computeCP(this.S);
      // Long horizon: a piece of a higher tier is worn even when it is still +0 and the old one was refined to +8 (the fresh piece has less CP until it is refined, and the policy
      // only refines what is worn: with the plain best-CP rule the player keeps the old piece for ever, never refines the new one and crafts it again and again).
      const tierOf = (id: string) => getGear(id)?.tier ?? 0;
      let bestTier = this.opts.long ? tierOf(resolveEquipped(this.S)[slot]?.item?.id ?? '') : 0;
      for (const i of listGearInstances(this.S)) {
        if (getGear(i.templateId)?.slot !== slot || isInstanceEquipped(this.S, i.id)) continue;
        const trial = applyEquipInstance(this.S, i.id);
        if (!trial) continue;
        const cp = computeCP(trial);
        const t = this.opts.long ? tierOf(i.templateId) : 0;
        if (t > bestTier || (t === bestTier && cp > bestCp + 1e-9)) {
          bestTier = t;
          bestCp = cp;
          best = i;
        }
      }
      if (best) {
        const next = applyEquipInstance(this.S, best.id);
        if (next) this.S = next;
      }
    }
    // The relic slot: the owned relic with the best CP (the game's own computeCP).
    let relicCp = computeCP(this.S);
    for (const id of ownedRelics(this.S)) {
      const trial = withRelic(this.S, id);
      const cp = computeCP(trial);
      if (cp > relicCp + 1e-9) {
        relicCp = cp;
        this.S = trial;
        this.mark('firstRelic');
      }
    }
  }

  // App.tsx buyGem (501-508): a gem costs shards. Buys what the next craft is missing.
  private buyGemsForTarget() {
    const target = chooseTarget(this.S);
    if (!target) return;
    for (const [g, need] of Object.entries(target.gems) as [GemId, number][]) {
      const def = GEMS.find((x) => x.id === g)!;
      while ((this.S.gems[g] ?? 0) < need && this.S.shards >= def.shardCost + (target.shards ?? 0)) {
        const bought = { ...this.S, shards: this.S.shards - def.shardCost, gems: { ...this.S.gems, [g]: (this.S.gems[g] ?? 0) + 1 } };
        this.acct(this.S, bought, 'compra');
        this.S = bought;
      }
    }
  }

  private socketSpareGems() {
    const target = chooseTarget(this.S);
    const keep = target?.gems ?? {};
    for (const slot of ['weapon', 'armor'] as const) {
      const eq = resolveEquipped(this.S)[slot];
      if (!eq.instance) continue;
      for (const g of ['ruby', 'sapphire', 'emerald'] as GemId[]) {
        while ((this.S.gems[g] ?? 0) - (keep[g] ?? 0) > 0 && eq.instance.sockets.length < socketsForTier(eq.item.tier ?? 0)) {
          const next = applySocketGem(this.S, eq.instance.id, g);
          if (!next) break;
          this.acct(this.S, next, 'engaste');
          this.S = next;
          return this.socketSpareGems();
        }
      }
    }
  }

  // Refine the equipped weapon / armor (tier >= 1; the starters have no stats to multiply) while it is affordable.
  private refineGear(reserve: number) {
    for (let guard = 0; guard < 12; guard++) {
      const pieces = (['weapon', 'armor'] as const)
        .map((slot) => resolveEquipped(this.S)[slot])
        .filter((v) => v.instance && (v.item.tier ?? 0) >= 1 && v.instance.upgrade < MAX_REFINE)
        .sort((a, b) => a.instance!.upgrade - b.instance!.upgrade);
      if (pieces.length === 0) return;
      const v = pieces[0];
      const cost = upgradeCost(v.item, v.instance!.upgrade);
      if (this.S.gold < cost.gold + reserve) return;
      for (const [m, q] of Object.entries(cost.materials ?? {}) as [MaterialId, number][]) {
        if ((this.S.materials[m] ?? 0) < q) {
          if (m === 'refining_dust') this.makeDust(q - (this.S.materials[m] ?? 0));
          if ((this.S.materials[m] ?? 0) < q) return;
        }
      }
      if ((cost.shards ?? 0) > this.S.shards) return;
      const flowBefore = this.flowMark();
      const res = applyUpgrade(this.S, v.instance!.id, false);
      if (!res) return;
      this.set(res.save, 'refino');
      this.flowCount('upgrade', flowBefore);
      if (res.success) this.mark('firstRefine');
    }
  }

  private makeDust(units: number) {
    for (let i = 0; i < units; i++) {
      const recipeOf = (m: MaterialId) => REFINING_RECIPES.find((r) => r.station === 'dust' && r.input[m]);
      const src = REFINE_DUST_SOURCES.find((m) => (this.S.materials[m] ?? 0) >= (recipeOf(m)?.input[m] ?? 10) + this.reservedUnits(m));
      if (!src) return;
      const rec = recipeOf(src);
      if (!rec) return;
      this.pend = [];
      const next = this.refineT(this.S, rec.id, 'dust');
      if (!next) return;
      this.S = next;
      this.commitPend();
    }
  }

  private reservedUnits(m: MaterialId): number {
    const t = chooseTarget(this.S);
    if (!t) return 0;
    return Math.min(this.S.materials[m] ?? 0, (t.deficit[m] ?? 0) + (m === 'leather_scrap' ? 9 : 0));
  }

  // Not while the last two sessions died before clearing a single floor: potions are being poured into a wall.
  private buyPotions(reserve: number) {
    const recent = this.recentStages.slice(-2);
    if (recent.length === 2 && recent.every((n) => n === 0)) return;
    for (let i = 0; i < POTION_STOCK; i++) {
      if (this.S.gold - 30 < reserve) return; // potions never touch the gold earmarked for the next craft
      if ((this.S.consumables.small_hp ?? 0) + (this.S.consumables.large_hp ?? 0) >= POTION_STOCK) return;
      const next = buyConsumable(this.S, 'small_hp');
      if (!next) return;
      this.set(next, 'poções');
    }
  }

  // ---- 4. Dungeon
  private dungeonSession() {
    this.maintain();
    const entered = enterDungeon(this.S, this.dayKey);
    if (!entered) return;
    this.S = entered;
    this.drinkForBoss();
    const cpAtStart = computeCP(this.S);
    // Long-horizon: once the floor-100 boss is down the sessions go to the Profundezas, one below the deepest depth cleared (App.tsx startSession(depths)).
    const depths = !!this.opts.long && depthsUnlocked(this.S);
    const run: DungeonRun = runDungeon(this.S, this.now, Infinity, depths ? nextDepthStage(this.S) : undefined);
    const applied = applyDungeonRun(this.S, run, this.now);
    this.ledger.goldIn['masmorra'] = (this.ledger.goldIn['masmorra'] ?? 0) + applied.goldFromRun;
    this.ledger.goldIn['marcos'] = (this.ledger.goldIn['marcos'] ?? 0) + applied.goldFromMilestones;
    // consumables the auto-potion drank during the run
    let cons = applied.save.consumables;
    let used = run.potionsUsed;
    for (const id of ['greater_elixir', 'large_hp', 'small_hp'] as const) {
      const take = Math.min(used, cons[id] ?? 0);
      if (take > 0) cons = { ...cons, [id]: (cons[id] ?? 0) - take };
      used -= take;
    }
    const dxp = applied.save.xp - this.S.xp;
    if (dxp > 0) this.ledger.xpIn['masmorra'] = (this.ledger.xpIn['masmorra'] ?? 0) + dxp;
    this.acct(this.S, applied.save, 'masmorra');
    this.S = { ...applied.save, consumables: cons };
    this.sessionsToday += 1;
    this.dungeonPerDay = this.sessionsToday;
    this.recentStages.push(run.stages);
    this.sessions.push({
      day: this.day + 1,
      index: this.sessionsToday,
      startFloor: run.startFloor,
      endFloor: depths ? 100 + deepestDepth(this.S) : this.S.highestDungeonFloor,
      stages: run.stages,
      seconds: run.seconds,
      outcome: run.outcome,
      cpAtStart,
    });
    this.now += Math.round(run.seconds * 1000) + 25_000; // the run itself + a few clicks
    this.fake(this.now);
    this.claimQuestsNow();
    this.checkMarks();
    this.spend();
  }

  // ---- 5. deliveries: one order at a time, never one that eats the materials the next craft needs
  private acceptDelivery() {
    if (this.opts.noOrders) return;
    this.S = ensureDeliveryOffers(this.S, this.now, Math.random, !!(this.opts.pass || this.opts.deliveriesOnly));
    if (this.S.deliveries.active) return;
    const target = chooseTarget(this.S);
    const reserved: Mats = {};
    if (target) {
      // everything the next craft consumes (recipe + refining inputs) stays out of the cargo
      const t = planFor(this.S, target.tpl);
      for (const tpl of t.crafts) {
        for (const [m, q] of Object.entries(getGear(tpl).recipe?.materials ?? {}) as [MaterialId, number][]) reserved[m] = (reserved[m] ?? 0) + q;
      }
      for (const b of t.batches) {
        const rec = REFINING_RECIPES.find((r) => r.id === b.recipeId)!;
        for (const [m, q] of Object.entries(rec.input) as [MaterialId, number][]) reserved[m] = (reserved[m] ?? 0) + q * b.times;
      }
    }
    const offers = this.S.deliveries.offers
      // orders consume from the bag only, but a careful player counts the stash too and brings the cargo over
      .filter((o) => (Object.entries(o.items) as [MaterialId, number][]).every(([m, q]) => owned(this.S, m, !!this.opts.careless) >= q) && o.durationMs <= 12 * HOUR)
      .filter((o) => (Object.entries(o.items) as [MaterialId, number][]).every(([m, q]) => owned(this.S, m, !!this.opts.careless) - q >= (reserved[m] ?? 0)))
      .sort((a, b) => b.gold - a.gold || b.xp - a.xp);
    for (const o of offers) {
      this.bring(o.items);
      if (!canAffordOffer(this.S, o)) continue;
      const flowBefore = this.flowMark();
      const next = applyDeliveryAccept(this.S, o.id, this.now, Math.random, !!(this.opts.pass || this.opts.deliveriesOnly));
      if (next) {
        this.S = next;
        this.flowCount('delivery', flowBefore);
        return;
      }
    }
  }

  // ---- 6. start the next background activity (one at a time: hunt / mine / chop)
  private startActivity() {
    const target = chooseTarget(this.S);
    const deficit: Mats = { ...(target?.deficit ?? {}) };
    // refine materials count as demand once the craft itself is covered
    if (!target || Object.keys(deficit).length === 0) {
      for (const slot of ['weapon', 'armor'] as const) {
        const v = resolveEquipped(this.S)[slot];
        if (!v.instance || (v.item.tier ?? 0) < 1 || v.instance.upgrade >= MAX_REFINE) continue;
        const mats = upgradeCost(v.item, v.instance.upgrade).materials ?? {};
        for (const [m, q] of Object.entries(mats) as [MaterialId, number][]) {
          if (m === 'refining_dust') continue;
          const short = q - owned(this.S, m, false);
          if (short > 0) deficit[m] = Math.max(deficit[m] ?? 0, short);
        }
      }
    }
    // the stash upgrade is the last thing worth fetching materials for: only once the craft and the refining are covered
    if (Object.keys(deficit).length === 0) {
      const sp = this.stashPlan();
      if (sp && !sp.blocked) for (const [m, q] of Object.entries(sp.deficit) as [MaterialId, number][]) deficit[m] = q;
    } else if (this.S.stash.level < 2) {
      // the first two upgrades are small (a few handles and bars): they are worth fetching even while a craft is still short of something
      const sp = this.stashPlan();
      if (sp && !sp.blocked) for (const [m, q] of Object.entries(sp.deficit) as [MaterialId, number][]) deficit[m] = Math.max(deficit[m] ?? 0, q);
    }
    const power = (skill: 'mining' | 'woodcutting') => gatherPower(BASE_GATHER_POWER, this.S.skillXp[skill]) * (skill === 'mining' ? T.mining.oreRatePerPower : T.woodcutting.woodRatePerPower);
    const hoursFor = (kind: 'mining' | 'woodcutting', ids: MaterialId[], tiers: { id: string; requiredLevel: number }[]): { hours: number; pick: MaterialId | null } => {
      const lvl = skillLevel(this.S.skillXp[kind], kind);
      let hours = 0;
      let pick: MaterialId | null = null;
      let pickHours = 0;
      for (const id of ids) {
        const short = deficit[id] ?? 0;
        if (short <= 0) continue;
        const tier = tiers.find((t) => t.id === id)!;
        let h = short / power(kind);
        if (lvl < tier.requiredLevel) h += (skillXpToReachLevel(tier.requiredLevel, kind) - this.S.skillXp[kind]) / (power(kind) * T.skills.xpPerUnit);
        else if (h > pickHours) {
          pickHours = h;
          pick = id;
        }
        hours += h;
      }
      return { hours, pick };
    };
    const mine = hoursFor('mining', ORE_IDS, ORE_TIERS);
    const wood = hoursFor('woodcutting', WOOD_IDS, WOOD_TIERS);
    let huntH = 0;
    for (const m of HUNT_MATS) {
      const short = deficit[m] ?? 0;
      if (short > 0) huntH = Math.max(huntH, short / ((this.huntUnits[m] ?? 1) / this.huntHours));
    }
    let choice: 'hunt' | 'mine' | 'wood' = 'hunt';
    this.visits += 1;
    this.trace.push(`d${this.day + 1} ${this.visit} gold=${this.S.gold} target=${target?.tpl ?? '-'} blocked=${target?.blocked ?? '-'} goldNeed=${target?.gold ?? '-'} deficit=${JSON.stringify(deficit)} hours(mine/wood/hunt)=${mine.hours.toFixed(1)}/${wood.hours.toFixed(1)}/${huntH.toFixed(1)} mats=${JSON.stringify(Object.fromEntries(Object.entries(this.S.materials).filter(([, v]) => v > 0)))}`);
    // Round-robin over the activities that still have something to cover (the one done longest ago first), so a shortage
    // that is quick to fix is never starved by a long one that the other activity cannot deliver.
    const needed = ([['hunt', huntH], ['mine', mine.hours], ['wood', wood.hours]] as ['hunt' | 'mine' | 'wood', number][]).filter(([, h]) => h > 0);
    if (needed.length > 0) {
      needed.sort((a, b) => this.lastDone[a[0]] - this.lastDone[b[0]] || b[1] - a[1]);
      choice = needed[0][0];
    }
    if (this.opts.balanced && this.visit === 'second') choice = this.day % 2 === 0 ? 'mine' : 'wood';
    this.lastDone[choice] = this.visits;
    this.trace.push(`   -> ${choice} (needed ${needed.map(([k, h]) => k + ':' + h.toFixed(1)).join(',')})`);
    if (choice === 'mine') {
      const unlocked = [...ORE_TIERS].filter((o) => skillLevel(this.S.skillXp.mining, 'mining') >= o.requiredLevel);
      const id = mine.pick ?? (unlocked[unlocked.length - 1]?.id as MaterialId);
      const next = startGathering(this.S, 'mine', id, this.now);
      if (next) {
        this.S = this.drinkBrew(next);
        return;
      }
    } else if (choice === 'wood') {
      const unlocked = [...WOOD_TIERS].filter((o) => skillLevel(this.S.skillXp.woodcutting, 'woodcutting') >= o.requiredLevel);
      const id = wood.pick ?? (unlocked[unlocked.length - 1]?.id as MaterialId);
      const next = startGathering(this.S, 'wood', id, this.now);
      if (next) {
        this.S = this.drinkBrew(next);
        return;
      }
    }
    // a hunt that is about to start must not overflow if a check-in can prevent it: make room for what it usually brings back
    const perHour: Mats = {};
    for (const m of HUNT_MATS) perHour[m] = Math.floor(((this.huntUnits[m] ?? 0) / this.huntHours) * 6);
    this.makeRoom(this.slotsForecast(perHour));
    this.startHunt(deficit);
  }

  // The Gatherer Brew covers the first 2 h of a gathering session when drunk at its start.
  private drinkBrew(s: SaveData): SaveData {
    if (this.opts.tonics === false) return s;
    const brewed = applyElixir(s, 'gatherer_brew', this.now) ?? s;
    return this.opts.sinks ? applyElixir(brewed, 'prospector_tonic', this.now) ?? brewed : brewed;
  }

  // Where to hunt: the zone that drops the Hunting material the next craft / refine / stash upgrade is longest short of (a player hunts where the thing he
  // needs drops); with nothing missing, the highest-XP zone unlocked by the Dungeon floor.
  private startHunt(deficit: Mats = {}): boolean {
    const cp = computeCP(this.S);
    const zones = HUNTING_ZONES.filter((z) => isZoneUnlocked(z, this.S.highestDungeonFloor)).sort((a, b) => b.xpPerHour - a.xpPerHour);
    let wantedMat: MaterialId | null = null;
    let wantedHours = 0;
    for (const m of HUNT_MATS) {
      const short = deficit[m] ?? 0;
      if (short <= 0 || !zones.some((z) => z.drops.some((d) => d.material === m))) continue;
      const h = short / ((this.huntUnits[m] ?? 1) / this.huntHours);
      if (h > wantedHours) {
        wantedHours = h;
        wantedMat = m;
      }
    }
    if (wantedMat) {
      const chanceOf = (z: (typeof zones)[number]) => z.drops.find((d) => d.material === wantedMat)?.chance ?? 0;
      zones.sort((a, b) => chanceOf(b) - chanceOf(a) || b.xpPerHour - a.xpPerHour);
    }
    for (const z of zones) {
      for (const depth of ['deep', 'dense', 'shallow'] as HuntingDepth[]) {
        if (!isDepthUnlocked(z, depth, cp)) continue;
        const next = requestHuntStart(this.S, z.id, depth, this.now);
        if (next) {
          this.S = next;
          this.trace.push(`   hunt ${z.id}:${depth}`);
          if (this.opts.sinks) this.S = applyElixir(this.S, 'hunter_lure', this.now) ?? this.S;
          return true;
        }
      }
    }
    return false;
  }
}
