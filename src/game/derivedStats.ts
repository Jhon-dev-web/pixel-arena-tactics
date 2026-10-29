import T from './tunables';
// TYPES ONLY: abilities.ts imports this file (igniteBurn, tickBurn), so this one must never import a value from it (a cycle with values both ways breaks on evaluation order). engine.ts, which knows both, computes the rotation terms.
import type { AbilityId, RotationCp } from './abilities';

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
  // Percent extra character XP from Hunting (the Season Relic, Aprendiz Veloz). No combat effect, no CP.
  xpBonus?: number;
  // Hero skills (heroSkills.ts). Each is present only when the hero has the skill, so a hero without skills has exactly the stats it always had.
  bleed?: number; // share of the (pre-crit) hit the enemy bleeds per second (Sangria); a second effect beside burn
  strikes?: StrikeStats; // the auto-triggered strikes (Golpe Esmagador / Furia / Duplo / Contra-ataque / Devastador), see resolveHeroHit
  block?: number; // chance that an enemy hit is blocked completely (Bloqueio)
  bastion?: boolean; // Ultimo Bastiao: a lethal hit leaves the hero at 1 HP and heals (bastionHp)
  bossReduction?: number; // share of the damage taken on boss / checkpoint floors negated (Postura Firme: Dungeon boss floors, plus Hunting promotion and Target fights)
  skillGold?: number; // percent extra Gold from Ganancia, outside the gear cap (like the tonic and the Pass)
  matMult?: number; // Hunting material yield multiplier (Faro); uniques and relics never see it
  uniqueMult?: number; // Hunting unique drop chance multiplier (Sorte Grande)
  bossLootMult?: number; // Dungeon boss unique / relic chance multiplier (Sorte Grande)
  // Equipment abilities (abilities.ts): the rotation of the hero, in order of priority, already limited to what his worn gear grants. Present only when it is not empty, so a hero without one has exactly the stats it always had.
  rotation?: AbilityId[];
  // Multiplier of every ability cooldown (abilities.ts abilityCdScale: the cooldowns are in average swings). Present only with a rotation and when it is not 1 (level 100 and up).
  cdScale?: number;
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
//   heroMs = floor + (base - floor) / (1 + AGI / halfPoint)      (defaults: 400 + 800 / (1 + AGI / 80))
// AGI 0 = 1200 ms, 80 = 800 ms, 300 = 568 ms, asymptote 400 ms: strictly diminishing returns and never <= 0.
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
// Sangria (the skill) is a SECOND effect of the same shape, kept in its own state: the same helpers with its own share and duration (bleedSpec).
export interface DotSpec {
  pctPerSec: number;
  durationMs: number;
}
export const bleedSpec = (pctPerSec: number): DotSpec => ({ pctPerSec, durationMs: T.heroSkills.bleedDurationMs });
export function igniteBurn(prev: BurnState | null, now: number, hitDamage: number, spec?: DotSpec): BurnState {
  const tickDamage = Math.max(1, Math.round(hitDamage * (spec ? spec.pctPerSec : T.battle.burnPctPerSec)));
  return { endsAt: now + (spec ? spec.durationMs : T.battle.burnDurationMs), nextTickAt: prev ? prev.nextTickAt : now + T.battle.effectTickMs, tickDamage };
}

export function nextBurnTickAt(burn: BurnState | null): number {
  return burn ? burn.nextTickAt : Infinity;
}

// The tick due at `burn.nextTickAt`: its damage and the state after it (null once the burn has run out; the last tick may land exactly at endsAt).
export function tickBurn(burn: BurnState): { damage: number; burn: BurnState | null } {
  const next = burn.nextTickAt + T.battle.effectTickMs;
  return { damage: burn.tickDamage, burn: next > burn.endsAt ? null : { ...burn, nextTickAt: next } };
}

// --- Hero skills in combat (heroSkills.ts): small pure helpers, shared by the three combat loops like the effects above ---------------------------------------

// The hero auto-triggered strikes (heroSkills.ts). Present only when the hero has at least one. Counted over the whole Dungeon run / Hunting session by a StrikeState.
export interface StrikeStats {
  crushEvery?: number; // Golpe Esmagador: every Nth hit is a crushing blow
  crushBonus?: number; // ... dealing 1 + this damage
  devastating?: boolean; // Golpe Devastador: every devastatingEvery-th crush deals devastatingMult x instead of its bonus
  furyPct?: number; // Golpe de Furia: every furyEveryMs of combat, furyHits extra hits of this share of the hit
  counter?: number; // Contra-ataque: the next hit after a block deals 1 + this damage
  doubleChance?: number; // Golpe Duplo: chance of an echo strike (doubleDmgPct of the hit)
}
export interface StrikeState {
  hits: number;
  crushes: number;
  counterReady: boolean;
}
export const newStrikeState = (): StrikeState => ({ hits: 0, crushes: 0, counterReady: false });

export interface HitResolution {
  mult: number; // multiplies the hit (before the crit multiplier): crushMult x counterMult
  crushMult: number;
  counterMult: number;
  crush: boolean;
  devastating: boolean;
  counter: boolean;
  double: boolean; // an echo strike of doubleDmgPct of the hit follows
}

// One hero hit: advances the hit counter (the Esmagador counter; the Furia flurry never calls this) and says which strikes it carries. roll draws the Golpe Duplo chance only when
// the hero has it (the Dungeon passes Math.random, Hunting its own seeded stream), so a hero without it never consumes a number.
export function resolveHeroHit(state: StrikeState, s: StrikeStats | undefined, roll: () => number): HitResolution {
  state.hits++;
  const out: HitResolution = { mult: 1, crushMult: 1, counterMult: 1, crush: false, devastating: false, counter: false, double: false };
  if (!s) return out;
  if (s.crushEvery && state.hits % s.crushEvery === 0) {
    out.crush = true;
    state.crushes++;
    if (s.devastating && state.crushes % T.heroSkills.devastatingEvery === 0) {
      out.devastating = true;
      out.crushMult = T.heroSkills.devastatingMult;
    } else out.crushMult = 1 + (s.crushBonus ?? 0);
  }
  if (state.counterReady) {
    state.counterReady = false;
    out.counter = true;
    out.counterMult = 1 + (s.counter ?? 0);
  }
  out.mult = out.crushMult * out.counterMult;
  if (s.doubleChance && roll() < s.doubleChance) out.double = true;
  return out;
}

// A hit on the hero was blocked: with Contra-ataque the next hit of the hero is the counter.
export function registerBlock(state: StrikeState, s: StrikeStats | undefined): void {
  if (s?.counter) state.counterReady = true;
}

// Damage of one hit of the Furia flurry from the hit it follows (pre-crit, modifiers included).
export const furyHitDamage = (hitBase: number, s: StrikeStats | undefined): number => (s?.furyPct ? Math.max(1, Math.round(hitBase * s.furyPct)) : 0);
// The echo of a Golpe Duplo.
export const echoDamage = (dmg: number): number => Math.max(1, Math.round(dmg * T.heroSkills.doubleDmgPct));

// Display-only counters of what each strike did (the result screens): times it triggered and damage it dealt.
export type StrikeTallyId = 'w_heavy_blow' | 'w_fury' | 'w_devastating_strike' | 'g_block' | 'h_light_step' | 'w_bleed';
export type StrikeTally = Partial<Record<StrikeTallyId, { n: number; dmg: number }>>;
export function tally(t: StrikeTally, id: StrikeTallyId, dmg: number): void {
  const e = (t[id] ??= { n: 0, dmg: 0 });
  e.n++;
  e.dmg += dmg;
}

// HP the hero is left with when Ultimo Bastiao saves it: 1 HP plus the heal.
export function bastionHp(maxHp: number): number {
  return Math.min(maxHp, 1 + Math.round(maxHp * T.heroSkills.bastionHealPct));
}

// Damage taken on a boss / checkpoint floor with Postura Firme (never below 1).
export function bossDamage(damage: number, bossReduction: number | undefined): number {
  return bossReduction && bossReduction > 0 ? Math.max(1, Math.round(damage * (1 - Math.min(0.9, bossReduction)))) : damage;
}

// Crit chance is held at 100 % (it is a probability), and what a hero stacks past it is NOT thrown away: it comes back as crit multiplier. At 100 % one more point of chance would have been worth
// (critMult - 1) points of damage; `share` of that is paid as multiplier instead (T.combat.critOverflowShare), so critMult' = critMult + share * excess * (critMult - 1). A hero at exactly 100 % (or below) gets nothing:
// the result is the multiplier it already had. buildCombatStats is the only caller and feeds BOTH the fight and the CP (combatPowerCore reads the stats it returns), so neither can disagree with the other.
export function critOverflow(rawChance: number, critMult: number, share: number = T.combat.critOverflowShare): { chance: number; mult: number } {
  const excess = Number.isFinite(rawChance) ? Math.max(0, rawChance - 1) : 0;
  return { chance: Math.min(1, rawChance), mult: critMult + share * excess * Math.max(0, critMult - 1) };
}

// Combat Power core (unscaled): geometric mean of expected DPS and effective HP, times a sustain multiplier.
//   cc    = clamp(critChance, 0, 1)                         (the chance arrives already held at 1 by buildCombatStats, whose excess is in critMult; this clamp only protects against a tampered save)
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

// `rot`: what the hero's rotation is worth (abilities.ts rotationCpTerms, computed by engine.cpOfStats); null = no rotation, and every line below is the closed form it always was.
// `rot` is REQUIRED on purpose (no default): a caller that forgets it would get a CP that silently ignores the rotation. Pass null explicitly when the rotation is to be left out.
export function combatPowerCore(stats: CombatStats, rot: RotationCp | null): number {
  const ceiling = T.advanced.cpInputCeiling;
  const cc = safeStat(stats.critChance, 1);
  const critMult = Math.max(1, safeStat(stats.critMult, ceiling));
  const heroMs = Number.isFinite(stats.heroMs) && stats.heroMs > 0 ? stats.heroMs : T.battle.heroAttackMs;
  const dmgBase = safeStat(stats.dmgBase, ceiling);
  const hits = dmgBase * (1000 / heroMs) * (1 + cc * (critMult - 1));
  const reduction = safeStat(stats.reduction, ceiling);
  const reflect = safeStat(stats.reflect, 1);
  // Strikes: Esmagador adds its bonus on one hit in N (every devastatingEvery-th crush is a Devastador), Duplo an echo on a share of the hits, Contra-ataque a bonus on the hit
  // after a block, Furia a flurry every furyEveryMs; weighted by cpStrikeWeight like every closed-form effect.
  const st = stats.strikes;
  let gain = 0;
  let flurryDps = 0;
  if (st) {
    const n = Math.floor(safeStat(st.crushEvery ?? 0, 1000));
    if (n >= 2) {
      const b = safeStat(st.crushBonus ?? 0, 10);
      const d = Math.max(1, Math.round(T.heroSkills.devastatingEvery));
      const crush = st.devastating ? ((d - 1) * b + (T.heroSkills.devastatingMult - 1)) / d : b;
      gain += crush / n;
    }
    gain += safeStat(st.doubleChance ?? 0, 1) * T.heroSkills.doubleDmgPct + Math.min(0.9, safeStat(stats.block ?? 0, 1)) * safeStat(st.counter ?? 0, 10);
    flurryDps = (dmgBase * safeStat(st.furyPct ?? 0, 10) * T.heroSkills.furyHits * 1000) / T.heroSkills.furyEveryMs;
  }
  const hitsBase = hits * (1 + T.advanced.cpStrikeWeight * gain);
  const hitsDps = rot ? hitsBase * (1 + rot.swingGain) * rot.hasteMult : hitsBase;
  const burnDps = stats.burn === true ? T.advanced.cpBurnWeight * dmgBase * T.battle.burnPctPerSec * (1000 / T.battle.effectTickMs) : 0;
  const bleedDps = T.advanced.cpBleedWeight * dmgBase * safeStat(stats.bleed ?? 0, 1) * (1000 / T.battle.effectTickMs);
  const abilityDotDps = rot ? rot.dotPerBase * dmgBase : 0;
  const dps = hitsDps * (1 + (T.advanced.cpReflectWeight * reflect) / (1 + reduction)) + burnDps + bleedDps + T.advanced.cpStrikeWeight * flurryDps + abilityDotDps;
  // Block removes a share of the hits, Firm Stance a share of the damage of the fights against bosses, Last Bastion heals once in a share of the fights.
  const block = Math.min(0.9, safeStat(stats.block ?? 0, 1)) * T.advanced.cpBlockWeight;
  const bossCut = Math.min(0.9, safeStat(stats.bossReduction ?? 0, 1)) * T.advanced.cpBossShare;
  const bastion = stats.bastion === true ? T.advanced.cpBastionWeight * T.heroSkills.bastionHealPct : 0;
  const ehpBase = (effectiveHp(safeStat(stats.maxHp, ceiling), reduction) * (1 + bastion)) / ((1 - block) * (1 - bossCut));
  const ehp = rot ? ehpBase * rot.ehpMult : ehpBase;
  const regenBase = safeStat(stats.hpRegenPct, 1) * (1000 / T.battle.effectTickMs);
  const regen = rot ? regenBase + rot.regen : regenBase;
  const regenSigma = hitsDps > 0 ? (T.advanced.cpRegenWeight * regen * ehp) / hitsDps : 0;
  const sigma = Math.min(Math.min(0.95, T.advanced.cpSustainSigmaCap), (safeStat(stats.lifesteal, ceiling) / 100) * (1 + reduction) + regenSigma);
  return Math.sqrt((dps * ehp) / (1 - sigma));
}

// Blessed (the Forge's blessed repair, spent by the next Dungeon run): +5% damage, multiplying like every other damage modifier. The one place the number lives.
export const BLESSED_DAMAGE_PCT = 0.05;

export interface CombatModifiers {
  blessedMult: number;
  strengthMult: number;
  attackMult: number; // Attack (Battle) Elixir: 1 when inactive
  sharpMult?: number; // Sharpening Stone (Round 12): 1 / missing when inactive
}

// Same operation order as the pre-refactor inline code: `(sum) * blessedMult * strengthMult`, then the Attack Elixir
// (x1 when inactive, which leaves the result bit-identical).
export function applyDamageModifiers(dmgBase: number, mods: CombatModifiers): number {
  return dmgBase * mods.blessedMult * mods.strengthMult * mods.attackMult * (mods.sharpMult ?? 1);
}
