import { heroAttackIntervalMs, mitigationFraction } from './derivedStats';
import { buildCombatStats, playerLevel, SaveData, vitHpPerPoint } from './engine';
import T from './tunables';

// What one point of each primary attribute is worth, as the numbers the Personagem screen prints. They are read from the same constants the engine uses
// (tunables.ts through strengthAdjustedDamage / playerMaxHp / heroAttackIntervalMs / buildCombatStats), never typed into the locale text, so a rebalance
// cannot leave the screen lying (src/game/__tests__/attributes.test.ts renders every description in both languages and checks the numbers).
export type AttrKey = 'str' | 'vit' | 'agi' | 'res';
export const ATTR_KEYS: AttrKey[] = ['str', 'vit', 'agi', 'res'];

const round = (n: number, d: number): number => Math.round(n * 10 ** d) / 10 ** d;

// Numbers of the description of `attr` for this hero (the ones that depend on the hero are the effect of its NEXT point).
export function attributeParams(attr: AttrKey, save: SaveData): Record<string, number> {
  const level = playerLevel(save.xp);
  switch (attr) {
    case 'str':
      return { flat: round(T.advanced.strengthFlatDamage, 2), pct: round(T.advanced.strengthWeaponScalePerPoint * 100, 2) };
    case 'vit':
      return { hp: round(vitHpPerPoint(level), 2), perLevel: round(T.advanced.vitHpPerLevel, 3) };
    case 'agi':
      return { ms: round(heroAttackIntervalMs(save.agi) - heroAttackIntervalMs(save.agi + 1), 1), max: T.battle.agiMax };
    case 'res': {
      const r = buildCombatStats(save).reduction;
      return { red: round((mitigationFraction(r + T.advanced.resResistPerPoint) - mitigationFraction(r)) * 100, 2), hp: round(T.advanced.resHpPerPoint, 2) };
    }
  }
}
