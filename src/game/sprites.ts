import Assets from '../assets.json';
import { dungeonEnemyKindForFloor } from './dungeon';
import { EnemyKind, getEnemyDef } from './enemies';
import { ownsAdventurerPass } from './entitlements';
import { wearsRealArmor } from './gearInstances';
import { sanitizeActiveSkin } from './seasonItems';
import type { SaveData } from './engine';

const WEAPON_SPRITES: Record<number, string> = {
  0: Assets.weapons.club.url,
  1: Assets.weapons.bronze.url,
  2: Assets.weapons.iron.url,
  3: Assets.weapons.steel.url,
  4: Assets.weapons.dragon.url,
};

// Which sheet draws the hero. Equipping armor only affects stats (HP, resistance, etc.), never the character's visual, with ONE deliberate exception: the
// peasant -> knight step. A new hero starts in rags with a wooden club and is drawn as the peasant; the moment any real armor (forged, dropped or unique, any
// tier >= 1) sits in the armor slot he is the knight, and every later armor keeps the knight (tier never changes the look). Taking the armor off back to the
// rags (or an empty slot) shows the peasant again: it is what he is wearing. The weapon never matters (a peasant holding a forged sword still shows the
// peasant sheet, accepted). A hero SKIN (seasonItems.ts) is a deliberate cosmetic choice (save.activeSkin) that overrides all of this, but only while valid:
// owned, the Pass, a known id (sanitizeActiveSkin); anything else falls back to the gear-driven look.
export type HeroSheet = 'peasant' | 'knight' | 'knight_golden';
export type HeroBaseLook = 'peasant' | 'knight';

type LookSave = Pick<SaveData, 'activeSkin' | 'cosmetics' | 'gearInstances' | 'equipped' | 'hasBattlePass'>;

const SHEET_URLS: Record<HeroSheet, string> = {
  peasant: Assets.spritesheets.peasant.url,
  knight: Assets.spritesheets.knight.url,
  knight_golden: Assets.spritesheets.knight_golden.url,
};

// What the armor slot makes of the hero, ignoring skins: a real armor instance (anything but the starter rags) = knight.
export function heroBaseLook(save: Pick<SaveData, 'gearInstances' | 'equipped'>): HeroBaseLook {
  return wearsRealArmor(save) ? 'knight' : 'peasant';
}

// THE one function that decides the hero's look from a save; every place that draws the hero goes through it.
export function heroSheet(save: LookSave): HeroSheet {
  if (sanitizeActiveSkin(save.activeSkin, save.cosmetics ?? [], ownsAdventurerPass(save)) === 'skin_golden_knight') return 'knight_golden';
  return heroBaseLook(save);
}

// The one-time peasant -> knight moment. Given the save before and after a change, returns the new save with the `heroKnighted` flag set when this very change put
// the first real armor on a hero who has not had the moment yet, else null. Unequipping back to the rags and re-equipping never repeats it (the flag stays), and a
// save that loaded already wearing armor has the flag set by normalizeSave, so old heroes never see it.
export function withKnightingMoment(prev: Pick<SaveData, 'gearInstances' | 'equipped'>, next: SaveData): SaveData | null {
  if (next.heroKnighted) return null;
  return heroBaseLook(prev) === 'peasant' && heroBaseLook(next) === 'knight' ? { ...next, heroKnighted: true } : null;
}

export const heroSheetUrl = (sheet: HeroSheet): string => SHEET_URLS[sheet];

export const playerSpriteUrl = (save: LookSave): string => heroSheetUrl(heroSheet(save));

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
