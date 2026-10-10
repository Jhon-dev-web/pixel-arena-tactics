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
} from '../../src/game/gearInstances';
import { computeCP, effectiveRepairCost, playerLevel, SaveData, defaultSave } from '../../src/game/engine';
import { GEAR, getGear, INSTANCED_SLOTS, MAX_REFINE, upgradeCost } from '../../src/game/gear';
import { GEMS, GemId, socketsForTier } from '../../src/game/gems';
import { MaterialId } from '../../src/game/materials';
import { REFINING_RECIPES } from '../../src/game/refining';
import { PLANTS } from '../../src/game/garden';
import { applyHarvest, applyPlant, readySlots } from '../../src/game/gardenActions';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import { skillLevel, skillXpToReachLevel, gatherPower, BASE_GATHER_POWER } from '../../src/game/skills';
import {
  HUNTING_ZONES,
  HuntingDepth,
  isDepthUnlocked,
  isZoneUnlocked,
} from '../../src/game/huntingZones';
import { applyHuntClaim, requestHuntStart, applyHuntStop } from '../../src/game/huntLifecycle';
import { applyDeliveryAccept, applyDeliveryClaim, canAffordOffer, ensureDeliveryOffers } from '../../src/game/deliveries';
import { expandInventory, inventoryCapacity, inventorySlotsUsed } from '../../src/game/inventory';
import { nextHuntPouchTierDef } from '../../src/game/huntPouch';
import T from '../../src/game/tunables';
import {
  applyDungeonRun,
  buyConsumable,
  claimGathering,
  claimQuests,
  DungeonRun,
  enterDungeon,
  refineMaterial,
  reload,
  runDungeon,
  spendAttributePoints,
  startGathering,
  upgradeHuntPouch,
} from './driver';

type Mats = Partial<Record<MaterialId, number>>;
export const HOUR = 3600 * 1000;

export const HUNT_MATS: MaterialId[] = ['leather_scrap', 'bone_fragment', 'demon_claw', 'concentrated_blood', 'demon_core', 'corrupted_crystal'];
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
  lost: number; // units that did not fit the hunt pouch
  hours: { hunt: number; mine: number; wood: number };
  units: Record<string, number>; // ore / wood / garden units that entered the bag today, by material id
}

const newLedger = (): DayLedger => ({ xpIn: {}, goldIn: {}, goldOut: {}, mats: { common: 0, uncommon: 0, rare: 0 }, lost: 0, hours: { hunt: 0, mine: 0, wood: 0 }, units: {} });

export interface DaySnapshot {
  day: number;
  level: number;
  cp: number;
  floor: number; // highestDungeonFloor as the game stores it (the floor the next session starts on)
  weaponTier: number;
  armorTier: number;
  gold: number;
  // Profession levels at the end of the day (Gardening is 1 for a player who never plants).
  skills: { mining: number; woodcutting: number; gardening: number };
  ledger: DayLedger;
  sessions: SessionRecord[];
}

export type FirstEvent = 'firstCraft' | 'firstRelic' | 'firstRefine' | 'floor10' | 'floor24' | 'floor25' | 'floor50' | 'boss50' | 'zone2';

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
  deficit: Mats; // raw units still missing after refining and what the bag already holds
  blocked: boolean; // needs something no activity can fetch right now (level, gems, shards)
  impossible: boolean;
}

const recipeFor = (m: MaterialId) => REFINING_RECIPES.find((r) => r.output === m && r.station !== 'dust');

function unequippedCounts(s: SaveData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of Object.values(s.gearInstances)) if (!isInstanceEquipped(s, i.id)) out[i.templateId] = (out[i.templateId] ?? 0) + 1;
  return out;
}

export function planFor(s: SaveData, tpl: string): Plan {
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
  plan.crafts.sort((a, b) => (getGear(a).tier ?? 0) - (getGear(b).tier ?? 0));

  // Expand what the bag cannot cover through the refining stations (copper -> bar, scrap -> leather, ...), to a fixpoint.
  const made: Mats = {};
  const batches: Record<string, number> = {};
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const m of Object.keys(need) as MaterialId[]) {
      const short = (need[m] ?? 0) - (s.materials[m] ?? 0) - (made[m] ?? 0);
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
    const short = (need[m] ?? 0) - (s.materials[m] ?? 0);
    if (short > 0) plan.deficit[m] = short;
  }
  const lvl = playerLevel(s.xp);
  const gemsMissing = Object.entries(plan.gems).some(([g, n]) => (s.gems[g as GemId] ?? 0) < (n as number));
  plan.blocked = lvl < plan.minLevel || gemsMissing || s.shards < plan.shards;
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

// Crafting priority inside one tier: weapon > armor > gloves > helmet > boots > ring (Rodada 3). The extra slots only have one piece per tier and
// the "1 of the previous tier" chain, so a slot is simply the next tier above the best piece owned.
export const CRAFT_PRIORITY = ['weapon', 'armor', 'gloves', 'helmet', 'boots', 'ring'] as const;

// The next thing worth crafting: the lowest tier first (slot priority on a tie), skipping a slot that is blocked on something
// no activity can fetch when another one is not.
function chooseTarget(s: SaveData): Plan | null {
  const plans: Plan[] = [];
  for (const slot of CRAFT_PRIORITY) {
    const owned = bestTier(s, slot);
    const cands = GEAR.filter((g) => g.slot === slot && g.recipe && (g.tier ?? 0) > owned);
    if (cands.length === 0) continue;
    const minTier = Math.min(...cands.map((g) => g.tier ?? 0));
    const pick = cands.filter((g) => (g.tier ?? 0) === minTier).sort((a, b) => a.cost - b.cost)[0];
    const p = planFor(s, pick.id);
    if (!p.impossible) plans.push(p);
  }
  const priority = (p: Plan) => CRAFT_PRIORITY.indexOf(p.slot as (typeof CRAFT_PRIORITY)[number]);
  // Relic (Rodada 4): one stackable piece for the single relic slot, no tiers. Once none is owned, the one that adds the most CP is worth crafting after the
  // whole tier-2 set (RELIC_AFTER_TIER), so it never delays the weapon / armor of a tier but does not wait for tier 4 either.
  const relic = chooseRelic(s);
  if (relic) plans.push(relic);
  const owned = (p: Plan) => (p.slot === 'relic' ? RELIC_AFTER_TIER : bestTier(s, p.slot));
  plans.sort((a, b) => Number(a.blocked) - Number(b.blocked) || owned(a) - owned(b) || priority(a) - priority(b));
  return plans[0] ?? null;
}

const RELIC_AFTER_TIER = 2.5;
const relicIds = (): string[] => GEAR.filter((g) => g.slot === 'relic' && g.recipe).map((g) => g.id);
const withRelic = (s: SaveData, id: string | null): SaveData => ({ ...s, equipped: { ...s.equipped, relic: id } });
const ownedRelics = (s: SaveData): string[] => relicIds().filter((id) => (s.inventory[id] ?? 0) > 0);

function chooseRelic(s: SaveData): Plan | null {
  if (ownedRelics(s).length > 0) return null;
  let best: Plan | null = null;
  let bestCp = -Infinity;
  for (const id of relicIds()) {
    const p = planFor(s, id);
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
  // Sensitivity scenario: a player who learned that long hunts lose every common drop to the 2-slot pouch. While the next
  // craft (or the pouch upgrade) still needs common hunt drops, the first visit of the day starts a hunt and stays
  // in the hunt screen for up to 15 minutes and stops it at the minute where the pouch preview (HuntModal shows exactly
  // this: allocateToPouch over the live drops) still keeps the most common drops - one extra visit. Off in the baseline.
  shortHunt?: boolean;
  // Diagnostic only (not a scenario of the report): never accept a delivery order, to isolate how much of the XP / gold comes from Hunting
  // and the Dungeon alone.
  noOrders?: boolean;
  // Profession scenarios (not part of the balance targets): `garden` plants / harvests the plots at every visit (what the next craft
  // needs first, otherwise the longest plant that fits the 12 h between visits); `balanced` is a player who spends the second visit of
  // the day gathering (mining on even days, woodcutting on odd ones, the best unlocked tier) instead of hunting.
  garden?: boolean;
  balanced?: boolean;
}

export const SHORT_HUNT_MAX_MIN = 15;

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
  private huntUnits: Mats = { leather_scrap: 50, bone_fragment: 50, demon_claw: 16, concentrated_blood: 16, demon_core: 3, corrupted_crystal: 3 };
  private sessionsToday = 0;
  private freeSessionsToday = 0;
  private fake: (t: number) => void;
  private visit: 'first' | 'second' | 'short' = 'first';
  private shortVisitDue = false;
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
    this.S = { ...this.S, lastMiningClaim: startAt, lastWoodcuttingClaim: startAt, huntingOfflineStart: startAt };
  }

  // ---- bookkeeping
  private set(next: SaveData, tag: string) {
    const dx = next.xp - this.S.xp;
    if (dx > 0) this.ledger.xpIn[tag] = (this.ledger.xpIn[tag] ?? 0) + dx;
    const d = next.gold - this.S.gold;
    if (d > 0) this.ledger.goldIn[tag] = (this.ledger.goldIn[tag] ?? 0) + d;
    else if (d < 0) this.ledger.goldOut[tag] = (this.ledger.goldOut[tag] ?? 0) - d;
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

  // ---- a day = two visits
  playDay(day: number, jitter: () => number) {
    this.day = day;
    this.ledger = newLedger();
    this.sessions = [];
    CHECKIN_HOURS.forEach((h, i) => {
      const at = new Date(2026, 5, 1 + day, h, 0, 0).getTime() + Math.round((jitter() * 2 - 1) * JITTER_MS);
      this.now = Math.max(this.now, at);
      this.checkIn(i === 0 ? 'first' : 'second');
      if (this.shortVisitDue) {
        this.shortVisitDue = false;
        this.now += this.bestShortHuntMs();
        this.miniVisit();
      }
    });
    this.snapshots.push({
      day: day + 1,
      level: playerLevel(this.S.xp),
      cp: computeCP(this.S),
      floor: this.S.highestDungeonFloor,
      weaponTier: equippedTier(this.S, 'weapon'),
      armorTier: equippedTier(this.S, 'armor'),
      gold: this.S.gold,
      skills: { mining: skillLevel(this.S.skillXp.mining, 'mining'), woodcutting: skillLevel(this.S.skillXp.woodcutting, 'woodcutting'), gardening: skillLevel(this.S.skillXp.gardening, 'gardening') },
      ledger: this.ledger,
      sessions: this.sessions,
    });
  }

  // Minute (1..15) at which stopping the running hunt keeps the most leather scrap / bone in the pouch.
  private bestShortHuntMs(): number {
    const started = this.S.huntingOfflineStart;
    let bestMin = SHORT_HUNT_MAX_MIN;
    let bestKept = -1;
    for (let m = 1; m <= SHORT_HUNT_MAX_MIN; m++) {
      const stopped = applyHuntStop(this.S, started + m * 60_000);
      const p = stopped?.pendingHuntReward;
      if (!p) return SHORT_HUNT_MAX_MIN * 60_000;
      const lost: Mats = {};
      for (const l of p.lost) lost[l.itemId] = l.count;
      const kept = (['leather_scrap', 'bone_fragment'] as MaterialId[]).reduce((a, k) => a + ((p.drops[k] ?? 0) - (lost[k] ?? 0)), 0);
      if (kept >= bestKept) {
        bestKept = kept;
        bestMin = m;
      }
    }
    return Math.max(60_000, started + bestMin * 60_000 - this.now);
  }

  // The extra short visit: collect, spend, and start the normal long activity.
  private miniVisit() {
    this.visit = 'short';
    this.fake(this.now);
    this.collect();
    this.claimQuestsNow();
    this.maintain();
    this.spend();
    this.acceptDelivery();
    this.startActivity();
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
      const stopped = applyHuntStop(s, this.now);
      if (stopped && stopped.pendingHuntReward) {
        const p = stopped.pendingHuntReward;
        const hours = p.pendingMs / HOUR;
        this.ledger.hours.hunt += hours;
        this.huntHours += hours;
        for (const [m, q] of Object.entries(p.drops) as [MaterialId, number][]) this.huntUnits[m] = (this.huntUnits[m] ?? 0) + q;
        const lost: Mats = {};
        for (const l of p.lost) lost[l.itemId] = l.count;
        for (const [m, q] of Object.entries(p.drops) as [MaterialId, number][]) {
          const kept = q - (lost[m] ?? 0);
          this.ledger.mats[rarityOf(m)] += kept;
          this.ledger.lost += lost[m] ?? 0;
        }
        const claimed = applyHuntClaim(stopped, p.id);
        if (claimed) this.set(claimed, 'caça');
      }
    } else if (s.activeOreId || s.activeWoodId) {
      const mine = !!s.activeOreId;
      const c = claimGathering(s, this.now);
      if (c) {
        this.ledger.mats[rarityOf(c.material)] += c.units;
        this.ledger.units[c.material] = (this.ledger.units[c.material] ?? 0) + c.units;
        this.ledger.hours[mine ? 'mine' : 'wood'] += c.hours;
        this.set(c.save, 'coleta');
      }
    }
    const done = applyDeliveryClaim(this.S, this.now);
    if (done) this.set(done.save, 'pedido');
    this.checkMarks();
  }

  // Garden upkeep of a visit: harvest what is ready, then fill every empty plot.
  private tendGarden() {
    if (!this.opts.garden) return;
    const ready = readySlots(this.S, this.now);
    if (ready.length > 0) {
      const res = applyHarvest(this.S, ready, this.now);
      if (res) {
        for (const h of res.harvested) this.ledger.units[h.material] = (this.ledger.units[h.material] ?? 0) + h.qty;
        this.S = res.save;
      }
    }
    const lvl = skillLevel(this.S.skillXp.gardening, 'gardening');
    const unlocked = PLANTS.filter((p) => p.requiredLevel <= lvl);
    const deficit = chooseTarget(this.S)?.deficit ?? {};
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
    for (const slot of INSTANCED_SLOTS) {
      const eq = resolveEquipped(this.S)[slot];
      if (!eq || !eq.instance || (eq.item.tier ?? 0) < 1) continue;
      if (eq.instance.durability >= 40) continue;
      const cost = effectiveRepairCost(this.S, eq.item.tier ?? 0, this.now);
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

  // ---- 3. spend: craft -> equip -> attributes -> pouch -> refine -> potions -> bag
  private spend() {
    // The bigger pouch comes first: until it is bought, long hunts lose every common drop.
    const pouch = nextHuntPouchTierDef(this.S.huntPouch.tier);
    if (pouch?.cost && this.S.gold >= pouch.cost.gold) {
      const next = upgradeHuntPouch(this.S);
      if (next) this.set(next, 'bolsa de caça');
    }
    for (let guard = 0; guard < 8; guard++) {
      if (!this.tryCraft()) break;
    }
    this.equipBest();
    this.buyGemsForTarget();
    this.S = spendAttributePoints(this.S);
    this.socketSpareGems();
    const reserve = this.goldReserve();
    this.refineGear(reserve);
    this.buyPotions(reserve);
    const slotsFree = inventoryCapacity(this.S) - inventorySlotsUsed(this.S);
    if (slotsFree <= 3) {
      const next = expandInventory(this.S);
      if (next && next.gold >= reserve) this.set(next, 'mochila');
    }
    this.claimQuestsNow();
    this.checkMarks();
  }

  // Gold that is not up for grabs (potions, refining, bag): the price of the next craft, saved up from the start (not while
  // that craft is blocked on something gold cannot fix - level, gems, shards).
  private goldReserve(): number {
    const target = chooseTarget(this.S);
    return target && !target.blocked ? target.gold : 0;
  }

  private tryCraft(): boolean {
    const target = chooseTarget(this.S);
    if (!target || target.blocked || Object.keys(target.deficit).length > 0 || this.S.gold < target.gold) return false;
    // refining stations first, then the crafts in tier order
    let s = this.S;
    for (const b of target.batches) {
      for (let i = 0; i < b.times; i++) {
        const next = refineMaterial(s, b.recipeId);
        if (!next) return false;
        const fee = s.gold - next.gold;
        this.ledger.goldOut['estações'] = (this.ledger.goldOut['estações'] ?? 0) + fee;
        s = next;
      }
    }
    this.S = s;
    let crafted = false;
    for (const tpl of target.crafts) {
      const res = applyForge(this.S, tpl, { level: playerLevel(this.S.xp), now: this.now });
      if (!res.ok || !res.save) break;
      this.set(res.save, 'forja');
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
      for (const i of listGearInstances(this.S)) {
        if (getGear(i.templateId)?.slot !== slot || isInstanceEquipped(this.S, i.id)) continue;
        const trial = applyEquipInstance(this.S, i.id);
        if (!trial) continue;
        const cp = computeCP(trial);
        if (cp > bestCp + 1e-9) {
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
        this.S = { ...this.S, shards: this.S.shards - def.shardCost, gems: { ...this.S.gems, [g]: (this.S.gems[g] ?? 0) + 1 } };
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
      const res = applyUpgrade(this.S, v.instance!.id, false);
      if (!res) return;
      this.set(res.save, 'refino');
      if (res.success) this.mark('firstRefine');
    }
  }

  private makeDust(units: number) {
    for (let i = 0; i < units; i++) {
      const src = REFINE_DUST_SOURCES.find((m) => (this.S.materials[m] ?? 0) >= 10 + this.reservedUnits(m));
      if (!src) return;
      const rec = REFINING_RECIPES.find((r) => r.station === 'dust' && r.input[src]);
      if (!rec) return;
      const next = refineMaterial(this.S, rec.id);
      if (!next) return;
      this.S = next;
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
    const cpAtStart = computeCP(this.S);
    const run: DungeonRun = runDungeon(this.S, this.now);
    const applied = applyDungeonRun(this.S, run);
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
    this.S = { ...applied.save, consumables: cons };
    this.sessionsToday += 1;
    this.recentStages.push(run.stages);
    this.sessions.push({
      day: this.day + 1,
      index: this.sessionsToday,
      startFloor: run.startFloor,
      endFloor: this.S.highestDungeonFloor,
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
    this.S = ensureDeliveryOffers(this.S, this.now, Math.random, false);
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
      .filter((o) => canAffordOffer(this.S, o) && o.durationMs <= 12 * HOUR)
      .filter((o) => (Object.entries(o.items) as [MaterialId, number][]).every(([m, q]) => (this.S.materials[m] ?? 0) - q >= (reserved[m] ?? 0)))
      .sort((a, b) => b.gold - a.gold || b.xp - a.xp);
    for (const o of offers) {
      const next = applyDeliveryAccept(this.S, o.id, this.now, Math.random, false);
      if (next) {
        this.S = next;
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
          const short = q - (this.S.materials[m] ?? 0);
          if (short > 0) deficit[m] = Math.max(deficit[m] ?? 0, short);
        }
      }
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
    if (choice === 'mine') {
      const unlocked = [...ORE_TIERS].filter((o) => skillLevel(this.S.skillXp.mining, 'mining') >= o.requiredLevel);
      const id = mine.pick ?? (unlocked[unlocked.length - 1]?.id as MaterialId);
      const next = startGathering(this.S, 'mine', id, this.now);
      if (next) {
        this.S = next;
        return;
      }
    } else if (choice === 'wood') {
      const unlocked = [...WOOD_TIERS].filter((o) => skillLevel(this.S.skillXp.woodcutting, 'woodcutting') >= o.requiredLevel);
      const id = wood.pick ?? (unlocked[unlocked.length - 1]?.id as MaterialId);
      const next = startGathering(this.S, 'wood', id, this.now);
      if (next) {
        this.S = next;
        return;
      }
    }
    const started = this.startHunt();
    if (started && this.opts.shortHunt && this.visit === 'first' && this.wantsCommons()) this.shortVisitDue = true;
  }

  private wantsCommons(): boolean {
    const t = chooseTarget(this.S);
    const deficit = t?.deficit ?? {};
    if ((deficit.leather_scrap ?? 0) > 0 || (deficit.bone_fragment ?? 0) > 0) return true;
    const pouch = nextHuntPouchTierDef(this.S.huntPouch.tier);
    return !!pouch?.cost && (this.S.materials.leather_scrap ?? 0) < (pouch.cost.materials.leather_scrap ?? 0);
  }

  private startHunt(): boolean {
    const cp = computeCP(this.S);
    const zones = HUNTING_ZONES.filter((z) => isZoneUnlocked(z, this.S.highestDungeonFloor)).sort((a, b) => b.xpPerHour - a.xpPerHour);
    for (const z of zones) {
      for (const depth of ['deep', 'dense', 'shallow'] as HuntingDepth[]) {
        if (!isDepthUnlocked(z, depth, cp)) continue;
        const next = requestHuntStart(this.S, z.id, depth, this.now);
        if (next) {
          this.S = next;
          return true;
        }
      }
    }
    return false;
  }
}
