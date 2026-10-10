import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import Assets from '../../assets.json';
import { dungeonEnemyKindForFloor, MAX_DUNGEON_FLOOR } from '../dungeon';
import { ENEMIES, getEnemyDef } from '../enemies';
import { dungeonEnemyVisualForFloor, enemySpriteUrl } from '../sprites';

const floors = Array.from({ length: MAX_DUNGEON_FLOOR }, (_, i) => i + 1);
const files = new Set(Object.keys(import.meta.glob('/public/assets/spritesheets/*')));

describe('dungeon enemy visuals', () => {
  it('every floor resolves to an existing sprite and a name in both locales', () => {
    for (const f of floors) {
      const v = dungeonEnemyVisualForFloor(f);
      expect(files.has('/public' + v.spriteUrl), `sprite floor ${f}`).toBe(true);
      expect((en.enemies as Record<string, string>)[v.nameKey], `en floor ${f}`).toBeTruthy();
      expect((pt.enemies as Record<string, string>)[v.nameKey], `pt floor ${f}`).toBeTruthy();
    }
  });

  it('maps the bosses and the fourth biome to their own art and names', () => {
    const sheets = Assets.spritesheets;
    expect(dungeonEnemyVisualForFloor(25)).toMatchObject({ spriteUrl: sheets.goblin_king.url, nameKey: 'goblinKing' });
    expect(dungeonEnemyVisualForFloor(50)).toMatchObject({ spriteUrl: sheets.orc_warchief.url, nameKey: 'orcWarchief' });
    expect(dungeonEnemyVisualForFloor(75)).toMatchObject({ spriteUrl: sheets.lich.url, nameKey: 'soulLich' });
    for (let f = 76; f <= 99; f++) {
      expect(dungeonEnemyVisualForFloor(f)).toMatchObject({ spriteUrl: sheets.death_knight.url, nameKey: 'deathKnight' });
    }
    expect(dungeonEnemyVisualForFloor(100)).toMatchObject({ spriteUrl: sheets.boss.url, nameKey: 'minotaurWarlord' });
    expect(en.enemies.goblinKing).toBe('Goblin King');
    expect(pt.enemies.deathKnight).toBe('Cavaleiro da Morte');
  });

  it('leaves every other floor on its old sprite and name', () => {
    for (const f of floors.filter((x) => x < 76 && x % 25 !== 0)) {
      const kind = dungeonEnemyKindForFloor(f);
      expect(dungeonEnemyVisualForFloor(f)).toMatchObject({ spriteUrl: enemySpriteUrl(kind), nameKey: getEnemyDef(kind).nameKey });
    }
  });

  it('stats still come from the unchanged enemy kinds', () => {
    for (const f of floors) {
      const oldKind = f % 25 === 0 || f >= 76 ? 'boss' : f < 25 ? 'goblin' : f < 50 ? 'orc' : 'warlock';
      expect(dungeonEnemyKindForFloor(f), `floor ${f}`).toBe(oldKind);
      expect(getEnemyDef(dungeonEnemyKindForFloor(f))).toBe(ENEMIES[oldKind]);
    }
  });
});
