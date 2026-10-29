import T from './tunables';
import { BurnState, heroAttackIntervalMs, igniteBurn, nextBurnTickAt, tickBurn } from './derivedStats';
import type { ArmorWeight, WeaponLine } from './gear';
import type { SkillFxId } from './skillFx';

// REVIEW (director): confirm a rotation fires in a REAL Dungeon run (BattleModal.tsx calls these functions but could not be run in a test); the simulator's mirror is scripts/sim/driver.ts.
//
// Equipment abilities and the rotation (classes reform, phase 4; the design is docs/CLASSES_E_EQUIPAMENTOS.md 2.2).
//
// A weapon line gives abilities, so does the chestpiece's weight. The hero lines up to T.abilities.rotationSlots of the ones his WORN gear grants (the save's `rotation`), in order of
// priority, and the combat is automatic: every time the hero would swing, the loop goes down the rotation and fires the FIRST ability that is off cooldown in place of the basic attack; when
// none is ready, the basic attack. An ability swing is never worse than the basic swing it replaces (the strike and the volley hit harder, the others hit as a normal swing and add their effect).
//
// Both Hunting and the Dungeon fight ONE enemy at a time, so "area" cannot mean "several at once": the `carry` effect is damage that spills over into the NEXT enemy of the same run (see carry below).
//
// This module is the single home of the rule. The three combat loops (huntCombat.ts, BattleModal.tsx, scripts/sim/driver.ts) only CALL the pure functions below (pickAbility, fireAbility,
// startAbilityFight, guardDamage, hastedMs, the dot helpers), exactly like resolveHeroHit / igniteBurn are shared, so a number or a rule can only change here. Nothing here draws a random number:
// a hero with abilities consumes exactly the same RNG stream as one without, and a hero with an empty rotation takes the same path through every loop and gets the same result bit for bit.
//
// All times are in the caller's ABILITY CLOCK (ms): a clock that only runs while the hero is fighting and carries over from fight to fight inside a session / a Dungeon run (huntCombat.ts: the session
// time, BattleModal.tsx: the combat clock, the driver: the clock without the intermissions). Cooldowns are `readyAt` stamps on that clock.

export type AbilityId =
  | 'firm_strike' | 'double_thrust' | 'breach' // sword
  | 'rift' | 'brutal_spin' | 'lacerate' // axe
  | 'arrow_rain' | 'opening_shot' | 'true_shot' // bow
  | 'piercing_bolt' | 'double_shot' | 'fatal_shot' // crossbow
  | 'arcane_burst' | 'flames' | 'nova' // staff
  | 'blessing' | 'drain_life' | 'dark_pulse' // scepter
  | 'iron_stance' | 'dodge' | 'arcane_breath'; // chestpieces: plate, leather, cloth

// Plate is the weight every piece had before the reform, so it has no `weight` field on the item (gear.ts); as an ability source it needs a name of its own.
export type BodyWeight = ArmorWeight | 'plate';
export type AbilitySource = { line: WeaponLine } | { weight: BodyWeight };

export type AbilityEffect =
  | { kind: 'strike'; pct: number } // one swing of pct x the damage
  | { kind: 'volley'; hits: number; pct: number } // hits swings of pct x the damage each
  | { kind: 'dot'; pctPerSec: number; durationMs: number } // a burn of its own (igniteBurn / DotSpec), pctPerSec of the hit per effect tick
  | { kind: 'carry'; pct: number } // pct of the swing is added to the bucket that hurts the NEXT enemy
  | { kind: 'guard'; reduction: number; durationMs: number } // damage taken -reduction for durationMs
  | { kind: 'heal'; pct: number } // heals pct of max HP
  | { kind: 'haste'; speedPct: number; durationMs: number } // attack speed +speedPct for durationMs
  | { kind: 'opener'; delayMs: number }; // delays the enemy's first attack of the fight (only ready while it has not acted)
export type AbilityEffectKind = AbilityEffect['kind'];

export interface AbilityDef {
  id: AbilityId;
  source: AbilitySource; // the weapon line or the chestpiece weight that grants it
  cooldownMs: number;
  // An ability can carry more than one effect (Bencao is a heal AND a haste), so this is a list.
  effects: AbilityEffect[];
  fx: SkillFxId; // the entry of skillFx.ts that plays when it fires
  icon: string; // /assets/icons/ab_<id>.png (same shape as HeroSkillDef.icon); required, a test checks the file exists
}

// Definition order is the order of the default rotation (defaultRotation) and of the lists shown to the player.
export const ABILITY_IDS: readonly AbilityId[] = [
  'firm_strike', 'double_thrust', 'breach',
  'rift', 'brutal_spin', 'lacerate',
  'arrow_rain', 'opening_shot', 'true_shot',
  'piercing_bolt', 'double_shot', 'fatal_shot',
  'arcane_burst', 'flames', 'nova',
  'blessing', 'drain_life', 'dark_pulse',
  'iron_stance', 'dodge', 'arcane_breath',
];

// Built from the tunables on every call so the debug panel keeps working (the loops read only the few numbers they need; this is not a hot path beyond a handful of cheap objects per swing).
export function abilityDef(id: AbilityId): AbilityDef | undefined {
  const def = abilityBody(id);
  return def && { ...def, icon: `/assets/icons/ab_${id}.png` };
}

function abilityBody(id: AbilityId): Omit<AbilityDef, 'icon'> | undefined {
  const a = T.abilities;
  switch (id) {
    case 'firm_strike':
      return { id, source: { line: 'sword' }, cooldownMs: a.firmStrikeCdMs, effects: [{ kind: 'strike', pct: a.firmStrikePct }], fx: 'ab_firm_strike' };
    case 'arrow_rain':
      return { id, source: { line: 'bow' }, cooldownMs: a.arrowRainCdMs, effects: [{ kind: 'volley', hits: a.arrowRainHits, pct: a.arrowRainPct }], fx: 'ab_arrow_rain' };
    case 'opening_shot':
      return { id, source: { line: 'bow' }, cooldownMs: a.openingShotCdMs, effects: [{ kind: 'opener', delayMs: a.openingShotDelayMs }], fx: 'ab_opening_shot' };
    case 'arcane_burst':
      return { id, source: { line: 'staff' }, cooldownMs: a.arcaneBurstCdMs, effects: [{ kind: 'carry', pct: a.arcaneBurstPct }], fx: 'ab_arcane_burst' };
    case 'flames':
      return { id, source: { line: 'staff' }, cooldownMs: a.flamesCdMs, effects: [{ kind: 'dot', pctPerSec: a.flamesPct, durationMs: a.flamesDurationMs }], fx: 'ab_flames' };
    case 'blessing':
      return {
        id,
        source: { line: 'scepter' },
        cooldownMs: a.blessingCdMs,
        effects: [
          { kind: 'heal', pct: a.blessingHealPct },
          { kind: 'haste', speedPct: a.blessingHastePct, durationMs: a.blessingHasteMs },
        ],
        fx: 'ab_blessing',
      };
    case 'iron_stance':
      return { id, source: { weight: 'plate' }, cooldownMs: a.ironStanceCdMs, effects: [{ kind: 'guard', reduction: a.ironStanceReduction, durationMs: a.ironStanceMs }], fx: 'ab_iron_stance' };
    case 'double_thrust':
      return { id, source: { line: 'sword' }, cooldownMs: a.doubleThrustCdMs, effects: [{ kind: 'volley', hits: a.doubleThrustHits, pct: a.doubleThrustPct }], fx: 'ab_double_thrust' };
    case 'breach':
      return {
        id,
        source: { line: 'sword' },
        cooldownMs: a.breachCdMs,
        effects: [
          { kind: 'strike', pct: a.breachPct },
          { kind: 'guard', reduction: a.breachReduction, durationMs: a.breachGuardMs },
        ],
        fx: 'ab_breach',
      };
    case 'rift':
      return { id, source: { line: 'axe' }, cooldownMs: a.riftCdMs, effects: [{ kind: 'strike', pct: a.riftPct }], fx: 'ab_rift' };
    case 'brutal_spin':
      return { id, source: { line: 'axe' }, cooldownMs: a.brutalSpinCdMs, effects: [{ kind: 'carry', pct: a.brutalSpinPct }], fx: 'ab_brutal_spin' };
    case 'lacerate':
      return { id, source: { line: 'axe' }, cooldownMs: a.lacerateCdMs, effects: [{ kind: 'dot', pctPerSec: a.laceratePct, durationMs: a.lacerateDurationMs }], fx: 'ab_lacerate' };
    case 'true_shot':
      return { id, source: { line: 'bow' }, cooldownMs: a.trueShotCdMs, effects: [{ kind: 'strike', pct: a.trueShotPct }], fx: 'ab_true_shot' };
    case 'piercing_bolt':
      return { id, source: { line: 'crossbow' }, cooldownMs: a.piercingBoltCdMs, effects: [{ kind: 'strike', pct: a.piercingBoltPct }], fx: 'ab_piercing_bolt' };
    case 'double_shot':
      return { id, source: { line: 'crossbow' }, cooldownMs: a.doubleShotCdMs, effects: [{ kind: 'volley', hits: a.doubleShotHits, pct: a.doubleShotPct }], fx: 'ab_double_shot' };
    case 'fatal_shot':
      return { id, source: { line: 'crossbow' }, cooldownMs: a.fatalShotCdMs, effects: [{ kind: 'strike', pct: a.fatalShotPct }], fx: 'ab_fatal_shot' };
    case 'nova':
      return {
        id,
        source: { line: 'staff' },
        cooldownMs: a.novaCdMs,
        effects: [
          { kind: 'carry', pct: a.novaPct },
          { kind: 'guard', reduction: a.novaReduction, durationMs: a.novaGuardMs },
        ],
        fx: 'ab_nova',
      };
    case 'drain_life':
      return {
        id,
        source: { line: 'scepter' },
        cooldownMs: a.drainLifeCdMs,
        effects: [
          { kind: 'strike', pct: a.drainLifePct },
          { kind: 'heal', pct: a.drainLifeHealPct },
        ],
        fx: 'ab_drain_life',
      };
    case 'dark_pulse':
      return { id, source: { line: 'scepter' }, cooldownMs: a.darkPulseCdMs, effects: [{ kind: 'carry', pct: a.darkPulsePct }], fx: 'ab_dark_pulse' };
    case 'dodge':
      return { id, source: { weight: 'leather' }, cooldownMs: a.dodgeCdMs, effects: [{ kind: 'haste', speedPct: a.dodgeHastePct, durationMs: a.dodgeHasteMs }], fx: 'ab_dodge' };
    case 'arcane_breath':
      return { id, source: { weight: 'cloth' }, cooldownMs: a.arcaneBreathCdMs, effects: [{ kind: 'heal', pct: a.arcaneBreathHealPct }], fx: 'ab_arcane_breath' };
    default:
      return undefined;
  }
}

// THE COOLDOWNS ARE IN AVERAGE SWINGS, NOT IN MILLISECONDS (phase 8, 28/10/2026). A cooldown is written in ms (tunables), but what it means is "how many swings fit in it": a low-level hero swings slower, so the same
// 4,500 ms is fewer swings and the ability fires more often per swing, and a fight is longer in ms. Measured (scripts/sim/abilityShare.sim.ts): the share of the speed that comes from abilities rose from 0.24 (tier 6) to
// 0.33 (tier 2) for the warrior in Hunting and from 0.17 to 0.33 against the boss, and the class with the strongest ability won the long-fight axes at low tiers (the warrior's Firm Strike took the boss axis from the
// archer at tier 3). So every cooldown is multiplied by the hero's attack interval from AGI alone (weapon and armor speed left out) over the one of a level 100 hero: 1 at level 100 (tier 6 and the whole endgame are
// untouched), 1.33 at level 1. It reads the LEVEL (AGI at the 20 % share of the points the balance policy spends), not the real AGI, so a build that piles into AGI does not also shorten its cooldowns.
export const ABILITY_AGI_PER_LEVEL = 0.6;
export function abilityCdScale(level: number): number {
  const lv = Math.max(1, Math.min(100, Math.floor(level)));
  return Math.round((heroAttackIntervalMs(lv * ABILITY_AGI_PER_LEVEL, 0) / heroAttackIntervalMs(100 * ABILITY_AGI_PER_LEVEL, 0)) * 1000) / 1000;
}

export const isAbilityId = (x: unknown): x is AbilityId => typeof x === 'string' && (ABILITY_IDS as readonly string[]).includes(x);

// --- What the worn gear grants, and the rotation -----------------------------------------------------------------------------------------------------------

// The abilities a weapon line and an armor weight grant, in definition order. An ABSENT (undefined) line is the sword and an ABSENT weight is plate (gear.ts: the original lines of tier 1 and up carry no value of
// their own, and they ARE sword and plate). NULL means "this piece grants nothing": equippedAbilities passes it for a tier 0 piece (the starting club and rags), which is neither a sword nor plate and would
// otherwise inherit their techniques through the default above (the owner opened Taticas with the starting gear and saw abilities).
export function grantedAbilities(weaponLine: WeaponLine | undefined | null, armorWeight: ArmorWeight | undefined | null): AbilityId[] {
  const line = weaponLine === null ? null : weaponLine ?? 'sword';
  const weight: BodyWeight | null = armorWeight === null ? null : armorWeight ?? 'plate';
  return ABILITY_IDS.filter((id) => {
    const s = abilityDef(id)!.source;
    return 'line' in s ? s.line === line : s.weight === weight;
  });
}

// The rotation a hero gets when he has not chosen one: everything his gear grants, in definition order, up to the slots. The save does NOT store it (an old save without `rotation` has an EMPTY one,
// so nothing changes for it); the screen of phase 5 uses it for its "default" button.
// DECIDED (owner/director, phase 4) AND APPLIED IN PHASE 5 (2026-10-28): a LOADED save WITHOUT a rotation gets defaultRotation() (engine.ts normalizeSave / loadedRotation), not an empty one. In an idle game most players never
// open the screen, and they must not keep their gear switched off while the ones who open it get an edge. A stored EMPTY list is a player who cleared his rotation on purpose and stays empty. The identity with the
// pre-engine golden file now holds for a hero with an EMPTY rotation (abilitiesIdentity.test.ts); the fill itself is proved in defaultRotation.test.ts.
export const defaultRotation = (granted: readonly AbilityId[]): AbilityId[] => granted.slice(0, T.abilities.rotationSlots);

// Sanitizes a rotation like sanitizeSkillTree does a skill allocation: only known ids, only the ones `granted` allows (omit it to skip that check, e.g. for a session that froze its rotation),
// no repeats, at most the slots, order kept. Anything that is not a list is the empty rotation.
export function sanitizeRotation(raw: unknown, granted?: readonly AbilityId[]): AbilityId[] {
  if (!Array.isArray(raw)) return [];
  const out: AbilityId[] = [];
  for (const x of raw) {
    if (!isAbilityId(x) || out.includes(x) || (granted && !granted.includes(x))) continue;
    out.push(x);
    if (out.length >= T.abilities.rotationSlots) break;
  }
  return out;
}

// --- The combat state ---------------------------------------------------------------------------------------------------------------------------------

export interface AbilityRuntime {
  readyAt: Partial<Record<AbilityId, number>>; // cooldowns: the ability clock from which each is ready again (absent = ready)
  dot: BurnState | null; // the ability burn on the enemy being fought (igniteBurn / tickBurn), on the ability clock
  carry: number; // the bucket: damage that spills over into the next enemy
  guardUntil: number;
  guardPct: number;
  hasteUntil: number;
  hastePct: number;
  fired: Partial<Record<AbilityId, number>>; // display / tests: how many times each one fired
}

export const newAbilityRuntime = (): AbilityRuntime => ({ readyAt: {}, dot: null, carry: 0, guardUntil: -Infinity, guardPct: 0, hasteUntil: -Infinity, hastePct: 0, fired: {} });

// The first ability of the rotation that is off cooldown, or null (the basic attack). An opener is only ready while the enemy has not acted in this fight. Pure: it changes nothing.
export function pickAbility(rt: AbilityRuntime, rotation: readonly AbilityId[] | undefined, now: number, enemyActed: boolean): AbilityDef | null {
  if (!rotation || rotation.length === 0) return null;
  for (const id of rotation) {
    if ((rt.readyAt[id] ?? 0) > now) continue;
    const def = abilityDef(id);
    if (!def) continue;
    if (enemyActed && def.effects.some((e) => e.kind === 'opener')) continue;
    return def;
  }
  return null;
}

export interface AbilityFire {
  def: AbilityDef;
  dmg: number; // the damage the swing deals to the enemy (the whole swing, volley included), in place of `base`
  heal: number; // HP the hero gets back (the caller caps it at max HP)
  enemyDelayMs: number; // push the enemy's next attack out by this much (opener)
}

// Fires `def` on the swing whose damage would have been `base` (after the crit and the strikes of heroSkills.ts); `hitBase` is the hero's pre-crit hit, the number the burn is taken from (the
// same one the weapon burn and Sangria use). Starts the cooldown, opens the guard / haste windows, lights the burn, fills the bucket, and says what the loop has to apply.
export function fireAbility(rt: AbilityRuntime, def: AbilityDef, now: number, base: number, hitBase: number, playerMax: number, cdScale = 1): AbilityFire {
  rt.readyAt[def.id] = now + Math.round(def.cooldownMs * cdScale);
  rt.fired[def.id] = (rt.fired[def.id] ?? 0) + 1;
  let hits = 1;
  let mult = 1;
  let heal = 0;
  let enemyDelayMs = 0;
  for (const e of def.effects) {
    switch (e.kind) {
      case 'strike':
        mult *= e.pct;
        break;
      case 'volley':
        hits = Math.max(1, Math.floor(e.hits));
        mult *= e.pct;
        break;
      case 'dot':
        rt.dot = igniteBurn(rt.dot, now, hitBase, { pctPerSec: e.pctPerSec, durationMs: e.durationMs });
        break;
      case 'carry':
        rt.carry += Math.max(1, Math.round(base * e.pct));
        break;
      case 'guard':
        rt.guardUntil = now + e.durationMs;
        rt.guardPct = Math.min(0.9, Math.max(0, e.reduction));
        break;
      case 'heal':
        heal += Math.max(1, Math.round(playerMax * e.pct));
        break;
      case 'haste':
        rt.hasteUntil = now + e.durationMs;
        rt.hastePct = Math.max(0, e.speedPct);
        break;
      case 'opener':
        enemyDelayMs += Math.max(0, e.delayMs);
        break;
    }
  }
  const dmg = hits > 1 || mult !== 1 ? hits * Math.max(1, Math.round(base * mult)) : base;
  return { def, dmg, heal, enemyDelayMs };
}

// A new enemy enters the fight. Returns the damage it comes in with: the bucket, capped at T.abilities.carryCapPct of its max HP (and never enough to kill it). The bucket is emptied either way:
// the spill does NOT chain on to the enemy after that. The burn of the ability does not follow the hero to the new enemy.
export function startAbilityFight(rt: AbilityRuntime, enemyMaxHp: number): number {
  rt.dot = null;
  const bucket = rt.carry;
  rt.carry = 0;
  if (!(bucket > 0) || !(enemyMaxHp > 1)) return 0;
  const cap = Math.floor(enemyMaxHp * Math.min(0.9, Math.max(0, T.abilities.carryCapPct)));
  return Math.max(0, Math.min(Math.round(bucket), cap, enemyMaxHp - 1));
}

// Damage the hero takes while a guard is up (never below 1, a hit that was blocked stays 0). Without a guard it returns the damage untouched.
export function guardDamage(rt: AbilityRuntime, now: number, damage: number): number {
  return damage > 0 && rt.guardUntil > now ? Math.max(1, Math.round(damage * (1 - rt.guardPct))) : damage;
}

// The hero's attack interval while a haste is up (the same floor as the AGI curve: no haste attacks faster than heroMinMs). Without one it returns `ms` untouched.
export function hastedMs(rt: AbilityRuntime, now: number, ms: number): number {
  return rt.hasteUntil > now ? Math.max(T.battle.heroMinMs, ms / (1 + rt.hastePct)) : ms;
}

// The ability burn, like burn / bleed: when the next tick is due (Infinity = none) and the tick itself.
export const abilityDotAt = (rt: AbilityRuntime): number => nextBurnTickAt(rt.dot);
export function tickAbilityDot(rt: AbilityRuntime): number {
  const tick = tickBurn(rt.dot!);
  rt.dot = tick.burn;
  return tick.damage;
}

// --- CP ----------------------------------------------------------------------------------------------------------------------------------------------------

// What a rotation is worth to the Combat Power (derivedStats.ts combatPowerCore reads this), as a long-run average per second, because the damage of a rotation depends on its cooldowns. The rotation is walked
// in priority order against the swings the hero has: each ability fires as often as its cooldown allows (a cooldown is only noticed at a swing, so it rounds UP to a whole number of swings) out of the swings the
// abilities above it left over. Then, per fire: a strike / volley adds (its damage - one basic swing), a carry adds its spill at cpAbilityCarryWeight, a burn adds its ticks (not past its own cooldown), a heal
// counts as regeneration, a guard / haste for the share of the time it is up. Openers are left out: they cost one swing a fight and change no damage. Returns null for an empty rotation (the closed form is untouched).
export interface RotationCp {
  swingGain: number; // extra damage per swing as a share of a hit (scales with the crit, like the strikes of heroSkills.ts): multiplies the hit damage by 1 + swingGain
  hasteMult: number; // multiplies the swing rate
  dotPerBase: number; // burn damage per second as a multiple of dmgBase (weight included), a flat term like the weapon burn
  regen: number; // share of max HP healed per second (before cpRegenWeight)
  ehpMult: number; // multiplies the effective HP (the guard)
}
export function rotationCpTerms(rotation: readonly AbilityId[] | undefined, heroMs: number, cdScale = 1): RotationCp | null {
  if (!rotation || rotation.length === 0 || !(heroMs > 0)) return null;
  const adv = T.advanced;
  let avail = 1 / heroMs; // swings per ms still free for the next ability
  const out: RotationCp = { swingGain: 0, hasteMult: 1, dotPerBase: 0, regen: 0, ehpMult: 1 };
  let guardCut = 0;
  const seen: AbilityId[] = [];
  for (const id of rotation) {
    const def = abilityDef(id);
    if (!def || seen.includes(id)) continue;
    seen.push(id);
    if (def.effects.some((e) => e.kind === 'opener')) continue;
    const cd = Math.max(heroMs, Math.ceil(Math.max(0, def.cooldownMs * cdScale) / heroMs - 1e-9) * heroMs);
    const rate = Math.min(avail, 1 / cd); // fires per ms
    if (!(rate > 0)) continue;
    avail -= rate;
    const share = rate * heroMs; // of the hero's swings
    for (const e of def.effects) {
      switch (e.kind) {
        case 'strike':
          out.swingGain += share * (e.pct - 1) * adv.cpAbilityStrikeWeight;
          break;
        case 'volley':
          out.swingGain += share * (Math.max(1, Math.floor(e.hits)) * e.pct - 1) * adv.cpAbilityStrikeWeight;
          break;
        case 'carry':
          out.swingGain += share * e.pct * adv.cpAbilityCarryWeight;
          break;
        case 'dot':
          out.dotPerBase += rate * 1000 * e.pctPerSec * (Math.min(e.durationMs, cd) / T.battle.effectTickMs) * adv.cpBurnWeight;
          break;
        case 'heal':
          out.regen += rate * 1000 * e.pct;
          break;
        case 'guard':
          guardCut += e.reduction * Math.min(1, e.durationMs / cd) * adv.cpAbilityGuardWeight;
          break;
        case 'haste': {
          const faster = heroMs / Math.max(T.battle.heroMinMs, heroMs / (1 + Math.max(0, e.speedPct)));
          out.hasteMult *= 1 + Math.min(1, e.durationMs / cd) * (faster - 1) * adv.cpAbilityHasteWeight;
          break;
        }
        case 'opener':
          break;
      }
    }
  }
  out.ehpMult = 1 / (1 - Math.min(0.9, guardCut));
  return out;
}
