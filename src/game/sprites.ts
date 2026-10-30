import Assets from '../assets.json';
import { depthBossPool, dungeonEnemyKindForFloor, isDungeonBoss, MAX_DUNGEON_FLOOR } from './dungeon';
import { EnemyKind, getEnemyDef } from './enemies';
import { ownsAdventurerPass } from './entitlements';
import { BASE_LOOK, getGear, HERO_LOOKS, type HeroBaseLook } from './gear';
import { resolveGearInstance } from './gearInstances';
import { sanitizeActiveSkin } from './seasonItems';
import type { SaveData } from './engine';

const WEAPON_SPRITES: Record<number, string> = {
  0: Assets.weapons.club.url,
  1: Assets.weapons.bronze.url,
  2: Assets.weapons.iron.url,
  3: Assets.weapons.steel.url,
  4: Assets.weapons.dragon.url,
};

// Which sheet draws the hero. The ARMOR in the armor slot decides his body, at every tier (gear.ts ARMOR_LOOKS, one look per armor template; a unique wears its twin's):
// rags / empty slot = peasant, bronze leather = bronze, chainmail = iron, steel plate = knight, gilded aegis, dragon scale, voidsteel and abyssal each have their own.
// Nothing else ever changes the sprite: the weapon (a peasant with a forged sword still shows the peasant sheet), helmet, gloves, boots, ring and shield only affect
// stats. Taking the armor off shows the peasant again: it is what he is wearing. A hero SKIN (seasonItems.ts) is a deliberate cosmetic choice (save.activeSkin) that
// overrides all of this, but only while valid: owned, the Pass, a known id (sanitizeActiveSkin); anything else falls back to the armor-driven look.
export type { HeroBaseLook };
export type HeroSheet = HeroBaseLook | 'knight_golden';

type LookSave = Pick<SaveData, 'activeSkin' | 'cosmetics' | 'gearInstances' | 'equipped' | 'hasBattlePass'>;

const SHEET_URLS: Record<HeroSheet, string> = {
  hero_peasant_v2: Assets.spritesheets.hero_peasant_v2.url,
  hero_bronze_v2: Assets.spritesheets.hero_bronze_v2.url,
  hero_iron_v2: Assets.spritesheets.hero_iron_v2.url,
  hero_steel_v2: Assets.spritesheets.hero_steel_v2.url,
  hero_dark_knight: Assets.spritesheets.hero_dark_knight.url,
  hero_dragon_v2: Assets.spritesheets.hero_dragon_v2.url,
  hero_voidsteel_v2: Assets.spritesheets.hero_voidsteel_v2.url,
  hero_abyssal_v2: Assets.spritesheets.hero_abyssal_v2.url,
  knight_golden: Assets.spritesheets.knight_golden.url,
};

// The look of an armor template (the starter rags and anything unknown are the peasant).
export const armorLook = (templateId: string | null | undefined): HeroBaseLook => (templateId ? getGear(templateId)?.look : undefined) ?? BASE_LOOK;

// What the armor slot makes of the hero, ignoring skins.
export function heroBaseLook(save: Pick<SaveData, 'gearInstances' | 'equipped'>): HeroBaseLook {
  const hit = resolveGearInstance(save, save.equipped?.armor);
  return hit && hit.item.slot === 'armor' ? armorLook(hit.instance.templateId) : BASE_LOOK;
}

// THE one function that decides the hero's look from a save; every place that draws the hero goes through it.
export function heroSheet(save: LookSave): HeroSheet {
  if (sanitizeActiveSkin(save.activeSkin, save.cosmetics ?? [], ownsAdventurerPass(save)) === 'skin_golden_knight') return 'knight_golden';
  return heroBaseLook(save);
}

// Every look at or below `look` in progression order (the peasant is never "seen": no celebration for him).
export const looksUpTo = (look: HeroBaseLook): HeroBaseLook[] => HERO_LOOKS.slice(1, HERO_LOOKS.indexOf(look) + 1);

// The first time each look is worn: given the save after a change, returns the new save with the look added to `seenLooks` when the armor now worn gives a look the
// hero has not worn yet, else null (the peasant never fires). Unequipping and re-equipping never repeats it; a save that loads already wearing a look has every look up to it
// marked as seen by normalizeSave, so old heroes are not spammed. `armorNameKey` is the worn armor's gear name key for the toast.
export interface LookMoment {
  save: SaveData;
  look: HeroBaseLook;
  armorNameKey: string;
}
export function withLookMoment(next: SaveData): LookMoment | null {
  const look = heroBaseLook(next);
  if (look === BASE_LOOK || (next.seenLooks ?? []).includes(look)) return null;
  const armor = resolveGearInstance(next, next.equipped.armor);
  return { save: { ...next, seenLooks: [...(next.seenLooks ?? []), look] }, look, armorNameKey: armor?.item.nameKey ?? '' };
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
  // A CSS class that tints the borrowed sheet (Profundezas bosses reuse the four biome boss sheets; round11.css .depth-tint-*).
  tintClass?: string;
  // Key under `enemies.` in the locales.
  nameKey: string;
  // Battle display size; the arena's usual enemy size unless a sheet needs a presentation tweak.
  size: string;
}

const BATTLE_ENEMY_SIZE = 'calc(var(--sprite-size, 132px) * 1.1)';

// The goblin forest used to be one monster for 24 floors in a row. Its second regular monster takes the even floors (the goblin keeps the odd ones, so floor 1 is still the goblin
// and floor 25 is still the king): same biome, same stats (dungeonEnemyKindForFloor still says 'goblin'), only the sheet and the name change. Like goblin.png the sheet faces right
// (the battle screen flips every enemy), and its body is anchored on the same ground line in all sixteen frames.
const FOREST_WOLF = { spriteUrl: '/assets/spritesheets/forest_wolf.png', nameKey: 'forestWolf' };

const BOSS_VISUALS: Record<number, { spriteUrl: string; nameKey: string }> = {
  25: { spriteUrl: Assets.spritesheets.goblin_king.url, nameKey: 'goblinKing' },
  50: { spriteUrl: Assets.spritesheets.orc_warchief.url, nameKey: 'orcWarchief' },
  75: { spriteUrl: Assets.spritesheets.lich.url, nameKey: 'soulLich' },
};

export function dungeonEnemyVisualForFloor(floor: number): DungeonEnemyVisual {
  // Profundezas (stage > 100): the regular enemy keeps the death knight; every boss depth borrows one of the four biome boss sheets, tinted and renamed.
  if (floor > MAX_DUNGEON_FLOOR) {
    if (!isDungeonBoss(floor)) return { spriteUrl: Assets.spritesheets.death_knight.url, nameKey: 'deathKnight', size: BATTLE_ENEMY_SIZE };
    const pool = depthBossPool(floor - MAX_DUNGEON_FLOOR);
    return { spriteUrl: BOSS_VISUALS[pool]?.spriteUrl ?? enemySpriteUrl('boss'), nameKey: `depthBoss${pool}`, tintClass: `depth-tint-${pool}`, size: BATTLE_ENEMY_SIZE };
  }
  const boss = BOSS_VISUALS[floor];
  if (boss) return { ...boss, size: BATTLE_ENEMY_SIZE };
  if (floor >= 76 && floor <= 99) return { spriteUrl: Assets.spritesheets.death_knight.url, nameKey: 'deathKnight', size: BATTLE_ENEMY_SIZE };
  const kind = dungeonEnemyKindForFloor(floor);
  if (kind === 'goblin' && floor % 2 === 0) return { ...FOREST_WOLF, size: BATTLE_ENEMY_SIZE };
  return { spriteUrl: enemySpriteUrl(kind), nameKey: getEnemyDef(kind).nameKey, size: BATTLE_ENEMY_SIZE };
}
