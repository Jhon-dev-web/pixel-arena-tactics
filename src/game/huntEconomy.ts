import T from './tunables';
import { sanitizeSubLevel } from './huntingZones';

// Economic normalization of Hunting material rolls ("Modelo C").
//
// Combat speed and material emission are deliberately separate: a strong build keeps killing at its real
// pace (kills, XP, Gold and promotion progress are never touched), but material rolls follow
//
//   x = killsPerHour / K_ref
//   rolls/h = min(killsPerHour, K_ref x min(cap, sqrt(x)))
//
// which is, per kill, the fraction  f = min(1, sqrt(K_ref / kph), cap x K_ref / kph).
// No floor and no boost: a build at or below the reference pace keeps every roll, and rolls never exceed
// real kills. K_ref shrinks with the sub-level exactly like enemy HP does (same subLevelHpGrowth), so a
// build that is "adequate" stays at x ~ 1 on every sub-level.
//
// The engine applies f per WON fight, using that fight's own pace (3600000 / fight duration) and the
// sub-level of the enemy that was defeated — see rollDropsForOneClear in huntCombat.ts. Summed over a
// session this reproduces the per-hour formula (exactly in the capped region, ~<1% under the sqrt region)
// while staying causal, so it is correct even when a session climbs through several sub-levels.

const MS_PER_HOUR = 3600 * 1000;

// Reference kills/h for a sub-level (sanitized 1..T.hunting.subLevels).
export function huntingEconomicKRef(subLevel: number): number {
  const base = Math.max(1, T.hunting.economicReferenceKillsPerHour);
  return base / (1 + Math.max(0, T.hunting.subLevelHpGrowth) * (sanitizeSubLevel(subLevel) - 1));
}

function economicCap(): number {
  return Math.max(1, T.hunting.economicRollCap);
}

// Kills/h -> pace, safely: NaN / negative / 0 count as "no pace" (0); +Infinity stays Infinity.
function safeKillsPerHour(killsPerHour: number): number {
  if (Number.isNaN(killsPerHour) || killsPerHour <= 0) return 0;
  return killsPerHour;
}

// min(cap, sqrt(x)) with x = kills/h / K_ref. Finite for every finite input; Infinity pace -> cap.
export function economicRollMultiplier(killsPerHour: number, kRef: number): number {
  const k = safeKillsPerHour(killsPerHour);
  if (!(kRef > 0)) return 0;
  return Math.min(economicCap(), Math.sqrt(k / kRef));
}

// Fraction of real kills that becomes an economic roll, always in [0, 1].
// kills/h <= K_ref (including NaN, negative, 0) -> exactly 1. +Infinity pace -> 0 (limit of cap x K_ref / kph).
export function economicRollFraction(killsPerHour: number, kRef: number): number {
  const k = safeKillsPerHour(killsPerHour);
  if (!(kRef > 0) || k <= kRef) return 1;
  if (k === Infinity) return 0;
  return Math.min(1, Math.sqrt(kRef / k), (economicCap() * kRef) / k);
}

// Fraction for one won fight: pace = one kill per `fightMs`, on the sub-level of the defeated enemy.
// A non-positive / NaN duration cannot happen in real combat; it is treated as an infinitely fast fight
// (fraction 0) so a broken value can never mint extra rolls.
export function economicRollFractionForFight(fightMs: number, subLevel: number): number {
  const kph = fightMs > 0 ? MS_PER_HOUR / fightMs : Infinity;
  return economicRollFraction(kph, huntingEconomicKRef(subLevel));
}
