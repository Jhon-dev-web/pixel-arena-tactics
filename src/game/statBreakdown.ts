import { activeTonicStats, BuffKind, buffRemainingMs, goldMultiplier, isBuffActive } from './buffs';
import { applyDamageModifiers, CombatStats, CombatModifiers } from './derivedStats';
import { buildCombatStats, combatModifiersFromSave, cpOfStats, SaveData, StatParts } from './engine';
import { GearSlot, INSTANCED_SLOTS, InstancedSlot } from './gear';
import { createGearInstance, GearInstance } from './gearInstances';
import { emptySkillTree, saveSkillEffects } from './heroSkills';
import { ownsAdventurerPass } from './entitlements';
import T from './tunables';

// The numbers on the hero panel and where they come from. NOT a second formula: every figure is read from buildCombatStats (the permanent stats the Dungeon, Hunting and the CP
// use) and from the same temporary-modifier functions the fight calls (combatModifiersFromSave, activeTonicStats, goldMultiplier), evaluated at `now`.
//
// The split by source is a staircase of those same functions: the stats are rebuilt with the hero stripped of everything (just the character), then one source is put back at a
// time, in a fixed order, and each line is the difference that source made at its step. The steps add up to the total by construction (the last step IS the engine's number), and a
// source that multiplies (the relic's final damage, a set, paragon, the damage elixirs) shows its factor as well as its difference. Nothing here is typed into a formula.
//
// Order of operations (also in docs/ITEM_BALANCE_AUDIT.md, "Como os status somam"):
//   1. Personagem   base + level + armor level + attributes (STR scales every flat damage that is added after it)
//   2. Equipamento  the seven slots in the order weapon, armor, helmet, gloves, boots, ring, shield: base stat x refine x durability x rarity, and the substats
//   3. Gemas        the gems socketed in those pieces
//   4. Conjunto     the set bonuses of the worn tier families
//   5. Reliquia     the relic
//   6. Habilidades  the hero skill tree
//   7. Paragon      the permanent paragon damage bonus
//   8. Passe        the Adventurer Pass gold bonus (Gold only)
//   9. Temporarios  blessed, then the elixirs and tonics, each at the moment `now`

export type StatId = 'maxHp' | 'damage' | 'critChance' | 'critMult' | 'defense' | 'attackSpeed' | 'lifesteal' | 'regen' | 'reflect' | 'gold' | 'xp';
export const STAT_IDS: StatId[] = ['maxHp', 'damage', 'critChance', 'critMult', 'defense', 'attackSpeed', 'lifesteal', 'regen', 'reflect', 'gold', 'xp'];

export type PermanentSource = 'character' | InstancedSlot | 'gems' | 'set' | 'relic' | 'skills' | 'paragon' | 'pass';
export type TemporarySource = 'blessed' | BuffKind;
export type SourceId = PermanentSource | TemporarySource;

// The raw unit of every row, the one its lines add up in:
//   maxHp HP | damage one hit before crit | critChance fraction | critMult multiplier (2 = 200%) | defense the RAW resistance sum (what the item lines call Defesa; the share of damage
//   it removes is mitigationFraction of it) | attackSpeed hits per second | lifesteal percent | regen max-HP share per effect tick | reflect fraction | gold percent | xp percent
export type StatVector = Record<StatId, number>;

export interface BreakdownLine {
  source: SourceId;
  temporary: boolean;
  delta: number; // in the raw unit of the row
  factor: number; // value after / value before at this step (1 when nothing multiplied); the UI shows it as "x1,04" for the multiplying sources
  remainingMs: number | null; // temporary sources with a timer
}

export interface StatRow {
  id: StatId;
  permanent: number;
  now: number;
  lines: BreakdownLine[];
}

export interface TemporaryOnPanel {
  source: TemporarySource;
  remainingMs: number | null;
}

export interface StatBreakdown {
  now: number;
  rows: Record<StatId, StatRow>;
  cpPermanent: number;
  cpNow: number;
  temporaries: TemporaryOnPanel[];
}

// Sources that multiply instead of adding. Only used to decide how the UI words a line; the numbers never come from here.
export const MULTIPLYING: Partial<Record<StatId, SourceId[]>> = {
  damage: ['set', 'relic', 'paragon', 'blessed', 'strength', 'attack', 'sharpened'],
  maxHp: ['skills'],
  defense: ['skills'],
};

const TEMPORARY_ORDER: TemporarySource[] = ['blessed', 'strength', 'attack', 'sharpened', 'stoneskin', 'polished', 'haste', 'precision', 'fortune'];

// ---- the vectors -----------------------------------------------------------------------------------------------------------

interface VectorInput {
  save: SaveData;
  parts?: StatParts;
  pass: boolean;
}

// The panel stats of a hero whose Layer-2 stats are `stats`. `fortune` / `pass` are the gold sources outside CombatStats; `hit` and `tonic` carry the temporary modifiers
// (undefined = permanent only).
function vectorOf(save: SaveData, stats: CombatStats, o: { pass: boolean; fortune: boolean; hit?: number; tonic?: CombatStats }): StatVector {
  const t = o.tonic ?? stats;
  return {
    maxHp: stats.maxHp,
    damage: o.hit ?? stats.dmgBase,
    critChance: t.critChance,
    critMult: stats.critMult,
    defense: t.reduction,
    attackSpeed: 1000 / t.heroMs,
    lifesteal: stats.lifesteal,
    regen: stats.hpRegenPct,
    reflect: stats.reflect,
    // Exactly the Dungeon's expression (App.tsx finishRun) and the Hunting build's (gear + Pass + Ganancia, Fortune added for the fight time it covers).
    gold: (goldMultiplier(stats.goldBonus ?? 0, o.fortune, o.pass ? T.battlePass.goldBonus : 0, saveSkillEffects(save).goldPct) - 1) * 100,
    xp: stats.xpBonus ?? 0,
  };
}

function permanentVector({ save, parts, pass }: VectorInput): StatVector {
  return vectorOf(save, buildCombatStats(save, parts), { pass, fortune: false });
}

// The fight's own view of `save` at `now`: the permanent stats, the damage modifiers and the tonics running at that moment, and the Fortune Tonic for the gold.
export function liveVector(save: SaveData, now: number): StatVector {
  const stats = buildCombatStats(save);
  return vectorOf(save, stats, {
    pass: ownsAdventurerPass(save),
    fortune: isBuffActive(save, 'fortune', now),
    hit: applyDamageModifiers(stats.dmgBase, combatModifiersFromSave(save, now) as CombatModifiers),
    tonic: activeTonicStats(stats, save, now),
  });
}

// The stats of the hero as the fight sees them at `now`, as a CombatStats (damage with the modifiers, the tonics applied): what "CP now" is computed from.
export function liveCombatStats(save: SaveData, now: number): CombatStats {
  const stats = buildCombatStats(save);
  return { ...activeTonicStats(stats, save, now), dmgBase: applyDamageModifiers(stats.dmgBase, combatModifiersFromSave(save, now)) };
}

// ---- the staircases --------------------------------------------------------------------------------------------------------

interface Step {
  source: SourceId;
  vector: StatVector;
}

function permanentSteps(save: SaveData): Step[] {
  const pass = ownsAdventurerPass(save);
  const wornInstances = new Set(INSTANCED_SLOTS.map((s) => save.equipped[s]).filter((id): id is string => !!id));
  const variant = (keep: readonly InstancedSlot[], o: { gems: boolean; relic: boolean; skills: boolean }): SaveData => {
    const equipped = { ...save.equipped, relic: o.relic ? save.equipped.relic : null };
    for (const slot of INSTANCED_SLOTS) if (!keep.includes(slot)) equipped[slot] = null;
    let gearInstances = save.gearInstances;
    if (!o.gems) {
      gearInstances = { ...save.gearInstances };
      for (const id of wornInstances) if (gearInstances[id]) gearInstances[id] = { ...gearInstances[id], sockets: [] };
    }
    return { ...save, equipped, gearInstances, skillTree: o.skills ? save.skillTree : emptySkillTree() };
  };
  const steps: Step[] = [];
  const none = { gems: false, relic: false, skills: false };
  const bare: StatParts = { sets: false, paragon: false };
  steps.push({ source: 'character', vector: permanentVector({ save: variant([], none), parts: bare, pass: false }) });
  INSTANCED_SLOTS.forEach((slot, i) => steps.push({ source: slot, vector: permanentVector({ save: variant(INSTANCED_SLOTS.slice(0, i + 1), none), parts: bare, pass: false }) }));
  steps.push({ source: 'gems', vector: permanentVector({ save: variant(INSTANCED_SLOTS, { ...none, gems: true }), parts: bare, pass: false }) });
  steps.push({ source: 'set', vector: permanentVector({ save: variant(INSTANCED_SLOTS, { ...none, gems: true }), parts: { paragon: false }, pass: false }) });
  steps.push({ source: 'relic', vector: permanentVector({ save: variant(INSTANCED_SLOTS, { gems: true, relic: true, skills: false }), parts: { paragon: false }, pass: false }) });
  steps.push({ source: 'skills', vector: permanentVector({ save, parts: { paragon: false }, pass: false }) });
  steps.push({ source: 'paragon', vector: permanentVector({ save, pass: false }) });
  steps.push({ source: 'pass', vector: permanentVector({ save, pass }) });
  return steps;
}

// Which temporary sources are running at `now`, in the order they are put back.
export function runningTemporaries(save: SaveData, now: number): TemporarySource[] {
  return TEMPORARY_ORDER.filter((k) => (k === 'blessed' ? save.blessed : isBuffActive(save, k, now)));
}

function onlyTemporaries(save: SaveData, keep: ReadonlySet<TemporarySource>): SaveData {
  const buffs: SaveData['buffs'] = {};
  for (const [k, v] of Object.entries(save.buffs ?? {})) if (keep.has(k as TemporarySource)) (buffs as Record<string, unknown>)[k] = v;
  return {
    ...save,
    blessed: keep.has('blessed') && save.blessed,
    activeBuff: keep.has('strength') ? save.activeBuff : null,
    attackBuff: keep.has('attack') ? save.attackBuff : null,
    buffs,
  };
}

function temporarySteps(save: SaveData, now: number, running: TemporarySource[]): Step[] {
  const steps: Step[] = [];
  const keep = new Set<TemporarySource>();
  for (const source of running) {
    keep.add(source);
    steps.push({ source, vector: liveVector(onlyTemporaries(save, keep), now) });
  }
  return steps;
}

// ---- the breakdown ---------------------------------------------------------------------------------------------------------

const EPS = 1e-9;

export function statBreakdown(save: SaveData, now: number): StatBreakdown {
  const perm = permanentSteps(save);
  const running = runningTemporaries(save, now);
  const temp = temporarySteps(save, now, running);
  const permanent = perm[perm.length - 1].vector;
  const total = running.length > 0 ? liveVector(save, now) : permanent;
  const rows = {} as Record<StatId, StatRow>;
  for (const id of STAT_IDS) {
    const lines: BreakdownLine[] = [];
    perm.forEach((step, i) => {
      const value = step.vector[id];
      const delta = i === 0 ? value : value - perm[i - 1].vector[id];
      const prev = i === 0 ? 0 : perm[i - 1].vector[id];
      if (i === 0 || Math.abs(delta) > EPS) lines.push({ source: step.source, temporary: false, delta, factor: prev > 0 ? value / prev : 1, remainingMs: null });
    });
    let prev = permanent[id];
    temp.forEach((step) => {
      const value = step.vector[id];
      const delta = value - prev;
      if (Math.abs(delta) > EPS) lines.push({ source: step.source, temporary: true, delta, factor: prev > 0 ? value / prev : 1, remainingMs: step.source === 'blessed' ? null : buffRemainingMs(save, now, step.source as BuffKind) });
      prev = value;
    });
    rows[id] = { id, permanent: permanent[id], now: total[id], lines };
  }
  return {
    now,
    rows,
    cpPermanent: cpOfStats(buildCombatStats(save)),
    cpNow: cpOfStats(liveCombatStats(save, now)),
    temporaries: running.map((source) => ({ source, remainingMs: source === 'blessed' ? null : buffRemainingMs(save, now, source as BuffKind) })),
  };
}

// ---- "with this item" ------------------------------------------------------------------------------------------------------

export interface ItemCandidate {
  slot: GearSlot;
  templateId: string;
  instance?: GearInstance; // the piece itself when it is one the hero owns (rarity, refine, substats, sockets, durability); absent = a fresh common copy (the Forge preview)
}

export interface StatChange {
  id: StatId;
  before: number;
  after: number;
  setDelta: number; // how much of the change is the set bonus (the swap can complete or break a set)
}

export interface ItemComparison {
  slot: GearSlot;
  changes: StatChange[];
}

// The hero with `candidate` worn in its slot instead of what is there now.
export function withItemEquipped(save: SaveData, candidate: ItemCandidate): SaveData {
  if (candidate.slot === 'relic') return { ...save, equipped: { ...save.equipped, relic: candidate.templateId } };
  const inst = candidate.instance ?? createGearInstance(candidate.templateId, { id: 'preview_' + candidate.templateId, origin: 'craft', rarity: 'common', substats: [] });
  return { ...save, gearInstances: { ...save.gearInstances, [inst.id]: inst }, equipped: { ...save.equipped, [candidate.slot]: inst.id } };
}

// The permanent column of the breakdown without the staircase: the totals the panel shows in its permanent value.
export function permanentTotals(save: SaveData, parts?: StatParts): StatVector {
  return permanentVector({ save, parts, pass: ownsAdventurerPass(save) });
}

// Permanent totals before / after the swap, the same numbers as the panel's permanent column (the staircase is only needed to explain them). null when the candidate is what the
// slot already holds. `setDelta` is the part of the change the set bonuses make (the swap can complete or break a set).
export function compareItem(save: SaveData, candidate: ItemCandidate): ItemComparison | null {
  const slot = candidate.slot;
  if (slot !== 'relic' && candidate.instance && save.equipped[slot] === candidate.instance.id) return null;
  if (slot === 'relic' && save.equipped.relic === candidate.templateId) return null;
  const swapped = withItemEquipped(save, candidate);
  const a = permanentTotals(save);
  const b = permanentTotals(swapped);
  const aNoSet = permanentTotals(save, { sets: false });
  const bNoSet = permanentTotals(swapped, { sets: false });
  const changes: StatChange[] = [];
  for (const id of STAT_IDS) {
    if (Math.abs(b[id] - a[id]) <= 1e-9) continue;
    changes.push({ id, before: a[id], after: b[id], setDelta: b[id] - bNoSet[id] - (a[id] - aNoSet[id]) });
  }
  return { slot, changes };
}
