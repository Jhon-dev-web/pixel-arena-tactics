import { DropRarity, MaterialId } from './materials';
import T from './tunables';
import type { HeroSheet } from './sprites';

export type HuntingEnemyId = 'demon' | 'blood_monster' | 'rift_fiend' | 'blood_abomination' | 'abyss_sovereign';

const HUNTING_ENEMY_SPRITES: Record<HuntingEnemyId, string> = {
  demon: '/assets/monsters/demon.png',
  blood_monster: '/assets/monsters/blood_monster.png',
  rift_fiend: '/assets/monsters/rift_fiend.png',
  blood_abomination: '/assets/monsters/blood_abomination.png',
  // Zone 5 (classes & equipment, phase 7) has no sheet of its own yet: the sovereign wears the abomination's until its art is drawn (a new PNG and a new row in HUNTING_ENEMY_ART are all it takes).
  abyss_sovereign: '/assets/monsters/blood_abomination.png',
};

export function huntingEnemySpriteUrl(id: HuntingEnemyId): string {
  return HUNTING_ENEMY_SPRITES[id];
}

// Name of each hunting monster (locale key under `enemies.`).
const HUNTING_ENEMY_NAME_KEYS: Record<HuntingEnemyId, string> = {
  demon: 'huntDemon',
  blood_monster: 'huntBloodMonster',
  rift_fiend: 'huntRiftFiend',
  blood_abomination: 'huntBloodAbomination',
  abyss_sovereign: 'huntAbyssSovereign',
};

export function huntingEnemyNameKey(id: HuntingEnemyId): string {
  return HUNTING_ENEMY_NAME_KEYS[id];
}

// Where the drawn creature sits inside the frames of a 4x4 sheet. Measured once per sheet on frame 0 of the idle row; everything the Hunt screens draw
// from a sheet (portrait, scene sprite, foot on the ground line) is derived from these numbers, so replacing a sheet with a new one of another cell
// size needs only the new PNG and a new row here.
//   cell    side of one frame in the sheet, in sheet pixels (the sheet is 4 x 4 cells)
//   box     bounding box [x0, y0, x1, y1] of the drawn creature inside frame 0 (inclusive sheet pixels); its bottom edge is where the feet are
//   lie     bottom edge (sheet pixel row inside the frame) of the creature in the LAST frame of the death row; the death pose is lowered by the difference to the
//           feet so a fallen creature lies on the ground instead of floating (omit for the hero)
//   height  how tall the creature should look in the scene, relative to the hero (1 = hero-sized)
export interface SheetArt {
  cell: number;
  box: [number, number, number, number];
  lie?: number;
}

export interface HuntingEnemyArt extends SheetArt {
  height: number;
}

const HUNTING_ENEMY_ART: Record<HuntingEnemyId, HuntingEnemyArt> = {
  demon: { cell: 176, box: [25, 30, 114, 149], lie: 152, height: 0.85 },
  blood_monster: { cell: 172, box: [57, 28, 112, 146], lie: 146, height: 0.95 },
  rift_fiend: { cell: 176, box: [57, 26, 106, 149], lie: 147, height: 1.1 },
  blood_abomination: { cell: 172, box: [58, 25, 111, 146], lie: 146, height: 1.15 },
  abyss_sovereign: { cell: 172, box: [58, 25, 111, 146], lie: 146, height: 1.25 },
};

// The hero's sheets, same measurement (frame 0 of the idle row), one entry per HeroSheet (sprites.ts). Every sheet stands on y = 251..253 (feet within 2 sheet pixels of each
// other, about 1 px on screen) and keeps its own natural proportions: the peasant is the smallest, the dragon family (dragon, voidsteel, abyssal) the widest and tallest.
// The recolors share their source sheet's box: golden knight and gilded = knight (the dark knight has its own box); voidsteel and abyssal = dragon.
const KNIGHT_ART: SheetArt = { cell: 256, box: [71, 12, 204, 251] };
export const HERO_ART: Record<HeroSheet, SheetArt> = {
  hero_peasant_v2: { cell: 256, box: [69, 43, 207, 251] },
  hero_bronze_v2: { cell: 256, box: [44, 45, 248, 251] },
  hero_iron_v2: { cell: 256, box: [51, 43, 212, 251] },
  hero_steel_v2: { cell: 256, box: [47, 47, 211, 251] },
  hero_dark_knight: { cell: 256, box: [50, 41, 216, 251] },
  hero_dragon_v2: { cell: 256, box: [14, 45, 228, 251] },
  hero_voidsteel_v2: { cell: 256, box: [16, 45, 248, 251] },
  hero_abyssal_v2: { cell: 256, box: [34, 45, 224, 251] },
  knight_golden: KNIGHT_ART,
};

export function huntingEnemyArt(id: HuntingEnemyId): HuntingEnemyArt {
  return HUNTING_ENEMY_ART[id];
}

// The art box as fractions of one frame: centre, size and the foot line. `size` is the larger side (portraits), `h` the height (scene scale).
export function artGeometry(art: SheetArt): { cx: number; cy: number; size: number; h: number; foot: number } {
  const [x0, y0, x1, y1] = art.box;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  return { cx: (x0 + x1 + 1) / 2 / art.cell, cy: (y0 + y1 + 1) / 2 / art.cell, size: Math.max(w, h) / art.cell, h: h / art.cell, foot: (y1 + 1) / art.cell };
}

// Map background of a zone's hunt scene (assets.json `background.hunt_<zone id>`, 400x144; the walkable ground is its dark bottom band).
// A zone without a map of its own borrows another zone's strip: put `<zone id>: '<other zone id>'` here, and delete the entry once its own PNG exists.
// Empty today — zone 5 (abyss_throne) borrowed the abyss strip until hunt_abyss_throne.png was drawn (classes reform, phase 7).
const ZONE_BACKGROUND_SOURCE: Record<string, string> = {};
export function huntingZoneBackgroundUrl(zoneId: string): string {
  return `/assets/backgrounds/hunt_${ZONE_BACKGROUND_SOURCE[zoneId] ?? zoneId}.png`;
}

export interface HuntingDrop {
  material: MaterialId;
  rarity: DropRarity;
  chance: number; // probability per encounter (0..1)
  qty: number; // amount granted per successful proc
  // Rolled on its own seeded stream (huntCombat.ts), so adding an entry to a zone moves no fight, crit or older drop of its session.
  ownStream?: boolean;
}

export interface HuntingZoneDef {
  id: string;
  nameKey: string;
  enemyId: HuntingEnemyId;
  cp: number;
  goldPerHour: number;
  // Rodada 31: the hero XP of ONE kill of this zone's monster at sub-level 1, Raso depth, before the depth (xpMultiplier), the size of the monster at its sub-level (the HP growth), the zone's own
  // sub-level bonus (xpPerSubLevel), the Relic and the Knowledge Elixir. The XP of a Hunting session is the sum of the XP of its kills (huntCombat.ts creditFight), so a hero that kills faster earns more
  // (until the pace fraction of huntEconomy.ts trims it). zoneReferenceXpPerHour() is what an hour at the reference pace pays.
  xpPerKill: number;
  // Kills an hour of the zone's reference monster (sub-level 1) by a hero exactly at the zone's recommended CP, as measured on the ladder builds of scripts/sim (npm run sim:xpbuilds prints it): the pace at which
  // a hero earns exactly the zone's reference rate (xpPerKill x xpRefKph). A slower hero earns in proportion, a faster one more, with diminishing returns (huntEconomy.ts xpPaceFractionForFight).
  xpRefKph: number;
  drops: HuntingDrop[];
  offlineCapHours: number;
  unlockFloor: number;
  // Rodada 22: the hero level that also opens the zone (in addition to the Dungeon floor). Absent = the floor alone opens it. Zone 3 asks level 40 and zone 4 level 60, so a hero
  // that bought gear cannot walk into the last zones on day 3: the XP of the League is paced by levels, not by the Dungeon floor alone.
  unlockLevel?: number;
  // Rodada 22: a zone whose sub-levels pay more XP the deeper they go (+xpPerSubLevel per sub-level above 1, so +18% at sub-level 10 with 0.02) and that asks CP for each of them: the hero
  // is PROMOTED to sub-level N only while his CP is at least recommendedCpForDepth x subLevelCpGrowth^(N - 1) (subLevelCpRequired), so the later sub-levels need the CP of tier 5 and 6 gear.
  // The fights themselves keep the global sub-level growth (they are easy for a hero over the CP): the gate is the CP, not a lucky win that would trap the hero on a level he cannot farm.
  // Absent = the usual flat XP and no CP gate.
  xpPerSubLevel?: number;
  subLevelCpGrowth?: number;
  // Sub-level-1, Raso-depth enemy stats — real combat stats (see huntCombat.ts), not decorative.
  // Used as-is for Denso/Profundo (scaled by the depth's cpMultiplier) and for Raso too, UNLESS the
  // zone defines its own shallow* override below.
  baseEnemyHp: number;
  baseEnemyDmg: number;
  // Raso-only override, for a zone whose Denso/Profundo difficulty must stay pinned to baseEnemyHp/Dmg
  // (already calibrated, shouldn't shift) while Raso itself needs its own, independently-calibrated
  // floor — currently only demon_glade, since it's the sole zone reachable before ANY other progression
  // (Andar 0, no Dungeon/Forge attempted yet): a "reasonable equipped" reference build is the wrong
  // calibration target there, it has to be winnable by a literal brand-new character (tier0 gear, 0
  // stat points). Absent for every other zone, which fall back to baseEnemyHp/Dmg/cp like before.
  shallowCp?: number;
  shallowEnemyHp?: number;
  shallowEnemyDmg?: number;
  // Unique (drop-only) pieces this zone can drop. `chance` is the base chance per victory BEFORE the economic roll fraction f (huntEconomy.ts), the same
  // f the materials use, so a faster build cannot multiply them; it is independent of depth, sub-level and the Battle Pass (a unique is never boosted by
  // the pass). See uniques.ts.
  uniques?: HuntingUnique[];
}

export interface HuntingUnique {
  itemId: string;
  chance: number;
}

export const DEFAULT_HUNTING_ZONE = 'demon_glade';

// Depth is a per-session choice layered on top of a zone, not a separate zone: same enemy, same
// art, same materials — only pace and drop mix change. Raso is exactly today's numbers (1x
// everywhere) so existing saves/behavior are unaffected by default. Denso/Profundo keep Common flat
// (Profundo slightly lower) and pay off in Uncommon/Rare quality, gated behind a higher recommended CP
// so the payoff scales with how strong the hero already is — not just AFK time.
//
// dropMultiplier is the single central depth x rarity table: it multiplies each drop's base chance
// (the zone's own number, unchanged). Raso is the easy starter place (little Uncommon/Rare), Profundo
// is clearly the best place for Rare. A sub-level bonus stacks on top (see subLevelDropMultiplier).
export type HuntingDepth = 'shallow' | 'dense' | 'deep';

export interface HuntingDepthDef {
  id: HuntingDepth;
  nameKey: string;
  cpMultiplier: number;
  xpMultiplier: number;
  dropMultiplier: Record<DropRarity, number>;
}

export const HUNTING_DEPTHS: HuntingDepthDef[] = [
  {
    id: 'shallow',
    nameKey: 'depth_shallow',
    cpMultiplier: 1,
    xpMultiplier: 1,
    dropMultiplier: { common: 1, uncommon: 0.7, rare: 0.4 },
  },
  {
    id: 'dense',
    nameKey: 'depth_dense',
    cpMultiplier: 1.15,
    xpMultiplier: 1.15,
    dropMultiplier: { common: 1, uncommon: 1.15, rare: 0.9 },
  },
  {
    id: 'deep',
    nameKey: 'depth_deep',
    cpMultiplier: 1.3,
    xpMultiplier: 1.3,
    dropMultiplier: { common: 0.9, uncommon: 1.65, rare: 1.8 },
  },
];

export const DEFAULT_HUNTING_DEPTH: HuntingDepth = 'shallow';

export function getHuntingDepthDef(depth: HuntingDepth): HuntingDepthDef {
  return HUNTING_DEPTHS.find((d) => d.id === depth) ?? HUNTING_DEPTHS[0];
}

export function recommendedCpForDepth(zone: HuntingZoneDef, depth: HuntingDepth): number {
  if (depth === 'shallow' && zone.shallowCp !== undefined) return zone.shallowCp;
  return Math.round(zone.cp * getHuntingDepthDef(depth).cpMultiplier);
}

export function isDepthUnlocked(zone: HuntingZoneDef, depth: HuntingDepth, playerCp: number): boolean {
  return playerCp >= recommendedCpForDepth(zone, depth);
}

// The CP a hero needs to be promoted to `subLevel` of this zone at this depth: 0 for a zone without a gate and for sub-level 1.
export function subLevelCpRequired(zone: HuntingZoneDef, depth: HuntingDepth, subLevel: number): number {
  if (!zone.subLevelCpGrowth || !(subLevel > 1)) return 0;
  return Math.round(recommendedCpForDepth(zone, depth) * Math.pow(zone.subLevelCpGrowth, Math.floor(subLevel) - 1));
}

// Shared sub-level sanitizer: non-finite -> 1, otherwise floored and clamped to 1..T.hunting.subLevels.
export function sanitizeSubLevel(subLevel: number): number {
  return Number.isFinite(subLevel) ? Math.min(T.hunting.subLevels, Math.max(1, Math.floor(subLevel))) : 1;
}

// Sub-level drop bonus: Common never changes; Uncommon and Rare grow linearly with the sub-level being
// fought (1 at sub-level 1). Sub-level is sanitized to 1..T.hunting.subLevels.
export function subLevelDropMultiplier(rarity: DropRarity, subLevel: number): number {
  const level = sanitizeSubLevel(subLevel);
  const bonus: Record<DropRarity, number> = {
    common: T.hunting.subLevelDropBonusCommon,
    uncommon: T.hunting.subLevelDropBonusUncommon,
    rare: T.hunting.subLevelDropBonusRare,
  };
  return 1 + bonus[rarity] * (level - 1);
}

// Effective per-encounter chance for one of the zone's drop entries: base chance x the depth's
// multiplier for that rarity x the sub-level multiplier for that rarity. The Battle Pass multiplier is
// applied by the caller on top (huntCombat.rollDropsForOneClear), not here.
export function effectiveDropChance(entry: HuntingDrop, depth: HuntingDepth, subLevel = 1): number {
  return entry.chance * getHuntingDepthDef(depth).dropMultiplier[entry.rarity] * subLevelDropMultiplier(entry.rarity, subLevel);
}

// Economy design (faucet/sink discipline — see Sunflower Land, Big Time, Pixels): Open Hunting is
// an unattended, bot-friendly loop, so it must NEVER be a meaningful liquid-currency source — that
// job belongs entirely to time-capped Expeditions. Hunting stays a pure crafting-input + character
// XP faucet: gold here is symbolic pocket change (a few coins/hour), never worth farming for wealth.
// Materials only ever drop here — never in the Dungeon — and accrue slowly by design:
// the XP of an hour of kills at the reference pace (xpPerKill x xpRefKph, 1.75k-8.8k since Rodada 31; it was the xpPerHour field) is still large relative to goldPerHour. Balance pass 2026-10-10 (docs/BALANCE_CHANGES.md): it was 17.5k-69.5k, which
// put a fresh hero at level 39 after ONE 4 h hunt and made the recipe level gates (10/20/25) meaningless; all four zones were scaled by the
// same 0.1 so their ratios are unchanged. Reaching character level 90 needs ~168M XP; at these rates Hunting is a minor share of it and the
// delivery orders (deliveries.xpPerHour*, untouched) carry most of the idle XP. Dungeon farming stays pointless as an XP source — Dungeon still grants no material/XP idle
// equivalent, and later zones here stay floor-gated, so a player still has to climb to unlock them.
// Common (25-35%): base Forge input. Uncommon (8-12%): mid-tier refine bottleneck.
// Rare (1-3%): high-value trade good, scarce even with the Battle Pass's 24h cap.
//
// Materials now drop per kill (rollDropsForOneClear in huntCombat.ts), not per elapsed time, so a
// stronger build farms visibly faster by winning more fights in the same idle window — but that only
// shows up if a fight actually takes enough hits for "faster" to be perceptible. baseEnemyHp/Dmg here
// are deliberately NOT a 1:1 read of "how dangerous this enemy is": HP was scaled up ~3x and Dmg scaled
// down by the same ~3x from what a naive calibration would give, which leaves total damage received
// over a fight — and therefore the win rate at the zone's recommended CP — unchanged (fight length and
// per-hit danger are inverses of each other for a fixed total-damage budget), while tripling the hit
// count so a build well above the recommended CP visibly kills in a fraction of the time. Drop `qty`
// was tripled to compensate at that time, and is now back to 1 per proc (a proc grants a single unit;
// chances are unchanged, so material/hour is exactly 1/3 of the tripled value). demon_glade's shallowEnemyHp/Dmg
// override follows the same rule (HP x3, damage /3 from the original 60/12 -> 180/4, same total damage
// budget, so it stays winnable by a literal fresh character — see shallowCp — while a build at the
// recommended CP kills in ~17 s like every other zone instead of ~6 s).
export const HUNTING_ZONES: HuntingZoneDef[] = [
  {
    id: 'demon_glade',
    nameKey: 'hunt1',
    enemyId: 'demon',
    cp: 144,
    shallowCp: 50,
    shallowEnemyHp: 180,
    shallowEnemyDmg: 4,
    goldPerHour: 3,
    xpPerKill: 7.1,
    xpRefKph: 210,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.25, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.08, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.007, qty: 1 },
      // Classes & equipment, phase 1 (docs/CLASSES_E_EQUIPAMENTOS.md): the new accessory drops (beast_sinew here, feather and arcane_dust in the marsh) are ownStream, so no existing session's roll order moves.
      // WARNING: every ownStream drop of a zone shares ONE generator in huntCombat.ts (ownRng) and is rolled in ARRAY ORDER on every kill, so inserting an ownStream drop into a zone that already has others (demon_rift, blood_abyss)
      // shifts the numbers of the older ones (rift_shard, fiend_horn, abyssal_marrow, blood_heart): same statistics, but a session replayed from the same seed gives other results. That is why the glade and the marsh (no earlier ownStream drop) are
      // the only zones that got the phase 1 drops. Whoever adds them to zones 3 and 4 in phase 3 needs a stream key of their own in huntCombat.ts (e.g. seedKey + ':class') instead of ownStream.
      { material: 'beast_sinew', rarity: 'common', chance: 0.03, qty: 1, ownStream: true },
    ],
    // Rodada 22: the chances below are the Rodada 9 ones cut again (zones 1 and 2 x0.4, zone 3 and 4 to 0.000008): in the 60-day sim the owner of the Pass (20 h of Hunting a day) found 5 to 7 uniques
    // of any kind, a plain player (6 h a day) 2 to 3; now 1 to 2 for the plain player and 3 to 4 for the owner who hunts all day (docs/BALANCE_CHANGES.md Rodada 22).
    // Unique drops (chance per victory before the economic fraction f). Rodada 9 (docs/BALANCE_CHANGES.md): uniques are tradeable goods, so they are rare PER PLAYER - a
    // normal player (2 check-ins a day, ~6 h of hunting a day) finds ONE unique of any kind per ~20-30 days in the zone that fits his stage (it was ~4). The zone's
    // economic rolls/h are ~224 / 165 / 140 / 140 (glade / marsh / rift / abyss) for a hero past the zone's recommended CP, which is what the chances below are sized for.
    uniques: [
      { itemId: 'demon_fang_dagger', chance: 0.000006 },
      { itemId: 'demonhide_vest', chance: 0.000006 },
    ],
    offlineCapHours: 6,
    unlockFloor: 0,
    baseEnemyHp: 450,
    baseEnemyDmg: 3,
  },
  {
    id: 'blood_marsh',
    nameKey: 'hunt2',
    enemyId: 'blood_monster',
    cp: 492,
    goldPerHour: 5,
    xpPerKill: 16.4,
    xpRefKph: 150,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.28, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.09, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.0105, qty: 1 },
      { material: 'feather', rarity: 'common', chance: 0.02, qty: 1, ownStream: true },
      { material: 'arcane_dust', rarity: 'uncommon', chance: 0.004, qty: 1, ownStream: true },
    ],
    uniques: [
      { itemId: 'bloodbound_cleaver', chance: 0.000006 },
      { itemId: 'bloodvein_plate', chance: 0.000006 },
      { itemId: 'bone_ward', chance: 0.000006 },
    ],
    offlineCapHours: 6,
    unlockFloor: 26,
    baseEnemyHp: 1800,
    baseEnemyDmg: 9,
  },
  {
    id: 'demon_rift',
    nameKey: 'hunt3',
    enemyId: 'rift_fiend',
    cp: 1068,
    goldPerHour: 8,
    xpPerKill: 40.8,
    xpRefKph: 125,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.32, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.105, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.0175, qty: 1 },
      { material: 'rift_shard', rarity: 'uncommon', chance: 0.025, qty: 1, ownStream: true },
      { material: 'fiend_horn', rarity: 'rare', chance: 0.0017, qty: 1, ownStream: true },
    ],
    uniques: [
      { itemId: 'riftwalker_boots', chance: 0.000008 },
      { itemId: 'shadow_hood', chance: 0.000008 },
    ],
    offlineCapHours: 6,
    unlockFloor: 51,
    unlockLevel: 40,
    baseEnemyHp: 4800,
    baseEnemyDmg: 19,
  },
  {
    id: 'blood_abyss',
    nameKey: 'hunt4',
    enemyId: 'blood_abomination',
    cp: 1607,
    goldPerHour: 12,
    xpPerKill: 51.6,
    xpRefKph: 145,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.12, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.036, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.0053, qty: 1 },
      { material: 'abyssal_marrow', rarity: 'uncommon', chance: 0.0132, qty: 1, ownStream: true },
      { material: 'blood_heart', rarity: 'rare', chance: 0.0021, qty: 1, ownStream: true },
    ],
    uniques: [
      { itemId: 'abyss_heart_ring', chance: 0.000008 },
      { itemId: 'bonecrusher_maul', chance: 0.000008 },
    ],
    offlineCapHours: 6,
    unlockFloor: 76,
    unlockLevel: 60,
    // Rodada 24: +4.5 % XP a sub-level (it was 2 %) and a CP gate that grows 25 % a sub-level (it was 18 %), with the base XP lowered from 10,000 to 8,750 so that a hero at sub-level 8 earns what he earned (11.5k an hour; sub-level 10 pays 12.3k, sub-level 5 10.3k);
    // Rodada 26 (the Epic is x1.15, the Legendary x1.50): +5 % XP a sub-level (+45 % at 10) and a CP gate that grows 23 % a sub-level (it was 4.5 % and 25 %), with the base XP 8,750 -> 8,800: an Epic set now opens two sub-levels more than a Common one
    // and a Legendary one two more than that (npm run sim:rarity), the fastest free set (Legendary +8) ends day 60 on 97.9 and a non-buyer Pass owner who plays smart on 82-84 (docs/BALANCE_CHANGES.md Rodada 26).
    // The sub-levels are where the power of the set becomes levels: (Rodada 24: sub-level 10 asked 15.6k CP in the deep depth; Rodada 26: 13.5k, which a Legendary set of tier 6 reaches, an Epic one of tier 6 +8 stops at 9 and a Common one at 7).
    xpPerSubLevel: 0.05,
    subLevelCpGrowth: 1.23,
    baseEnemyHp: 7200,
    baseEnemyDmg: 28,
  },
  // Classes & equipment, phase 7: the fifth zone, for the second half of the season (day ~30 to 60), when the hero sits in the abyss. Every number extends the curve of the four before it, none is a new rule:
  //  - cp 3,600: the CP of a zone grows 3.4x, 2.2x, 1.5x; this one is 2.2x the abyss (3,600 is a T5+0 Common set at level 75, 3,126 in `npm run sim:sublevels`, plus a little), so the deep depth (x1.3 = 4,680)
  //    opens where abyss sub-level 5 does, and its own sub-level gate (x1.23 as in the abyss) reaches sub-level 7 with a Legendary T6+8 set (17,974) and stops short of 10.
  //  - baseEnemyHp x baseEnemyDmg grows with the CP squared (abyss 201.6k at 1,607, rift 91.2k at 1,068): 16,000 x 63 = 1.008M at 3,600, and the HP/damage ratio (254) is the abyss's (257).
  //  - xpPerKill 70 x xpRefKph 140 = 9,800 an hour at the reference pace, +31% over the abyss (7,482), after +47% and +65% of the two before; the abyss at sub-level 7 pays 67 a kill, so a hero who moves up
  //    earns more from the first sub-level on (+5% a sub-level, as the abyss).
  //  - unlockFloor 90 and unlockLevel 75: the level is the real gate (a hero reaches 75 around day 40; the buyer of the Pass around day 33); the floor only keeps it behind the Dungeon like every other zone.
  //  - Drops: the abyss's own materials at the abyss's chances, so a hero who moves up keeps the same material an hour, plus the three class materials (sinew, feather, dust) at the glade's and the marsh's chances.
  //    The zone is new, so every drop that can be ownStream is (nothing older to preserve).
  //  - No uniques: the nine unique pieces are tied to zones 1-4 and a unique is a tradeable good whose rarity is the owner's call; a new one needs a new piece (and art), not a number.
  {
    id: 'abyss_throne',
    nameKey: 'hunt5',
    enemyId: 'abyss_sovereign',
    cp: 3600,
    goldPerHour: 16,
    xpPerKill: 70,
    xpRefKph: 140,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.12, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.036, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.0053, qty: 1 },
      { material: 'abyssal_marrow', rarity: 'uncommon', chance: 0.0132, qty: 1, ownStream: true },
      { material: 'blood_heart', rarity: 'rare', chance: 0.0021, qty: 1, ownStream: true },
      { material: 'beast_sinew', rarity: 'common', chance: 0.03, qty: 1, ownStream: true },
      { material: 'feather', rarity: 'common', chance: 0.02, qty: 1, ownStream: true },
      { material: 'arcane_dust', rarity: 'uncommon', chance: 0.004, qty: 1, ownStream: true },
    ],
    offlineCapHours: 6,
    unlockFloor: 90,
    unlockLevel: 75,
    xpPerSubLevel: 0.05,
    subLevelCpGrowth: 1.23,
    baseEnemyHp: 16000,
    baseEnemyDmg: 63,
  },
];

// The XP an hour of Hunting pays a hero that kills exactly at the reference pace (xpRefKph kills an hour of the reference monster, no bonus): the yardstick the zone
// numbers were set by (it was the zone's xpPerHour before Rodada 31, when XP was paid by fight time) and the base the server bounds use.
export function zoneReferenceXpPerHour(zone: HuntingZoneDef): number {
  return zone.xpPerKill * zone.xpRefKph;
}

export function getHuntingZone(id: string): HuntingZoneDef | undefined {
  return HUNTING_ZONES.find((z) => z.id === id);
}

// The Dungeon floor alone: the zone is DISCOVERED (it shows in save.unlockedHuntingZones, which only the floor feeds). Starting a hunt there also asks the hero level (isZoneOpen).
export function isZoneUnlocked(zone: HuntingZoneDef, highestDungeonFloor: number): boolean {
  return highestDungeonFloor >= zone.unlockFloor;
}

// Can a hero of this Dungeon floor AND level start a hunt in the zone? (Rodada 22: zone 3 asks level 40, zone 4 level 60, besides the floor.) Every place that starts a hunt, lists what
// a hero can hunt or counts what the zones drop for him asks this, never isZoneUnlocked.
export function isZoneOpen(zone: HuntingZoneDef, highestDungeonFloor: number, heroLevel: number): boolean {
  return highestDungeonFloor >= zone.unlockFloor && heroLevel >= (zone.unlockLevel ?? 0);
}

export function unlockedZoneIds(highestDungeonFloor: number): string[] {
  return HUNTING_ZONES.filter((z) => isZoneUnlocked(z, highestDungeonFloor)).map((z) => z.id);
}

export function openZoneIds(highestDungeonFloor: number, heroLevel: number): string[] {
  return HUNTING_ZONES.filter((z) => isZoneOpen(z, highestDungeonFloor, heroLevel)).map((z) => z.id);
}
