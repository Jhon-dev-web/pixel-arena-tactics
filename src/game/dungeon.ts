import { EnemyKind } from './enemies';
import { MaterialId } from './materials';

export interface FloorDef {
  floor: number;
  nameKey: string;
  cp: number;
  enemyKind: EnemyKind;
  goldMin: number;
  goldMax: number;
  drops: Partial<Record<MaterialId, number>>;
  shards?: number;
}

export const FLOORS: FloorDef[] = [
  { floor: 1, nameKey: 'floor1', cp: 35, enemyKind: 'goblin', goldMin: 40, goldMax: 70, drops: { leather: 2, iron: 2 } },
  { floor: 2, nameKey: 'floor2', cp: 80, enemyKind: 'orc', goldMin: 80, goldMax: 120, drops: { iron: 3 } },
  { floor: 3, nameKey: 'floor3', cp: 150, enemyKind: 'warlock', goldMin: 150, goldMax: 200, drops: { steel: 2, essence: 1 } },
  { floor: 4, nameKey: 'floor4', cp: 250, enemyKind: 'boss', goldMin: 300, goldMax: 450, drops: { dragon_scales: 2 }, shards: 3 },
];

export interface BattleRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
}

export function getFloor(floor: number): FloorDef {
  return FLOORS[floor - 1];
}
