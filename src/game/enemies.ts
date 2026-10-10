export type EnemyKind = 'goblin' | 'orc' | 'warlock' | 'boss';

export interface EnemyDef {
  id: EnemyKind;
  nameKey: string;
  hp: number;
  dmg: number;
  atkSpeedMs: number;
  hpMult: number;
  atkMult: number;
  healMult: number;
  dodge?: number;
  poison?: boolean;
  shieldWeight?: number;
  focusWeight?: number;
  chargeWeight?: number;
  boss?: boolean;
  slam?: boolean;
  slamMin?: number;
  slamMax?: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  goblin: {
    id: 'goblin',
    nameKey: 'goblinRogue',
    hp: 45,
    dmg: 6,
    atkSpeedMs: 1500,
    hpMult: 0.8,
    atkMult: 0.85,
    healMult: 0,
    dodge: 0.25,
  },
  orc: {
    id: 'orc',
    nameKey: 'orcBerserker',
    hp: 110,
    dmg: 18,
    atkSpeedMs: 1700,
    hpMult: 1,
    atkMult: 1,
    healMult: 1,
    shieldWeight: 0.25,
    focusWeight: 0.25,
  },
  warlock: {
    id: 'warlock',
    nameKey: 'skeletonWarlock',
    hp: 240,
    dmg: 38,
    atkSpeedMs: 1800,
    hpMult: 1.1,
    atkMult: 0.9,
    healMult: 0.9,
    poison: true,
    focusWeight: 0.25,
  },
  boss: {
    id: 'boss',
    nameKey: 'minotaurWarlord',
    // hp was 550: halved (x ~0.48) in the balance pass so the floor-25 boss stops being a cliff (docs/BALANCE_CHANGES.md). It also scales
    // floors 76-99 (this def is their regular mob) and the bosses of 50/75/100 by the same factor, so every boss stays above the floor before it.
    hp: 260,
    dmg: 75,
    atkSpeedMs: 2000,
    hpMult: 2,
    atkMult: 1.15,
    healMult: 1.6,
    shieldWeight: 0.2,
    focusWeight: 0.1,
    chargeWeight: 0.3,
    boss: true,
    slam: true,
    slamMin: 40,
    slamMax: 55,
  },
};

export function getEnemyDef(kind: EnemyKind): EnemyDef {
  return ENEMIES[kind];
}
