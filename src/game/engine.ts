import T from './tunables';
import { EquippedGear, DEFAULT_EQUIPPED, DEFAULT_INVENTORY, durabilityFactor, effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance, getEquipped, getGear, MAX_DURABILITY, refineLevel, repairCost, sanitizeSaveInventory } from './gear';
import { Materials, MaterialId, emptyMaterials, getMaterial } from './materials';
import { ActiveExpedition, getExpedition } from './expedition';
import { ConsumableId, emptyConsumables } from './consumables';
import { GemId, emptyGems, getGem, totalGemBonuses } from './gems';
import { QuestState, emptyQuestState } from './quests';
import { Rarity, Substat, rarityStatMult, totalSubstatTotals } from './rarity';
import { MAX_DUNGEON_FLOOR, MILESTONE_FLOORS } from './dungeon';
import { DEFAULT_HUNTING_DEPTH, DEFAULT_HUNTING_ZONE, getHuntingDepthDef, getHuntingZone, HUNTING_DEPTHS, HUNTING_ZONES, HuntingDepth } from './huntingZones';
import { HuntCombatBuild, HuntLiveSnapshot, HuntPotionCfg, HuntPotionStock, HuntZoneCombatCfg, simulateHuntingSession } from './huntCombat';
import { applyDamageModifiers, combatPowerCore, CombatModifiers, CombatStats, heroAttackIntervalMs, strengthAdjustedDamage } from './derivedStats';
import { DEFAULT_ORE_TIER, getOreTier, ORE_TIERS } from './ores';
import { getWoodTier, WOOD_TIERS } from './woodcutting';
import { defaultHuntPouch, getHuntPouchTierDef, HuntPouchItem, HuntPouchState } from './huntPouch';
import { getPlant, PlantId } from './garden';
import { emptySkillXp, gatherPower, SkillId, skillXpToReachLevel } from './skills';

export type BuffType = 'strength';

export interface ActiveBuff {
  type: BuffType;
  expiresAt: number;
}

export const GARDEN_SLOTS = 4;

export interface GardenSlot {
  plantId: PlantId | null;
  startedAt: number;
}

function emptyGardenSlot(): GardenSlot {
  return { plantId: null, startedAt: 0 };
}

function emptyGardenSlots(): GardenSlot[] {
  return Array.from({ length: GARDEN_SLOTS }, emptyGardenSlot);
}

function sanitizeGardenSlot(raw: unknown): GardenSlot {
  const r = (raw ?? {}) as Partial<GardenSlot>;
  const plantId = typeof r.plantId === 'string' && getPlant(r.plantId) ? (r.plantId as PlantId) : null;
  const startedAt = plantId && typeof r.startedAt === 'number' && Number.isFinite(r.startedAt) ? r.startedAt : 0;
  return { plantId, startedAt };
}

export interface SaveData {
  gold: number;
  victories: number;
  shards: number;
  xp: number;
  weaponLevel: number;
  armorLevel: number;
  inventory: Record<string, number>;
  equipped: EquippedGear;
  upgrades: Record<string, number>;
  highestDungeonFloor: number;
  heroName: string;
  str: number;
  vit: number;
  agi: number;
  res: number;
  materials: Materials;
  potions: { hp: number; stamina: number; elixir: number };
  consumables: Record<ConsumableId, number>;
  expeditions: ActiveExpedition[];
  durability: Record<string, number>;
  gems: Record<GemId, number>;
  sockets: Record<string, GemId[]>;
  blessed: boolean;
  quests: QuestState;
  itemRarity: Record<string, Rarity>;
  itemSubstats: Record<string, Substat[]>;
  activeOreId: string | null;
  lastMiningClaim: number;
  miningCapHours: number;
  activeWoodId: string | null;
  lastWoodcuttingClaim: number;
  woodcuttingCapHours: number;
  skillXp: Record<SkillId, number>;
  activeHuntingZone: string | null;
  activeHuntingDepth: HuntingDepth | null;
  huntingOfflineStart: number;
  // Resume sub-level per zone+depth (key `${zoneId}:${depth}`) — the next sub-level to attempt
  // climbing past. Missing key means 1 (never attempted). Keyed per zone+depth so stalling out in
  // one depth doesn't reset/leak into another the player tries meanwhile.
  huntingSubLevels: Record<string, number>;
  unlockedHuntingZones: string[];
  hasBattlePass: boolean;
  battlePassExpiresAt: number | null;
  battlePassLevel: number;
  battlePassXp: number;
  claimedPassRewards: { free: number[]; premium: number[] };
  oneTokenBalance: number;
  cosmetics: string[];
  activeTitle: string | null;
  dungeonCheckpoints: number[];
  dungeonEliteDefeated: number[];
  huntPouch: HuntPouchState;
  gardenSlots: GardenSlot[];
  activeBuff: ActiveBuff | null;
  dungeonSessionsDay: string;
  dungeonSessionsUsed: number;
  seenTooltips: string[];
  seenWelcome: boolean;
  autoPotionThreshold: number;
  autoPotionPriority: 'small_first' | 'large_first';
  reforgeCount: Record<string, number>;
}

const SAVE_KEY = 'arena-rpg-save-v1';

export const MAX_LEVEL = 100;
export const MAX_BATTLE_PASS_LEVEL = 30;

export function xpForNextLevel(level: number): number {
  return Math.round(T.progression.xpBase * Math.pow(T.progression.xpGrowth, level - 1));
}

export function xpToReachLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForNextLevel(l);
  return total;
}

export function playerLevel(xp: number): number {
  let level = 1;
  let total = 0;
  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (xp < total + need) return level;
    total += need;
    level++;
  }
  return MAX_LEVEL;
}

export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return trimDec(n / 1e9) + 'B';
  if (abs >= 1e6) return trimDec(n / 1e6) + 'M';
  if (abs >= 1e3) return trimDec(n / 1e3) + 'K';
  return String(Math.floor(n));
}

function trimDec(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function playerMaxHp(save: SaveData): number {
  const { armor } = getEquipped(save.equipped);
  const armorLvl = refineLevel(save.upgrades, save.equipped.armor);
  const aDur = save.durability?.[save.equipped.armor] ?? MAX_DURABILITY;
  const aRarity = rarityStatMult(save.itemRarity?.[save.equipped.armor]);
  const gems = totalGemBonuses(save.equipped, save.sockets ?? {});
  const subs = totalSubstatTotals(save.equipped, save.itemSubstats ?? {});
  return Math.round(
    T.progression.playerBaseHp +
      (save.armorLevel - 1) * T.progression.armorHpPerLvl +
      effectiveMaxHp(armor, armorLvl) * durabilityFactor(aDur) * aRarity +
      (playerLevel(save.xp) - 1) * T.progression.levelHpBonus +
      save.vit * T.advanced.vitHpPerPoint +
      gems.maxHp +
      subs.maxHp,
  );
}

// Single source of truth for a hero's derived combat stats (Layer 2, see derivedStats.ts). Hunting
// (computeHuntingStatus), the Dungeon (BattleModal.tsx) and computeCP all derive from this — do not
// re-derive these numbers anywhere else. Pure function of the save: no clock, no buffs. Temporary
// modifiers (blessed / Strength Elixir) are separate, see combatModifiersFromSave.
//
// These are the PERMANENT effective stats (relic crit multiplier included); Hunting, the Dungeon and computeCP
// all read them. Temporary modifiers are never part of this.
export function buildCombatStats(save: SaveData): CombatStats {
  const { weapon, armor, relic } = getEquipped(save.equipped);
  const wLvl = refineLevel(save.upgrades, save.equipped.weapon);
  const aLvl = refineLevel(save.upgrades, save.equipped.armor);
  const wDur = save.durability?.[save.equipped.weapon] ?? MAX_DURABILITY;
  const aDur = save.durability?.[save.equipped.armor] ?? MAX_DURABILITY;
  const wFactor = durabilityFactor(wDur);
  const aFactor = durabilityFactor(aDur);
  const wRarity = rarityStatMult(save.itemRarity?.[save.equipped.weapon]);
  const aRarity = rarityStatMult(save.itemRarity?.[save.equipped.armor]);
  const gems = totalGemBonuses(save.equipped, save.sockets ?? {});
  const subs = totalSubstatTotals(save.equipped, save.itemSubstats ?? {});

  // Flat base hit (avg of attackMin/attackMax) plus the weapon term W (refine, durability, rarity); STR is applied on top
  // of that sum by strengthAdjustedDamage (derivedStats.ts). blessed/Elixir/crit come later, at the call sites.
  const baseDmg = (T.combat.attackMin + T.combat.attackMax) / 2;
  return {
    maxHp: playerMaxHp(save),
    dmgBase: strengthAdjustedDamage(baseDmg + effectiveDamage(weapon, wLvl) * wFactor * wRarity, save.str),
    critChance: effectiveCrit(weapon, wLvl) * wFactor + subs.critRate / 100,
    critMult: T.combat.critMult + (relic?.critMultBonus ?? 0) + gems.critDamageBonus + subs.critDamage / 100,
    // AGI -> attack interval: hyperbolic curve with a 400 ms floor and sanitized input, see derivedStats.ts.
    heroMs: heroAttackIntervalMs(save.agi),
    reduction: effectiveResistance(armor, aLvl) * aFactor * aRarity + save.res * T.advanced.resResistPerPoint + gems.resistance + subs.defense / 100,
    lifesteal: subs.lifesteal,
  };
}

// Temporary damage modifiers, evaluated at a moment the CALLER chooses (`now` is explicit on purpose —
// see derivedStats.ts). Hunting calls this once with the claim-time clock; the Dungeon calls it on every
// hit with Date.now(). Those different timings are pre-existing behavior, not decided here.
export function combatModifiersFromSave(save: SaveData, now: number): CombatModifiers {
  return {
    blessedMult: save.blessed ? 1.05 : 1,
    strengthMult: isBuffActive(save, 'strength', now) ? 1 + T.battle.strengthElixirDmgPct : 1,
  };
}

// CP scale constant. Chosen so the recalibrated milestone/zone CPs (see dungeon.ts, huntingZones.ts)
// land in a similar order of magnitude to the pre-fix numbers, purely so the transition isn't a jarring
// unit change — CP has no absolute physical meaning, it's only ever compared to a recommended threshold.
const CP_SCALE = 2;

// CP = round(CP_SCALE * combatPowerCore(stats)): a universal, STATIC measure of general combat power (see
// derivedStats.ts combatPowerCore for the formula). Geometric mean of expected DPS (attack speed, crit chance AND crit
// multiplier folded together) and effective HP (maxHp scaled by the same asymptotic resistance applyDamageReduction
// uses), times a sustain multiplier derived from lifesteal. The geometric mean matches how a duel is actually decided
// (the side with the larger dps*ehp wins a symmetric fight) and keeps lopsided builds from being over-credited.
// It reads buildCombatStats — permanent gear/attributes only (relic crit multiplier included). blessed, Strength
// Elixir, potions and every other temporary/economic modifier are deliberately NOT part of CP. CP is a general
// strength rating, not a matchup predictor: a lower-CP build can beat a higher-CP one.
export function computeCP(save: SaveData): number {
  return Math.round(CP_SCALE * combatPowerCore(buildCombatStats(save)));
}

export function isBattlePassActive(save: SaveData, now: number): boolean {
  return save.hasBattlePass && (save.battlePassExpiresAt === null || save.battlePassExpiresAt > now);
}

// Battle Pass convenience perks: extra parallel Expeditions, extra Hunting Pouch buffer,
// and a repair discount — its role is player-facing convenience/retention, not a new faucet.
export const BASE_EXPEDITION_SLOTS = 1;

export function maxExpeditionSlots(save: SaveData, now: number): number {
  return BASE_EXPEDITION_SLOTS + (isBattlePassActive(save, now) ? T.battlePass.expeditionBonusSlots : 0);
}

export function effectivePouchSlots(save: SaveData, now: number): number {
  const base = getHuntPouchTierDef(save.huntPouch.tier)?.slots ?? 2;
  return base + (isBattlePassActive(save, now) ? T.battlePass.pouchBonusSlots : 0);
}

export function effectiveRepairCost(save: SaveData, tier: number, now: number): number {
  const base = repairCost(tier);
  return isBattlePassActive(save, now) ? Math.ceil(base * (1 - T.battlePass.repairDiscount)) : base;
}

export function battlePassXpForLevel(level: number): number {
  return Math.round(T.battlePass.xpBase * Math.pow(T.battlePass.xpGrowth, level - 1));
}

export function addBattlePassXp(save: SaveData, amount: number): { battlePassLevel: number; battlePassXp: number } {
  if (save.battlePassLevel >= MAX_BATTLE_PASS_LEVEL) {
    return { battlePassLevel: MAX_BATTLE_PASS_LEVEL, battlePassXp: 0 };
  }
  let level = save.battlePassLevel;
  let xp = save.battlePassXp + Math.max(0, amount);
  while (level < MAX_BATTLE_PASS_LEVEL) {
    const need = battlePassXpForLevel(level);
    if (xp < need) break;
    xp -= need;
    level++;
  }
  if (level >= MAX_BATTLE_PASS_LEVEL) {
    level = MAX_BATTLE_PASS_LEVEL;
    xp = 0;
  }
  return { battlePassLevel: level, battlePassXp: xp };
}

export interface MiningStatus {
  capMs: number;
  pendingMs: number;
  oreId: MaterialId | null;
  oreReady: number;
  goldReady: number;
  full: boolean;
}

export function computeMiningStatus(save: SaveData, now: number): MiningStatus {
  const passActive = isBattlePassActive(save, now);
  const capHours = passActive ? Math.max(save.miningCapHours, T.battlePass.capHours) : save.miningCapHours;
  const capMs = capHours * 3600 * 1000;
  const tier = save.activeOreId ? getOreTier(save.activeOreId) : undefined;
  if (!tier) {
    return { capMs, pendingMs: 0, oreId: null, oreReady: 0, goldReady: 0, full: false };
  }
  const elapsedMs = Math.max(0, now - save.lastMiningClaim);
  const pendingMs = Math.min(elapsedMs, capMs);
  const hours = pendingMs / (3600 * 1000);
  const power = gatherPower(getGear('rusty_pickaxe')?.miningPower ?? 0, save.skillXp.mining);
  const dropMult = passActive ? T.battlePass.dropRateMultiplier : 1;
  const oreReady = Math.floor(hours * power * T.mining.oreRatePerPower * dropMult);
  const goldReady = Math.floor(hours * power * T.mining.goldRatePerPower);
  return { capMs, pendingMs, oreId: tier.id, oreReady, goldReady, full: pendingMs >= capMs };
}

export interface WoodcuttingStatus {
  capMs: number;
  pendingMs: number;
  woodId: MaterialId | null;
  woodReady: number;
  goldReady: number;
  full: boolean;
}

// Mirrors computeMiningStatus exactly — same continuous-accrual-capped-offline-window shape, same
// zero-gold-by-design faucet (T.woodcutting.goldRatePerPower is 0, matching T.mining.goldRatePerPower).
export function computeWoodcuttingStatus(save: SaveData, now: number): WoodcuttingStatus {
  const passActive = isBattlePassActive(save, now);
  const capHours = passActive ? Math.max(save.woodcuttingCapHours, T.battlePass.capHours) : save.woodcuttingCapHours;
  const capMs = capHours * 3600 * 1000;
  const tier = save.activeWoodId ? getWoodTier(save.activeWoodId) : undefined;
  if (!tier) {
    return { capMs, pendingMs: 0, woodId: null, woodReady: 0, goldReady: 0, full: false };
  }
  const elapsedMs = Math.max(0, now - save.lastWoodcuttingClaim);
  const pendingMs = Math.min(elapsedMs, capMs);
  const hours = pendingMs / (3600 * 1000);
  const power = gatherPower(getGear('worn_axe')?.woodcuttingPower ?? 0, save.skillXp.woodcutting);
  const dropMult = passActive ? T.battlePass.dropRateMultiplier : 1;
  const woodReady = Math.floor(hours * power * T.woodcutting.woodRatePerPower * dropMult);
  const goldReady = Math.floor(hours * power * T.woodcutting.goldRatePerPower);
  return { capMs, pendingMs, woodId: tier.id, woodReady, goldReady, full: pendingMs >= capMs };
}

export interface GardenStatus {
  plantId: PlantId | null;
  durationMs: number;
  elapsedMs: number;
  remainingMs: number;
  ready: boolean;
}

// Unlike Mining/Hunting (continuous accrual capped at a rollover window), each Garden slot is a
// single fixed-duration harvest per planting — elapsed time past durationMs never yields more, it
// just sits "ready" until collected. Still timestamp-based like the others, so offline time counts
// the same way (no separate offline-catchup code path needed).
export function computeGardenSlotStatus(save: SaveData, now: number, slotIndex: number): GardenStatus {
  const slot = save.gardenSlots[slotIndex];
  const def = slot?.plantId ? getPlant(slot.plantId) : undefined;
  if (!slot || !def) {
    return { plantId: null, durationMs: 0, elapsedMs: 0, remainingMs: 0, ready: false };
  }
  const elapsedMs = Math.max(0, now - slot.startedAt);
  const remainingMs = Math.max(0, def.durationMs - elapsedMs);
  return { plantId: def.id, durationMs: def.durationMs, elapsedMs, remainingMs, ready: elapsedMs >= def.durationMs };
}

export function computeGardenStatuses(save: SaveData, now: number): GardenStatus[] {
  return save.gardenSlots.map((_, i) => computeGardenSlotStatus(save, now, i));
}

// Timestamp-based like Mining/Hunting/Garden — no ticking interval needed to know if it's still
// valid, only checked at read time (e.g. right before a damage calc, or when rendering the HUD).
export function isBuffActive(save: SaveData, type: BuffType, now: number): boolean {
  return !!save.activeBuff && save.activeBuff.type === type && save.activeBuff.expiresAt > now;
}

export function buffRemainingMs(save: SaveData, now: number): number {
  if (!save.activeBuff) return 0;
  return Math.max(0, save.activeBuff.expiresAt - now);
}

export interface HuntingStatus {
  capMs: number;
  pendingMs: number;
  goldReady: number;
  xpReady: number;
  drops: Partial<Record<MaterialId, number>>;
  full: boolean;
  // Real-combat sub-level results (see huntCombat.ts) — the session climbs sub-level by sub-level
  // from resumeSubLevel, stops climbing at the first loss (that becomes the safe ceiling to farm),
  // and keeps re-clearing the ceiling for the rest of the idle window.
  ceilingSubLevel: number;
  resumeSubLevel: number;
  climbed: boolean;
  clearsAtCeiling: number;
  potionsUsed: HuntPotionStock;
  liveSnapshot: HuntLiveSnapshot | null;
}

export function huntingSubLevelKey(zoneId: string, depth: HuntingDepth): string {
  return `${zoneId}:${depth}`;
}

export function resumeHuntingSubLevel(save: SaveData, zoneId: string, depth: HuntingDepth): number {
  return save.huntingSubLevels[huntingSubLevelKey(zoneId, depth)] ?? 1;
}

export function computeHuntingStatus(save: SaveData, now: number): HuntingStatus {
  const zone = save.activeHuntingZone ? getHuntingZone(save.activeHuntingZone) : undefined;
  const emptyPotionsUsed: HuntPotionStock = { greater_elixir: 0, large_hp: 0, small_hp: 0 };
  if (!zone) {
    return {
      capMs: 0,
      pendingMs: 0,
      goldReady: 0,
      xpReady: 0,
      drops: {},
      full: false,
      ceilingSubLevel: 0,
      resumeSubLevel: 1,
      climbed: false,
      clearsAtCeiling: 0,
      potionsUsed: emptyPotionsUsed,
      liveSnapshot: null,
    };
  }
  const passActive = isBattlePassActive(save, now);
  const capHours = passActive ? Math.max(zone.offlineCapHours, T.battlePass.capHours) : zone.offlineCapHours;
  const capMs = capHours * 3600 * 1000;
  const elapsedMs = Math.max(0, now - save.huntingOfflineStart);
  const pendingMs = Math.min(elapsedMs, capMs);
  const depth = save.activeHuntingDepth ?? DEFAULT_HUNTING_DEPTH;
  const depthDef = getHuntingDepthDef(depth);

  // Permanent stats from the shared derivation (buildCombatStats), plus temporary modifiers evaluated
  // HERE, once, at the claim-time `now` — the Hunting session's existing (retroactive) buff behavior,
  // deliberately unchanged. BattleModal.tsx applies the same modifiers per hit instead.
  const stats = buildCombatStats(save);
  const mods = combatModifiersFromSave(save, now);

  const build: HuntCombatBuild = {
    playerMax: stats.maxHp,
    heroDmgBase: applyDamageModifiers(stats.dmgBase, mods),
    critChance: stats.critChance,
    critMult: stats.critMult,
    heroMs: stats.heroMs,
    reduction: stats.reduction,
    lifestealPct: stats.lifesteal,
  };

  // Raso-only override (see HuntingZoneDef.shallowCp/shallowEnemyHp/shallowEnemyDmg) — currently only
  // demon_glade defines one. Denso/Profundo of every zone, and every depth of every other zone, are
  // unaffected and keep using baseEnemyHp/Dmg exactly as before.
  const useShallowOverride = depth === 'shallow' && zone.shallowEnemyHp !== undefined && zone.shallowEnemyDmg !== undefined;
  const zoneCfg: HuntZoneCombatCfg = {
    baseEnemyHp: useShallowOverride ? zone.shallowEnemyHp! : zone.baseEnemyHp,
    baseEnemyDmg: useShallowOverride ? zone.shallowEnemyDmg! : zone.baseEnemyDmg,
    enemyAtkMs: T.hunting.enemyAtkMs,
    hpGrowth: T.hunting.subLevelHpGrowth,
    dmgGrowth: T.hunting.subLevelDmgGrowth,
    depthMult: depthDef.cpMultiplier,
    // Depth never touches gold — Hunting stays a non-currency faucet by design at every depth.
    goldPerHour: zone.goldPerHour,
    xpPerHour: zone.xpPerHour * depthDef.xpMultiplier,
    drops: zone.drops,
    depth,
    dropRateMult: passActive ? T.battlePass.dropRateMultiplier : 1,
  };

  const potionCfg: HuntPotionCfg = {
    threshold: save.autoPotionThreshold,
    priority: save.autoPotionPriority,
    stock: {
      greater_elixir: save.consumables.greater_elixir ?? 0,
      large_hp: save.consumables.large_hp ?? 0,
      small_hp: save.consumables.small_hp ?? 0,
    },
    greaterElixirHealPct: T.battle.greaterElixirHealPct,
    potionHeal: T.battle.potionHeal,
    largePotionHeal: T.battle.largePotionHeal,
    cooldownMs: T.battle.potionCooldownMs,
  };

  const resumeSubLevel = resumeHuntingSubLevel(save, zone.id, depth);

  // Deterministic seed keyed off this session's own start time: computeHuntingStatus gets polled
  // every ~1s while the tab is open, and it must return the SAME outcome every time for the same
  // (unclaimed) session instead of a fresh random result flickering in on every render.
  const result = simulateHuntingSession(
    build,
    zoneCfg,
    resumeSubLevel,
    pendingMs,
    potionCfg,
    T.battle.waveHeal,
    `${save.huntingOfflineStart}:${zone.id}:${depth}:${resumeSubLevel}`,
  );

  return {
    capMs,
    pendingMs,
    goldReady: result.goldReady,
    xpReady: result.xpReady,
    drops: result.drops,
    full: pendingMs >= capMs,
    ceilingSubLevel: result.ceilingSubLevel,
    resumeSubLevel,
    climbed: result.climbed,
    clearsAtCeiling: result.clearsAtCeiling,
    potionsUsed: result.potionsUsed,
    liveSnapshot: result.liveSnapshot,
  };
}

export function defaultSave(): SaveData {
  return {
    gold: 0,
    victories: 0,
    shards: 0,
    xp: 0,
    weaponLevel: 1,
    armorLevel: 1,
    inventory: { ...DEFAULT_INVENTORY },
    equipped: { ...DEFAULT_EQUIPPED },
    upgrades: {},
    highestDungeonFloor: 1,
    heroName: 'Hero',
    str: 0,
    vit: 0,
    agi: 0,
    res: 0,
    materials: emptyMaterials(),
    potions: { hp: 0, stamina: 0, elixir: 0 },
    consumables: emptyConsumables(),
    expeditions: [],
    durability: {},
    gems: emptyGems(),
    sockets: {},
    blessed: false,
    quests: emptyQuestState(),
    itemRarity: {},
    itemSubstats: {},
    activeOreId: null,
    lastMiningClaim: Date.now(),
    miningCapHours: T.mining.capHours,
    activeWoodId: null,
    lastWoodcuttingClaim: Date.now(),
    woodcuttingCapHours: T.woodcutting.capHours,
    skillXp: emptySkillXp(),
    activeHuntingZone: null,
    activeHuntingDepth: null,
    huntingOfflineStart: Date.now(),
    huntingSubLevels: {},
    unlockedHuntingZones: [DEFAULT_HUNTING_ZONE],
    hasBattlePass: false,
    battlePassExpiresAt: null,
    battlePassLevel: 1,
    battlePassXp: 0,
    claimedPassRewards: { free: [], premium: [] },
    oneTokenBalance: 0,
    cosmetics: [],
    activeTitle: null,
    dungeonCheckpoints: [],
    dungeonEliteDefeated: [],
    gardenSlots: emptyGardenSlots(),
    activeBuff: null,
    huntPouch: defaultHuntPouch(),
    dungeonSessionsDay: '',
    dungeonSessionsUsed: 0,
    seenTooltips: [],
    seenWelcome: false,
    // Matches the old hardcoded auto-potion behavior (greater_elixir > large_hp > small_hp) so
    // existing saves see no gameplay change until the player actually opens the settings.
    autoPotionThreshold: 0.35,
    autoPotionPriority: 'large_first',
    reforgeCount: {},
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = defaultSave();
      const legacyOwned = (parsed as { owned?: string[] }).owned;
      const inventory =
        parsed.inventory ??
        (legacyOwned ? Object.fromEntries(legacyOwned.map((id) => [id, 1])) : base.inventory);
      const gear = sanitizeSaveInventory(inventory, parsed.equipped ?? base.equipped);
      let xp = typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) && parsed.xp >= 0 ? parsed.xp : 0;
      if (xp >= xpToReachLevel(MAX_LEVEL + 1)) xp = 0;
      const upgrades: Record<string, number> = {};
      for (const [id, lvl] of Object.entries(parsed.upgrades ?? {})) {
        const n = Math.floor(Number(lvl));
        if (getGear(id) && Number.isFinite(n) && n > 0) upgrades[id] = Math.min(8, n);
      }
      const highestDungeonFloor = Math.max(1, Math.min(MAX_DUNGEON_FLOOR, Math.floor(Number(parsed.highestDungeonFloor ?? 1)) || 1));
      const sanitizeExpedition = (exp: unknown): ActiveExpedition | null => {
        const e = exp as Partial<ActiveExpedition> | null | undefined;
        return e && typeof e.id === 'string' && getExpedition(e.id) && typeof e.endsAt === 'number' && Number.isFinite(e.endsAt)
          ? { id: e.id, endsAt: e.endsAt }
          : null;
      };
      const legacyExpedition = (parsed as { expedition?: unknown }).expedition;
      const rawExpeditions = Array.isArray(parsed.expeditions) ? parsed.expeditions : legacyExpedition ? [legacyExpedition] : [];
      const expeditions = rawExpeditions
        .map(sanitizeExpedition)
        .filter((e): e is ActiveExpedition => !!e)
        .slice(0, 4);
      const durability: Record<string, number> = {};
      for (const [id, d] of Object.entries(parsed.durability ?? {})) {
        if (!getGear(id)) continue;
        const n = Math.floor(Number(d));
        if (Number.isFinite(n)) durability[id] = Math.max(0, Math.min(MAX_DURABILITY, n));
      }
      const gems = { ...emptyGems() };
      for (const k of Object.keys(gems) as GemId[]) {
        const n = Math.floor(Number((parsed.gems ?? {})[k]));
        gems[k] = Number.isFinite(n) && n > 0 ? n : 0;
      }
      const sockets: Record<string, GemId[]> = {};
      for (const [id, list] of Object.entries(parsed.sockets ?? {})) {
        if (!getGear(id) || !Array.isArray(list)) continue;
        sockets[id] = (list as string[]).filter((g) => getGem(g)).slice(0, 4) as GemId[];
      }
      const today = new Date().toDateString();
      const q: Partial<QuestState> = parsed.quests ?? {};
      const quests: QuestState = {
        dailyDay: typeof q.dailyDay === 'string' ? q.dailyDay : '',
        daily: { ...emptyQuestState().daily, ...(q.daily ?? {}) },
        dailyClaimed: Array.isArray(q.dailyClaimed) ? q.dailyClaimed : [],
        counters: { ...emptyQuestState().counters, ...(q.counters ?? {}) },
        claimed: Array.isArray(q.claimed) ? q.claimed : [],
      };
      if (quests.dailyDay !== today) {
        quests.dailyDay = today;
        quests.daily = { kills: 0, forge: 0, purchases: 0, expeditions: 0 };
        quests.dailyClaimed = [];
      }
      let dungeonSessionsDay = typeof parsed.dungeonSessionsDay === 'string' ? parsed.dungeonSessionsDay : '';
      let dungeonSessionsUsed = Number.isFinite(Number(parsed.dungeonSessionsUsed)) ? Math.max(0, Math.floor(Number(parsed.dungeonSessionsUsed))) : 0;
      if (dungeonSessionsDay !== today) {
        dungeonSessionsDay = today;
        dungeonSessionsUsed = 0;
      }
      const seenTooltips = Array.isArray(parsed.seenTooltips) ? parsed.seenTooltips.filter((id) => typeof id === 'string') : [];
      const seenWelcome = parsed.seenWelcome === true;
      const itemRarity: Record<string, Rarity> = {};
      for (const [id, r] of Object.entries(parsed.itemRarity ?? {})) {
        if (getGear(id) && (r === 'common' || r === 'rare' || r === 'epic' || r === 'legendary')) itemRarity[id] = r as Rarity;
      }
      const itemSubstats: Record<string, Substat[]> = {};
      for (const [id, list] of Object.entries(parsed.itemSubstats ?? {})) {
        if (!getGear(id) || !Array.isArray(list)) continue;
        itemSubstats[id] = (list as Substat[]).filter((s) => s && typeof s.value === 'number').slice(0, 4);
      }
      const oreTierIds = new Set(ORE_TIERS.map((t) => t.id as string));
      const legacyMiningActive = (parsed as { miningActive?: boolean }).miningActive === true;
      const activeOreId =
        typeof parsed.activeOreId === 'string' && oreTierIds.has(parsed.activeOreId)
          ? parsed.activeOreId
          : legacyMiningActive
            ? DEFAULT_ORE_TIER
            : null;
      const lastMiningClaim =
        typeof parsed.lastMiningClaim === 'number' && Number.isFinite(parsed.lastMiningClaim) && parsed.lastMiningClaim > 0
          ? parsed.lastMiningClaim
          : Date.now();
      const miningCapHours =
        typeof parsed.miningCapHours === 'number' && Number.isFinite(parsed.miningCapHours) && parsed.miningCapHours > 0
          ? parsed.miningCapHours
          : T.mining.capHours;
      const woodTierIds = new Set(WOOD_TIERS.map((t) => t.id as string));
      const activeWoodId = typeof parsed.activeWoodId === 'string' && woodTierIds.has(parsed.activeWoodId) ? parsed.activeWoodId : null;
      const lastWoodcuttingClaim =
        typeof parsed.lastWoodcuttingClaim === 'number' && Number.isFinite(parsed.lastWoodcuttingClaim) && parsed.lastWoodcuttingClaim > 0
          ? parsed.lastWoodcuttingClaim
          : Date.now();
      const woodcuttingCapHours =
        typeof parsed.woodcuttingCapHours === 'number' && Number.isFinite(parsed.woodcuttingCapHours) && parsed.woodcuttingCapHours > 0
          ? parsed.woodcuttingCapHours
          : T.woodcutting.capHours;
      // Skill Level migration (one-time — only when parsed.skillXp is absent entirely, i.e. a save
      // from before this system existed): pickaxe/axe tiers were removed in favor of Mining/Woodcutting
      // Skill Level gates, so a save that already owned a higher-tier tool must not lose access to the
      // ore/wood tier that tool unlocked. Checked against the RAW pre-sanitize `inventory` object above
      // (sanitizeSaveInventory already strips the now-unknown tool ids from `gear.inventory`, since
      // they're no longer in GEAR) — highest tool owned wins, and skill XP is set to exactly the amount
      // needed to just reach that tier's unlock level (migrated players start at the bottom of that
      // level's progress bar, not mid-level). Gardening never had its own tool, but was already gated by
      // character level before Skill Levels existed, so the same non-regression rule is extended to it:
      // a save whose character already passed the old 15/35 thresholds keeps its Garden access.
      const rawInv = inventory as Record<string, number>;
      const legacyTierLevel = (ids: [string, number][]): number => {
        for (const [id, lvl] of ids) if ((rawInv[id] ?? 0) > 0) return lvl;
        return 1;
      };
      const legacyMiningLevel = legacyTierLevel([
        ['runic_pickaxe', 75],
        ['mithril_pickaxe', 50],
        ['steel_pickaxe', 25],
        ['iron_pickaxe', 10],
      ]);
      const legacyWoodLevel = legacyTierLevel([
        ['runic_axe', 75],
        ['mithril_axe', 50],
        ['steel_axe', 25],
        ['iron_axe', 10],
      ]);
      const legacyGardenLevel = playerLevel(xp) >= 35 ? 35 : playerLevel(xp) >= 15 ? 15 : 1;
      const rawSkillXp = (parsed.skillXp ?? {}) as Partial<Record<SkillId, number>>;
      const skillXp: Record<SkillId, number> = {
        mining:
          typeof rawSkillXp.mining === 'number' && Number.isFinite(rawSkillXp.mining)
            ? Math.max(0, rawSkillXp.mining)
            : skillXpToReachLevel(legacyMiningLevel),
        woodcutting:
          typeof rawSkillXp.woodcutting === 'number' && Number.isFinite(rawSkillXp.woodcutting)
            ? Math.max(0, rawSkillXp.woodcutting)
            : skillXpToReachLevel(legacyWoodLevel),
        gardening:
          typeof rawSkillXp.gardening === 'number' && Number.isFinite(rawSkillXp.gardening)
            ? Math.max(0, rawSkillXp.gardening)
            : skillXpToReachLevel(legacyGardenLevel),
      };
      const knownZoneIds = new Set(HUNTING_ZONES.map((z) => z.id));
      const unlockedHuntingZones = Array.isArray(parsed.unlockedHuntingZones)
        ? Array.from(new Set([DEFAULT_HUNTING_ZONE, ...parsed.unlockedHuntingZones.filter((id) => knownZoneIds.has(id))]))
        : [DEFAULT_HUNTING_ZONE];
      const activeHuntingZone =
        typeof parsed.activeHuntingZone === 'string' && unlockedHuntingZones.includes(parsed.activeHuntingZone)
          ? parsed.activeHuntingZone
          : null;
      const knownDepths = new Set(HUNTING_DEPTHS.map((d) => d.id));
      const activeHuntingDepth =
        activeHuntingZone && typeof parsed.activeHuntingDepth === 'string' && knownDepths.has(parsed.activeHuntingDepth as HuntingDepth)
          ? (parsed.activeHuntingDepth as HuntingDepth)
          : activeHuntingZone
            ? DEFAULT_HUNTING_DEPTH
            : null;
      const huntingOfflineStart =
        typeof parsed.huntingOfflineStart === 'number' && Number.isFinite(parsed.huntingOfflineStart) && parsed.huntingOfflineStart > 0
          ? parsed.huntingOfflineStart
          : Date.now();
      const huntingSubLevels: Record<string, number> = {};
      if (parsed.huntingSubLevels && typeof parsed.huntingSubLevels === 'object') {
        for (const [key, raw] of Object.entries(parsed.huntingSubLevels)) {
          const n = Math.floor(Number(raw));
          if (Number.isFinite(n) && n > 0) huntingSubLevels[key] = Math.min(T.hunting.subLevels, n);
        }
      }
      const hasBattlePass = !!parsed.hasBattlePass;
      const battlePassExpiresAt =
        typeof parsed.battlePassExpiresAt === 'number' && Number.isFinite(parsed.battlePassExpiresAt) && parsed.battlePassExpiresAt > 0
          ? parsed.battlePassExpiresAt
          : null;
      const battlePassLevelRaw = Math.floor(Number(parsed.battlePassLevel));
      const battlePassLevel =
        Number.isFinite(battlePassLevelRaw) && battlePassLevelRaw > 0 ? Math.min(MAX_BATTLE_PASS_LEVEL, battlePassLevelRaw) : 1;
      const battlePassXp =
        typeof parsed.battlePassXp === 'number' && Number.isFinite(parsed.battlePassXp) && parsed.battlePassXp >= 0 ? parsed.battlePassXp : 0;
      const rawClaimed = parsed.claimedPassRewards as { free?: unknown; premium?: unknown } | undefined;
      const sanitizeLevels = (arr: unknown): number[] =>
        Array.isArray(arr)
          ? Array.from(new Set(arr.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_BATTLE_PASS_LEVEL)))
          : [];
      const claimedPassRewards = { free: sanitizeLevels(rawClaimed?.free), premium: sanitizeLevels(rawClaimed?.premium) };
      const oneTokenBalance =
        typeof parsed.oneTokenBalance === 'number' && Number.isFinite(parsed.oneTokenBalance) && parsed.oneTokenBalance >= 0
          ? parsed.oneTokenBalance
          : 0;
      const cosmetics = Array.isArray(parsed.cosmetics) ? parsed.cosmetics.filter((c): c is string => typeof c === 'string') : [];
      const activeTitle = typeof parsed.activeTitle === 'string' && cosmetics.includes(parsed.activeTitle) ? parsed.activeTitle : null;
      const dungeonCheckpoints = Array.isArray(parsed.dungeonCheckpoints)
        ? Array.from(new Set(parsed.dungeonCheckpoints.filter((f): f is number => typeof f === 'number' && MILESTONE_FLOORS.includes(f))))
        : [];
      const dungeonEliteDefeated = Array.isArray(parsed.dungeonEliteDefeated)
        ? Array.from(new Set(parsed.dungeonEliteDefeated.filter((f): f is number => typeof f === 'number' && MILESTONE_FLOORS.includes(f))))
        : [];
      // v2: 4 independent slots. v1 saves only ever had one active plant (activePlant/plantStartedAt)
      // — migrate that into slot 0 so nobody's in-progress planting is lost, rest start empty.
      const legacyPlant = parsed as unknown as { activePlant?: unknown; plantStartedAt?: unknown };
      let gardenSlots: GardenSlot[];
      if (Array.isArray(parsed.gardenSlots)) {
        gardenSlots = Array.from({ length: GARDEN_SLOTS }, (_, i) => sanitizeGardenSlot(parsed.gardenSlots[i]));
      } else if (typeof legacyPlant.activePlant === 'string' && getPlant(legacyPlant.activePlant)) {
        gardenSlots = [
          sanitizeGardenSlot({ plantId: legacyPlant.activePlant, startedAt: legacyPlant.plantStartedAt }),
          ...Array.from({ length: GARDEN_SLOTS - 1 }, emptyGardenSlot),
        ];
      } else {
        gardenSlots = emptyGardenSlots();
      }
      const rawBuff = parsed.activeBuff as Partial<ActiveBuff> | undefined;
      const activeBuff: ActiveBuff | null =
        rawBuff && rawBuff.type === 'strength' && typeof rawBuff.expiresAt === 'number' && Number.isFinite(rawBuff.expiresAt)
          ? { type: 'strength', expiresAt: rawBuff.expiresAt }
          : null;
      const sanitizePouchItems = (arr: unknown): HuntPouchItem[] =>
        Array.isArray(arr)
          ? (arr as HuntPouchItem[])
              .filter((i) => i && typeof i.itemId === 'string' && !!getMaterial(i.itemId) && Number.isFinite(i.count) && i.count > 0)
              .map((i) => ({ itemId: i.itemId, count: Math.floor(i.count) }))
          : [];
      const rawPouch = parsed.huntPouch as Partial<HuntPouchState> | undefined;
      const pouchTierRaw = Math.floor(Number(rawPouch?.tier));
      const huntPouch: HuntPouchState = {
        tier: getHuntPouchTierDef(pouchTierRaw) ? pouchTierRaw : 1,
        items: sanitizePouchItems(rawPouch?.items),
        lostItems: sanitizePouchItems(rawPouch?.lostItems),
      };
      return {
        ...base,
        ...parsed,
        xp,
        inventory: gear.inventory,
        equipped: gear.equipped,
        upgrades,
        highestDungeonFloor,
        materials: { ...emptyMaterials(), ...(parsed.materials ?? {}) },
        potions: { hp: 0, stamina: 0, elixir: 0, ...(parsed.potions ?? {}) },
        consumables: { ...emptyConsumables(), ...(parsed.consumables ?? {}) },
        expeditions,
        durability,
        gems,
        sockets,
        blessed: !!parsed.blessed,
        quests,
        itemRarity,
        itemSubstats,
        activeOreId,
        lastMiningClaim,
        miningCapHours,
        activeWoodId,
        lastWoodcuttingClaim,
        woodcuttingCapHours,
        skillXp,
        activeHuntingZone,
        activeHuntingDepth,
        huntingSubLevels,
        huntingOfflineStart,
        unlockedHuntingZones,
        hasBattlePass,
        battlePassExpiresAt,
        battlePassLevel,
        battlePassXp,
        claimedPassRewards,
        oneTokenBalance,
        cosmetics,
        activeTitle,
        dungeonCheckpoints,
        dungeonEliteDefeated,
        huntPouch,
        gardenSlots,
        activeBuff,
        dungeonSessionsDay,
        dungeonSessionsUsed,
        seenTooltips,
        seenWelcome,
        autoPotionThreshold:
          typeof parsed.autoPotionThreshold === 'number' && Number.isFinite(parsed.autoPotionThreshold)
            ? Math.max(0.1, Math.min(0.7, parsed.autoPotionThreshold))
            : base.autoPotionThreshold,
        autoPotionPriority: parsed.autoPotionPriority === 'small_first' ? 'small_first' : base.autoPotionPriority,
        reforgeCount: { ...base.reforgeCount, ...(parsed.reforgeCount ?? {}) },
      };
    }
  } catch {
    /* ignore */
  }
  return defaultSave();
}

export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
