// The 3-layer stat model, formalized:
//
// Layer 1 — Primaries: STR/VIT/AGI/RES. Points the player spends per level. Unchanged by this file.
//
// Layer 2 — Derived: Max HP, Final Damage, Crit Chance, Crit Multiplier, Damage Reduction (asymptotic,
// hard-capped below 100% by construction — see applyDamageReduction below), Attack Speed. This is the
// layer combat and CP actually run on. Primaries and gear (rarity/refine/gems/substats — Layer 3) only
// ever matter by feeding into these six numbers; nothing reads a primary or a substat directly inside
// combat resolution.
//
// Layer 3 — Substats: rarity-rolled bonuses already living on gear (rarity.ts). They feed Layer 2
// (e.g. a crit-rate substat adds into Crit Chance) and never act independently of it.
//
// This module owns the one piece of Layer-2 math that is genuinely shared today: the damage-reduction
// formula. The rest of Layer 2's *assembly* (deriving Final Damage/Crit Chance/etc. from a save's
// primaries+gear) still lives twice — once inline in BattleModal.tsx's per-tick combat loop, once in
// engine.ts's computeHuntingStatus for the idle Hunting simulation — because unifying that assembly
// into one call site is a structural refactor deliberately deferred until the formula fixes here have
// been simulated and accepted (see the code comments at each site for the explicit "keep these two in
// sync" pointer). Both call applyDamageReduction from here, so this one function can never drift.

// Damage Reduction, Layer 2: `reductionSum` is the existing raw fractional total (effectiveResistance
// contributions + res*perPoint + gem resistance + substat defense — same inputs as before, unchanged).
// The old formula did `damageTaken = raw * (1 - reductionSum)`, which goes to *zero* (or would go
// negative, if not for a floor) once reductionSum reaches 1.0 — trivially reachable by stacking
// RES/gems/refine, confirmed earlier this session as a real, live-triggerable exploit path.
//
// Replaced with the classic RPG/MOBA armor formula (League of Legends, Dota): damage scales down
// asymptotically as resistance grows, so it approaches but can mathematically never reach a 100%
// reduction, no matter how extreme the stacking:
//
//   damageTaken = rawDamage / (1 + reductionSum)
//
// Equivalently `rawDamage * effectiveReductionFraction` where `effectiveReductionFraction =
// reductionSum / (1 + reductionSum)` — e.g. a naive 100% (reductionSum=1) now reduces damage by only
// 50%; a naive 500% (reductionSum=5) reduces it by 83.3%, never by more than that ratio allows.
export function applyDamageReduction(rawDamage: number, reductionSum: number): number {
  const safeSum = Math.max(0, reductionSum);
  return Math.max(1, Math.round(rawDamage / (1 + safeSum)));
}

// Effective HP, Layer 2: how large a raw-damage-only HP pool would need to be to take the same total
// punishment as `maxHp` behind `reductionSum` of resistance — i.e. maxHp scaled by the same asymptotic
// relationship applyDamageReduction uses. This is what makes survivability and resistance interact
// *multiplicatively* instead of as two independent additive terms — the structural fix computeCP needed
// (see engine.ts computeCP) — without needing a specific enemy's damage number to express it.
export function effectiveHp(maxHp: number, reductionSum: number): number {
  return maxHp * (1 + Math.max(0, reductionSum));
}
