import { MAX_LEVEL, xpForNextLevelWith, xpToReachLevel } from './engine';
import { paragonLevelXp } from './paragon';
import T from './tunables';

// Round 15: the hero XP curve above level 60 was made far cheaper (bands 4 and 5 grow 3% a level instead of 21% / 27%), see docs/BALANCE_CHANGES.md. The XP of a save is one
// number and the level is read from it, so an older save would suddenly read a much higher level. This file keeps the old curve and maps an older save's XP onto the new one so
// that it keeps the level it had and the same share of that level (levels 1 to 60 are identical on both curves: their XP is left exactly as it is).

// The save stamp: a save written with the current curve carries it, a save from before has none (curve 1) or an older number.
// 1 = until Round 15 (bands 4 and 5 grew 21% / 27% a level); 2 = Round 15 to 19 (both 3%); 3 = Rodada 20, the League (band 4 grows 2.3% a level, band 5 3%): hero XP now comes only from
// Hunting (+25% with the Knowledge Elixir), and the top of the curve was set so the fastest Pass owner is level 90 to 92 on day 60 and nobody reaches 100.
// 4 = Rodada 28: the first levels cost more (levels 2 to 16 ask 3x, gone at level 27, tunables progression.heroEarly*); every curve before it has none of that, so every older save is mapped onto the
// current curve keeping its level and its share of the level (a hero of level 40 has more XP afterwards, never fewer levels).
export const XP_CURVE_VERSION = 4;

// What the saves stamped 2 used for bands 4 and 5 (the live tunables of Round 15 to 19).
const V2_GROWTH_4 = 1.03;
const V2_GROWTH_5 = 1.03;

// What the saves stamped 3 used (Rodada 20 to 27): the live growths, and no early multiplier.
const v3Need = (level: number): number => xpForNextLevelWith(level, { early: false });

// The curve the saves written before the stamp used (heroGrowth4 / heroGrowth5 of that time; the other bands are the live tunables, which did not change; no early multiplier).
const LEGACY_GROWTH_4 = 1.21;
const LEGACY_GROWTH_5 = 1.27;
const legacyNeed = (level: number): number => xpForNextLevelWith(level, { growth4: LEGACY_GROWTH_4, growth5: LEGACY_GROWTH_5, early: false });

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

// A save stamped 2 (the curve of Round 15 to 19): the same level and the same share of it on the current curve, so changing the curve costs nobody a level. At level 100 and beyond the paragon progress is kept as whole paragon levels of the current price.
const v2Need = (level: number): number => xpForNextLevelWith(level, { growth4: V2_GROWTH_4, growth5: V2_GROWTH_5, early: false });
export function migrateV2Xp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  let left = xp;
  let level = 1;
  while (level < MAX_LEVEL && left >= v2Need(level)) {
    left -= v2Need(level);
    level++;
  }
  if (level < MAX_LEVEL) return Math.floor(xpToReachLevel(level) + (left / v2Need(level)) * xpForNextLevelWith(level, {}));
  const v2Paragon = (n: number) => Math.max(1, Math.round(v2Need(MAX_LEVEL - 1) * T.paragon.xpShare * Math.pow(T.paragon.xpGrowth, Math.max(0, n - 1))));
  let n = 0;
  while (left >= v2Paragon(n + 1) && n < 9999) {
    left -= v2Paragon(n + 1);
    n++;
  }
  let total = xpToReachLevel(MAX_LEVEL);
  for (let i = 1; i <= n; i++) total += paragonLevelXp(i);
  return Math.floor(total + (left / v2Paragon(n + 1)) * paragonLevelXp(n + 1));
}

// A save stamped 3 (Rodada 20 to 27): the same level and the same share of it on the current curve (the early levels got dearer). At level 100 and beyond the paragon progress is kept as whole
// paragon levels (their price did not change: it follows the cost of level 99, which the early multiplier does not touch).
export function migrateV3Xp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  let left = xp;
  let level = 1;
  while (level < MAX_LEVEL && left >= v3Need(level)) {
    left -= v3Need(level);
    level++;
  }
  if (level < MAX_LEVEL) return Math.floor(xpToReachLevel(level) + (left / v3Need(level)) * xpForNextLevelWith(level, {}));
  let n = 0;
  while (left >= paragonLevelXp(n + 1) && n < 9999) {
    left -= paragonLevelXp(n + 1);
    n++;
  }
  let total = xpToReachLevel(MAX_LEVEL);
  for (let i = 1; i <= n; i++) total += paragonLevelXp(i);
  return Math.floor(total + (left / paragonLevelXp(n + 1)) * paragonLevelXp(n + 1));
}
