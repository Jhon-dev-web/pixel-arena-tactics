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
}

export const DEFAULT_HUNTING_ZONE = 'demon_glade';

// Economy design (faucet/sink discipline — see Sunflower Land, Big Time, Pixels): Open Hunting is
// an unattended, bot-friendly loop, so it must NEVER be a meaningful liquid-currency source — that
// job belongs entirely to time-capped Expeditions. Hunting stays a pure crafting-input + character
// XP faucet: gold here is symbolic pocket change (a few coins/hour), never worth farming for wealth.
// Materials only ever drop here — never in the Dungeon — and accrue slowly by design:
// Common (25-35%): base Forge input. Uncommon (8-12%): mid-tier refine bottleneck.
// Rare (1-3%): high-value trade good, scarce even with the Battle Pass's 24h cap.
export const HUNTING_ZONES: HuntingZoneDef[] = [
  {
    id: 'demon_glade',
    nameKey: 'hunt1',
    enemyId: 'demon',
    cp: 20,
    goldPerHour: 3,
    xpPerHour: 15,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.25, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.08, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.01, qty: 1 },
    ],
    offlineCapHours: 4,
    unlockFloor: 0,
  },
  {
    id: 'blood_marsh',
    nameKey: 'hunt2',
    enemyId: 'blood_monster',
    cp: 70,
    goldPerHour: 5,
    xpPerHour: 25,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.28, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.09, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.015, qty: 1 },
    ],
    offlineCapHours: 5,
    unlockFloor: 26,
  },
  {
    id: 'demon_rift',
    nameKey: 'hunt3',
    enemyId: 'demon',
    cp: 140,
    goldPerHour: 8,
    xpPerHour: 40,
    drops: [
      { material: 'leather_scrap', rarity: 'common', chance: 0.32, qty: 1 },
      { material: 'demon_claw', rarity: 'uncommon', chance: 0.105, qty: 1 },
      { material: 'demon_core', rarity: 'rare', chance: 0.025, qty: 1 },
    ],
    offlineCapHours: 6,
    unlockFloor: 51,
  },
  {
    id: 'blood_abyss',
    nameKey: 'hunt4',
    enemyId: 'blood_monster',
    cp: 230,
    goldPerHour: 12,
    xpPerHour: 60,
    drops: [
      { material: 'bone_fragment', rarity: 'common', chance: 0.35, qty: 1 },
      { material: 'concentrated_blood', rarity: 'uncommon', chance: 0.12, qty: 1 },
      { material: 'corrupted_crystal', rarity: 'rare', chance: 0.03, qty: 1 },
    ],
    offlineCapHours: 8,
    unlockFloor: 76,
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
