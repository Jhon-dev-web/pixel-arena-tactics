import type { ConsumableId } from './consumables';
import { BLESSED_DAMAGE_PCT, CombatStats, heroAttackIntervalMs } from './derivedStats';
import type { SaveData } from './engine';
import type { TimeWindow } from './huntSession';
import T from './tunables';

// ONE description of every timed consumable effect ("buff"): which item starts it, how long it lasts and how the engine reads it back.
// Eleven kinds share the same machinery (expiry timestamp, Dungeon read per hit, Hunting session windows, elixirs.ts to drink them):
//   legacy slots (kept so old saves load untouched): strength -> save.activeBuff, attack -> save.attackBuff
//   Garden 3.0 tonics: stoneskin / fortune / haste / gatherer / precision -> save.buffs[kind] = { from, expiresAt }
//   Round 12 (T.consumables): sharpened (+damage), polished (+reduction), bait (+uncommon / rare drop chance of ONE zone, `zone` is stored with the buff), prospect (+Mining / Woodcutting units)
// Pure data + helpers: the only runtime import besides tunables is derivedStats (heroAttackIntervalMs), so engine.ts can import this file.

export type LegacyBuffKind = 'strength' | 'attack';
export type TimedBuffKind = 'stoneskin' | 'fortune' | 'haste' | 'gatherer' | 'precision' | 'sharpened' | 'polished' | 'bait' | 'prospect';
export type BuffKind = LegacyBuffKind | TimedBuffKind;

// A tonic that is running: it covers [from, expiresAt). `from` is when it was FIRST drunk in an unbroken run (drinking again while it is
// active renews the duration from now but keeps `from`), so a Mining session can credit the part of its time the tonic really covered.
export interface TimedBuff {
  from: number;
  expiresAt: number;
  // bait only: the Hunting zone the lure was used for (it does nothing anywhere else)
  zone?: string;
}

export const TIMED_BUFF_KINDS: TimedBuffKind[] = ['stoneskin', 'fortune', 'haste', 'gatherer', 'precision', 'sharpened', 'polished', 'bait', 'prospect'];
// The ones a Hunting session has to track as time windows (Mining reads `gatherer` from the save when it is collected).
export const HUNT_BUFF_KINDS: TimedBuffKind[] = ['stoneskin', 'fortune', 'haste', 'precision', 'sharpened', 'polished', 'bait'];

export const BUFF_ITEM: Partial<Record<ConsumableId, BuffKind>> = {
  strength_elixir: 'strength',
  atk_elixir: 'attack',
  stoneskin_tonic: 'stoneskin',
  fortune_tonic: 'fortune',
  haste_tonic: 'haste',
  gatherer_brew: 'gatherer',
  precision_elixir: 'precision',
  sharpening_stone: 'sharpened',
  armor_polish: 'polished',
  hunter_lure: 'bait',
  prospector_tonic: 'prospect',
};

export function buffMinutes(kind: BuffKind): number {
  switch (kind) {
    case 'strength':
      return T.battle.strengthElixirMinutes;
    case 'attack':
      return T.battle.attackElixirMinutes;
    case 'stoneskin':
      return T.tonics.stoneskinMinutes;
    case 'fortune':
      return T.tonics.fortuneMinutes;
    case 'haste':
      return T.tonics.hasteMinutes;
    case 'gatherer':
      return T.tonics.gathererMinutes;
    case 'precision':
      return T.tonics.precisionMinutes;
    case 'sharpened':
      return T.consumables.sharpenMinutes;
    case 'polished':
      return T.consumables.polishMinutes;
    case 'bait':
      return T.consumables.baitMinutes;
    case 'prospect':
      return T.consumables.prospectMinutes;
  }
}

export function isTimedKind(kind: BuffKind): kind is TimedBuffKind {
  return kind !== 'strength' && kind !== 'attack';
}

export function emptyBuffs(): Partial<Record<TimedBuffKind, TimedBuff>> {
  return {};
}

// Expiry of a buff in its slot (running or not), null when the slot is empty.
export function buffExpiry(save: SaveData, kind: BuffKind): number | null {
  if (kind === 'strength') return save.activeBuff && save.activeBuff.type === 'strength' ? save.activeBuff.expiresAt : null;
  if (kind === 'attack') return save.attackBuff && save.attackBuff.type === 'attack' ? save.attackBuff.expiresAt : null;
  return save.buffs?.[kind]?.expiresAt ?? null;
}

export function isBuffActive(save: SaveData, kind: BuffKind, now: number): boolean {
  const e = buffExpiry(save, kind);
  return e !== null && e > now;
}

export function buffRemainingMs(save: SaveData, now: number, kind: BuffKind = 'strength'): number {
  const e = buffExpiry(save, kind);
  return e === null ? 0 : Math.max(0, e - now);
}

// The save with `kind` running until `expiresAt`. A tonic that is still active keeps its original `from`.
export function withBuff(save: SaveData, kind: BuffKind, now: number, expiresAt: number, zone?: string): SaveData {
  if (kind === 'strength') return { ...save, activeBuff: { type: 'strength', expiresAt } };
  if (kind === 'attack') return { ...save, attackBuff: { type: 'attack', expiresAt } };
  const prev = save.buffs?.[kind];
  const from = prev && prev.expiresAt > now ? Math.min(prev.from, now) : now;
  return { ...save, buffs: { ...(save.buffs ?? {}), [kind]: { from, expiresAt, ...(zone ? { zone } : {}) } } };
}

const MS_PER_HOUR = 3600 * 1000;

// Extra Mining / Woodcutting hours the Gatherer Brew adds to a session that accrued during [startMs, startMs + pendingMs]: only the part of the
// accrual the tonic really covered counts (a tonic drunk after the session, or one that ran out, adds nothing for the time outside it).
export function gathererBonusHours(save: SaveData, startMs: number, pendingMs: number): number {
  const b = save.buffs?.gatherer;
  if (!b || !(pendingMs > 0) || !Number.isFinite(startMs)) return 0;
  const inside = Math.min(startMs + pendingMs, b.expiresAt) - Math.max(startMs, b.from);
  return inside > 0 ? (inside / MS_PER_HOUR) * T.tonics.gathererYieldPct : 0;
}

// The Prospector's Tonic (Round 12) works exactly like the Gatherer Brew with its own, smaller share: extra effective hours for the part of the session it covered.
export function prospectBonusHours(save: SaveData, startMs: number, pendingMs: number): number {
  const b = save.buffs?.prospect;
  if (!b || !(pendingMs > 0) || !Number.isFinite(startMs)) return 0;
  const inside = Math.min(startMs + pendingMs, b.expiresAt) - Math.max(startMs, b.from);
  return inside > 0 ? (inside / MS_PER_HOUR) * T.consumables.prospectYieldPct : 0;
}

// ---- combat tonics ----------------------------------------------------------------------------------------------------

export interface TonicFlags {
  stoneskin?: boolean;
  haste?: boolean;
  precision?: boolean;
  polished?: boolean;
}

// Attack interval with the Haste Tonic: the bonus enters the SAME derivation as a relic's attackSpeedBonus, so heroMinMs still floors it.
export function hasteIntervalMs(stats: CombatStats): number {
  if (typeof stats.agi === 'number') return heroAttackIntervalMs(stats.agi, (stats.speedBonus ?? 0) + T.tonics.hasteAttackSpeed);
  return Math.max(T.battle.heroMinMs, stats.heroMs / (1 + T.tonics.hasteAttackSpeed));
}

export const stoneskinReduction = (stats: CombatStats): number => stats.reduction + T.tonics.stoneskinReduction;
// Armor Polish adds to the same Layer-2 reduction SUM (with Stoneskin they simply add: applyDamageReduction keeps the result asymptotic).
export const polishReductionAdd = (): number => T.consumables.polishReduction;
export const precisionCrit = (stats: CombatStats): number => Math.min(1, stats.critChance + T.tonics.precisionCritPoints);

// The combat stats with the tonics in `flags` applied: stoneskin adds to the Layer-2 reduction SUM (applyDamageReduction keeps it asymptotic),
// haste divides the attack interval through heroAttackIntervalMs, precision adds absolute crit points (capped at 100%).
export function withTonicStats(stats: CombatStats, flags: TonicFlags): CombatStats {
  return {
    ...stats,
    reduction: (flags.stoneskin ? stoneskinReduction(stats) : stats.reduction) + (flags.polished ? polishReductionAdd() : 0),
    heroMs: flags.haste ? hasteIntervalMs(stats) : stats.heroMs,
    critChance: flags.precision ? precisionCrit(stats) : stats.critChance,
  };
}

// The tonics running at `now` (the Dungeon reads this at every hit, like the damage elixirs).
export function activeTonicStats(stats: CombatStats, save: SaveData, now: number): CombatStats {
  return withTonicStats(stats, {
    stoneskin: isBuffActive(save, 'stoneskin', now),
    haste: isBuffActive(save, 'haste', now),
    precision: isBuffActive(save, 'precision', now),
    polished: isBuffActive(save, 'polished', now),
  });
}

// Gold multiplier of a Dungeon / Hunting reward: gear goldBonus (already capped at GOLD_BONUS_CAP by equippedSubstatTotals) and the Fortune Tonic ADD,
// they do not multiply, and the tonic is outside the gear cap.
// The Adventurer Pass's gold bonus (a fraction, T.battlePass.goldBonus) adds the same way.
// Ganancia (heroSkills.ts, `skillGold`, a fraction) adds the same way, outside the gear cap.
export function goldMultiplier(gearGoldBonusPct: number, fortuneActive: boolean, passGold = 0, skillGold = 0): number {
  const gear = Number.isFinite(gearGoldBonusPct) ? Math.max(0, gearGoldBonusPct) : 0;
  return 1 + gear / 100 + (fortuneActive ? T.tonics.fortuneGoldPct : 0) + Math.max(0, passGold) + Math.max(0, skillGold);
}

export type TonicWindows = Partial<Record<TimedBuffKind, TimeWindow[]>>;

// ---- the table of every temporary effect -------------------------------------------------------------------------------------
// ONE declarative list of what each timed effect does, read from the tunables at call time (so the tweak panel moves it): the hero panel's breakdown uses the kinds and values,
// docs/ITEM_BALANCE_AUDIT.md ("Como os status somam") prints it and temporaryEffects.test.ts checks the document against it and each row against the fight. The ENGINE never reads
// this table (each effect is applied where the comment above it says); it is the description that a test holds equal to what the engine does.
export type EffectStat = 'damage' | 'critChance' | 'defense' | 'attackSpeed' | 'gold' | 'dropChance' | 'gatherYield';
export interface TemporaryEffect {
  kind: BuffKind | 'blessed';
  item: ConsumableId | null; // blessed comes from the Forge's blessed repair
  stat: EffectStat;
  // multiplier: multiplies the hit with the other damage buffs. add: adds to the sum of its stat (defense: the raw resistance sum, crit: absolute points, speed: the same
  // bonus a relic gives, gold: added to gear + Pass + Ganancia, dropChance / gatherYield: the share of the base).
  how: 'multiplier' | 'add';
  value: number; // a fraction: 0.2 = +20%
  minutes: number | null; // null = until the next Dungeon run spends it
  dungeon: boolean;
  hunt: boolean;
  gather: boolean;
}

export function temporaryEffects(): TemporaryEffect[] {
  return [
    { kind: 'blessed', item: null, stat: 'damage', how: 'multiplier', value: BLESSED_DAMAGE_PCT, minutes: null, dungeon: true, hunt: true, gather: false },
    { kind: 'strength', item: 'strength_elixir', stat: 'damage', how: 'multiplier', value: T.battle.strengthElixirDmgPct, minutes: T.battle.strengthElixirMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'attack', item: 'atk_elixir', stat: 'damage', how: 'multiplier', value: T.battle.attackElixirDmgPct, minutes: T.battle.attackElixirMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'sharpened', item: 'sharpening_stone', stat: 'damage', how: 'multiplier', value: T.consumables.sharpenDmgPct, minutes: T.consumables.sharpenMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'stoneskin', item: 'stoneskin_tonic', stat: 'defense', how: 'add', value: T.tonics.stoneskinReduction, minutes: T.tonics.stoneskinMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'polished', item: 'armor_polish', stat: 'defense', how: 'add', value: T.consumables.polishReduction, minutes: T.consumables.polishMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'haste', item: 'haste_tonic', stat: 'attackSpeed', how: 'add', value: T.tonics.hasteAttackSpeed, minutes: T.tonics.hasteMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'precision', item: 'precision_elixir', stat: 'critChance', how: 'add', value: T.tonics.precisionCritPoints, minutes: T.tonics.precisionMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'fortune', item: 'fortune_tonic', stat: 'gold', how: 'add', value: T.tonics.fortuneGoldPct, minutes: T.tonics.fortuneMinutes, dungeon: true, hunt: true, gather: false },
    { kind: 'bait', item: 'hunter_lure', stat: 'dropChance', how: 'multiplier', value: T.consumables.baitDropPct, minutes: T.consumables.baitMinutes, dungeon: false, hunt: true, gather: false },
    { kind: 'gatherer', item: 'gatherer_brew', stat: 'gatherYield', how: 'add', value: T.tonics.gathererYieldPct, minutes: T.tonics.gathererMinutes, dungeon: false, hunt: false, gather: true },
    { kind: 'prospect', item: 'prospector_tonic', stat: 'gatherYield', how: 'add', value: T.consumables.prospectYieldPct, minutes: T.consumables.prospectMinutes, dungeon: false, hunt: false, gather: true },
  ];
}
