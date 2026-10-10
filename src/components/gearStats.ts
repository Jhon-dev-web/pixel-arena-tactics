import { activeLocale, t } from '../locales';
import T from '../game/tunables';
import { GearItem, effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance } from '../game/gear';

// The one place a gear piece is turned into its display stat lines (forge cards, inventory detail, equipment panel). Which lines show is
// decided by which fields the template defines, so every slot reads right without per-slot ternaries. Values are the base + refine numbers
// the item cards always showed (rarity, durability and substats are listed separately).
export type GearStatKind = 'damage' | 'maxHp' | 'critChance' | 'critMult' | 'resistance' | 'burn' | 'reflect' | 'regen' | 'attackSpeed' | 'damagePct' | 'lifesteal' | 'gold' | 'xp';

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
  if (item.damagePct) push('damagePct', t('profile.finalDamage'), `+${pct(item.damagePct)}%`);
  if (item.maxHp) push('maxHp', t('profile.hp'), `+${effectiveMaxHp(item, level)}`);
  if (item.critChance) push('critChance', t('profile.critRate'), `+${pct(effectiveCrit(item, level))}%`);
  if (item.critMultBonus) push('critMult', t('profile.critDamage'), `+${pct(item.critMultBonus)}%`);
  if (item.resistance) push('resistance', t('profile.defense'), `+${pct(effectiveResistance(item, level))}%`);
  // Boss relics: lifestealPct and goldBonusPct are already whole percents (3 = 3 %), unlike the 0..1 fractions above.
  if (item.lifestealPct) push('lifesteal', t('profile.lifesteal'), `+${pct(item.lifestealPct / 100)}%`);
  if (item.goldBonusPct) push('gold', t('profile.goldBonus'), `+${pct(item.goldBonusPct / 100)}%`);
  if (item.xpBonusPct) push('xp', t('profile.xpBonus'), `+${pct(item.xpBonusPct / 100)}%`);
  // Effects (gear.ts): one sentence each, built from the same numbers combat reads (tunables / item fields), so they cannot drift from the data.
  const sentence = (kind: GearStatKind, text: string) => out.push({ kind, label: text, value: '', text });
  if (item.burn) sentence('burn', t('profile.burnStat', { pct: pct(T.battle.burnPctPerSec), s: T.battle.burnDurationMs / 1000 }));
  if (item.reflect) sentence('reflect', t('profile.reflectStat', { pct: pct(item.reflect) }));
  if (item.hpRegenPct) sentence('regen', t('profile.regenStat', { pct: pct(item.hpRegenPct) }));
  if (item.attackSpeedBonus) sentence('attackSpeed', t('profile.attackSpeedStat', { pct: pct(item.attackSpeedBonus) }));
  return out;
}
