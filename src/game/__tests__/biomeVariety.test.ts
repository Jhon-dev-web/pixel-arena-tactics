import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { dungeonEnemyKindForFloor, getBiomeForFloor } from '../dungeon';
import { getEnemyDef } from '../enemies';
import { dungeonEnemyVisualForFloor } from '../sprites';
import { stageEnemyDmg, stageEnemyHp, waveRewards } from '../waves';

// The orc camp, the warlock crypt and the minotaur lair each show two monsters (sprites.ts is a presentation-only layer, the same trick as the goblin forest: forestVariety.test.ts),
// but the game underneath must not notice. Every row is what floors 26-100 fought and paid BEFORE the second monsters existed, captured from the unchanged code:
// [floor, kind, hp, dmg, atkSpeedMs, dodge, healMult, gold at the lowest roll, gold at the highest roll, shards at each, drops/gems/uniques/relics at the lowest roll, same at the highest].
// If one of these lights up after an art change, the art change touched the game: fix that, never this table.
const BEFORE: [number, string, number, number, number, number | null, number, number, number, number, number, string, string][] = [
  [26,"orc",1544,192,1700,null,1,12,18,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [27,"orc",1593,198,1700,null,1,12,18,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [28,"orc",1641,204,1700,null,1,12,19,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [29,"orc",1690,209,1700,null,1,12,19,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [30,"orc",2608,269,1700,null,1,70,88,2,2,"[{},{},[],[]]","[{},{},[],[]]"],
  [31,"orc",1788,221,1700,null,1,12,19,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [32,"orc",1836,227,1700,null,1,12,19,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [33,"orc",1885,232,1700,null,1,12,19,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [34,"orc",1934,238,1700,null,1,13,20,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [35,"orc",1982,244,1700,null,1,13,20,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [36,"orc",2031,250,1700,null,1,13,20,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [37,"orc",2080,255,1700,null,1,13,20,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [38,"orc",2129,261,1700,null,1,13,20,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [39,"orc",2178,267,1700,null,1,13,20,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [40,"orc",3339,341,1700,null,1,73,93,2,2,"[{},{},[],[]]","[{},{},[],[]]"],
  [41,"orc",2275,278,1700,null,1,13,21,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [42,"orc",2324,284,1700,null,1,13,21,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [43,"orc",2373,290,1700,null,1,14,21,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [44,"orc",2421,296,1700,null,1,14,21,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [45,"orc",2470,301,1700,null,1,14,21,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [46,"orc",2519,307,1700,null,1,14,22,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [47,"orc",2568,313,1700,null,1,14,22,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [48,"orc",2616,319,1700,null,1,14,22,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [49,"orc",2665,324,1700,null,1,14,22,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [50,"boss",5517,267,2000,null,1.6,170,210,5,5,"[{},{\"ruby\":1},[{\"templateId\":\"warchief_gauntlets\",\"rarity\":\"common\",\"substats\":[{\"type\":\"critRate\",\"value\":4}]},{\"templateId\":\"warden_bulwark\",\"rarity\":\"common\",\"substats\":[{\"type\":\"critRate\",\"value\":4}]}],[\"warchief_totem\"]]","[{},{\"emerald\":1},[],[]]"],
  [51,"warlock",2684,346,1800,null,0.9,21,29,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [52,"warlock",2764,355,1800,null,0.9,21,29,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [53,"warlock",2844,364,1800,null,0.9,21,29,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [54,"warlock",2926,374,1800,null,0.9,21,29,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [55,"warlock",3010,383,1800,null,0.9,21,30,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [56,"warlock",3094,393,1800,null,0.9,22,30,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [57,"warlock",3179,402,1800,null,0.9,22,30,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [58,"warlock",3266,412,1800,null,0.9,22,30,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [59,"warlock",3353,422,1800,null,0.9,22,31,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [60,"warlock",5163,539,1800,null,0.9,95,118,2,2,"[{},{},[],[]]","[{},{},[],[]]"],
  [61,"warlock",3532,442,1800,null,0.9,22,31,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [62,"warlock",3623,452,1800,null,0.9,23,31,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [63,"warlock",3715,462,1800,null,0.9,23,31,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [64,"warlock",3808,472,1800,null,0.9,23,32,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [65,"warlock",3902,483,1800,null,0.9,23,32,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [66,"warlock",3998,493,1800,null,0.9,23,32,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [67,"warlock",4095,504,1800,null,0.9,23,32,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [68,"warlock",4192,515,1800,null,0.9,23,32,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [69,"warlock",4291,526,1800,null,0.9,24,33,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [70,"warlock",6587,671,1800,null,0.9,100,123,2,2,"[{},{},[],[]]","[{},{},[],[]]"],
  [71,"warlock",4492,548,1800,null,0.9,24,33,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [72,"warlock",4594,559,1800,null,0.9,24,33,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [73,"warlock",4698,570,1800,null,0.9,24,34,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [74,"warlock",4802,582,1800,null,0.9,24,34,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [75,"boss",11809,534,2000,null,1.6,225,270,5,5,"[{},{\"ruby\":1},[{\"templateId\":\"lich_soul_ring\",\"rarity\":\"common\",\"substats\":[{\"type\":\"critRate\",\"value\":5}]}],[\"lich_phylactery\"]]","[{},{\"emerald\":1},[],[]]"],
  [76,"boss",12481,575,2000,null,1.6,29,40,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [77,"boss",13742,616,2000,null,1.6,29,40,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [78,"boss",15030,659,2000,null,1.6,29,40,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [79,"boss",16345,702,2000,null,1.6,29,41,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [80,"boss",26530,746,2000,null,1.6,113,143,2,2,"[{},{},[],[]]","[{},{},[],[]]"],
  [81,"boss",19055,791,2000,null,1.6,29,41,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [82,"boss",20450,837,2000,null,1.6,30,41,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [83,"boss",21872,884,2000,null,1.6,30,42,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [84,"boss",23321,931,2000,null,1.6,30,42,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [85,"boss",24796,980,2000,null,1.6,30,42,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [86,"boss",26299,1029,2000,null,1.6,30,42,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [87,"boss",27828,1079,2000,null,1.6,30,43,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [88,"boss",29384,1130,2000,null,1.6,31,43,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [89,"boss",30967,1181,2000,null,1.6,31,43,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [90,"boss",48864,1234,2000,null,1.6,118,148,2,2,"[{},{},[],[]]","[{},{},[],[]]"],
  [91,"boss",34213,1287,2000,null,1.6,31,44,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [92,"boss",35876,1341,2000,null,1.6,31,44,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [93,"boss",37566,1396,2000,null,1.6,32,44,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [94,"boss",39283,1452,2000,null,1.6,32,44,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [95,"boss",41027,1508,2000,null,1.6,32,45,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [96,"boss",42797,1566,2000,null,1.6,32,45,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [97,"boss",44595,1624,2000,null,1.6,32,45,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [98,"boss",46419,1683,2000,null,1.6,32,45,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [99,"boss",48270,1743,2000,null,1.6,33,46,0,0,"[{},{},[],[]]","[{},{},[],[]]"],
  [100,"boss",61606,2110,2000,null,1.6,265,330,5,5,"[{},{\"ruby\":1},[{\"templateId\":\"overlord_greataxe\",\"rarity\":\"common\",\"substats\":[{\"type\":\"critRate\",\"value\":5}]}],[\"overlord_sigil\"]]","[{},{\"emerald\":1},[],[]]"],
];

const roll = (floor: number, r: number) => {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(r);
  try {
    return waveRewards(getBiomeForFloor(floor), floor);
  } finally {
    spy.mockRestore();
  }
};

// [first floor, last floor, boss floor, even-floor monster, odd-floor monster, boss monster]
const BIOMES: [number, number, number, string, string, string][] = [
  [26, 49, 50, 'warBoar', 'orcBerserker', 'orcWarchief'],
  [51, 74, 75, 'cryptWraith', 'skeletonWarlock', 'soulLich'],
  [76, 99, 100, 'stoneGolem', 'deathKnight', 'minotaurWarlord'],
];

describe('orc camp, warlock crypt, minotaur lair: two monsters each, one set of numbers', () => {
  it('the art and the name alternate along each biome (the new monster on even floors, the old one on odd floors) and the boss floors are untouched', () => {
    for (const [from, to, boss, even, odd, bossName] of BIOMES) {
      const sheets = new Set<string>();
      for (let f = from; f <= to; f++) {
        const v = dungeonEnemyVisualForFloor(f);
        sheets.add(v.spriteUrl);
        expect(v.nameKey, `floor ${f}`).toBe(f % 2 === 0 ? even : odd);
        expect((en.enemies as Record<string, string>)[v.nameKey]).toBeTruthy();
        expect((pt.enemies as Record<string, string>)[v.nameKey]).toBeTruthy();
      }
      expect(sheets.size, `sheets in ${from}-${to}`).toBe(2);
      expect(dungeonEnemyVisualForFloor(boss).nameKey).toBe(bossName);
    }
    // the Profundezas keep the death knight on every regular stage
    expect(dungeonEnemyVisualForFloor(102).nameKey).toBe('deathKnight');
    expect(dungeonEnemyVisualForFloor(103).nameKey).toBe('deathKnight');
  });

  it('floors 26 to 100 fight and pay exactly what they did before: life, damage, speed, dodge, heal, gold, shards, drops, gems, uniques and relics', () => {
    expect(BEFORE).toHaveLength(75);
    for (const [f, kindBefore, hp, dmg, atk, dodge, heal, goldLo, goldHi, shardsLo, shardsHi, dropsLo, dropsHi] of BEFORE) {
      const kind = dungeonEnemyKindForFloor(f);
      const def = getEnemyDef(kind);
      expect(kind, `kind floor ${f}`).toBe(kindBefore);
      expect(stageEnemyHp(def, f), `hp floor ${f}`).toBe(hp);
      expect(stageEnemyDmg(def, f), `dmg floor ${f}`).toBe(dmg);
      expect(def.atkSpeedMs, `speed floor ${f}`).toBe(atk);
      expect(def.dodge ?? null, `dodge floor ${f}`).toBe(dodge);
      expect(def.healMult, `heal floor ${f}`).toBe(heal);
      const lo = roll(f, 0);
      const hi = roll(f, 0.999999);
      expect([lo.gold, hi.gold, lo.shards, hi.shards], `gold/shards floor ${f}`).toEqual([goldLo, goldHi, shardsLo, shardsHi]);
      expect(JSON.stringify([lo.drops, lo.gems, lo.uniques, lo.relics]), `drops floor ${f} low roll`).toBe(dropsLo);
      expect(JSON.stringify([hi.drops, hi.gems, hi.uniques, hi.relics]), `drops floor ${f} high roll`).toBe(dropsHi);
    }
  });

  it('the second-monster sheets are 4x4 cells of 172 px (688x688, RGBA): a sheet of another size would be cut in the wrong places on the battle screen', () => {
    for (const name of ['forest_wolf', 'war_boar', 'crypt_wraith', 'stone_golem']) {
      const head = readFileSync(`public/assets/spritesheets/${name}.png`).subarray(0, 26);
      expect(head.subarray(1, 4).toString(), name).toBe('PNG');
      expect([head.readUInt32BE(16), head.readUInt32BE(20), head[25]], name).toEqual([688, 688, 6]);
    }
  });
});
