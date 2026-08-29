import { EnemyKind } from './enemies';
import { MaterialId } from './materials';

export interface DropEntry {
  material: MaterialId;
  qty: number;
  chance: number;
}

export interface FloorDef {
  floor: number;
  nameKey: string;
  cp: number;
  enemyKind: EnemyKind;
  goldMin: number;
  goldMax: number;
  drops: DropEntry[];
  shards?: number;
}

export const FLOORS: FloorDef[] = [
  {
    floor: 1,
    nameKey: 'floor1',
    cp: 35,
    enemyKind: 'goblin',
    goldMin: 4,
    goldMax: 8,
    drops: [
      { material: 'leather', qty: 1, chance: 0.35 },
      { material: 'iron', qty: 1, chance: 0.25 },
    ],
  },
  { floor: 2, nameKey: 'floor2', cp: 80, enemyKind: 'orc', goldMin: 80, goldMax: 120, drops: [{ material: 'iron', qty: 3, chance: 1 }] },
  {
    floor: 3,
    nameKey: 'floor3',
    cp: 150,
    enemyKind: 'warlock',
    goldMin: 150,
    goldMax: 200,
    drops: [
      { material: 'steel', qty: 2, chance: 1 },
      { material: 'essence', qty: 1, chance: 1 },
    ],
  },
  { floor: 4, nameKey: 'floor4', cp: 250, enemyKind: 'boss', goldMin: 300, goldMax: 450, drops: [{ material: 'dragon_scales', qty: 2, chance: 1 }], shards: 3 },
];

export interface BattleRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
}

export function getFloor(floor: number): FloorDef {
  return FLOORS[floor - 1];
}
