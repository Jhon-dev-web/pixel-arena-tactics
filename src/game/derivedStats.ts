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
  // The inputs of heroMs, kept so a timed Haste Tonic can be derived through the same function and floor (buffs.ts hasteIntervalMs). Optional: sessions
  // saved before they existed fall back to dividing heroMs.
  agi?: number;
  speedBonus?: number;
  reduction: number; // raw reductionSum, fed to applyDamageReduction (NOT a mitigation percentage)
  lifesteal: number; // percent of damage dealt healed per hit
  // Gear effects (gear.ts burn / reflect / hpRegenPct): every combat loop reads them through the helpers below, never the items.
  burn: boolean; // each hero hit sets / refreshes a burn on the enemy (igniteBurn)
  reflect: number; // share of the damage the hero actually took that the attacker takes back (reflectedDamage)
  hpRegenPct: number; // max-HP share regenerated per T.battle.effectTickMs of combat (regenAmount)
  // Percent extra Gold from the Dungeon and Hunting (gear goldBonus substats + the Goblin Lucky Coin, already capped at GOLD_BONUS_CAP). No combat effect, no CP.
  goldBonus?: number;
  // Percent extra character XP from the Dungeon, Hunting and delivery orders (the Season Relic). No combat effect, no CP.
  xpBonus?: number;
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
//
// `speedBonus` (a relic's attackSpeedBonus, 0.08 = +8% attacks per second) divides the AGI interval and then goes through the SAME floor, so no
// combination of AGI and bonus can attack faster than heroMinMs. A non-finite / negative bonus counts as 0.
export function heroAttackIntervalMs(rawAgi: number, speedBonus = 0): number {
  const base = T.battle.heroAttackMs;
  const floor = T.battle.heroMinMs;
  const safeAgi = Number.isFinite(rawAgi) ? Math.min(T.battle.agiMax, Math.max(0, Math.floor(rawAgi))) : 0;
  const safeBonus = Number.isFinite(speedBonus) ? Math.max(0, speedBonus) : 0;
  const ms = (floor + (base - floor) / (1 + safeAgi / T.battle.agiHalfPoint)) / (1 + safeBonus);
  return Number.isFinite(ms) ? Math.max(floor, ms) : base;
}

// --- Gear effects over time: burn, reflect, regeneration --------------------------------------------------
// Pure helpers shared by the three combat loops (BattleModal.tsx's frame loop, huntCombat.ts's event loop and scripts/sim/driver.ts's mirror of the
// first), so a number can only be changed here. All times are in the caller's combat clock (ms). Enemies have no mitigation of their own: a burn tick
// is applied to their HP as it is.

// Damage the attacker takes back for a hit the hero actually took (post-mitigation, the number that came off the hero's HP).
export function reflectedDamage(damageTaken: number, reflect: number): number {
  if (!(reflect > 0) || !(damageTaken > 0)) return 0;
  return Math.max(1, Math.round(damageTaken * reflect));
}

// HP the hero regenerates per effect tick (0 without the effect). The caller still caps the result at max HP.
export function regenAmount(maxHp: number, hpRegenPct: number): number {
  if (!(hpRegenPct > 0) || !(maxHp > 0)) return 0;
  return Math.max(1, Math.round(maxHp * hpRegenPct));
}

// One burn on one enemy. It never stacks: a new hit while it burns only pushes `endsAt` out to now + burnDurationMs and takes the newest tick damage; the
// tick grid (`nextTickAt`) keeps its phase, so refreshing on every hit does not delay the damage. null = not burning.
export interface BurnState {
  endsAt: number;
  nextTickAt: number;
  tickDamage: number;
}

// `hitDamage` is the hero's final per-hit damage BEFORE crit (blessed / elixir included): the burn deals burnPctPerSec of it per tick.
export function igniteBurn(prev: BurnState | null, now: number, hitDamage: number): BurnState {
  const tickDamage = Math.max(1, Math.round(hitDamage * T.battle.burnPctPerSec));
  return { endsAt: now + T.battle.burnDurationMs, nextTickAt: prev ? prev.nextTickAt : now + T.battle.effectTickMs, tickDamage };
}

export function nextBurnTickAt(burn: BurnState | null): number {
  return burn ? burn.nextTickAt : Infinity;
}

// The tick due at `burn.nextTickAt`: its damage and the state after it (null once the burn has run out; the last tick may land exactly at endsAt).
export function tickBurn(burn: BurnState): { damage: number; burn: BurnState | null } {
  const next = burn.nextTickAt + T.battle.effectTickMs;
  return { damage: burn.tickDamage, burn: next > burn.endsAt ? null : { ...burn, nextTickAt: next } };
}

// Combat Power core (unscaled): geometric mean of expected DPS and effective HP, times a sustain multiplier.
//   cc    = clamp(critChance, 0, 1)                         (CP-only protection; real combat is not touched)
//   hits  = dmgBase * (1000 / heroMs) * (1 + cc * (critMult - 1))
//   dps   = hits * (1 + reflectW * reflect / (1 + reduction)) + burnW * dmgBase * burnPct * (1000 / tick)     (reflect and burn only when the gear has them)
//   ehp   = maxHp * (1 + reduction)
//   sigma = min(cap, lifesteal% * (1 + reduction) + regenW * regen * (1000 / tick) * ehp / hits)     heal / incoming damage in a symmetric duel
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
  const dmgBase = safeStat(stats.dmgBase, ceiling);
  const hits = dmgBase * (1000 / heroMs) * (1 + cc * (critMult - 1));
  const reduction = safeStat(stats.reduction, ceiling);
  const reflect = safeStat(stats.reflect, 1);
  const burnDps = stats.burn === true ? T.advanced.cpBurnWeight * dmgBase * T.battle.burnPctPerSec * (1000 / T.battle.effectTickMs) : 0;
  const dps = hits * (1 + (T.advanced.cpReflectWeight * reflect) / (1 + reduction)) + burnDps;
  const ehp = effectiveHp(safeStat(stats.maxHp, ceiling), reduction);
  const regen = safeStat(stats.hpRegenPct, 1) * (1000 / T.battle.effectTickMs);
  const regenSigma = hits > 0 ? (T.advanced.cpRegenWeight * regen * ehp) / hits : 0;
  const sigma = Math.min(Math.min(0.95, T.advanced.cpSustainSigmaCap), (safeStat(stats.lifesteal, ceiling) / 100) * (1 + reduction) + regenSigma);
  return Math.sqrt((dps * ehp) / (1 - sigma));
}

export interface CombatModifiers {
  blessedMult: number;
  strengthMult: number;
  attackMult: number; // Attack (Battle) Elixir: 1 when inactive
}

// Same operation order as the pre-refactor inline code: `(sum) * blessedMult * strengthMult`, then the Attack Elixir
// (x1 when inactive, which leaves the result bit-identical).
export function applyDamageModifiers(dmgBase: number, mods: CombatModifiers): number {
  return dmgBase * mods.blessedMult * mods.strengthMult * mods.attackMult;
}
