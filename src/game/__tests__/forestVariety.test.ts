import { describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { dungeonEnemyKindForFloor, getBiomeForFloor } from '../dungeon';
import { ENEMIES, getEnemyDef } from '../enemies';
import { dungeonEnemyVisualForFloor } from '../sprites';
import { stageEnemyDmg, stageEnemyHp, waveRewards } from '../waves';

// The goblin forest shows two monsters (sprites.ts is a presentation-only layer), but the game underneath must not notice. Every number below is what floors 1-24 paid and
// fought BEFORE the second monster existed, captured from the unchanged code: [floor, hp, dmg, gold at the lowest roll, gold at the highest roll, shards].
// If one of these lights up after an art change, the art change touched the game: fix that, never this table.
const BEFORE: [number, number, number, number, number, number][] = [
  [1, 45, 6, 5, 8, 0], [2, 52, 7, 5, 8, 0], [3, 59, 7, 5, 8, 0], [4, 65, 8, 5, 8, 0], [5, 72, 9, 5, 8, 0], [6, 79, 10, 5, 8, 0],
  [7, 86, 10, 5, 9, 0], [8, 92, 11, 5, 9, 0], [9, 99, 12, 5, 9, 0], [10, 159, 16, 55, 63, 2], [11, 113, 13, 6, 9, 0], [12, 119, 14, 6, 9, 0],
  [13, 126, 15, 6, 9, 0], [14, 133, 15, 6, 9, 0], [15, 140, 16, 6, 9, 0], [16, 146, 17, 6, 9, 0], [17, 153, 18, 6, 10, 0], [18, 160, 18, 6, 10, 0],
  [19, 167, 19, 6, 10, 0], [20, 260, 25, 55, 65, 2], [21, 180, 20, 6, 10, 0], [22, 187, 21, 6, 10, 0], [23, 194, 22, 6, 10, 0], [24, 200, 23, 6, 10, 0],
];

const roll = (floor: number, r: number) => {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(r);
  try {
    return waveRewards(getBiomeForFloor(floor), floor);
  } finally {
    spy.mockRestore();
  }
};

describe('goblin forest: two monsters, one set of numbers', () => {
  it('the art and the name change along the biome: goblin on odd floors, wolf on even ones, the king still on 25', () => {
    const names = new Set<string>();
    const sheets = new Set<string>();
    for (let f = 1; f <= 24; f++) {
      const v = dungeonEnemyVisualForFloor(f);
      names.add(v.nameKey);
      sheets.add(v.spriteUrl);
      expect(v.nameKey, `floor ${f}`).toBe(f % 2 === 0 ? 'forestWolf' : 'goblinRogue');
      expect((en.enemies as Record<string, string>)[v.nameKey]).toBeTruthy();
      expect((pt.enemies as Record<string, string>)[v.nameKey]).toBeTruthy();
    }
    expect(names.size).toBe(2);
    expect(sheets.size).toBe(2);
    expect(dungeonEnemyVisualForFloor(1).nameKey).toBe('goblinRogue');
    expect(dungeonEnemyVisualForFloor(25).nameKey).toBe('goblinKing');
  });

  it('floors 1 to 24 fight and pay exactly what they did before: life, damage, speed, dodge, gold, shards and drops', () => {
    for (const [f, hp, dmg, goldLo, goldHi, shards] of BEFORE) {
      const kind = dungeonEnemyKindForFloor(f);
      const def = getEnemyDef(kind);
      expect(kind, `kind floor ${f}`).toBe('goblin');
      expect(def, `def floor ${f}`).toBe(ENEMIES.goblin);
      expect(stageEnemyHp(def, f), `hp floor ${f}`).toBe(hp);
      expect(stageEnemyDmg(def, f), `dmg floor ${f}`).toBe(dmg);
      expect(def.atkSpeedMs).toBe(1500);
      expect(def.dodge).toBe(0.25);
      expect(def.healMult).toBe(0);
      const lo = roll(f, 0);
      const hi = roll(f, 0.999999);
      expect([lo.gold, hi.gold, lo.shards], `gold/shards floor ${f}`).toEqual([goldLo, goldHi, shards]);
      for (const w of [lo, hi]) {
        expect(w.drops).toEqual({});
        expect(w.gems).toEqual({});
        expect(w.uniques).toEqual([]);
        expect(w.relics).toEqual([]);
      }
    }
  });
});
