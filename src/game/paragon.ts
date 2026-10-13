import { MAX_LEVEL, xpForNextLevel, xpToReachLevel } from './engine';
import T from './tunables';

// Paragon: past hero level 100 the XP keeps counting. Each paragon level costs xpShare of the last hero level's XP, growing xpGrowth per level, and gives a tiny permanent damage
// bonus (damagePerLevel), capped at maxBonus in total (50 levels with the shipped numbers). Nothing is stored beyond `xp`: the paragon level is read from it, so an old save loads
// unchanged (a hero below level 100 has paragon level 0 and exactly the stats it always had).

// XP where paragon level 0 begins: the XP that completes hero level 99 -> 100. Memoised on the curve's own numbers (it is read on every combat-stat derivation).
let startMemo: { sig: number; value: number } | null = null;
export function paragonStartXp(): number {
  const p = T.progression;
  const sig = p.xpBase + p.heroBand1To * 3 + p.heroBand2To * 7 + p.heroBand3To * 11 + p.heroBand4To * 13 + p.heroGrowth1 * 17 + p.heroGrowth2 * 19 + p.heroGrowth3 * 23 + p.heroGrowth4 * 29 + p.heroGrowth5 * 31;
  if (!startMemo || startMemo.sig !== sig) startMemo = { sig, value: xpToReachLevel(MAX_LEVEL) };
  return startMemo.value;
}

// XP of paragon level n (n >= 1): from n - 1 to n.
export function paragonLevelXp(n: number): number {
  return Math.max(1, Math.round(xpForNextLevel(MAX_LEVEL - 1) * T.paragon.xpShare * Math.pow(T.paragon.xpGrowth, Math.max(0, n - 1))));
}

export interface ParagonProgress {
  level: number;
  into: number; // XP into the current paragon level
  need: number; // XP the current paragon level asks for
}

export function paragonProgress(xp: number): ParagonProgress {
  let left = (Number.isFinite(xp) ? xp : 0) - paragonStartXp();
  let level = 0;
  if (!(left >= 0)) return { level: 0, into: 0, need: paragonLevelXp(1) };
  for (;;) {
    const need = paragonLevelXp(level + 1);
    if (left < need || level >= 9999) return { level, into: left, need };
    left -= need;
    level++;
  }
}

export const paragonLevel = (xp: number): number => (xp < paragonStartXp() ? 0 : paragonProgress(xp).level);

// The permanent damage bonus (a fraction) of a paragon level, capped.
export const paragonDamageBonus = (level: number): number => Math.min(T.paragon.maxBonus, Math.max(0, level) * T.paragon.damagePerLevel);

// The largest XP a save may hold: hero levels 1 to 100 plus 9999 paragon levels' worth (a tampered giant is clamped on load).
export function maxSaneXp(): number {
  return paragonStartXp() + paragonLevelXp(1) * 1e6;
}
