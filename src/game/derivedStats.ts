import T from './tunables';

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

// Real share of incoming damage negated by a reductionSum: damage / (1 + r) removes r / (1 + r) of it (e.g. r = 0.4337
// -> ~30.25%, NOT 43.37%). Display helper only — combat keeps using applyDamageReduction on the raw sum.
export function mitigationFraction(reductionSum: number): number {
  const r = Number.isFinite(reductionSum) ? Math.max(0, reductionSum) : 0;
  return r / (1 + r);
}

// Effective HP, Layer 2: how large a raw-damage-only HP pool would need to be to take the same total
// punishment as `maxHp` behind `reductionSum` of resistance — i.e. maxHp scaled by the same asymptotic
// relationship applyDamageReduction uses. This is what makes survivability and resistance interact
// *multiplicatively* instead of as two independent additive terms — the structural fix computeCP needed
// (see engine.ts computeCP) — without needing a specific enemy's damage number to express it.
export function effectiveHp(maxHp: number, reductionSum: number): number {
  return maxHp * (1 + Math.max(0, reductionSum));
}

// --- Combat stats: the single source of truth for a hero's derived combat numbers -------------------
//
// `CombatStats` is the Layer-2 result (see the header above) for ONE hero: what the Hunting simulation,
// the Dungeon's BattleModal and computeCP all read. It is built by engine.ts's buildCombatStats /
// buildCombatStats (kept there because it needs playerLevel/playerMaxHp, and engine.ts already
// imports this file — putting the builder here would create an import cycle).
//
// It deliberately holds only PERMANENT derived numbers (primaries + gear: refine, rarity, durability,
// gems, substats, relic crit multiplier). Temporary damage modifiers (blessed, Strength Elixir) are NOT
// baked in: `dmgBase` is the pre-modifier hit, and each caller applies `CombatModifiers` explicitly via
// applyDamageModifiers, at the moment ITS own rules dictate (Hunting: once, at claim time; Dungeon: on
// every hit). Keeping that timing decision at the call site is intentional — it is a known difference
// between the two systems that this module must not hide or change.
export interface CombatStats {
  maxHp: number;
  dmgBase: number; // pre-crit, pre-modifier hit: strengthAdjustedDamage(12.5 + weapon*refine*durability*rarity, STR)
  critChance: number; // 0..1
  critMult: number;
  heroMs: number; // hero attack interval in ms, from heroAttackIntervalMs (AGI, sanitized, floored)
  reduction: number; // raw reductionSum, fed to applyDamageReduction (NOT a mitigation percentage)
  lifesteal: number; // percent of damage dealt healed per hit
}

// STR -> pre-modifier hit damage. Hybrid: a flat part plus a part that scales with (base hit + weapon):
//   dmgBase = (baseHit + W) * (1 + STR * strengthWeaponScalePerPoint) + STR * strengthFlatDamage
// where W is the weapon term already including refine, rarity and durability (see engine.ts deriveCombatStats).
// The flat part keeps STR valuable with weak gear (a fresh character), the scaling part keeps it from
// evaporating against high-tier gear. The result is dmgBase: blessed / Strength Elixir / crit are applied
// AFTER it, as before — never fold STR in after them.
// STR is sanitized here (the single derivation point): non-finite -> 0, floored, minimum 0, and capped by
// strengthOverflowGuard purely so the arithmetic can never overflow to Infinity. No points-budget rule.
export function strengthAdjustedDamage(baseHitPlusWeapon: number, rawStr: number): number {
  const str = Number.isFinite(rawStr) ? Math.min(T.advanced.strengthOverflowGuard, Math.max(0, Math.floor(rawStr))) : 0;
  return baseHitPlusWeapon * (1 + str * T.advanced.strengthWeaponScalePerPoint) + str * T.advanced.strengthFlatDamage;
}

// AGI -> hero attack interval (ms). Hyperbolic with a hard floor:
//   heroMs = floor + (base - floor) / (1 + AGI / halfPoint)      (defaults: 400 + 800 / (1 + AGI / 100))
// AGI 0 = 1200 ms, 100 = 800 ms, 300 = 600 ms, asymptote 400 ms: strictly diminishing returns and never <= 0.
// The input is sanitized HERE (the single derivation point) rather than trusted from the save: non-finite
// -> 0, floored, clamped to [0, agiMax]. The result is also guarded: if it is somehow non-finite (e.g. a
// bad tunable) it falls back to the base interval, and it is never below the floor.
export function heroAttackIntervalMs(rawAgi: number): number {
  const base = T.battle.heroAttackMs;
  const floor = T.battle.heroMinMs;
  const safeAgi = Number.isFinite(rawAgi) ? Math.min(T.battle.agiMax, Math.max(0, Math.floor(rawAgi))) : 0;
  const ms = floor + (base - floor) / (1 + safeAgi / T.battle.agiHalfPoint);
  return Number.isFinite(ms) ? Math.max(floor, ms) : base;
}

// Combat Power core (unscaled): geometric mean of expected DPS and effective HP, times a sustain multiplier.
//   cc    = clamp(critChance, 0, 1)                         (CP-only protection; real combat is not touched)
//   dps   = dmgBase * (1000 / heroMs) * (1 + cc * (critMult - 1))
//   ehp   = maxHp * (1 + reduction)
//   sigma = min(cap, lifesteal% * (1 + reduction))          heal / incoming damage in a symmetric duel
//   core  = sqrt(dps * ehp / (1 - sigma))                   computeCP = round(CP_SCALE * core)
// Input is the PERMANENT effective CombatStats (buildCombatStats: gear, refine, rarity, durability, gems, substats,
// relic crit multiplier) — never blessed / Strength Elixir / potions. Every input is sanitized here (non-finite ->
// 0, negatives -> 0, capped by cpInputCeiling) so a tampered save can never yield NaN, Infinity or a negative CP.
function safeStat(x: number, max: number): number {
  return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0;
}

export function combatPowerCore(stats: CombatStats): number {
  const ceiling = T.advanced.cpInputCeiling;
  const cc = safeStat(stats.critChance, 1);
  const critMult = Math.max(1, safeStat(stats.critMult, ceiling));
  const heroMs = Number.isFinite(stats.heroMs) && stats.heroMs > 0 ? stats.heroMs : T.battle.heroAttackMs;
  const dps = safeStat(stats.dmgBase, ceiling) * (1000 / heroMs) * (1 + cc * (critMult - 1));
  const reduction = safeStat(stats.reduction, ceiling);
  const ehp = effectiveHp(safeStat(stats.maxHp, ceiling), reduction);
  const sigma = Math.min(Math.min(0.95, T.advanced.cpSustainSigmaCap), (safeStat(stats.lifesteal, ceiling) / 100) * (1 + reduction));
  return Math.sqrt((dps * ehp) / (1 - sigma));
}

export interface CombatModifiers {
  blessedMult: number;
  strengthMult: number;
}

// Same operation order as the pre-refactor inline code: `(sum) * blessedMult * strengthMult`.
export function applyDamageModifiers(dmgBase: number, mods: CombatModifiers): number {
  return dmgBase * mods.blessedMult * mods.strengthMult;
}
