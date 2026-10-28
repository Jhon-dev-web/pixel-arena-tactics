// One hero per class, equipped whole in one tier (classes reform, phase 8; docs/CLASSES_E_EQUIPAMENTOS.md 2.5). The class is a reflection of the gear (affinity.ts), so a class hero is just the full set of a weight
// plus the weapon of its family: the warrior wears the plate set and a sword (or the axe), the archer the leather set and a bow (or the crossbow), the mage the cloth set and a staff (or the scepter). Everything else is
// identical on purpose (same level, same refine, common rarity, no substats, the attribute split of the sim player, no hero skills, the ring of the tier), so the only thing that differs between two heroes is
// what the class changes: the stats of the pieces, the abilities they grant and the class affinity.
import { SaveData } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { medianSubstatValue, rarityDef, Rarity, Substat, SUBSTATS } from '../../src/game/rarity';
import { CLOTH_LINES, GEAR, getGear, LEATHER_LINES, WEAPON_LINES } from '../../src/game/gear';
import { HeroMode } from './duel';
import { buildHero, TIER_GEAR } from './ladder';

export type ClassWeapon = 'sword' | 'axe' | 'bow' | 'crossbow' | 'staff' | 'scepter';
export interface ClassBuild {
  id: string;
  cls: 'warrior' | 'archer' | 'mage';
  weapon: ClassWeapon;
}
// The three classes as the doc counts them (the first of each is the one the balance targets are read from), then the other weapon of each family.
export const CLASS_MAIN: ClassBuild[] = [
  { id: 'warrior', cls: 'warrior', weapon: 'sword' },
  { id: 'archer', cls: 'archer', weapon: 'bow' },
  { id: 'mage', cls: 'mage', weapon: 'staff' },
];
export const CLASS_VARIANTS: ClassBuild[] = [
  { id: 'warrior (axe)', cls: 'warrior', weapon: 'axe' },
  { id: 'archer (crossbow)', cls: 'archer', weapon: 'crossbow' },
  { id: 'mage (scepter)', cls: 'mage', weapon: 'scepter' },
];

// The weapon of a line at a tier. The sword is the weapon of the tier's pair (ladder.ts), the axe line is read from the item table.
export function weaponId(weapon: ClassWeapon, tier: number): string {
  if (weapon === 'sword') return TIER_GEAR[tier][0];
  if (weapon === 'axe') return GEAR.filter((g) => g.slot === 'weapon' && g.line === 'axe').sort((a, b) => a.tier! - b.tier!)[tier - 1].id;
  return WEAPON_LINES.find((l) => l.line === weapon)!.ids[tier - 1];
}

// `rarity`: every worn piece with the median substats of that rarity (the first n of crit, life, defense, crit damage, life steal, as scripts/sim/depthHero.ts and subLevelReach.sim.ts build theirs).
export function classHero(b: ClassBuild, level: number, tier: number, refine: number, mode: HeroMode = 'real', floor = 100, rarity: Rarity = 'common'): SaveData {
  const hero = buildHero(level, tier, refine, floor, mode); // the full plate set of the tier + the sword, ring included
  const instances = { ...hero.gearInstances };
  const equipped = { ...hero.equipped } as unknown as Record<string, string>;
  const wear = (slot: string, tpl: string) => {
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  };
  if (b.weapon !== 'sword') wear('weapon', weaponId(b.weapon, tier));
  if (b.cls === 'archer') for (const l of LEATHER_LINES) wear(l.slot, l.ids[tier - 1]);
  if (b.cls === 'mage') for (const l of CLOTH_LINES) wear(l.slot, l.ids[tier - 1]);
  if (rarity !== 'common') {
    const def = rarityDef(rarity);
    const order = ['critRate', 'maxHp', 'defense', 'critDamage', 'lifesteal'] as const;
    for (const [, id] of Object.entries(equipped)) {
      const old = instances[id];
      if (!old) continue;
      const subs: Substat[] = order.slice(0, def.substatCount).map((type) => ({ type, value: medianSubstatValue(SUBSTATS.find((x) => x.type === type)!, getGear(old.templateId).tier ?? tier, def.substatMult) }));
      instances[id] = createGearInstance(old.templateId, { id, origin: 'craft', rarity, substats: subs, upgrade: refine });
    }
  }
  return { ...hero, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
}
