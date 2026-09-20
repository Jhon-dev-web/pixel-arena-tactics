import { t } from '../locales';
import { getGear } from '../game/gear';
import { GearInstance } from '../game/gearInstances';
import { rarityDef } from '../game/rarity';

export const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

// "Steel Greatsword +3 Epic" — the one way an individual weapon / armor is named in the UI (common rarity is
// left out; it is the default).
export function gearInstanceLabel(inst: GearInstance): string {
  const item = getGear(inst.templateId);
  const name = item ? t(`gear.${item.nameKey}`) : inst.templateId;
  const rarity = inst.rarity !== 'common' ? ` ${t(`rarity.${rarityDef(inst.rarity).nameKey}`)}` : '';
  return `${name}${refineTag(inst.upgrade)}${rarity}`;
}
