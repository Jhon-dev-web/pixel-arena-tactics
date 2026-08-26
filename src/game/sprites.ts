import Assets from '../assets.json';
import { EnemyKind } from './enemies';

const ARMOR_SPRITES: Record<number, string> = {
  0: Assets.spritesheets.peasant.url,
  1: Assets.spritesheets.bronze.url,
  2: Assets.spritesheets.iron.url,
  3: Assets.spritesheets.knight.url,
  4: Assets.spritesheets.dragon.url,
};

const WEAPON_SPRITES: Record<number, string> = {
  0: Assets.weapons.club.url,
  1: Assets.weapons.bronze.url,
  2: Assets.weapons.iron.url,
  3: Assets.weapons.steel.url,
  4: Assets.weapons.dragon.url,
};

export function spriteForArmorTier(tier: number): string {
  return ARMOR_SPRITES[tier] ?? Assets.spritesheets.knight.url;
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
