import { DropRarity, MaterialId } from './materials';

export type HuntingEnemyId = 'demon' | 'blood_monster';

const HUNTING_ENEMY_SPRITES: Record<HuntingEnemyId, string> = {
  demon: '/assets/monsters/demon.png',
  blood_monster: '/assets/monsters/blood_monster.png',
};

export function huntingEnemySpriteUrl(id: HuntingEnemyId): string {
  return HUNTING_ENEMY_SPRITES[id];
}

export interface HuntingDrop {
  material: MaterialId;
  rarity: DropRarity;
  chance: number; // probability per encounter (0..1)
  qty: number; // amount granted per successful proc
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
}

export const DEFAULT_HUNTING_ZONE = 'demon_glade';

// Depth is a per-session choice layered on top of a zone, not a separate zone: same enemy, same
// art, same materials — only pace and drop mix change. Raso is exactly today's numbers (1x
// everywhere) so existing saves/behavior are unaffected by default. Denso/Profundo trade a lower
// share of Common for a much richer Uncommon/Rare mix, gated behind a higher recommended CP so the
// payoff scales with how strong the hero already is — not just AFK time.
export type HuntingDepth = 'shallow' | 'dense' | 'deep';

export interface HuntingDepthDef {
  id: HuntingDepth;
  nameKey: string;
  cpMultiplier: number;
  itemsPerHourMultiplier: number;
  xpMultiplier: number;
  rarityWeight: Record<DropRarity, number>;
}

export const HUNTING_DEPTHS: HuntingDepthDef[] = [
  {
    id: 'shallow',
    nameKey: 'depth_shallow',
    cpMultiplier: 1,
    itemsPerHourMultiplier: 1,
    xpMultiplier: 1,
    rarityWeight: { common: 1, uncommon: 1, rare: 1 },
  },
  {
    id: 'dense',
    nameKey: 'depth_dense',
    cpMultiplier: 1.15,
    itemsPerHourMultiplier: 1.3,
    xpMultiplier: 1.15,
    rarityWeight: { common: 0.85, uncommon: 1.3, rare: 1.6 },
  },
  {
    id: 'deep',
    nameKey: 'depth_deep',
    cpMultiplier: 1.3,
    itemsPerHourMultiplier: 1.6,
    xpMultiplier: 1.3,
    rarityWeight: { common: 0.65, uncommon: 1.6, rare: 2.2 },
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

// Effective per-encounter chance for one of the zone's drop entries at a given depth: the overall
// pace multiplier and the rarity-tier weight both apply, so a deeper run drops noticeably more
// Uncommon/Rare per hour while Common stays close to its Raso rate instead of flooding the bag.
export function effectiveDropChance(entry: HuntingDrop, depth: HuntingDepth): number {
  const def = getHuntingDepthDef(depth);
  return entry.chance * def.itemsPerHourMultiplier * def.rarityWeight[entry.rarity];
}

// Economy design (faucet/sink discipline — see Sunflower Land, Big Time, Pixels): Open Hunting is
// an unattended, bot-friendly loop, so it must NEVER be a meaningful liquid-currency source — that
// job belongs entirely to time-capped Expeditions. Hunting stays a pure crafting-input + character
// XP faucet: gold here is symbolic pocket change (a few coins/hour), never worth farming for wealth.
// Materials only ever drop here — never in the Dungeon — and accrue slowly by design:
// xpPerHour is deliberately huge (17.5k-69.5k) relative to goldPerHour: reaching character level
// 90 (the real gate for surviving the Floor 100 boss) needs ~168M XP, and pre-rebalance Dungeon
// combat was the only viable source of that at years-long timescales. These rates, combined with
// Expedition's, close that idle-only to ~5-7.5 weeks (calibrated against xpToReachLevel(90) in
// engine.ts) without making Dungeon farming pointless — Dungeon still grants no material/XP idle
// equivalent, and later zones here stay floor-gated, so a player still has to climb to unlock them.
// Common (25-35%): base Forge input. Uncommon (8-12%): mid-tier refine bottleneck.
// Rare (1-3%): high-value trade good, scarce even with the Battle Pass's 24h cap.
export const HUNTING_ZONES: HuntingZoneDef[] = [
  {
    id: 'demon_glade',
    nameKey: 'hunt1',
    enemyId: 'demon',
    cp: 144,
    shallowCp: 50,
    shallowEnemyHp: 60,
    shallowEnemyDmg: 12,
    goldPerHour: 3,
    xpPerHour: 17500,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.25, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.08, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.01, qty: 1 },
    ],
    offlineCapHours: 4,
    unlockFloor: 0,
    baseEnemyHp: 150,
    baseEnemyDmg: 9,
  },
  {
    id: 'blood_marsh',
    nameKey: 'hunt2',
    enemyId: 'blood_monster',
    cp: 492,
    goldPerHour: 5,
    xpPerHour: 29000,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.28, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.09, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.015, qty: 1 },
    ],
    offlineCapHours: 5,
    unlockFloor: 26,
    baseEnemyHp: 600,
    baseEnemyDmg: 26,
  },
  {
    id: 'demon_rift',
    nameKey: 'hunt3',
    enemyId: 'demon',
    cp: 1068,
    goldPerHour: 8,
    xpPerHour: 46500,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.32, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.105, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.025, qty: 1 },
    ],
    offlineCapHours: 6,
    unlockFloor: 51,
    baseEnemyHp: 1600,
    baseEnemyDmg: 58,
  },
  {
    id: 'blood_abyss',
    nameKey: 'hunt4',
    enemyId: 'blood_monster',
    cp: 1607,
    goldPerHour: 12,
    xpPerHour: 69500,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.35, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.12, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.03, qty: 1 },
    ],
    offlineCapHours: 8,
    unlockFloor: 76,
    baseEnemyHp: 2400,
    baseEnemyDmg: 84,
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
