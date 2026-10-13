import { MAX_LEVEL, xpForNextLevelWith, xpToReachLevel } from './engine';
import { paragonLevelXp } from './paragon';

// Round 15: the hero XP curve above level 60 was made far cheaper (bands 4 and 5 grow 3% a level instead of 21% / 27%), see docs/BALANCE_CHANGES.md. The XP of a save is one
// number and the level is read from it, so an older save would suddenly read a much higher level. This file keeps the old curve and maps an older save's XP onto the new one so
// that it keeps the level it had and the same share of that level (levels 1 to 60 are identical on both curves: their XP is left exactly as it is).

// The save stamp: a save written with the new curve carries it, a save from before has none.
export const XP_CURVE_VERSION = 2;

// The curve the saves written before the stamp used (heroGrowth4 / heroGrowth5 of that time; the other bands are the live tunables, which did not change).
const LEGACY_GROWTH_4 = 1.21;
const LEGACY_GROWTH_5 = 1.27;
const legacyNeed = (level: number): number => xpForNextLevelWith(level, { growth4: LEGACY_GROWTH_4, growth5: LEGACY_GROWTH_5 });

// First level whose cost differs between the two curves (the cost of level 60 -> 61 is the first of band 4).
const FIRST_CHANGED_LEVEL = 60;

// Where an older save's XP sits on the old curve: its level (1 to 100, 100 meaning "at least") and how far into that level, as a 0..1 share (0 at 100 and above).
export function legacyLevelProgress(xp: number): { level: number; share: number; past100: number } {
  let left = Number.isFinite(xp) && xp > 0 ? xp : 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    const need = legacyNeed(level);
    if (left < need) return { level, share: left / need, past100: 0 };
    left -= need;
  }
  return { level: MAX_LEVEL, share: 0, past100: left };
}

// The XP an older save has on the new curve: the same level and the same share of it. Past level 100 the leftover XP counts as paragon progress at the new price of a paragon
// level (nobody could have had any: the old level 100 cost 3.3 billion XP), the whole paragon levels it pays being kept.
export function migrateLegacyXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  const { level, share, past100 } = legacyLevelProgress(xp);
  if (level <= FIRST_CHANGED_LEVEL) return xp;
  if (level < MAX_LEVEL) return Math.floor(xpToReachLevel(level) + share * xpForNextLevelWith(level, {}));
  // level 100 and beyond: whole paragon levels of the old price kept as levels of the new one
  const oldParagon = (n: number) => Math.max(1, Math.round(legacyNeed(MAX_LEVEL - 1) * 0.05 * Math.pow(1.015, Math.max(0, n - 1))));
  let left = past100;
  let n = 0;
  while (left >= oldParagon(n + 1) && n < 9999) {
    left -= oldParagon(n + 1);
    n++;
  }
  let total = xpToReachLevel(MAX_LEVEL);
  for (let i = 1; i <= n; i++) total += paragonLevelXp(i);
  return Math.floor(total + (left / oldParagon(n + 1)) * paragonLevelXp(n + 1));
}
