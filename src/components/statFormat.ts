import { activeLocale, t } from '../locales';
import { BUFF_ITEM } from '../game/buffs';
import { mitigationFraction } from '../game/derivedStats';
import { formatNumber } from '../game/engine';
import { BreakdownLine, MULTIPLYING, SourceId, StatId } from '../game/statBreakdown';
import T from '../game/tunables';

// How the hero panel, the breakdown and the "with this item" lines write the numbers of game/statBreakdown.ts. One place, so the three of them can never word a stat differently.

export const fmtDec = (n: number, digits = 1, trim = true): string => {
  const s = trim ? String(Number(n.toFixed(digits))) : n.toFixed(digits);
  return activeLocale === 'pt' ? s.replace('.', ',') : s;
};

export const STAT_ICON: Record<StatId, string> = { maxHp: '❤️', damage: '⚔️', critChance: '💥', critMult: '🔥', defense: '🛡️', attackSpeed: '⚡', lifesteal: '🩸', regen: '💚', reflect: '🪞', gold: '🪙', xp: '📘' };

export const statName = (id: StatId): string => t(`statsPanel.stat_${id}`);

// The value a stat is SHOWN as (the panel's total). Defense is the share of damage it removes, not the raw sum the items and lines add up in.
export function fmtStat(id: StatId, raw: number): string {
  switch (id) {
    case 'maxHp':
      return formatNumber(Math.round(raw));
    case 'damage':
      return formatNumber(Math.round(raw));
    case 'critChance':
      return `${fmtDec(raw * 100)}%`;
    case 'critMult':
      return `${Math.round(raw * 100)}%`;
    case 'defense':
      return `${fmtDec(mitigationFraction(raw) * 100)}%`;
    case 'attackSpeed':
      return `${fmtDec(raw, 2, false)} ${t('profile.attackSpeedUnit')}`;
    case 'regen':
      return `${fmtDec(raw * (1000 / T.battle.effectTickMs) * 100, 2)}%/s`;
    case 'reflect':
      return `${fmtDec(raw * 100)}%`;
    case 'lifesteal':
    case 'gold':
    case 'xp':
      return `${fmtDec(raw)}%`;
  }
}

const sign = (n: number): string => (n < 0 ? '−' : '+');

// A difference of `id` in its raw unit (what the lines add up in). Defense stays in resistance points here, as the items write it.
export function fmtDelta(id: StatId, delta: number): string {
  const a = Math.abs(delta);
  switch (id) {
    case 'maxHp':
      return `${sign(delta)}${formatNumber(Math.round(a))}`;
    case 'damage':
      return `${sign(delta)}${fmtDec(a, a < 10 ? 1 : 0)}`;
    case 'critChance':
    case 'defense':
    case 'reflect':
      return `${sign(delta)}${fmtDec(a * 100)}%`;
    case 'critMult':
      return `${sign(delta)}${Math.round(a * 100)}%`;
    case 'attackSpeed':
      return `${sign(delta)}${fmtDec(a, 2, false)} ${t('profile.attackSpeedUnit')}`;
    case 'regen':
      return `${sign(delta)}${fmtDec(a * (1000 / T.battle.effectTickMs) * 100, 2)}%/s`;
    case 'lifesteal':
    case 'gold':
    case 'xp':
      return `${sign(delta)}${fmtDec(a)}%`;
  }
}

export const fmtFactor = (f: number): string => `×${fmtDec(f, 3)}`;

// One line of the breakdown: a multiplying source is written as the factor the engine applies, the rest as the amount they add.
export function fmtLine(id: StatId, line: BreakdownLine): string {
  if (line.source !== 'character' && MULTIPLYING[id]?.includes(line.source) && Math.abs(line.factor - 1) > 1e-9) return fmtFactor(line.factor);
  return fmtDelta(id, line.delta);
}

// "1:23" / "1h 05m": the time left of a running effect.
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ITEM_OF_KIND = Object.fromEntries(Object.entries(BUFF_ITEM).map(([item, kind]) => [kind, item]));

export function sourceLabel(source: SourceId): string {
  switch (source) {
    case 'character':
    case 'gems':
    case 'set':
    case 'skills':
    case 'paragon':
    case 'pass':
    case 'blessed':
      return t(`statsPanel.src_${source}`);
    case 'weapon':
    case 'armor':
    case 'helmet':
    case 'gloves':
    case 'boots':
    case 'ring':
    case 'shield':
    case 'relic':
      return t(`gear.${source}`);
    default:
      return ITEM_OF_KIND[source] ? t(`consumables.${ITEM_OF_KIND[source]}`) : String(source);
  }
}
