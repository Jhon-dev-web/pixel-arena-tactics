import { heroAttackIntervalMs, mitigationFraction } from './derivedStats';
import { buildCombatStats, playerLevel, SaveData, vitHpPerPoint } from './engine';
import T from './tunables';
import { attributePointsAvailable } from './nextStep';

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

// "Distribuir sugerido": the unspent points spread by a fixed target share (Força 35%, Vitalidade 30%, Agilidade 20%, Resistência 15% - the split the progression
// simulation plays with), each point going to the attribute furthest below its share of the total. A new hero ends up balanced, which is what survives the first floors;
// Agilidade never goes past its combat cap. Pure: returns the points to ADD to each attribute (all zeros when nothing is left to spend).
export const SUGGESTED_SHARE: Record<AttrKey, number> = { str: 0.35, vit: 0.3, agi: 0.2, res: 0.15 };

export function suggestedSpend(save: SaveData): Record<AttrKey, number> {
  const add: Record<AttrKey, number> = { str: 0, vit: 0, agi: 0, res: 0 };
  const have: Record<AttrKey, number> = { str: save.str, vit: save.vit, agi: save.agi, res: save.res };
  let spent = have.str + have.vit + have.agi + have.res;
  for (let left = attributePointsAvailable(save); left > 0; left--) {
    let pick: AttrKey | null = null;
    let pickGap = -Infinity;
    for (const key of ATTR_KEYS) {
      if (key === 'agi' && have.agi >= T.battle.agiMax) continue;
      const gap = SUGGESTED_SHARE[key] * (spent + 1) - have[key];
      if (gap > pickGap) {
        pickGap = gap;
        pick = key;
      }
    }
    if (pick === null) break;
    have[pick] += 1;
    add[pick] += 1;
    spent += 1;
  }
  return add;
}
