import type { CombatStats } from './derivedStats';
import { getMaterial, MaterialId } from './materials';
import type { HuntPouchItem } from './huntPouch';
import { HUNTING_DEPTHS, HuntingDepth } from './huntingZones';
import T from './tunables';

// Persistent state of ONE Hunting session and of the reward it leaves behind. Pure data + helpers, no engine import
// (engine.ts imports this file, so it must stay a leaf).
//
// Retroactivity rule: everything that could make a session stronger is fixed when the session STARTS, or only counts
// from the moment it really began:
//   - permanent combat stats (gear, attributes) and blessed  -> `stats` / `blessed`, frozen at start;
//   - Strength Elixir and Battle Pass (both time-limited)     -> `strength` / `pass` windows: the real time spans in
//     which they were active. A buff already running at start opens a window at start; one activated mid-session
//     opens a window at its activation (App.tsx records it); one bought AFTER the session is never retroactive.
// Everything else the simulation reads (potion stock, auto-potion settings, saved sub-level progress) is unchanged.

// Real time span [from, to) in epoch ms. `to: null` = open-ended (a pass without expiry).
export interface TimeWindow {
  from: number;
  to: number | null;
}

export interface HuntSession {
  stats: CombatStats;
  blessed: boolean;
  strength: TimeWindow[];
  pass: TimeWindow[];
}

const MAX_WINDOWS = 16;
const MAX_MS = 1e14;

const finiteNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const nonNegInt = (n: unknown, max: number): number => (finiteNum(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0);

export function windowCovers(windows: TimeWindow[], t: number): boolean {
  return windows.some((w) => w.from <= t && (w.to === null || t < w.to));
}

// Sorted, overlapping/touching windows merged, bounded in size (oldest dropped).
export function mergeWindows(list: TimeWindow[]): TimeWindow[] {
  const sorted = list
    .filter((w) => finiteNum(w.from) && (w.to === null || (finiteNum(w.to) && w.to > w.from)))
    .map((w) => ({ from: w.from, to: w.to }))
    .sort((a, b) => a.from - b.from);
  const out: TimeWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && (last.to === null || w.from <= last.to)) {
      if (last.to !== null) last.to = w.to === null ? null : Math.max(last.to, w.to);
    } else {
      out.push(w);
    }
  }
  return out.slice(-MAX_WINDOWS);
}

// The session with one more active window (an elixir drunk / a pass activated while hunting).
export function withSessionWindow(session: HuntSession, kind: 'strength' | 'pass', w: TimeWindow): HuntSession {
  return { ...session, [kind]: mergeWindows([...session[kind], w]) };
}

// Windows as session-relative [from, to) offsets in ms (Infinity = open-ended), negative starts clamped to 0.
export function relativeWindows(windows: TimeWindow[], startedAt: number): [number, number][] {
  return windows
    .map((w): [number, number] => [Math.max(0, w.from - startedAt), w.to === null ? Infinity : w.to - startedAt])
    .filter(([a, b]) => b > a);
}

// A hit / cleared fight at session time t belongs to (from, to]: an effect switched on at exactly t was not yet active for
// the action landing at t, so activating something at the very moment a session ends changes nothing.
export function inRelativeWindows(windows: [number, number][], t: number): boolean {
  for (const [a, b] of windows) if (a < t && t <= b) return true;
  return false;
}

// Hunting time that counts. Up to `baseCapMs` it always counts; time beyond that only counts while the Battle Pass was
// really active (up to `passCapMs`) — so buying the pass after the base cap was reached, or after the pass lapsed,
// cannot turn hours that were already lost into valid ones. Pure and safe: non-finite/negative elapsed -> 0.
export function huntValidMs(elapsedMs: number, baseCapMs: number, passCapMs: number, passWindows: [number, number][]): number {
  const e = finiteNum(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const base = finiteNum(baseCapMs) && baseCapMs > 0 ? baseCapMs : 0;
  let p = Math.min(e, base);
  const limit = Math.min(e, Math.max(base, finiteNum(passCapMs) ? passCapMs : 0));
  while (p < limit) {
    const w = passWindows.find(([a, b]) => a <= p && p < b);
    if (!w) break;
    p = Math.min(w[1], limit);
  }
  return p;
}

// --- Pending reward ------------------------------------------------------------------------------------------------

// What a stopped session earned, frozen at stop. Claiming applies exactly this and never rolls or recomputes anything.
// The pouch allocation (what fit / what did not) was decided at stop too: the fitting drops are already in
// `save.huntPouch`, `lost` is what did not fit and is gone for good (information only, never given back).
export interface PendingHuntReward {
  id: string;
  zoneId: string;
  depth: HuntingDepth;
  startedAt: number;
  endedAt: number;
  timeMs: number; // real time between start and stop
  pendingMs: number; // the part of it that counted (offline cap)
  startCeiling: number;
  ceilingSubLevel: number;
  promotions: number;
  promotionLosses: number;
  promotionWins: number;
  promotionRequired: number;
  gold: number;
  xp: number;
  bpXp: number;
  drops: Partial<Record<MaterialId, number>>; // everything the session rolled
  lost: HuntPouchItem[]; // the part that did not fit the pouch
  pouchCapacity: number; // pouch slots at stop time (tier + Battle Pass)
}

export function sanitizeWindows(raw: unknown): TimeWindow[] {
  if (!Array.isArray(raw)) return [];
  const list: TimeWindow[] = [];
  for (const w of raw as Partial<TimeWindow>[]) {
    if (!w || !finiteNum(w.from) || w.from < 0 || w.from > MAX_MS) continue;
    if (w.to === null) list.push({ from: w.from, to: null });
    else if (finiteNum(w.to) && w.to > w.from && w.to <= MAX_MS) list.push({ from: w.from, to: w.to });
  }
  return mergeWindows(list);
}

// null = missing or unusable (the caller then rebuilds it conservatively from the live save).
export function sanitizeHuntSession(raw: unknown): HuntSession | null {
  const r = raw as Partial<HuntSession> | null | undefined;
  const s = r?.stats as Partial<CombatStats> | undefined;
  if (!r || !s || typeof r !== 'object') return null;
  const n = (v: unknown, min: number, max: number): number | null => (finiteNum(v) && v >= min && v <= max ? v : null);
  const ceil = T.advanced.cpInputCeiling;
  const maxHp = n(s.maxHp, 1, ceil);
  const dmgBase = n(s.dmgBase, 0, ceil);
  const critChance = n(s.critChance, 0, 1);
  const critMult = n(s.critMult, 1, ceil);
  const heroMs = n(s.heroMs, T.battle.heroMinMs, T.battle.heroAttackMs);
  const reduction = n(s.reduction, 0, ceil);
  const lifesteal = n(s.lifesteal, 0, ceil);
  if ([maxHp, dmgBase, critChance, critMult, heroMs, reduction, lifesteal].some((v) => v === null)) return null;
  return {
    stats: {
      maxHp: maxHp!,
      dmgBase: dmgBase!,
      critChance: critChance!,
      critMult: critMult!,
      heroMs: heroMs!,
      reduction: reduction!,
      lifesteal: lifesteal!,
    },
    blessed: r.blessed === true,
    strength: sanitizeWindows(r.strength),
    pass: sanitizeWindows(r.pass),
  };
}

const MAX_REWARD = 1e12;

function sanitizeMaterialRecord(raw: unknown): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = nonNegInt(v, 1e9);
      if (getMaterial(k as MaterialId) && n > 0) out[k as MaterialId] = n;
    }
  }
  return out;
}

// A pending reward from a tampered/old save: unknown materials dropped, numbers clamped to finite non-negative ints.
// null = not a reward at all (no usable id) — nothing to claim.
export function sanitizePendingHuntReward(raw: unknown): PendingHuntReward | null {
  const r = raw as Partial<PendingHuntReward> | null | undefined;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 200) return null;
  const maxSub = T.hunting.subLevels;
  const ceilingSubLevel = Math.min(maxSub, Math.max(1, nonNegInt(r.ceilingSubLevel, maxSub)));
  const depth = HUNTING_DEPTHS.some((d) => d.id === r.depth) ? (r.depth as HuntingDepth) : 'shallow';
  const lost: HuntPouchItem[] = Array.isArray(r.lost)
    ? (r.lost as HuntPouchItem[])
        .filter((i) => i && typeof i.itemId === 'string' && !!getMaterial(i.itemId) && nonNegInt(i.count, 1e9) > 0)
        .map((i) => ({ itemId: i.itemId, count: nonNegInt(i.count, 1e9) }))
    : [];
  return {
    id: r.id,
    zoneId: typeof r.zoneId === 'string' ? r.zoneId : '',
    depth,
    startedAt: nonNegInt(r.startedAt, MAX_MS),
    endedAt: nonNegInt(r.endedAt, MAX_MS),
    timeMs: nonNegInt(r.timeMs, MAX_MS),
    pendingMs: nonNegInt(r.pendingMs, MAX_MS),
    startCeiling: Math.min(maxSub, Math.max(1, nonNegInt(r.startCeiling, maxSub))),
    ceilingSubLevel,
    promotions: nonNegInt(r.promotions, 1e6),
    promotionLosses: nonNegInt(r.promotionLosses, 1e6),
    promotionWins: nonNegInt(r.promotionWins, 1e6),
    promotionRequired: nonNegInt(r.promotionRequired, 1e6),
    gold: nonNegInt(r.gold, MAX_REWARD),
    xp: nonNegInt(r.xp, MAX_REWARD),
    bpXp: nonNegInt(r.bpXp, MAX_REWARD),
    drops: sanitizeMaterialRecord(r.drops),
    lost,
    pouchCapacity: nonNegInt(r.pouchCapacity, 1000),
  };
}
