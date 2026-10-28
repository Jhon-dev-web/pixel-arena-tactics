// Heroes and the reach probe shared by the depth tuning report (depthReach.sim.ts) and the test that keeps it (round14.test.ts).
import { SaveData } from '../../src/game/engine';
import { stageOfDepth } from '../../src/game/dungeon';
import { paragonLevelXp, paragonStartXp } from '../../src/game/paragon';
import { medianSubstatValue, rarityDef, Rarity, Substat, SUBSTATS } from '../../src/game/rarity';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear } from '../../src/game/gear';
import { buildHero, clearRate, TIER_EXTRAS, TIER_GEAR } from './ladder';
import type { HeroMode } from './duel';
import { spendSkillPoints } from './driver';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

// Every piece of tier 6 at +8 with the given rarity and its median substats (the first n of a fixed useful order: crit, life, defense).
const ORDER = ['critRate', 'maxHp', 'defense', 'critDamage', 'lifesteal'] as const;
// `refine` is the level of every piece (8 = the reference of rounds 14-16; the refinement past +8 of round 16 allows up to +12 on tier 5 and 6).
// `mode`: the parts of the real player the hero carries (duel.ts HeroMode). The default stays 'gear' (the empty rotation) because round14.test.ts and round17.test.ts pin the depth targets with it; sim:depths
// prints both ('rotation' is the real player), and the difference is a finding of phase 8 (docs/CLASSES_E_EQUIPAMENTOS.md 5.1.6): with the rotation on, the Epic set reaches depths the Round 14 targets keep for the Legendary.
export function gearHero(rarity: Rarity, paragon: number, refine = 8, mode: HeroMode = 'gear'): SaveData {
  let hero = buildHero(100, 6, refine, 100, mode);
  const instances = { ...hero.gearInstances };
  const equipped = { ...hero.equipped } as unknown as Record<string, string>;
  const pieces: [string, string][] = [['weapon', TIER_GEAR[6][0]], ['armor', TIER_GEAR[6][1]], ...TIER_EXTRAS[6]];
  for (const [slot, tpl] of pieces) {
    const tier = getGear(tpl)?.tier ?? 6;
    const def = rarityDef(rarity);
    const subs: Substat[] = ORDER.slice(0, def.substatCount).map((type) => ({ type, value: medianSubstatValue(SUBSTATS.find((s) => s.type === type)!, tier, def.substatMult) }));
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity, substats: subs, upgrade: refine });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  hero = { ...hero, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
  let xp = paragonStartXp();
  for (let n = 1; n <= paragon; n++) xp += paragonLevelXp(n);
  return spendSkillPoints({ ...hero, xp }, 'warrior');
}

export function depthReach(hero: SaveData, max = 90): number {
  let reach = 0;
  for (let d = 1; d <= max; d++) {
    if (clearRate(hero, stageOfDepth(d), NOW, 3) < 2 / 3) break;
    reach = d;
  }
  return reach;
}

