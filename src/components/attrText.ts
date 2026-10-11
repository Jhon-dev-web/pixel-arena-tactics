import { activeLocale, t } from '../locales';
import { AttrKey, attributeParams } from '../game/attributes';
import { SaveData } from '../game/engine';
import T from '../game/tunables';

// 0.35 -> "0.35", 3 -> "3", 0.30 -> "0.3": up to three decimals (the trigger values are small), no trailing zeros, the active language's separator.
export function fmtAttrNumber(n: number): string {
  const s = String(Number(n.toFixed(3)));
  return activeLocale === 'pt' ? s.replace('.', ',') : s;
}

// The one-line description of an attribute for this hero, every number filled from the data (game/attributes.ts), never typed into the locale text.
export function attrText(attr: AttrKey, save: SaveData): string {
  // at the AGI cap there is no next point to describe
  if (attr === 'agi' && save.agi >= T.battle.agiMax) return t('attributes.agiDescMax', { max: fmtAttrNumber(T.battle.agiMax) });
  const params = Object.fromEntries(Object.entries(attributeParams(attr, save)).map(([k, v]) => [k, fmtAttrNumber(v)]));
  return t(`attributes.${attr}Desc`, params);
}
