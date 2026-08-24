export type EnemyKind = 'goblin' | 'orc' | 'warlock' | 'boss';

export interface EnemyDef {
  id: EnemyKind;
  nameKey: string;
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
    hpMult: 0.8,
    atkMult: 0.85,
    healMult: 0,
    dodge: 0.25,
  },
  orc: {
    id: 'orc',
    nameKey: 'orcBerserker',
    hpMult: 1,
    atkMult: 1,
    healMult: 1,
    shieldWeight: 0.25,
    focusWeight: 0.25,
  },
  warlock: {
    id: 'warlock',
    nameKey: 'skeletonWarlock',
    hpMult: 1.1,
    atkMult: 0.9,
    healMult: 0.9,
    poison: true,
    focusWeight: 0.25,
  },
  boss: {
    id: 'boss',
    nameKey: 'minotaurWarlord',
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

export function enemyKindForDuel(duel: number): EnemyKind {
  if (duel % 5 === 0) return 'boss';
  const rotation: EnemyKind[] = ['goblin', 'goblin', 'orc', 'warlock'];
  return rotation[(duel - 1) % rotation.length];
}
