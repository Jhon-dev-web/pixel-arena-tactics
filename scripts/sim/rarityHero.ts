// A full seven-piece set of one tier, every piece of one rarity with the median substats of that rarity (shared by rarityCp.sim.ts and itemPrices.sim.ts).
import { SaveData } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear } from '../../src/game/gear';
import { medianSubstatValue, rarityDef, Rarity, Substat, SUBSTATS } from '../../src/game/rarity';
import { buildHero, TIER_EXTRAS, TIER_GEAR } from './ladder';
import { spendSkillPoints } from './driver';

// The substats a median piece of the rarity carries: the first `substatCount` of this order (crit, life, defense, crit damage, lifesteal).
const ORDER = ['critRate', 'maxHp', 'defense', 'critDamage', 'lifesteal'] as const;

export function rarityHero(level: number, tier: number, refine: number, rarity: Rarity): SaveData {
  let hero = buildHero(level, tier, refine, 100);
  const instances = { ...hero.gearInstances };
  const equipped = { ...hero.equipped } as unknown as Record<string, string>;
  const def = rarityDef(rarity);
  const pieces: [string, string][] = [['weapon', TIER_GEAR[tier][0]], ['armor', TIER_GEAR[tier][1]], ...TIER_EXTRAS[tier]];
  for (const [slot, tpl] of pieces) {
    const subs: Substat[] = ORDER.slice(0, def.substatCount).map((type) => ({ type, value: medianSubstatValue(SUBSTATS.find((s) => s.type === type)!, getGear(tpl)?.tier ?? tier, def.substatMult) }));
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity, substats: subs, upgrade: refine });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  hero = { ...hero, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
  return spendSkillPoints(hero, 'warrior');
}
