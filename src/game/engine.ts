import { LeagueMark, sanitizeLeagueMark } from './leagueMark';
import T from './tunables';
import { grantDailyPassKit, ownsAdventurerPass } from './entitlements';
import { sanitizeActiveFrame, sanitizeActiveSkin, sanitizeStashBonus } from './seasonItems';
import { sanitizeSeasonSummary, seasonNumber, type SeasonSummary } from './seasons';
import { EquippedGear, getGear, HERO_LOOKS, HeroBaseLook, DEFAULT_EQUIPPED, INSTANCED_SLOTS, DEFAULT_INVENTORY, durabilityFactor, effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance, repairCost, sanitizeLegacyInventory, sanitizeStackableGear } from './gear';
import {
  GEAR_SCHEMA_VERSION,
  equippedExtraStats,
  GearInstance,
  GearInstanceId,
  createStarterGear,
  equippedGemBonuses,
  equippedSetItems,
  equippedSubstatTotals,
  migrateGearV1toV2,
  resolveEquipped,
  sanitizeEquippedInstance,
  bindEquipped,
  sanitizeGearInstances,
  viewDurability,
  viewRarity,
  viewRefine,
} from './gearInstances';
import { heroBaseLook, looksUpTo } from './sprites';
import { Materials, MaterialId, emptyMaterials } from './materials';
import { ActiveExpedition, getExpedition } from './expedition';
import { DeliveryState, emptyDeliveries, sanitizeDeliveries } from './deliveryState';
import { ConsumableId, emptyConsumables } from './consumables';
import { GemId, emptyGems } from './gems';
import { QuestState, emptyQuestState, migrateAchievementId } from './quests';
import { LifetimeStats, emptyStats, normalizeStats, StatsBackfill } from './stats';
import { rollWeekly, sanitizeStreak, sanitizeWeekly } from './weekly';
import { CodexState, emptyCodex, normalizeCodex } from './codex';
import { Rarity, rarityStatMult } from './rarity';
import { emptySetTotals, setBonuses } from './setBonuses';
import { MAX_DUNGEON_FLOOR, MILESTONE_FLOORS } from './dungeon';
import { DEFAULT_HUNTING_DEPTH, DEFAULT_HUNTING_ZONE, getHuntingDepthDef, getHuntingZone, HUNTING_DEPTHS, HUNTING_ZONES, HuntingDepth, HuntingZoneDef, subLevelCpRequired } from './huntingZones';
import { HuntCombatBuild, HuntLiveSnapshot, HuntPotionCfg, HuntPotionStock, HuntProgress, HuntTimeline, HuntZoneCombatCfg, simulateHuntingSession } from './huntCombat';
import { HuntSession, PendingHuntReward, huntValidMs, relativeWindows, sanitizeHuntSession, sanitizePendingHuntReward, windowCovers, withPermanentPassWindow, LEGACY_PASS_CAP_HOURS } from './huntSession';
import { applyDamageModifiers, BLESSED_DAMAGE_PCT, combatPowerCore, CombatModifiers, CombatStats, heroAttackIntervalMs, strengthAdjustedDamage, StrikeTally } from './derivedStats';
import { DEFAULT_ORE_TIER, getOreTier, ORE_TIERS } from './ores';
import { getWoodTier, WOOD_TIERS } from './woodcutting';
import { getPlant, MAX_GARDEN_PLOTS, PlantId } from './garden';
import { BASE_GATHER_POWER, emptySkillXp, gatherPower, SkillId, skillLevel, skillXpToReachLevel } from './skills';
import { gatherMasteryMult, plantGrowthMs } from './mastery';
import { maxSaneXp, paragonDamageBonus, paragonLevel } from './paragon';
import { XP_CURVE_VERSION, migrateLegacyXp, migrateV2Xp } from './xpCurve';
import { legacyXpPotionCount, legacyXpPotionGold, withoutLegacyXpPotion } from './legacyXpPotion';
import { DEFAULT_INVENTORY_CAPACITY, normalizeInventoryCapacity } from './inventory';
import { migrateLegacyPouch } from './legacyPouch';
import { emptyStash, sanitizeStash, StashState } from './stash';
import { emptyMerchant, MerchantState, sanitizeMerchant } from './merchant';
import { emptyWholesale, sanitizeWholesale, WholesaleState } from './wholesale';
import { emptyPouchDay, migratePouchFaces, PouchCerts, PouchDayState, sanitizeLegacyPouchCerts, sanitizePouchCerts, sanitizePouchDay } from './goldPouch';
import { UniqueDrop } from './uniques';
import { PendingBossClaim, sanitizeBossClaims } from './bossClaims';
import { isServerItemAuthority } from './itemAuthority';
import { SkillTreeState, emptySkillTree, sanitizeSkillTree, saveSkillEffects } from './heroSkills';
import { BuffKind, buffExpiry, buffMinutes, buffRemainingMs, gathererBonusHours, prospectBonusHours, HUNT_BUFF_KINDS, isBuffActive, TIMED_BUFF_KINDS, TimedBuff, TimedBuffKind, TonicWindows, hasteIntervalMs, precisionCrit, stoneskinReduction } from './buffs';

export { buffRemainingMs, isBuffActive };

// Every timed effect (the two damage elixirs and the Garden 3.0 tonics) is described in buffs.ts; this is the shape of the two legacy save slots.
export type BuffType = BuffKind;

export interface ActiveBuff {
  type: BuffType;
  expiresAt: number;
}

// Slots the save carries (see garden.ts: only the first unlockedGardenPlots(level) of them can be planted).
export const GARDEN_SLOTS = MAX_GARDEN_PLOTS;

export interface GardenSlot {
  plantId: PlantId | null;
  startedAt: number;
  // The plant this plot last held (planted / harvested / uprooted): only feeds the "plant again" shortcut. Optional so
  // saves written before it existed load as-is.
  lastPlantId?: PlantId | null;
  // True once Fertilizer was used on THIS planting (one per planting per plot); cleared when the plot is planted, harvested or uprooted.
  fertilized?: boolean;
}

export const CONTEXTUAL_TUTORIAL_IDS = ['garden', 'mining', 'woodcutting', 'deliveries', 'reforge', 'sockets', 'skills'] as const;
export type ContextualTutorialId = (typeof CONTEXTUAL_TUTORIAL_IDS)[number];
export type InitialTutorialStep = 'intro' | 'points' | 'dungeon' | 'hunt' | 'huntModal' | 'final';
export type InitialTutorialStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

// Presentation-only progress. It intentionally sits beside game progress so the tutorial can never
// influence combat, rewards, unlocks or economy transitions.
export interface TutorialState {
  initial: InitialTutorialStatus;
  initialStep: InitialTutorialStep;
  seen: ContextualTutorialId[];
  // The explicit "Skip tutorial" preference. Completion and manual replay never change it.
  automatic: boolean;
}

export function freshTutorialState(): TutorialState {
  return { initial: 'pending', initialStep: 'intro', seen: [], automatic: true };
}

function legacyTutorialState(): TutorialState {
  // Existing players keep their uninterrupted session and can choose "Review tutorial" themselves.
  return { initial: 'completed', initialStep: 'final', seen: [...CONTEXTUAL_TUTORIAL_IDS], automatic: false };
}

function sanitizeTutorial(raw: unknown): TutorialState {
  if (!raw || typeof raw !== 'object') return legacyTutorialState();
  const value = raw as Partial<TutorialState>;
  const initial: InitialTutorialStatus = ['pending', 'in_progress', 'completed', 'skipped'].includes(value.initial ?? '')
    ? (value.initial as InitialTutorialStatus)
    : 'completed';
  // A save written by the first tutorial keeps its place: the old 'character' balloon becomes the points step, the old 'forge' balloon the closing one.
  const rawStep = value.initialStep === ('character' as string) ? 'points' : value.initialStep === ('forge' as string) ? 'final' : value.initialStep;
  const initialStep: InitialTutorialStep = ['intro', 'points', 'dungeon', 'hunt', 'huntModal', 'final'].includes(rawStep ?? '')
    ? (rawStep as InitialTutorialStep)
    : initial === 'pending' ? 'intro' : 'final';
  const seen = Array.isArray(value.seen)
    ? value.seen.filter((id): id is ContextualTutorialId => CONTEXTUAL_TUTORIAL_IDS.includes(id as ContextualTutorialId))
    : [];
  // Tutorials written by the first guided-tutorial release did not have this flag. Its persisted
  // initial status still tells us whether the player used the explicit Skip button.
  const automatic = typeof value.automatic === 'boolean' ? value.automatic : initial !== 'skipped';
  return { initial, initialStep, seen: [...new Set(seen)], automatic };
}

function emptyGardenSlot(): GardenSlot {
  return { plantId: null, startedAt: 0, lastPlantId: null };
}

function emptyGardenSlots(): GardenSlot[] {
  return Array.from({ length: GARDEN_SLOTS }, emptyGardenSlot);
}

function sanitizeGardenSlot(raw: unknown): GardenSlot {
  const r = (raw ?? {}) as Partial<GardenSlot>;
  const plantId = typeof r.plantId === 'string' && getPlant(r.plantId) ? (r.plantId as PlantId) : null;
  const lastPlantId = typeof r.lastPlantId === 'string' && getPlant(r.lastPlantId) ? (r.lastPlantId as PlantId) : null;
  // A plant needs a real start time: a missing / invalid one starts growing now (it must not count as long ready), and a
  // start in the future (clock moved back / tampered) is clamped to now so the plot cannot be frozen.
  const validStart = typeof r.startedAt === 'number' && Number.isFinite(r.startedAt) && r.startedAt > 0;
  const startedAt = plantId ? (validStart ? Math.min(r.startedAt as number, Date.now()) : Date.now()) : 0;
  return { plantId, startedAt, lastPlantId, ...(plantId && r.fertilized === true ? { fertilized: true } : {}) };
}

export interface SaveData {
  gold: number;
  victories: number;
  shards: number;
  xp: number;
  weaponLevel: number;
  armorLevel: number;
  // Schema 2: every weapon / armor is its own GearInstance (rarity, substats, refine, sockets, durability,
  // reforge count). `inventory` now only holds STACKABLE gear (relics, tools); `equipped.weapon/armor` are
  // instance ids. See gearInstances.ts.
  schemaVersion: number;
  // Which hero XP curve `xp` is on (xpCurve.ts): 3 since Rodada 20. A save without it is on the old curve and is mapped onto the new one when it loads, keeping its level.
  xpCurve?: number;
  gearInstances: Record<GearInstanceId, GearInstance>;
  inventory: Record<string, number>;
  equipped: EquippedGear;
  // Single shared inventory capacity (materials/consumables/stackable gear stacks of STACK_LIMIT units + stored, unequipped
  // GearInstances all draw from this one pool). Never decreases across a load — see normalizeInventoryCapacity in inventory.ts.
  inventoryCapacity: number;
  // Permanent extra slots granted ONCE for the tiers of the old Hunting Pouch the player had bought (legacyPouch.ts); `pouchMigrated` records it.
  inventoryBonusSlots?: number;
  pouchMigrated?: boolean;
  // Baú do acampamento (stash.ts): a second container, storage only. Old saves load with the empty level-0 stash.
  stash: StashState;
  // What the merchant has paid today (merchant.ts); a new local day starts at zero.
  merchant: MerchantState;
  // Units sold to the wholesale merchant today, by material (wholesale.ts); a new local day starts clean.
  wholesale: WholesaleState;
  // Gold Pouches created today (goldPouch.ts): the daily limit; a new local day starts at zero.
  pouchDay: PouchDayState;
  // The certificate ids of the Gold Pouches the hero holds, by pouch id (goldPouch.ts). A pouch without one is uncertified. Old saves load with none.
  pouchCerts?: PouchCerts;
  // Rodada 22: the Gold Pouch faces changed from 10,000 / 50,000 / 100,000 to 2,000 / 5,000 / 20,000. `pouchFacesV2` records that this save was settled once (goldPouch.ts migratePouchFaces:
  // uncertified pouches became Gold at the old face); `legacyPouchCerts` are the certificates of pouches minted at the old face that the hero still holds, which open for the OLD face.
  pouchFacesV2?: boolean;
  legacyPouchCerts?: string[];
  // Web build: the boss unique drops of banked Dungeon runs the server has not rolled yet (bossClaims.ts). Old saves load with none.
  pendingBossClaims?: PendingBossClaim[];
  highestDungeonFloor: number;
  heroName: string;
  str: number;
  vit: number;
  agi: number;
  res: number;
  // Hero skills (heroSkills.ts): the allocation(s) of the skill points earned every few levels and the free-respec flag. Old saves load with nothing spent.
  skillTree: SkillTreeState;
  materials: Materials;
  potions: { hp: number; stamina: number; elixir: number };
  consumables: Record<ConsumableId, number>;
  expeditions: ActiveExpedition[]; // LEGACY: Expeditions started before delivery orders. They finish and are claimed the old way; nothing new starts.
  deliveries: DeliveryState; // delivery orders (deliveries.ts): the offers on the board and the one active delivery
  gems: Record<GemId, number>;
  blessed: boolean;
  quests: QuestState;
  // Lifetime counters (stats.ts): kills, gold earned, forged by rarity, ... Old saves load with what they already prove (kills counted, gear owned) and zero for the rest.
  stats: LifetimeStats;
  // The codex (codex.ts): the gear, materials and monsters ever owned / held / defeated. Backfilled from what an old save holds.
  codex: CodexState;
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
  // Persistent sub-level mastery per zone+depth (key `${zoneId}:${depth}`): the ceiling being farmed and
  // the wins banked toward the next promotion attempt. Missing key = never played = ceiling 1, 0 wins.
  // Written only when a hunt session ends (stop / zone switch) from that session's simulated result —
  // claiming rewards never changes it. Replaces the legacy huntingSubLevels resume map (see loadSave).
  huntProgress: Record<string, HuntProgress>;
  // Frozen inputs of the ACTIVE session (huntSession.ts): permanent stats + blessed at start, and the real time spans
  // in which the Strength Elixir / Battle Pass were active. null when not hunting.
  huntSession: HuntSession | null;
  // What the last stopped session earned, waiting to be claimed. Persistent: it survives reload/close, is applied
  // exactly once by huntLifecycle.applyHuntClaim, and blocks starting another session until then.
  pendingHuntReward: PendingHuntReward | null;
  unlockedHuntingZones: string[];
  // Owns the Adventurer Pass (permanent). Decided ONLY by entitlements.ts ownsAdventurerPass; never read this flag elsewhere.
  hasBattlePass: boolean;
  // The Pass as it was when the running Mining / Woodcutting session started (see snapshotGatherPass). Optional: old saves get it computed at load.
  miningPass?: GatherPass | null;
  woodcuttingPass?: GatherPass | null;
  battlePassLevel: number;
  battlePassXp: number;
  claimedPassRewards: { free: number[]; premium: number[] };
  // The season the level / XP / claimed lists above belong to (the last one SETTLED, see battlepass.ts settleSeason) and, until the player dismisses it, what the last settlement delivered.
  passSeason: number;
  pendingSeasonSummary: SeasonSummary | null;
  cosmetics: string[];
  activeTitle: string | null;
  // Portrait frame (seasonItems.ts FRAMES) the hero wears, one of the owned cosmetics; null = none.
  activeFrame: string | null;
  // Hero skin (seasonItems.ts SKINS) the hero wears, one of the owned cosmetics; null = the default knight.
  activeSkin: string | null;
  // The hero looks (gear.ts HERO_LOOKS, never the peasant) he has already worn: the first time each one is worn there is a one-off toast and portrait flash (sprites.ts
  // withLookMoment). Loads as every look up to the armor he wears now, so only a look he really reaches later ever celebrates. Replaces the old heroKnighted flag.
  seenLooks?: HeroBaseLook[];
  // Stash slots from Stash Deeds, beyond the upgrade ladder (seasonItems.ts, capped at +20 over all seasons).
  stashBonusSlots: number;
  dungeonCheckpoints: number[];
  gardenSlots: GardenSlot[];
  activeBuff: ActiveBuff | null; // Strength Elixir (kept as-is for old saves)
  attackBuff: ActiveBuff | null; // Attack (Battle) Elixir: an independent slot, same shape and rules
  // Garden 3.0 tonics (buffs.ts): one entry per running kind, each with the span it covers. Missing = none (old saves).
  buffs: Partial<Record<TimedBuffKind, TimedBuff>>;
  dungeonSessionsDay: string;
  dungeonSessionsUsed: number;
  // The local day the Pass owner's daily Repair Kit was last delivered (entitlements.ts grantDailyPassKit). Missing on saves from before it.
  passKitDay?: string;
  seenTooltips: string[];
  seenWelcome: boolean;
  // Online only: which reset of the first League this hero belongs to (leagueReset.ts). Absent = never reset (every save from before the League, and every offline / desktop save).
  league?: LeagueMark;
  tutorial: TutorialState;
  autoPotionThreshold: number;
  autoPotionPriority: 'small_first' | 'large_first';
}

const SAVE_KEY = 'arena-rpg-save-v1';

export const MAX_LEVEL = 100;
export const MAX_BATTLE_PASS_LEVEL = 30;

// Modelo C hero curve (5 bands, see tunables.ts progression.heroBand*/heroGrowth* for the rationale).
// Each band's `base` is the previous band's own need() evaluated at its last level, so the curve is
// continuous at every boundary (no jump): xpForNextLevel(heroBand1To) and xpForNextLevel(heroBand1To+1)
// are equal, then band 2's own growth takes over from there. Band 1 starts at T.progression.xpBase (100).
// `override` (xpCurve.ts) replaces the growth of bands 4 and 5 to rebuild the curve saves had before Round 15.
function heroBandTable(override: { growth4?: number; growth5?: number } = {}): { from: number; base: number; growth: number }[] {
  const p = T.progression;
  const bounds = [1, p.heroBand1To + 1, p.heroBand2To + 1, p.heroBand3To + 1, p.heroBand4To + 1];
  const growths = [p.heroGrowth1, p.heroGrowth2, p.heroGrowth3, override.growth4 ?? p.heroGrowth4, override.growth5 ?? p.heroGrowth5];
  const bands: { from: number; base: number; growth: number }[] = [];
  let base = p.xpBase;
  for (let i = 0; i < bounds.length; i++) {
    bands.push({ from: bounds[i], base, growth: growths[i] });
    if (i + 1 < bounds.length) base *= Math.pow(growths[i], bounds[i + 1] - 1 - bounds[i]);
  }
  return bands;
}

export function xpForNextLevelWith(level: number, override: { growth4?: number; growth5?: number }): number {
  const bands = heroBandTable(override);
  let band = bands[0];
  for (const b of bands) {
    if (b.from > level) break;
    band = b;
  }
  return Math.round(band.base * Math.pow(band.growth, level - band.from));
}

export function xpForNextLevel(level: number): number {
  return xpForNextLevelWith(level, {});
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

// Max HP one VIT point is worth at a character level.
export const vitHpPerPoint = (level: number): number => T.advanced.vitHpPerPoint + T.advanced.vitHpPerLevel * level;

export function playerMaxHp(save: SaveData): number {
  const armorView = resolveEquipped(save).armor;
  const armor = armorView.item;
  const armorLvl = viewRefine(armorView);
  const aDur = viewDurability(armorView);
  const aRarity = rarityStatMult(viewRarity(armorView));
  const gems = equippedGemBonuses(save);
  const subs = equippedSubstatTotals(save);
  const extra = equippedExtraStats(save);
  const raw =
    T.progression.playerBaseHp +
    (save.armorLevel - 1) * T.progression.armorHpPerLvl +
    effectiveMaxHp(armor, armorLvl) * durabilityFactor(aDur) * aRarity +
    (playerLevel(save.xp) - 1) * T.progression.levelHpBonus +
    save.vit * vitHpPerPoint(playerLevel(save.xp)) +
    save.res * T.advanced.resHpPerPoint +
    gems.maxHp +
    subs.maxHp +
    extra.maxHp;
  // Thick Skin (heroSkills.ts): a share of the whole pool, rounded once at the end.
  return Math.round(raw * (1 + saveSkillEffects(save).maxHpPct));
}

// Single source of truth for a hero's derived combat stats (Layer 2, see derivedStats.ts). Hunting
// (computeHuntingStatus), the Dungeon (BattleModal.tsx) and computeCP all derive from this — do not
// re-derive these numbers anywhere else. Pure function of the save: no clock, no buffs. Temporary
// modifiers (blessed / Strength Elixir) are separate, see combatModifiersFromSave.
//
// These are the PERMANENT effective stats (relic crit multiplier included); Hunting, the Dungeon and computeCP
// all read them. Temporary modifiers are never part of this.
// `parts` exists only for the hero panel's breakdown (statBreakdown.ts): it leaves the set bonuses and / or the paragon bonus out so the stats can be rebuilt layer by layer with THIS function
// instead of a second formula. Nothing in the game passes it, so every fight, the CP and every session read the full stats.
export interface StatParts {
  sets?: boolean;
  paragon?: boolean;
}

export function buildCombatStats(save: SaveData, parts: StatParts = {}): CombatStats {
  const { weapon: weaponView, armor: armorView, relic } = resolveEquipped(save);
  const weapon = weaponView.item;
  const armor = armorView.item;
  const wLvl = viewRefine(weaponView);
  const aLvl = viewRefine(armorView);
  const wDur = viewDurability(weaponView);
  const aDur = viewDurability(armorView);
  const wFactor = durabilityFactor(wDur);
  const aFactor = durabilityFactor(aDur);
  const wRarity = rarityStatMult(viewRarity(weaponView));
  const aRarity = rarityStatMult(viewRarity(armorView));
  const gems = equippedGemBonuses(save);
  const subs = equippedSubstatTotals(save, parts.sets !== false);
  // Helmet / gloves / boots / ring / shield (gearInstances.equippedExtraStats): gloves damage joins the weapon term, so STR scales it too.
  const extra = equippedExtraStats(save);
  // Set bonuses (setBonuses.ts): the crafted tier families worn, added to the same numbers the relic and the gear feed.
  const set = parts.sets === false ? emptySetTotals() : setBonuses(equippedSetItems(save)).totals;

  // Flat base hit (avg of attackMin/attackMax) plus the weapon term W (refine, durability, rarity); STR is applied on top
  // of that sum by strengthAdjustedDamage (derivedStats.ts). blessed/Elixir/crit come later, at the call sites.
  const baseDmg = (T.combat.attackMin + T.combat.attackMax) / 2;
  // Hero skills (heroSkills.ts): every effect enters the Layer-2 numbers here and nowhere else.
  const fx = saveSkillEffects(save);
  const speedBonus = (relic?.attackSpeedBonus ?? 0) + set.attackSpeedBonus;
  const stats: CombatStats = {
    maxHp: playerMaxHp(save),
    // Boss relic damagePct (Warchief Totem): a share of the FINAL hit, applied after STR, before blessed / elixirs. Golpe Pesado is another such share; Mestre de Armas
    // grows the weapon term W before STR scales it.
    dmgBase: strengthAdjustedDamage(baseDmg + effectiveDamage(weapon, wLvl) * wFactor * wRarity * (1 + fx.weaponPct) + extra.damage, save.str) * (1 + (relic?.damagePct ?? 0)) * (1 + set.damagePct) * (1 + (parts.paragon === false ? 0 : paragonDamageBonus(paragonLevel(save.xp)))),
    critChance: effectiveCrit(weapon, wLvl) * wFactor + subs.critRate / 100 + extra.critChance + (relic?.critChance ?? 0) + fx.critChance,
    critMult: T.combat.critMult + (relic?.critMultBonus ?? 0) + gems.critDamageBonus + subs.critDamage / 100 + extra.critMult + fx.critMultBonus + set.critMultBonus,
    // AGI -> attack interval: hyperbolic curve with a 400 ms floor and sanitized input, see derivedStats.ts.
    // The relic's attackSpeedBonus (and the skills') enter the same derivation, so the 400 ms floor still caps them.
    heroMs: heroAttackIntervalMs(save.agi, speedBonus),
    agi: save.agi,
    speedBonus,
    // Muralha scales the whole resistance sum, which applyDamageReduction then keeps asymptotic.
    reduction: (effectiveResistance(armor, aLvl) * aFactor * aRarity + save.res * T.advanced.resResistPerPoint + gems.resistance + subs.defense / 100 + extra.resistance + set.resistance) * (1 + fx.resistancePct),
    // The Lich Phylactery's lifestealPct enters the same derivation as the lifesteal substats.
    lifesteal: subs.lifesteal + (relic?.lifestealPct ?? 0) + set.lifestealPct,
    burn: !!weapon.burn,
    // Reflect scales with the armor's durability like its resistance does (a broken armor reflects less), not with rarity; the shield's and Espinhos' add to it.
    reflect: (armor.reflect ?? 0) * aFactor + extra.reflect + fx.reflect,
    hpRegenPct: (relic?.hpRegenPct ?? 0) + fx.hpRegenPct + set.hpRegenPct,
    // Gold bonus (substats + Goblin Lucky Coin, capped): the Dungeon pays it through buffs.goldMultiplier, Hunting through the session's frozen stats.
    goldBonus: subs.goldBonus,
    xpBonus: (relic?.xpBonusPct ?? 0) + Math.round(fx.xpPct * 10000) / 100,
  };
  // The skill effects that have no gear twin are only present when the hero has them, so a hero without skills has exactly the stats it always had.
  if (fx.bleed > 0) stats.bleed = fx.bleed;
  if (fx.strikes) stats.strikes = fx.strikes;
  if (fx.blockChance > 0) stats.block = fx.blockChance;
  if (fx.lastBastion) stats.bastion = true;
  if (fx.bossReduction > 0) stats.bossReduction = fx.bossReduction;
  if (fx.goldPct > 0) stats.skillGold = Math.round(fx.goldPct * 10000) / 100;
  if (fx.materialsMult !== 1) stats.matMult = fx.materialsMult;
  if (fx.huntUniqueMult !== 1) stats.uniqueMult = fx.huntUniqueMult;
  if (fx.bossLootMult !== 1) stats.bossLootMult = fx.bossLootMult;
  return stats;
}

// Temporary damage modifiers, evaluated at a moment the CALLER chooses (`now` is explicit on purpose —
// see derivedStats.ts). The Dungeon calls it on every hit with Date.now(). Hunting no longer reads it live: a session
// freezes blessed at start and tracks the Elixir as time windows (see HuntSession / buildHuntSession).
export function combatModifiersFromSave(save: SaveData, now: number): CombatModifiers {
  return {
    blessedMult: save.blessed ? 1 + BLESSED_DAMAGE_PCT : 1,
    strengthMult: isBuffActive(save, 'strength', now) ? 1 + T.battle.strengthElixirDmgPct : 1,
    attackMult: isBuffActive(save, 'attack', now) ? 1 + T.battle.attackElixirDmgPct : 1,
    sharpMult: isBuffActive(save, 'sharpened', now) ? 1 + T.consumables.sharpenDmgPct : 1,
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
  return cpOfStats(buildCombatStats(save));
}

// The same rating for any CombatStats (the hero panel's "CP now" feeds it the stats with the elixirs applied).
export function cpOfStats(stats: CombatStats): number {
  return Math.round(CP_SCALE * combatPowerCore(stats));
}

// Adventurer Pass convenience perks (owners only, see entitlements.ts): a longer offline window and a small material yield bump (Hunting / Mining /
// Woodcutting), one more visible delivery offer + one more free reroll and a delivery XP bonus (T.deliveries), extra inventory slots (inventory.ts
// inventoryCapacity) and a repair discount. Convenience and retention, never power: uniques and relics never see the multiplier.

export function effectiveRepairCost(save: SaveData, tier: number): number {
  const base = repairCost(tier);
  return ownsAdventurerPass(save) ? Math.ceil(base * (1 - T.battlePass.repairDiscount)) : base;
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

// What the Adventurer Pass was doing when a gathering session STARTED: the storage cap and the yield bonus of that session come from it, so a Pass
// bought mid-session does not stretch the running session (it applies from the next one). The Pass never expires, so owning it at the start is all there is.
// (Snapshots saved under the 30-day model also carried the expiry instant; it is dropped on load, see sanitizeGatherPass.)
export interface GatherPass {
  active: boolean;
  // The storage cap the session started with. Always the base cap now (the Pass no longer extends storage); a session saved under the old Pass keeps the
  // longer cap it started with (LEGACY_PASS_CAP_HOURS) and is never shortened retroactively.
  capHours?: number;
  // Coletor (heroSkills.ts) as it was when the session started: a share of extra yield, frozen like the Pass. Missing = none (older snapshots).
  gatherPct?: number;
}

export function snapshotGatherPass(save: SaveData, baseCap: number): GatherPass {
  const owner = ownsAdventurerPass(save);
  const gatherPct = saveSkillEffects(save).gatherPct;
  return { active: owner, capHours: owner ? Math.max(baseCap, T.battlePass.capHours) : baseCap, ...(gatherPct > 0 ? { gatherPct } : {}) };
}

export type GatherKind = 'mining' | 'woodcutting';

// A saved snapshot as is (an owner is an owner for good: the old expiry is ignored); a running session without one (an old save) gets the Pass as it is at load.
function sanitizeGatherPass(raw: unknown, running: boolean, hasPass: boolean, baseCap: number): GatherPass | null {
  const r = raw as Partial<GatherPass> | null | undefined;
  if (!running) return null;
  if (!r || typeof r.active !== 'boolean') return { active: hasPass, capHours: baseCap };
  const cap = typeof r.capHours === 'number' && Number.isFinite(r.capHours) && r.capHours > 0 ? r.capHours : r.active ? Math.max(baseCap, LEGACY_PASS_CAP_HOURS) : baseCap;
  const gatherPct = typeof r.gatherPct === 'number' && Number.isFinite(r.gatherPct) && r.gatherPct > 0 ? Math.min(1, r.gatherPct) : 0;
  return { active: r.active, capHours: cap, ...(gatherPct > 0 ? { gatherPct } : {}) };
}

interface GatherAccrual {
  capMs: number;
  pendingMs: number;
  tierId: MaterialId | null;
  units: number;
  gold: number;
  full: boolean;
  // false when this session started without the Pass (so the longer cap only applies from the next one)
  passCoversSession: boolean;
}

// ONE accrual for Mining and Woodcutting (they cannot diverge): units = floor(effective hours x power x rate), effective hours = real hours, plus the Gatherer
// Brew's share, with the Pass's drop multiplier when the session started with the Pass.
function gatherAccrual(save: SaveData, kind: GatherKind, now: number): GatherAccrual {
  const mining = kind === 'mining';
  const tier = mining ? (save.activeOreId ? getOreTier(save.activeOreId) : undefined) : save.activeWoodId ? getWoodTier(save.activeWoodId) : undefined;
  const baseCap = mining ? save.miningCapHours : save.woodcuttingCapHours;
  const startedAt = mining ? save.lastMiningClaim : save.lastWoodcuttingClaim;
  // Old saves (no snapshot) and plain states fall back to the Pass as it is now.
  const snap = (mining ? save.miningPass : save.woodcuttingPass) ?? { active: ownsAdventurerPass(save), capHours: baseCap }; // no snapshot (old save / plain state): never a longer cap than the player had
  const capHours = Math.max(baseCap, snap.capHours ?? 0);
  const capMs = capHours * 3600 * 1000;
  if (!tier) return { capMs, pendingMs: 0, tierId: null, units: 0, gold: 0, full: false, passCoversSession: snap.active };
  const elapsedMs = Math.max(0, now - startedAt);
  const pendingMs = Math.min(elapsedMs, capMs);
  const hours = pendingMs / (3600 * 1000);
  const power = gatherPower(BASE_GATHER_POWER, save.skillXp[kind]);
  // Coletor's share (frozen in the snapshot) works like the Gatherer Brew: extra effective hours, for the units only (the Gold of the session is unchanged).
  const effective = hours * (1 + (snap.gatherPct ?? 0)) + gathererBonusHours(save, startedAt, pendingMs) + prospectBonusHours(save, startedAt, pendingMs);
  const dropMult = snap.active ? T.battlePass.dropRateMultiplier : 1;
  const rate = mining ? T.mining.oreRatePerPower : T.woodcutting.woodRatePerPower;
  const goldRate = mining ? T.mining.goldRatePerPower : T.woodcutting.goldRatePerPower;
  return {
    capMs,
    pendingMs,
    tierId: tier.id,
    units: Math.floor(effective * power * rate * dropMult * gatherMasteryMult(kind, skillLevel(save.skillXp[kind], kind))),
    gold: Math.floor(hours * power * goldRate),
    full: pendingMs >= capMs,
    passCoversSession: snap.active,
  };
}

export function computeMiningStatus(save: SaveData, now: number): MiningStatus & { passCoversSession: boolean } {
  const g = gatherAccrual(save, 'mining', now);
  return { capMs: g.capMs, pendingMs: g.pendingMs, oreId: g.tierId, oreReady: g.units, goldReady: g.gold, full: g.full, passCoversSession: g.passCoversSession };
}

export interface WoodcuttingStatus {
  capMs: number;
  pendingMs: number;
  woodId: MaterialId | null;
  woodReady: number;
  goldReady: number;
  full: boolean;
}

export function computeWoodcuttingStatus(save: SaveData, now: number): WoodcuttingStatus & { passCoversSession: boolean } {
  const g = gatherAccrual(save, 'woodcutting', now);
  return { capMs: g.capMs, pendingMs: g.pendingMs, woodId: g.tierId, woodReady: g.units, goldReady: g.gold, full: g.full, passCoversSession: g.passCoversSession };
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
  // A non-finite clock / start counts as no time elapsed (never as "already ready").
  const rawElapsed = now - slot.startedAt;
  const elapsedMs = Number.isFinite(rawElapsed) ? Math.max(0, rawElapsed) : 0;
  // Gardening mastery (mastery.ts) shortens every plant's growth from level 50 on; below it the duration is the plant's own, to the millisecond.
  const durationMs = plantGrowthMs(def, skillLevel(save.skillXp.gardening, 'gardening'));
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  return { plantId: def.id, durationMs, elapsedMs, remainingMs, ready: elapsedMs >= durationMs };
}

export function computeGardenStatuses(save: SaveData, now: number): GardenStatus[] {
  return save.gardenSlots.map((_, i) => computeGardenSlotStatus(save, now, i));
}

// Timestamp-based like Mining/Hunting/Garden — no ticking interval needed to know if a buff is still valid, only checked at read time (e.g. right
// before a damage calc, or when rendering the HUD). isBuffActive / buffRemainingMs live in buffs.ts and are re-exported above.

// A tonic never outlives its duration: expiry further ahead than one full duration from now (tampered / clock moved back) is clamped.
function sanitizeBuffs(raw: unknown): Partial<Record<TimedBuffKind, TimedBuff>> {
  const out: Partial<Record<TimedBuffKind, TimedBuff>> = {};
  if (!raw || typeof raw !== 'object') return out;
  const now = Date.now();
  for (const kind of TIMED_BUFF_KINDS) {
    const b = (raw as Record<string, Partial<TimedBuff> | undefined>)[kind];
    if (!b || typeof b.expiresAt !== 'number' || !Number.isFinite(b.expiresAt)) continue;
    const expiresAt = Math.min(b.expiresAt, now + buffMinutes(kind) * 60 * 1000);
    const from = typeof b.from === 'number' && Number.isFinite(b.from) && b.from > 0 ? Math.min(b.from, expiresAt) : expiresAt - buffMinutes(kind) * 60 * 1000;
    const zone = (b as { zone?: unknown }).zone;
    out[kind] = { from, expiresAt, ...(kind === 'bait' && typeof zone === 'string' && zone.length > 0 && zone.length < 64 ? { zone } : {}) };
  }
  return out;
}

export interface HuntingStatus {
  capMs: number;
  pendingMs: number;
  goldReady: number;
  xpReady: number;
  drops: Partial<Record<MaterialId, number>>;
  uniques: UniqueDrop[]; // unique pieces this session rolled (not materials: whole gear pieces, one slot each)
  full: boolean;
  // Real-combat sub-level mastery (see huntCombat.ts): the session replays from the SAVED progress
  // (startCeiling / startPromotionWins) — no climb — and ends at ceilingSubLevel / promotionWins, which
  // is what gets persisted when the hunt stops. promotionRequired is the win requirement AT the ending
  // ceiling (0 once at the max level).
  ceilingSubLevel: number;
  promotionWins: number;
  promotionRequired: number;
  // Rodada 22: the CP the NEXT sub-level asks in a zone with a CP gate (huntingZones.ts subLevelCpRequired), 0 when the zone has none or the ceiling is the last level.
  nextSubLevelCp: number;
  startCeiling: number;
  promotions: number;
  promotionLosses: number;
  // Fights won / lost so far (display only, see HuntSessionResult): a win is a kill, a promotion fight counts like any other.
  kills: number;
  defeats: number;
  potionsUsed: HuntPotionStock;
  liveSnapshot: HuntLiveSnapshot | null;
  // Display only: what each skill strike did in the session (times and damage) and the total damage dealt, for the result line.
  skillTally: StrikeTally;
  totalDamage: number;
}

export function huntProgressKey(zoneId: string, depth: HuntingDepth): string {
  return `${zoneId}:${depth}`;
}

export function getHuntProgress(save: SaveData, zoneId: string, depth: HuntingDepth): HuntProgress {
  const p = save.huntProgress[huntProgressKey(zoneId, depth)];
  return p ? { ceiling: p.ceiling, promotionWins: p.promotionWins } : { ceiling: 1, promotionWins: 0 };
}

// Wins needed AT `ceiling` before the hunt tries ceiling + 1 (table lives in tunables; levels past the
// last entry reuse it).
export function huntPromotionRequiredWins(ceiling: number): number {
  const table = [
    T.hunting.huntPromotionWins1,
    T.hunting.huntPromotionWins2,
    T.hunting.huntPromotionWins3,
    T.hunting.huntPromotionWins4,
    T.hunting.huntPromotionWins5,
    T.hunting.huntPromotionWins6,
    T.hunting.huntPromotionWins7,
    T.hunting.huntPromotionWins8,
    T.hunting.huntPromotionWins9,
  ];
  const idx = Math.min(table.length, Math.max(1, Math.floor(ceiling))) - 1;
  return Math.max(1, Math.floor(table[idx]));
}

// The save's progress map after a session ends: that zone+depth takes the session's final state.
export function withHuntProgress(save: SaveData, zoneId: string, depth: HuntingDepth, status: HuntingStatus): Record<string, HuntProgress> {
  return {
    ...save.huntProgress,
    [huntProgressKey(zoneId, depth)]: { ceiling: status.ceilingSubLevel, promotionWins: status.promotionWins },
  };
}

// The frozen inputs of a session that starts at `startedAt`: permanent stats and blessed as of now, plus a window for
// every timed modifier that is ALREADY running at that moment (later activations are recorded by the caller).
export function buildHuntSession(save: SaveData, startedAt: number): HuntSession {
  const buff = save.activeBuff;
  const atk = save.attackBuff;
  return {
    stats: buildCombatStats(save),
    blessed: save.blessed,
    strength: isBuffActive(save, 'strength', startedAt) && buff ? [{ from: startedAt, to: buff.expiresAt }] : [],
    attack: isBuffActive(save, 'attack', startedAt) && atk ? [{ from: startedAt, to: atk.expiresAt }] : [],
    pass: ownsAdventurerPass(save) ? [{ from: startedAt, to: null }] : [],
    ...(ownsAdventurerPass(save) ? { passCapHours: T.battlePass.capHours, passGold: T.battlePass.goldBonus * 100 } : {}),
    storageFlat: true,
    tonics: runningTonicWindows(save, startedAt, startedAt),
  };
}

// One window [from, expiry) for every hunt-relevant tonic that is running at `now`. The Hunter Lure only counts for the zone it was used in.
function runningTonicWindows(save: SaveData, now: number, from: number): TonicWindows {
  const out: TonicWindows = {};
  for (const kind of HUNT_BUFF_KINDS) {
    const expiresAt = buffExpiry(save, kind);
    if (kind === 'bait' && save.buffs?.bait?.zone !== save.activeHuntingZone) continue;
    if (expiresAt !== null && expiresAt > now) out[kind] = [{ from, to: expiresAt }];
  }
  return out;
}

// A session that was already running before sessions were snapshotted (old save) or whose snapshot is unusable. Its
// real history is unknowable, so it is rebuilt conservatively from the save as it is NOW: stats as they are now, an
// Elixir still running only counts from now on (a 30-minute buff is never worth crediting backwards), and a Battle
// Pass that is active now is assumed to have covered the session (so its cap and drop bonus are not taken away).
export function buildLegacyHuntSession(save: SaveData, now: number): HuntSession {
  const buff = save.activeBuff;
  const atk = save.attackBuff;
  const from = Math.min(now, Number.isFinite(save.huntingOfflineStart) ? save.huntingOfflineStart : now);
  return {
    stats: buildCombatStats(save),
    blessed: save.blessed,
    strength: isBuffActive(save, 'strength', now) && buff ? [{ from: now, to: buff.expiresAt }] : [],
    attack: isBuffActive(save, 'attack', now) && atk ? [{ from: now, to: atk.expiresAt }] : [],
    pass: ownsAdventurerPass(save) ? [{ from, to: null }] : [],
    storageFlat: true,
    tonics: runningTonicWindows(save, now, now),
  };
}

// What simulateHuntingSession needs for one session of `zone` at `depth`, derived from the session's frozen inputs (computeHuntingStatus) or from a
// hypothetical one built from the live hero (huntEstimate.ts). Pure: reads the save, rolls nothing. `startedAt` anchors the window offsets.
export function buildHuntSimSetup(
  save: SaveData,
  zone: HuntingZoneDef,
  depth: HuntingDepth,
  session: HuntSession,
  startedAt: number,
  passWindows: [number, number][],
): { build: HuntCombatBuild; zoneCfg: HuntZoneCombatCfg; timeline: HuntTimeline; potionCfg: HuntPotionCfg } {
  const depthDef = getHuntingDepthDef(depth);
  // Stats and blessed are the session's frozen ones (not the live save): gear/attribute changes and a blessed repair made
  // after the session started only count from the next session. The Elixir is applied per hit while its window covers
  // that hit, the Battle Pass drop bonus per cleared fight while its window covers it (see HuntTimeline).
  const stats = session.stats;
  const mods = { blessedMult: session.blessed ? 1 + BLESSED_DAMAGE_PCT : 1, strengthMult: 1, attackMult: 1 };
  const strengthMods = { ...mods, strengthMult: 1 + T.battle.strengthElixirDmgPct };
  const attackMods = { ...mods, attackMult: 1 + T.battle.attackElixirDmgPct };

  const build: HuntCombatBuild = {
    playerMax: stats.maxHp,
    heroDmgBase: applyDamageModifiers(stats.dmgBase, mods),
    critChance: stats.critChance,
    critMult: stats.critMult,
    heroMs: stats.heroMs,
    reduction: stats.reduction,
    lifestealPct: stats.lifesteal,
    burn: stats.burn === true,
    reflect: stats.reflect ?? 0,
    hpRegenPct: stats.hpRegenPct ?? 0,
    goldBonusPct: (stats.goldBonus ?? 0) + (session.passGold ?? 0) + (stats.skillGold ?? 0),
    xpBonusPct: stats.xpBonus ?? 0,
    ...(stats.bleed ? { bleed: stats.bleed } : {}),
    ...(stats.strikes ? { strikes: stats.strikes } : {}),
    ...(stats.block ? { block: stats.block } : {}),
    ...(stats.bastion ? { bastion: true } : {}),
    ...(stats.matMult ? { matMult: stats.matMult } : {}),
    ...(stats.uniqueMult ? { uniqueMult: stats.uniqueMult } : {}),
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
    ...(zone.xpPerSubLevel ? { xpPerSubLevel: zone.xpPerSubLevel } : {}),
    drops: zone.drops,
    uniques: zone.uniques,
    depth,
    dropRateMult: 1, // the pass bonus is time-dependent, see `timeline`
  };
  const timeline: HuntTimeline = {
    strengthWindows: relativeWindows(session.strength, startedAt),
    attackWindows: relativeWindows(session.attack, startedAt),
    dmgStrength: applyDamageModifiers(stats.dmgBase, strengthMods),
    dmgAttack: applyDamageModifiers(stats.dmgBase, attackMods),
    dmgBoth: applyDamageModifiers(stats.dmgBase, { ...strengthMods, attackMult: attackMods.attackMult }),
    passWindows,
    passDropMult: T.battlePass.dropRateMultiplier,
    stoneWindows: relativeWindows(session.tonics?.stoneskin ?? [], startedAt),
    hasteWindows: relativeWindows(session.tonics?.haste ?? [], startedAt),
    precisionWindows: relativeWindows(session.tonics?.precision ?? [], startedAt),
    fortuneWindows: relativeWindows(session.tonics?.fortune ?? [], startedAt),
    knowledgeWindows: relativeWindows(session.tonics?.knowledge ?? [], startedAt),
    xpBuffPct: T.consumables.knowledgeXpPct,
    sharpWindows: relativeWindows(session.tonics?.sharpened ?? [], startedAt),
    polishWindows: relativeWindows(session.tonics?.polished ?? [], startedAt),
    baitWindows: relativeWindows(session.tonics?.bait ?? [], startedAt),
    sharpMult: 1 + T.consumables.sharpenDmgPct,
    reductionPolish: T.consumables.polishReduction,
    baitDropPct: T.consumables.baitDropPct,
    reductionStone: stoneskinReduction(stats),
    heroMsHaste: hasteIntervalMs(stats),
    critPrecision: precisionCrit(stats),
    fortuneGoldPct: T.tonics.fortuneGoldPct,
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
  return { build, zoneCfg, timeline, potionCfg };
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
      uniques: [],
      full: false,
      ceilingSubLevel: 1,
      promotionWins: 0,
      promotionRequired: huntPromotionRequiredWins(1),
      nextSubLevelCp: 0,
      startCeiling: 1,
      promotions: 0,
      promotionLosses: 0,
      kills: 0,
      defeats: 0,
      potionsUsed: emptyPotionsUsed,
      liveSnapshot: null,
      skillTally: {},
      totalDamage: 0,
    };
  }
  const startedAt = save.huntingOfflineStart;
  const session = save.huntSession ?? buildLegacyHuntSession(save, now);
  // Time: a non-finite / negative / future-start elapsed counts as 0. Up to the zone's base cap it always counts; beyond
  // it (up to the pass cap) only while the Battle Pass really covered that stretch (huntValidMs).
  const elapsedMs = Number.isFinite(now - startedAt) ? Math.max(0, now - startedAt) : 0;
  const baseCapMs = zone.offlineCapHours * 3600 * 1000;
  // The Pass's longer cap is frozen into the session when it starts (buildHuntSession); a session started without it, or rebuilt without a snapshot, has the zone cap.
  const passCapMs = Math.max(zone.offlineCapHours, session.passCapHours ?? 0) * 3600 * 1000;
  const passWindows = relativeWindows(session.pass, startedAt);
  const pendingMs = huntValidMs(elapsedMs, baseCapMs, passCapMs, passWindows);
  const stalled = pendingMs < elapsedMs;
  const capMs = stalled ? pendingMs : windowCovers(session.pass, now) ? Math.max(baseCapMs, passCapMs) : baseCapMs;
  const depth = save.activeHuntingDepth ?? DEFAULT_HUNTING_DEPTH;

  const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup(save, zone, depth, session, startedAt, passWindows);

  const startProgress = getHuntProgress(save, zone.id, depth);

  // Deterministic seed keyed off this session's own start time: computeHuntingStatus gets polled
  // every ~1s while the tab is open, and it must return the SAME outcome every time for the same
  // (unclaimed) session instead of a fresh random result flickering in on every render.
  const result = simulateHuntingSession(
    build,
    zoneCfg,
    startProgress,
    pendingMs,
    potionCfg,
    `${save.huntingOfflineStart}:${zone.id}:${depth}`,
    { maxLevel: T.hunting.subLevels, requiredWins: huntPromotionRequiredWins, ...(zone.subLevelCpGrowth ? { allowed: (next: number) => cpOfStats(session.stats) >= subLevelCpRequired(zone, depth, next) } : {}) },
    timeline,
  );

  return {
    capMs,
    pendingMs,
    goldReady: result.goldReady,
    xpReady: result.xpReady,
    drops: result.drops,
    // Web build: the server rolls the uniques when the reward is claimed (itemAuthority.ts), so the running hunt shows none.
    uniques: isServerItemAuthority() ? [] : result.uniques,
    full: stalled || pendingMs >= capMs,
    ceilingSubLevel: result.ceilingSubLevel,
    promotionWins: result.promotionWins,
    promotionRequired: result.ceilingSubLevel >= T.hunting.subLevels ? 0 : huntPromotionRequiredWins(result.ceilingSubLevel),
    nextSubLevelCp: result.ceilingSubLevel >= T.hunting.subLevels ? 0 : subLevelCpRequired(zone, depth, result.ceilingSubLevel + 1),
    startCeiling: Math.min(T.hunting.subLevels, Math.max(1, startProgress.ceiling)),
    promotions: result.promotions,
    promotionLosses: result.promotionLosses,
    kills: result.kills,
    defeats: result.defeats,
    potionsUsed: result.potionsUsed,
    liveSnapshot: result.liveSnapshot,
    skillTally: result.skillTally,
    totalDamage: result.totalDamage,
  };
}

export function defaultSave(): SaveData {
  const starter = createStarterGear();
  return {
    gold: 0,
    victories: 0,
    shards: 0,
    xp: 0,
    weaponLevel: 1,
    armorLevel: 1,
    schemaVersion: GEAR_SCHEMA_VERSION,
    xpCurve: XP_CURVE_VERSION,
    gearInstances: starter.instances,
    inventory: { ...DEFAULT_INVENTORY },
    equipped: { ...DEFAULT_EQUIPPED, weapon: starter.weaponId, armor: starter.armorId },
    inventoryCapacity: DEFAULT_INVENTORY_CAPACITY,
    inventoryBonusSlots: 0,
    pouchMigrated: false,
    stash: emptyStash(),
    merchant: emptyMerchant(),
    wholesale: emptyWholesale(),
    pouchDay: emptyPouchDay(),
    pouchFacesV2: true,
    highestDungeonFloor: 1,
    heroName: 'Hero',
    str: 0,
    vit: 0,
    agi: 0,
    res: 0,
    skillTree: emptySkillTree(),
    materials: emptyMaterials(),
    potions: { hp: 0, stamina: 0, elixir: 0 },
    consumables: emptyConsumables(),
    expeditions: [],
    deliveries: emptyDeliveries(),
    gems: emptyGems(),
    blessed: false,
    quests: emptyQuestState(),
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
    huntProgress: {},
    huntSession: null,
    pendingHuntReward: null,
    unlockedHuntingZones: [DEFAULT_HUNTING_ZONE],
    hasBattlePass: false,
    miningPass: null,
    woodcuttingPass: null,
    battlePassLevel: 1,
    battlePassXp: 0,
    claimedPassRewards: { free: [], premium: [] },
    passSeason: seasonNumber(Date.now()),
    pendingSeasonSummary: null,
    cosmetics: [],
    activeTitle: null,
    activeFrame: null,
    activeSkin: null,
    seenLooks: [],
    stashBonusSlots: 0,
    dungeonCheckpoints: [],
    gardenSlots: emptyGardenSlots(),
    activeBuff: null,
    attackBuff: null,
    buffs: {},
    dungeonSessionsDay: '',
    dungeonSessionsUsed: 0,
    seenTooltips: [],
    seenWelcome: false,
    tutorial: freshTutorialState(),
    // Matches the old hardcoded auto-potion behavior (greater_elixir > large_hp > small_hp) so
    // existing saves see no gameplay change until the player actually opens the settings.
    autoPotionThreshold: 0.35,
    autoPotionPriority: 'large_first',
    stats: emptyStats(),
    codex: emptyCodex(),
  };
}

// Raw v1 save, kept once before the first v2 write so the migration can always be audited / rolled back by hand.
const LEGACY_BACKUP_KEY = 'arena-rpg-save-v1.pre-instances';
// Per-itemId gear maps that no longer exist in SaveData; stripped from the loaded object (they'd otherwise leak in
// through `...parsed` and become a second source of truth).
const LEGACY_GEAR_KEYS = ['upgrades', 'durability', 'sockets', 'itemRarity', 'itemSubstats', 'reforgeCount'] as const;

// Returns true when a backup of the v1 save exists in storage afterwards (already there, or just written and read
// back). An EXISTING backup is never overwritten.
function ensureLegacyBackup(raw: string): boolean {
  try {
    if (localStorage.getItem(LEGACY_BACKUP_KEY) === null) localStorage.setItem(LEGACY_BACKUP_KEY, raw);
    return localStorage.getItem(LEGACY_BACKUP_KEY) !== null;
  } catch {
    return false;
  }
}

// Set when the v1 save was migrated in memory but its backup could not be written. While set, persistSave will
// NOT overwrite the stored v1 save with the migrated v2 one (it retries the backup first). The stored save stays the
// untouched original, and since the migration is deterministic the next load simply migrates it again.
let unbackedLegacyRaw: string | null = null;

// Normalizes/sanitizes an arbitrary save payload — a raw localStorage JSON string, or an already-parsed
// object such as a Supabase jsonb column — into a trusted SaveData, running every migration/clamp exactly
// once so local saves and server-loaded saves can never drift onto two different code paths (Phase 1
// backend migration: see saveRepository.ts).
// seenLooks: the stored list (known looks only) plus, for a hero whose old save carried the heroKnighted flag, every look up to the knight, plus every look up to the
// armor he wears right now (he has plainly worn those), so an old save is never spammed with celebrations for gear it already owns.
function sanitizeSeenLooks(raw: unknown, legacyKnighted: boolean, current: HeroBaseLook): HeroBaseLook[] {
  const seen = new Set<HeroBaseLook>(Array.isArray(raw) ? raw.filter((l): l is HeroBaseLook => typeof l === 'string' && (HERO_LOOKS as readonly string[]).includes(l) && l !== 'peasant') : []);
  if (legacyKnighted) for (const l of looksUpTo('knight')) seen.add(l);
  for (const l of looksUpTo(current)) seen.add(l);
  return HERO_LOOKS.filter((l) => seen.has(l));
}

// What the gear an old save owns proves about forging / uniques, so the counters of a veteran do not start from zero.
function statsBackfill(gearInstances: Record<GearInstanceId, GearInstance>, kills: number): StatsBackfill {
  const forgedByRarity: Partial<Record<Rarity, number>> = {};
  let uniquesFound = 0;
  for (const inst of Object.values(gearInstances)) {
    if (inst.origin === 'craft') forgedByRarity[inst.rarity] = (forgedByRarity[inst.rarity] ?? 0) + 1;
    if (getGear(inst.templateId)?.unique) uniquesFound++;
  }
  return { kills, forgedByRarity, uniquesFound };
}

export function normalizeSave(rawInput: unknown): SaveData {
  try {
    const raw = typeof rawInput === 'string' ? rawInput : rawInput ? JSON.stringify(rawInput) : null;
    if (raw) {
      const parsed = (typeof rawInput === 'string' ? JSON.parse(raw) : rawInput) as Partial<SaveData>;
      const base = defaultSave();
      const legacyOwned = (parsed as { owned?: string[] }).owned;
      const inventory =
        parsed.inventory ??
        (legacyOwned ? Object.fromEntries(legacyOwned.map((id) => [id, 1])) : {});
      // v2 = weapons / armors are gear instances. A save that already HAS `gearInstances` is v2 and is never
      // migrated again; only one without them is v1 (per-itemId maps) and goes through migrateGearV1toV2 (pure,
      // deterministic ids), so load -> persist -> load -> load is stable.
      const rawParsed = parsed as Record<string, unknown>;
      const isV2 = !!parsed.gearInstances && typeof parsed.gearInstances === 'object' && !Array.isArray(parsed.gearInstances);
      let gearInstances: Record<GearInstanceId, GearInstance>;
      let weaponId: GearInstanceId | null;
      let armorId: GearInstanceId | null;
      let migratedMaxRefine = 0;
      if (isV2) {
        gearInstances = sanitizeGearInstances(parsed.gearInstances);
        weaponId = sanitizeEquippedInstance(parsed.equipped?.weapon, 'weapon', gearInstances);
        armorId = sanitizeEquippedInstance(parsed.equipped?.armor, 'armor', gearInstances);
      } else {
        unbackedLegacyRaw = ensureLegacyBackup(raw) ? null : raw;
        const legacy = sanitizeLegacyInventory(inventory, parsed.equipped ?? {});
        const mig = migrateGearV1toV2({
          inventory: legacy.inventory,
          equipped: legacy.equipped,
          itemRarity: rawParsed.itemRarity,
          itemSubstats: rawParsed.itemSubstats,
          upgrades: rawParsed.upgrades,
          durability: rawParsed.durability,
          sockets: rawParsed.sockets,
          reforgeCount: rawParsed.reforgeCount,
        });
        gearInstances = mig.gearInstances;
        weaponId = mig.weaponId;
        armorId = mig.armorId;
        migratedMaxRefine = mig.maxRefineEver;
      }
      const gear = sanitizeStackableGear(inventory, parsed.equipped);
      // helmet / gloves / boots / ring / shield: an instance id that exists and belongs to that slot, else empty. A v1 save, the old stackable `helmet`
      // value (always null in practice) or a save from before shields simply yields empty slots.
      const extraSlotIds = Object.fromEntries(
        INSTANCED_SLOTS.filter((slot) => slot !== 'weapon' && slot !== 'armor').map((slot) => [slot, isV2 ? sanitizeEquippedInstance((parsed.equipped as unknown as Record<string, unknown> | undefined)?.[slot], slot, gearInstances) : null]),
      ) as Pick<EquippedGear, 'helmet' | 'gloves' | 'boots' | 'ring' | 'shield'>;
      // Bind on equip: whatever is worn when the save loads counts as bound (a save from before the rule, or any save).
      gearInstances = bindEquipped(gearInstances, [weaponId, armorId, ...Object.values(extraSlotIds)]);
      let xp = typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) && parsed.xp >= 0 ? parsed.xp : 0;
      // Past level 100 the XP keeps counting into paragon levels (paragon.ts); only an absurd value (tampered) is thrown away.
      if (xp > maxSaneXp()) xp = 0;
      // A real save from before the new curve (it has the gear schema stamp but not the curve stamp) keeps its level: its XP is mapped onto the new curve. A raw object with neither stamp
      // (a test, a hand-made import) is taken as it is: the new curve only ever makes a level cheaper, so nobody can lose one.
      if (typeof parsed.xpCurve !== 'number' && typeof (parsed as { schemaVersion?: unknown }).schemaVersion === 'number') xp = migrateLegacyXp(xp);
      else if (parsed.xpCurve === 2) xp = migrateV2Xp(xp); // the curve of Rodada 20 moved the top of band 4: same level, same share
      const highestDungeonFloor = Math.max(1, Math.min(MAX_DUNGEON_FLOOR, Math.floor(Number(parsed.highestDungeonFloor ?? 1)) || 1));
      // Counters and attribute points: only a real, finite number inside the legal range survives (strings, NaN, negatives and
      // tampered giants fall back to the default). Whole numbers: the game only ever adds whole units to these.
      const cleanInt = (raw: unknown, min: number, max: number, fallback: number): number =>
        typeof raw === 'number' && Number.isFinite(raw) && raw >= min ? Math.min(max, Math.floor(raw)) : fallback;
      const maxAttrPoints = MAX_LEVEL * 3; // 3 points per level, level cap 100
      // The old instant XP potion (Rodada 20) is paid out in Gold, bag and stash alike, and the id is dropped from both.
      const gold = Math.min(Number.MAX_SAFE_INTEGER, cleanInt(parsed.gold, 0, Number.MAX_SAFE_INTEGER, 0) + legacyXpPotionGold(legacyXpPotionCount(parsed as Parameters<typeof legacyXpPotionCount>[0])));
      const shards = cleanInt(parsed.shards, 0, Number.MAX_SAFE_INTEGER, 0);
      const victories = cleanInt(parsed.victories, 0, Number.MAX_SAFE_INTEGER, 0);
      const vit = cleanInt(parsed.vit, 0, maxAttrPoints, 0);
      const armorLevel = cleanInt(parsed.armorLevel, 1, Number.MAX_SAFE_INTEGER, 1);
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
      const gems = { ...emptyGems() };
      for (const k of Object.keys(gems) as GemId[]) {
        const n = Math.floor(Number((parsed.gems ?? {})[k]));
        gems[k] = Number.isFinite(n) && n > 0 ? n : 0;
      }
      const today = new Date().toDateString();
      const q: Partial<QuestState> = parsed.quests ?? {};
      const quests: QuestState = {
        dailyDay: typeof q.dailyDay === 'string' ? q.dailyDay : '',
        daily: { ...emptyQuestState().daily, ...(q.daily ?? {}) },
        dailyClaimed: Array.isArray(q.dailyClaimed) ? q.dailyClaimed : [],
        counters: { ...emptyQuestState().counters, ...(q.counters ?? {}) },
        claimed: Array.isArray(q.claimed) ? [...new Set((q.claimed as unknown[]).filter((id): id is string => typeof id === 'string').map(migrateAchievementId))] : [],
        weekly: emptyQuestState().weekly,
        streak: emptyQuestState().streak,
      };
      // The daily counter once called `expeditions` (the Expedition the delivery orders replaced) is `deliveries` now.
      const rawDaily = (q.daily ?? {}) as Record<string, unknown>;
      quests.daily = { kills: Number(rawDaily.kills) || 0, forge: Number(rawDaily.forge) || 0, purchases: Number(rawDaily.purchases) || 0, deliveries: Number(rawDaily.deliveries ?? rawDaily.expeditions) || 0 };
      // Highest refine ever reached survives destroying the piece (see gearInstances.questMaxRefine).
      quests.counters.maxRefineEver = Math.max(Math.floor(Number(quests.counters.maxRefineEver ?? 0)) || 0, migratedMaxRefine);
      if (quests.dailyDay !== today) {
        quests.dailyDay = today;
        quests.daily = { kills: 0, forge: 0, purchases: 0, deliveries: 0 };
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
            : skillXpToReachLevel(legacyMiningLevel, 'mining'),
        woodcutting:
          typeof rawSkillXp.woodcutting === 'number' && Number.isFinite(rawSkillXp.woodcutting)
            ? Math.max(0, rawSkillXp.woodcutting)
            : skillXpToReachLevel(legacyWoodLevel, 'woodcutting'),
        gardening:
          typeof rawSkillXp.gardening === 'number' && Number.isFinite(rawSkillXp.gardening)
            ? Math.max(0, rawSkillXp.gardening)
            : skillXpToReachLevel(legacyGardenLevel, 'gardening'),
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
      // A start in the future (clock moved back / tampered) is clamped to now: it would otherwise freeze the session.
      const loadNow = Date.now();
      const huntingOfflineStart =
        typeof parsed.huntingOfflineStart === 'number' && Number.isFinite(parsed.huntingOfflineStart) && parsed.huntingOfflineStart > 0
          ? Math.min(parsed.huntingOfflineStart, loadNow)
          : loadNow;
      // Sub-level mastery. Legacy saves stored `huntingSubLevels[key] = resume` (= last cleared ceiling + 1,
      // clamped to the max level — the next level the old climb tried for free). Converted to
      // ceiling = resume - 1 (levels really cleared are kept), floor 1, with 0 banked wins: the "free
      // attempt at resume" is intentionally not carried over. resume == max level is ambiguous (could
      // mean ceiling 9 or 10) and resolves to the max so nobody is demoted. A present `huntProgress`
      // entry always wins over the legacy one.
      const maxSubLevel = T.hunting.subLevels;
      const huntProgress: Record<string, HuntProgress> = {};
      const legacyResume = (parsed as { huntingSubLevels?: unknown }).huntingSubLevels;
      if (legacyResume && typeof legacyResume === 'object') {
        for (const [key, raw] of Object.entries(legacyResume as Record<string, unknown>)) {
          const resume = Math.min(maxSubLevel, Math.floor(Number(raw)));
          if (Number.isFinite(resume) && resume > 0) {
            huntProgress[key] = { ceiling: resume >= maxSubLevel ? maxSubLevel : Math.max(1, resume - 1), promotionWins: 0 };
          }
        }
      }
      if (parsed.huntProgress && typeof parsed.huntProgress === 'object') {
        for (const [key, raw] of Object.entries(parsed.huntProgress as Record<string, unknown>)) {
          if (!raw || typeof raw !== 'object') continue;
          const ceiling = Math.floor(Number((raw as HuntProgress).ceiling));
          const wins = Math.floor(Number((raw as HuntProgress).promotionWins));
          if (Number.isFinite(ceiling) && ceiling > 0) {
            huntProgress[key] = {
              ceiling: Math.min(maxSubLevel, ceiling),
              promotionWins: ceiling >= maxSubLevel ? 0 : Number.isFinite(wins) && wins > 0 ? Math.min(1_000_000, wins) : 0,
            };
          }
        }
      }
      // Migration (no save-key bump): the Pass used to expire 30 days after activation. Any save that EVER activated it (hasBattlePass true, expired or
      // not) is now a permanent owner; one that never had it stays without. The old battlePassExpiresAt is not read: it is gone from the data on the next save.
      const hasBattlePass = !!parsed.hasBattlePass;
      const passSeasonRaw = Math.floor(Number(parsed.passSeason));
      // A save from before seasons adopts the season it is loaded in (its level / claims carry over); a stored season is never lowered (clock set back).
      const passSeason = Number.isFinite(passSeasonRaw) && passSeasonRaw >= 1 ? passSeasonRaw : seasonNumber(Date.now());
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
      const cosmetics = Array.isArray(parsed.cosmetics) ? parsed.cosmetics.filter((c): c is string => typeof c === 'string') : [];
      const activeTitle = typeof parsed.activeTitle === 'string' && cosmetics.includes(parsed.activeTitle) ? parsed.activeTitle : null;
      const dungeonCheckpoints = Array.isArray(parsed.dungeonCheckpoints)
        ? Array.from(new Set(parsed.dungeonCheckpoints.filter((f): f is number => typeof f === 'number' && MILESTONE_FLOORS.includes(f))))
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
      // A timed buff never outlives its duration: an expiry further ahead than one full duration from now (tampered / clock moved
      // back) is clamped, so it cannot be made permanent by editing the save.
      const sanitizeBuff = (raw: unknown, type: BuffType, minutes: number): ActiveBuff | null => {
        const b = raw as Partial<ActiveBuff> | undefined;
        return b && b.type === type && typeof b.expiresAt === 'number' && Number.isFinite(b.expiresAt)
          ? { type, expiresAt: Math.min(b.expiresAt, Date.now() + minutes * 60 * 1000) }
          : null;
      };
      const activeBuff = sanitizeBuff(parsed.activeBuff, 'strength', T.battle.strengthElixirMinutes);
      const attackBuff = sanitizeBuff(parsed.attackBuff, 'attack', T.battle.attackElixirMinutes);
      const buffs = sanitizeBuffs(parsed.buffs);
      const loaded: SaveData = {
        ...base,
        ...parsed,
        xp,
        gold,
        shards,
        victories,
        vit,
        armorLevel,
        schemaVersion: GEAR_SCHEMA_VERSION,
        xpCurve: XP_CURVE_VERSION,
        gearInstances,
        inventory: gear.inventory,
        equipped: { ...gear.equipped, ...extraSlotIds, weapon: weaponId, armor: armorId },
        inventoryCapacity: normalizeInventoryCapacity(parsed.inventoryCapacity),
        inventoryBonusSlots: Math.max(0, Math.min(1000, Math.floor(Number(parsed.inventoryBonusSlots)) || 0)),
        pouchMigrated: parsed.pouchMigrated === true,
        stash: sanitizeStash(parsed.stash),
        merchant: sanitizeMerchant(parsed.merchant, Date.now()),
        wholesale: sanitizeWholesale(parsed.wholesale, Date.now()),
        pouchDay: sanitizePouchDay(parsed.pouchDay, Date.now()),
        ...(Object.keys(sanitizePouchCerts(parsed.pouchCerts)).length > 0 ? { pouchCerts: sanitizePouchCerts(parsed.pouchCerts) } : {}),
        pouchFacesV2: parsed.pouchFacesV2 === true, // (explicit: the defaults the save is merged over already carry true)
        ...(sanitizeLegacyPouchCerts(parsed.legacyPouchCerts).length > 0 ? { legacyPouchCerts: sanitizeLegacyPouchCerts(parsed.legacyPouchCerts) } : {}),
        ...(sanitizeBossClaims(parsed.pendingBossClaims).length > 0 ? { pendingBossClaims: sanitizeBossClaims(parsed.pendingBossClaims) } : {}),
        highestDungeonFloor,
        materials: { ...emptyMaterials(), ...(parsed.materials ?? {}) },
        potions: { hp: 0, stamina: 0, elixir: 0, ...(parsed.potions ?? {}) },
        consumables: { ...emptyConsumables(), ...withoutLegacyXpPotion((parsed.consumables ?? {}) as Record<string, number>) },
        expeditions,
        deliveries: sanitizeDeliveries(parsed.deliveries, Date.now()),
        gems,
        blessed: !!parsed.blessed,
        quests,
        activeOreId,
        lastMiningClaim,
        miningCapHours,
        activeWoodId,
        lastWoodcuttingClaim,
        woodcuttingCapHours,
        skillXp,
        activeHuntingZone,
        activeHuntingDepth,
        huntProgress,
        huntingOfflineStart,
        unlockedHuntingZones,
        hasBattlePass,
        miningPass: sanitizeGatherPass(parsed.miningPass, activeOreId !== null, hasBattlePass, miningCapHours),
        woodcuttingPass: sanitizeGatherPass(parsed.woodcuttingPass, activeWoodId !== null, hasBattlePass, woodcuttingCapHours),
        battlePassLevel,
        battlePassXp,
        claimedPassRewards,
        passSeason,
        pendingSeasonSummary: sanitizeSeasonSummary(parsed.pendingSeasonSummary),
        cosmetics,
        activeTitle,
        activeFrame: sanitizeActiveFrame(parsed.activeFrame, cosmetics),
        activeSkin: sanitizeActiveSkin(parsed.activeSkin, cosmetics, hasBattlePass),
        seenLooks: sanitizeSeenLooks(rawParsed.seenLooks, rawParsed.heroKnighted === true, heroBaseLook({ gearInstances, equipped: { armor: armorId } as EquippedGear })),
        stashBonusSlots: sanitizeStashBonus(parsed.stashBonusSlots),
        dungeonCheckpoints,
        skillTree: sanitizeSkillTree(parsed.skillTree, playerLevel(xp), hasBattlePass),
        gardenSlots,
        activeBuff,
        attackBuff,
        buffs,
        dungeonSessionsDay,
        dungeonSessionsUsed,
        seenTooltips,
        seenWelcome,
        league: sanitizeLeagueMark(parsed.league),
        tutorial: sanitizeTutorial(parsed.tutorial),
        autoPotionThreshold:
          typeof parsed.autoPotionThreshold === 'number' && Number.isFinite(parsed.autoPotionThreshold)
            ? Math.max(0.1, Math.min(0.7, parsed.autoPotionThreshold))
            : base.autoPotionThreshold,
        autoPotionPriority: parsed.autoPotionPriority === 'small_first' ? 'small_first' : base.autoPotionPriority,
        stats: normalizeStats(parsed.stats, statsBackfill(gearInstances, quests.counters.kills)),
        codex: emptyCodex(),
      };
      loaded.codex = normalizeCodex(parsed.codex, loaded);
      // Weekly goals and the login streak (weekly.ts): an old save has neither and starts its first week now; a new UTC week snapshots the counters again.
      loaded.quests = { ...loaded.quests, weekly: rollWeekly(sanitizeWeekly(q.weekly, loaded.stats, loadNow, playerLevel(loaded.xp)), loaded.stats, loadNow, playerLevel(loaded.xp)), streak: sanitizeStreak(q.streak) };
      // Hunting session snapshot + pending reward (both new, optional fields: an older save simply lacks them). An active
      // session without a usable snapshot (saved before snapshots existed, or corrupt) is rebuilt conservatively.
      loaded.pendingHuntReward = sanitizePendingHuntReward(parsed.pendingHuntReward);
      const hunt = activeHuntingZone ? sanitizeHuntSession(parsed.huntSession) ?? buildLegacyHuntSession(loaded, loadNow) : null;
      loaded.huntSession = hunt && hasBattlePass ? withPermanentPassWindow(hunt, loadNow) : hunt;
      for (const key of LEGACY_GEAR_KEYS) delete (loaded as unknown as Record<string, unknown>)[key];
      delete (loaded as unknown as Record<string, unknown>).battlePassExpiresAt; // the 30-day model's expiry: ownership is permanent now
      // The old Hunting Pouch: its paid tiers become permanent slots, its items move into the inventory (or stay owed in the pending reward), and the
      // fields are gone (legacyPouch.ts). A pending reward written under that rule recorded the pouch capacity.
      const rawPending = parsed.pendingHuntReward as { pouchCapacity?: unknown } | null | undefined;
      const migrated = migrateLegacyPouch(loaded, (parsed as { huntPouch?: unknown }).huntPouch, Number(rawPending?.pouchCapacity) > 0);
      delete (migrated as unknown as Record<string, unknown>).huntPouch;
      const keptKitDay = typeof parsed.passKitDay === 'string' && parsed.passKitDay.length < 40 ? parsed.passKitDay : undefined;
      return grantDailyPassKit(migratePouchFaces(keptKitDay ? { ...migrated, passKitDay: keptKitDay } : migrated), today);
    }
  } catch {
    /* ignore */
  }
  return defaultSave();
}

export function loadSave(): SaveData {
  return normalizeSave(localStorage.getItem(SAVE_KEY));
}

export function persistSave(data: SaveData): void {
  if (unbackedLegacyRaw !== null) {
    if (!ensureLegacyBackup(unbackedLegacyRaw)) return;
    unbackedLegacyRaw = null;
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
