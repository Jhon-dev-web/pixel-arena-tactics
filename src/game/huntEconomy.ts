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

// Rodada 31: hero XP is paid PER KILL, and a pace fraction (the same shape as the material one above, with its own reference pace per zone and cap) keeps a build that kills many times faster
// than the reference from running away with the levels. A kill is worth its monster's size, hpRel = the HP of the enemy that fell / the HP of the zone's reference monster at the depth it is
// hunted at (1 at sub-level 1, 1.72 at sub-level 10, more in a League wave or a Target), so what is compared with the reference is the monster HP a hero takes down per hour:
//
//   x = killsPerHour x hpRel / K        K = the zone's xpRefKph (kills/h of the reference monster by a hero exactly at the zone's recommended CP; T.hunting.xpReferenceKillsPerHour if absent)
//   XP/h = zone rate x x                         for x <= 1   (every kill pays in full: a faster hero earns proportionally more)
//   XP/h = zone rate x min(xpPaceCap, sqrt(x))   for x > 1    (the extra speed pays less and less, up to xpPaceCap)
//
// which is, per kill, the fraction  f = min(1, sqrt(K / (kph x hpRel)), xpPaceCap x K / (kph x hpRel)).  A zone's `xpPerKill` times K is the XP an hour of a hero exactly at the reference
// pace earns (zoneReferenceXpPerHour), the rate the zones paid by fight time before this round.

// Pace fraction of one won fight (one kill per `fightMs`) of a monster of size `hpRel`, in [0, 1]. A non-positive / NaN duration cannot happen in real combat; it counts as an infinitely fast fight (0).
export function xpPaceFractionForFight(fightMs: number, hpRel: number, refKph: number = T.hunting.xpReferenceKillsPerHour): number {
  const kRef = Math.max(1, refKph);
  const kph = fightMs > 0 ? MS_PER_HOUR / fightMs : Infinity;
  const pace = kph * Math.max(0, Number.isFinite(hpRel) ? hpRel : 0); // reference-monster kills per hour
  if (pace <= kRef) return 1;
  if (pace === Infinity) return 0;
  return Math.min(1, Math.sqrt(kRef / pace), (Math.max(1, T.hunting.xpPaceCap) * kRef) / pace);
}

// The most XP an hour of one zone's kills can pay, as a multiple of the zone's reference-pace rate (the server bounds use it).
export function huntingXpPaceCap(): number {
  return Math.max(1, T.hunting.xpPaceCap);
}
