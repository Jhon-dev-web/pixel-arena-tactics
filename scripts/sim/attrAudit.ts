// Primary-attribute audit (docs/ITEM_BALANCE_AUDIT.md section D, docs/BALANCE_CHANGES.md "Rodada 8"). Shared by the audit printout (itemAudit.sim.ts) and
// the balance tests (src/game/__tests__/attributes.test.ts): everything is measured through the REAL game code (buildCombatStats, combatPowerCore, the
// closed-form duel margin of duel.ts, the Dungeon driver and computeHuntingStatus), never through a copy of a formula.
//
// "Real value" of a point = 100 x ln(P'/P) / points, P = duel margin (time the hero survives / time it needs to kill) against one enemy of the hero's own
// representative floor. "CP value" = 100 x 2 x ln(core'/core): the CP is the square root of dps x ehp, so its log change is half that of a duel margin and the
// factor 2 puts the two on one scale (computeCP itself rounds to an integer, so its raw core is used).
import { buildCombatStats, computeCP, computeHuntingStatus, buildHuntSession, playerLevel, SaveData } from '../../src/game/engine';
import { combatPowerCore } from '../../src/game/derivedStats';
import { HUNTING_ZONES, HuntingDepth, HUNTING_DEPTHS, isDepthUnlocked, isZoneOpen } from '../../src/game/huntingZones';
import { isDungeonCheckpoint } from '../../src/game/dungeon';
import { cargoReferenceValue } from '../../src/game/economy';
import { MaterialId } from '../../src/game/materials';
import { duel, repFloor } from './duel';
import { buildHero, clearRate } from './ladder';
import { spendSkillPoints, SkillBuild } from './driver';

export const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;

export type Attr = 'str' | 'vit' | 'agi' | 'res';
export const ATTRS: Attr[] = ['str', 'vit', 'agi', 'res'];
export type Alloc = 'none' | 'warrior' | 'guardian';
export const ALLOCS: Alloc[] = ['none', 'warrior', 'guardian'];
export const ALLOC_LABEL: Record<Alloc, string> = { none: 'sem habilidades', warrior: 'Guerreiro', guardian: 'Guardião' };
export type Attrs = Record<Attr, number>;

// The gear that is normal for a level: the full set of one tier (weapon, armor, helmet, gloves, boots, ring, shield; common rarity, no gems) refined to
// what a player of that level usually holds. Tier unlock levels are the weapon recipes' (PAIRS in duel.ts).
export interface AuditSpec {
  level: number;
  tier: number;
  refine: number;
}
export const AUDIT_SPECS: AuditSpec[] = [
  { level: 5, tier: 1, refine: 2 },
  { level: 10, tier: 2, refine: 2 },
  { level: 20, tier: 2, refine: 6 },
  { level: 30, tier: 3, refine: 4 },
  { level: 45, tier: 3, refine: 8 },
  { level: 60, tier: 4, refine: 6 },
  { level: 80, tier: 5, refine: 6 },
  { level: 100, tier: 6, refine: 8 },
];
// Sensitivity only (not asserted): the first day, before anything is forged - the starting club and rags.
export const STARTER_SPECS: AuditSpec[] = [
  { level: 5, tier: 0, refine: 0 },
  { level: 10, tier: 0, refine: 0 },
];
export const specOf = (level: number): AuditSpec => AUDIT_SPECS.find((s) => s.level === level)!;

// A hero of the spec: attribute points spread by the sim player's policy (driver.ts ATTR_WEIGHTS, 35/30/20/15) unless `attrs` says otherwise, skill points
// bought in the order of the path (driver.ts SKILL_BUILDS) as far as the level affords.
export function auditHero(spec: AuditSpec, alloc: Alloc = 'none', attrs?: Partial<Attrs>): SaveData {
  let h = buildHero(spec.level, spec.tier, spec.refine);
  if (attrs) h = { ...h, ...attrs };
  return alloc === 'none' ? h : spendSkillPoints(h, alloc as SkillBuild);
}

export const logPct = (a: number, b: number): number => Math.log(a / b) * 100;

export interface PointValue {
  floor: number;
  real: Attrs; // 100 x ln(P'/P) per point
  cp: Attrs; // 100 x 2 x ln(core'/core) per point
}
// Average value per point of the NEXT `step` points of each attribute for the hero `h`, on the floor `floor` (default: the hero's own representative floor).
// 10 points rather than 1: max HP is rounded to a whole number and a VIT point is only ~5 HP, so a single point is lost in the rounding.
export const VALUE_STEP = 10;
export function pointValue(h: SaveData, floor = repFloor(h), step = VALUE_STEP): PointValue {
  const p0 = duel(h, floor).P;
  // null: this audit measures what the primary attributes do and leaves the equipment rotation out on purpose.
  const c0 = combatPowerCore(buildCombatStats(h), null);
  const real = {} as Attrs;
  const cp = {} as Attrs;
  for (const a of ATTRS) {
    const s = { ...h, [a]: h[a] + step };
    real[a] = logPct(duel(s, floor).P, p0) / step;
    cp[a] = (2 * logPct(combatPowerCore(buildCombatStats(s), null), c0)) / step;
  }
  return { floor, real, cp };
}
export const spread = (v: Attrs): number => Math.max(...ATTRS.map((a) => v[a])) / Math.min(...ATTRS.map((a) => v[a]));

// The value of the next point of `attr` when `n` points are already in it (the other three stay as the balanced policy put them; beyond the budget of the
// level the hero is hypothetical), on the representative floor of the balanced hero.
export function marginalValue(spec: AuditSpec, alloc: Alloc, attr: Attr, n: number): number {
  const bal = auditHero(spec, alloc);
  const floor = repFloor(bal);
  const h = { ...bal, [attr]: n };
  return pointValue(h, floor).real[attr];
}
export const STACK_POINTS = [0, 25, 50, 100, 150];

// ---- builds ------------------------------------------------------------------------------------------------------------------------------------------------

export const attrBuilds = (pts: number): [string, Attrs][] => {
  const z = (o: Partial<Attrs>): Attrs => ({ str: 0, vit: 0, agi: 0, res: 0, ...o });
  const half = pts / 2;
  const cap = (a: number) => Math.min(a, 300);
  const out: [string, Attrs][] = [];
  for (const a of ATTRS) out.push([`tudo ${a.toUpperCase()}`, z({ [a]: a === 'agi' ? cap(pts) : pts })]);
  const pairs: [Attr, Attr][] = [['str', 'vit'], ['str', 'agi'], ['str', 'res'], ['vit', 'agi'], ['vit', 'res'], ['agi', 'res']];
  for (const [a, b] of pairs) out.push([`${a.toUpperCase()}+${b.toUpperCase()} 50/50`, z({ [a]: half, [b]: half })]);
  return out;
};

// Deepest floor cleared from full HP in >= 80% of seeded 1-floor runs (stops after 5 failed floors in a row).
export function depth(s: SaveData): number {
  let best = 0;
  let miss = 0;
  for (let f = 1; f <= 100; f++) {
    if (clearRate(s, f, NOW, 5) >= 0.8) {
      best = f;
      miss = 0;
    } else if (!isDungeonCheckpoint(f) && ++miss >= 5) break;
  }
  return best;
}

// One hunt of `hours` in a zone at a depth.
export function huntRun(s: SaveData, zoneId: string, hunt: HuntingDepth = 'shallow', hours = 4) {
  const save: SaveData = { ...s, activeHuntingZone: zoneId, activeHuntingDepth: hunt, huntingOfflineStart: NOW, huntSession: buildHuntSession({ ...s, activeHuntingZone: zoneId, activeHuntingDepth: hunt }, NOW) };
  const st = computeHuntingStatus(save, NOW + hours * HOUR);
  return { xp: st.xpReady / hours, mats: cargoReferenceValue(st.drops as Partial<Record<MaterialId, number>>) / hours, ceiling: st.ceilingSubLevel };
}
// The best place the build can farm: zones unlocked by the floor it clears (highestDungeonFloor = floor) and depths unlocked by its CP; the one with the most
// materials per hour (reference Gold). XP per hour is that of the same place.
export function huntBest(s: SaveData, floor: number) {
  const hero = { ...s, highestDungeonFloor: Math.max(1, floor) };
  const cp = computeCP(hero);
  let best = { zone: '-', depth: 'shallow' as HuntingDepth, xp: 0, mats: -1, ceiling: 1 };
  for (const z of HUNTING_ZONES) {
    if (!isZoneOpen(z, hero.highestDungeonFloor, playerLevel(hero.xp))) continue;
    for (const d of HUNTING_DEPTHS) {
      if (!isDepthUnlocked(z, d.id, cp)) continue;
      const r = huntRun(hero, z.id, d.id);
      if (r.mats > best.mats) best = { zone: z.id, depth: d.id, ...r };
    }
  }
  return best;
}

export interface BuildResult {
  label: string;
  attrs: Attrs;
  cp: number;
  depth: number;
  zone: string;
  hunt: HuntingDepth;
  mats: number;
  xp: number;
  matsAtBase: number; // materials per hour in the place the BALANCED build farms (same enemies for everyone: the pure combat effect, without the floor that unlocks a zone)
  xpAtBase: number;
  boss25: { ttk: number; P: number };
  boss50: { ttk: number; P: number };
}
export function evalBuild(spec: AuditSpec, alloc: Alloc, label: string, attrs?: Attrs, base?: BuildResult): BuildResult {
  const s = auditHero(spec, alloc, attrs);
  const d = depth(s);
  const h = huntBest(s, d);
  const at = base ? huntRun({ ...s, highestDungeonFloor: Math.max(1, d) }, base.zone, base.hunt) : { mats: h.mats, xp: h.xp };
  const b25 = duel(s, 25);
  const b50 = duel(s, 50);
  return { label, attrs: { str: s.str, vit: s.vit, agi: s.agi, res: s.res }, cp: computeCP(s), depth: d, zone: h.zone, hunt: h.depth, mats: h.mats, xp: h.xp, matsAtBase: at.mats, xpAtBase: at.xp, boss25: { ttk: b25.ttk, P: b25.P }, boss50: { ttk: b50.ttk, P: b50.P } };
}
export function buildTable(spec: AuditSpec, alloc: Alloc): BuildResult[] {
  const pts = spec.level * 3;
  const out = [evalBuild(spec, alloc, 'balanceado 35/30/20/15')];
  for (const [label, attrs] of attrBuilds(pts)) out.push(evalBuild(spec, alloc, label, attrs, out[0]));
  return out;
}
