import Assets from '../assets.json';
import { dungeonEnemyKindForFloor } from './dungeon';
import { EnemyKind, getEnemyDef } from './enemies';

const WEAPON_SPRITES: Record<number, string> = {
  0: Assets.weapons.club.url,
  1: Assets.weapons.bronze.url,
  2: Assets.weapons.iron.url,
  3: Assets.weapons.steel.url,
  4: Assets.weapons.dragon.url,
};

// Design decision: equipping armor only affects stats (HP, resistance, etc.), never the
// character's visual — the player sprite is always the knight, regardless of armor tier.
export function playerSpriteUrl(): string {
  return Assets.spritesheets.knight.url;
}

export function spriteForWeaponTier(tier: number): string {
  return WEAPON_SPRITES[tier] ?? Assets.weapons.club.url;
}

export function enemySpriteUrl(kind: EnemyKind): string {
  switch (kind) {
    case 'goblin':
      return Assets.spritesheets.goblin.url;
    case 'orc':
      return Assets.spritesheets.orc.url;
    case 'warlock':
      return Assets.spritesheets.warlock.url;
    default:
      return Assets.spritesheets.boss.url;
  }
}

export function enemySpriteSize(kind: EnemyKind): string {
  return kind === 'boss' ? 'calc(var(--sprite-size, 132px) * 1.3)' : 'var(--sprite-size, 132px)';
}

// Presentation-only layer for the Dungeon: the biome bosses (25/50/75) and the fourth biome's regular enemies get their own art and name, while
// stats, drops and the sim keep coming from dungeonEnemyKindForFloor -> getEnemyDef. Floor 100 keeps the shared minotaur boss.
export interface DungeonEnemyVisual {
  spriteUrl: string;
  // Key under `enemies.` in the locales.
  nameKey: string;
  // Battle display size; the arena's usual enemy size unless a sheet needs a presentation tweak.
  size: string;
}

const BATTLE_ENEMY_SIZE = 'calc(var(--sprite-size, 132px) * 1.1)';

const BOSS_VISUALS: Record<number, { spriteUrl: string; nameKey: string }> = {
  25: { spriteUrl: Assets.spritesheets.goblin_king.url, nameKey: 'goblinKing' },
  50: { spriteUrl: Assets.spritesheets.orc_warchief.url, nameKey: 'orcWarchief' },
  75: { spriteUrl: Assets.spritesheets.lich.url, nameKey: 'soulLich' },
};

export function dungeonEnemyVisualForFloor(floor: number): DungeonEnemyVisual {
  const boss = BOSS_VISUALS[floor];
  if (boss) return { ...boss, size: BATTLE_ENEMY_SIZE };
  if (floor >= 76 && floor <= 99) return { spriteUrl: Assets.spritesheets.death_knight.url, nameKey: 'deathKnight', size: BATTLE_ENEMY_SIZE };
  const kind = dungeonEnemyKindForFloor(floor);
  return { spriteUrl: enemySpriteUrl(kind), nameKey: getEnemyDef(kind).nameKey, size: BATTLE_ENEMY_SIZE };
}
