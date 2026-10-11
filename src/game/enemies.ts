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
    // Round 2 of the balance pass: was 110 / 18. The orc biome (floors 26-49) used to be easier than the floor-25 boss and the hero crossed it
    // in a day; with these stats it asks for a real gear climb between boss 25 and boss 50.
    // Rodada 8 (primary attributes): 310 / 46 -> 325 / 48, because the new VIT / AGI values make a hero of floors 26-49 about 3 % stronger.
    hp: 325,
    dmg: 48,
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
    hp: 312,
    dmg: 49,
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
    // This def is also the regular mob of floors 76-99: do not retune it for the floor-25 boss (see T.battle.boss25HpMult and friends).
    hp: 715,
    dmg: 98,
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
