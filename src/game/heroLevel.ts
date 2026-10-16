import T from './tunables';

// The hero level curve (Modelo C), a leaf module: engine.ts re-exports it.
export const MAX_LEVEL = 100;

// Modelo C hero curve (5 bands, see tunables.ts progression.heroBand*/heroGrowth* for the rationale).
// Each band's `base` is the previous band's own need() evaluated at its last level, so the curve is
// continuous at every boundary (no jump): xpForNextLevel(heroBand1To) and xpForNextLevel(heroBand1To+1)
// are equal, then band 2's own growth takes over from there. Band 1 starts at T.progression.xpBase (100).
// `override` (xpCurve.ts) replaces the growth of bands 4 and 5 to rebuild the curve saves had before Round 15.
function heroBandTable(override: { growth4?: number; growth5?: number } = {}): { from: number; base: number; growth: number }[] {
  const p = T.progression;
  const bounds = [1, p.heroBand1To + 1, p.heroBand2To + 1, p.heroBand3To + 1, p.heroBand4To + 1];
  const growths = [p.heroGrowth1, p.heroGrowth2, p.heroGrowth3, override.growth4 ?? p.heroGrowth4, override.growth5 ?? p.heroGrowth5];
  const bands: { from: number; base: number; growth: number }[] = [];
  let base = p.xpBase;
  for (let i = 0; i < bounds.length; i++) {
    bands.push({ from: bounds[i], base, growth: growths[i] });
    if (i + 1 < bounds.length) base *= Math.pow(growths[i], bounds[i + 1] - 1 - bounds[i]);
  }
  return bands;
}

export function xpForNextLevelWith(level: number, override: { growth4?: number; growth5?: number }): number {
  const bands = heroBandTable(override);
  let band = bands[0];
  for (const b of bands) {
    if (b.from > level) break;
    band = b;
  }
  return Math.round(band.base * Math.pow(band.growth, level - band.from));
}

export function xpForNextLevel(level: number): number {
  return xpForNextLevelWith(level, {});
}

export function xpToReachLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForNextLevel(l);
  return total;
}

export function playerLevel(xp: number): number {
  let level = 1;
  let total = 0;
  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (xp < total + need) return level;
    total += need;
    level++;
  }
  return MAX_LEVEL;
}
