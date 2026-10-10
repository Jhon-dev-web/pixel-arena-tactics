import { activeLocale, t } from '../locales';
import { GearItem, effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance } from '../game/gear';

// The one place a gear piece is turned into its display stat lines (forge cards, inventory detail, equipment panel). Which lines show is
// decided by which fields the template defines, so every slot reads right without per-slot ternaries. Values are the base + refine numbers
// the item cards always showed (rarity, durability and substats are listed separately).
export type GearStatKind = 'damage' | 'maxHp' | 'critChance' | 'critMult' | 'resistance';

export interface GearStatLine {
  kind: GearStatKind;
  label: string;
  value: string; // "+20", "+3.5%"
  text: string; // "+20 PV"
}

const pct = (frac: number): string => {
  const p = `${Math.round(frac * 1000) / 10}`;
  return activeLocale === 'pt' ? p.replace('.', ',') : p;
};

export function gearStatLines(item: GearItem, level = 0): GearStatLine[] {
  const out: GearStatLine[] = [];
  const push = (kind: GearStatKind, label: string, value: string) => out.push({ kind, label, value, text: `${value} ${label}` });
  if (item.damage) push('damage', t('profile.damage'), `+${effectiveDamage(item, level)}`);
  if (item.maxHp) push('maxHp', t('profile.hp'), `+${effectiveMaxHp(item, level)}`);
  if (item.critChance) push('critChance', t('profile.critRate'), `+${pct(effectiveCrit(item, level))}%`);
  if (item.critMultBonus) push('critMult', t('profile.critDamage'), `+${pct(item.critMultBonus)}%`);
  if (item.resistance) push('resistance', t('profile.defense'), `+${pct(effectiveResistance(item, level))}%`);
  return out;
}
