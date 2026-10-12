import { DropRarity, MaterialId } from './materials';
import T from './tunables';
import type { HeroSheet } from './sprites';

export type HuntingEnemyId = 'demon' | 'blood_monster' | 'rift_fiend' | 'blood_abomination';

const HUNTING_ENEMY_SPRITES: Record<HuntingEnemyId, string> = {
  demon: '/assets/monsters/demon.png',
  blood_monster: '/assets/monsters/blood_monster.png',
  rift_fiend: '/assets/monsters/rift_fiend.png',
  blood_abomination: '/assets/monsters/blood_abomination.png',
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
};

// The hero's sheets, same measurement (frame 0 of the idle row), one entry per HeroSheet (sprites.ts). Every sheet stands on y = 251..253 (feet within 2 sheet pixels of each
// other, about 1 px on screen) and keeps its own natural proportions: the peasant is the smallest, the dragon family (dragon, voidsteel, abyssal) the widest and tallest.
// The recolors share their source sheet's box: golden knight and gilded = knight; voidsteel and abyssal = dragon.
const KNIGHT_ART: SheetArt = { cell: 256, box: [71, 12, 204, 251] };
const DRAGON_ART: SheetArt = { cell: 256, box: [49, 6, 217, 253] };
export const HERO_ART: Record<HeroSheet, SheetArt> = {
  peasant: { cell: 256, box: [66, 20, 189, 253] },
  bronze: { cell: 256, box: [65, 25, 216, 253] },
  iron: { cell: 256, box: [56, 25, 203, 253] },
  knight: KNIGHT_ART,
  hero_gilded: KNIGHT_ART,
  dragon: DRAGON_ART,
  hero_voidsteel: DRAGON_ART,
  hero_abyssal: DRAGON_ART,
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
export function huntingZoneBackgroundUrl(zoneId: string): string {
  return `/assets/backgrounds/hunt_${zoneId}.png`;
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
  xpPerHour: number;
  drops: HuntingDrop[];
  offlineCapHours: number;
  unlockFloor: number;
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
// xpPerHour (1.75k-6.95k) is still large relative to goldPerHour. Balance pass 2026-10-10 (docs/BALANCE_CHANGES.md): it was 17.5k-69.5k, which
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
    xpPerHour: 1750,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.25, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.08, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.007, qty: 1 },
    ],
    // Unique drops (chance per victory before the economic fraction f). Rodada 9 (docs/BALANCE_CHANGES.md): uniques are tradeable goods, so they are rare PER PLAYER - a
    // normal player (2 check-ins a day, ~6 h of hunting a day) finds ONE unique of any kind per ~20-30 days in the zone that fits his stage (it was ~4). The zone's
    // economic rolls/h are ~224 / 165 / 140 / 140 (glade / marsh / rift / abyss) for a hero past the zone's recommended CP, which is what the chances below are sized for.
    uniques: [
      { itemId: 'demon_fang_dagger', chance: 0.000015 },
      { itemId: 'demonhide_vest', chance: 0.000015 },
    ],
    offlineCapHours: 4,
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
    xpPerHour: 2900,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.28, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.09, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.0105, qty: 1 },
    ],
    uniques: [
      { itemId: 'bloodbound_cleaver', chance: 0.000014 },
      { itemId: 'bloodvein_plate', chance: 0.000014 },
      { itemId: 'bone_ward', chance: 0.000014 },
    ],
    offlineCapHours: 5,
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
    xpPerHour: 4650,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.32, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.105, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.0175, qty: 1 },
      { material: 'rift_shard', rarity: 'uncommon', chance: 0.1, qty: 1, ownStream: true },
      { material: 'fiend_horn', rarity: 'rare', chance: 0.014, qty: 1, ownStream: true },
    ],
    uniques: [
      { itemId: 'riftwalker_boots', chance: 0.000024 },
      { itemId: 'shadow_hood', chance: 0.000024 },
    ],
    offlineCapHours: 6,
    unlockFloor: 51,
    baseEnemyHp: 4800,
    baseEnemyDmg: 19,
  },
  {
    id: 'blood_abyss',
    nameKey: 'hunt4',
    enemyId: 'blood_abomination',
    cp: 1607,
    goldPerHour: 12,
    xpPerHour: 6950,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.35, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.12, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.021, qty: 1 },
      { material: 'abyssal_marrow', rarity: 'uncommon', chance: 0.11, qty: 1, ownStream: true },
      { material: 'blood_heart', rarity: 'rare', chance: 0.0175, qty: 1, ownStream: true },
    ],
    uniques: [
      { itemId: 'abyss_heart_ring', chance: 0.000024 },
      { itemId: 'bonecrusher_maul', chance: 0.000024 },
    ],
    offlineCapHours: 8,
    unlockFloor: 76,
    baseEnemyHp: 7200,
    baseEnemyDmg: 28,
  },
];

export function getHuntingZone(id: string): HuntingZoneDef | undefined {
  return HUNTING_ZONES.find((z) => z.id === id);
}

export function isZoneUnlocked(zone: HuntingZoneDef, highestDungeonFloor: number): boolean {
  return highestDungeonFloor >= zone.unlockFloor;
}

export function unlockedZoneIds(highestDungeonFloor: number): string[] {
  return HUNTING_ZONES.filter((z) => isZoneUnlocked(z, highestDungeonFloor)).map((z) => z.id);
}
