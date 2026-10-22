import type { CombatStats, StrikeStats, StrikeTally } from './derivedStats';
import { getMaterial, MaterialId } from './materials';
import { UniqueDrop, sanitizeUniqueDrops } from './uniques';
import { HUNTING_DEPTHS, HuntingDepth } from './huntingZones';
import T from './tunables';
import { HUNT_BUFF_KINDS, type TimedBuffKind } from './buffs';

// Persistent state of ONE Hunting session and of the reward it leaves behind. Pure data + helpers, no engine import
// (engine.ts imports this file, so it must stay a leaf).
//
// Retroactivity rule: everything that could make a session stronger is fixed when the session STARTS, or only counts
// from the moment it really began:
//   - permanent combat stats (gear, attributes) and blessed  -> `stats` / `blessed`, frozen at start;
//   - Strength / Attack Elixir and Battle Pass (all time-limited) -> `strength` / `attack` / `pass` windows: the real time spans in
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
  attack: TimeWindow[];
  pass: TimeWindow[];
  // Garden 3.0 tonics that matter to a hunt (stoneskin, fortune, haste, precision), same rule as the elixirs above. Missing = none (older sessions).
  tonics?: Partial<Record<TimedBuffKind, TimeWindow[]>>;
  // The offline cap the Pass gave this session when it STARTED (T.battlePass.capHours for an owner; a session saved by the first Pass model carries
  // LEGACY_PASS_CAP_HOURS). It only counts while a Pass window covers the time, and is never changed after the start.
  passCapHours?: number;
  passGold?: number; // percent extra Gold the Pass gave this session when it started (T.battlePass.goldBonus x 100); adds to the gear bonus
  storageFlat?: true; // written by the current model: a session without it (and with a Pass window) came from the old one
  // Rodada 22 (leagueEvents.ts). `league`: the server's League opening (leagueClock.ts) the moment the session STARTED, so the event calendar of the session is fixed with it (null / absent = no League:
  // no events). `eventXp`: the timed Hunting XP buffs the player had earned at the start, and every one earned while it ran (from then on, never for the time already hunted); `pct` is a fraction.
  league?: number;
  // The dated pre-season events (leagueClock.ts, migration 0035) that overlapped the first 48 h of the session when it started, absolute ms; same trust model as `league` (the server bound is what counts).
  datedEvents?: { id: string; kind: 'hero' | 'profession' | 'final'; startMs: number; endMs: number }[];
  eventXp?: { from: number; to: number; pct: number }[];
}

export const LEGACY_PASS_CAP_HOURS = 24;

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
export function withSessionWindow(session: HuntSession, kind: 'strength' | 'attack' | 'pass' | TimedBuffKind, w: TimeWindow): HuntSession {
  if (kind === 'strength' || kind === 'attack' || kind === 'pass') return { ...session, [kind]: mergeWindows([...session[kind], w]) };
  return { ...session, tonics: { ...(session.tonics ?? {}), [kind]: mergeWindows([...(session.tonics?.[kind] ?? []), w]) } };
}

// A save from the 30-day Pass model: its session's Pass windows end at the old expiry. The Pass is permanent now, so an owner's windows that were still
// running at `now` stay open, and one that has lapsed starts again from `now` (no retroactive bonus for the time in between).
export function withPermanentPassWindow(session: HuntSession, now: number): HuntSession {
  const open = session.pass.map((w) => (w.to !== null && w.to > now ? { from: w.from, to: null } : w));
  if (!open.some((w) => w.from <= now && (w.to === null || w.to > now))) open.push({ from: now, to: null });
  return { ...session, pass: mergeWindows(open) };
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

// A stack of one material in a reward (what was rolled, what was left behind).
export interface HuntItem {
  itemId: MaterialId;
  count: number;
}

// What a stopped session earned, frozen at stop. Claiming applies exactly this and never rolls anything. The loot goes into the inventory AT CLAIM
// TIME (huntLifecycle.planHuntClaim): into the free space of that moment, rarest first; what does not fit is left behind for good (shown, never given back).
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
  drops: Partial<Record<MaterialId, number>>; // everything the session rolled; what does not fit the inventory at claim is left behind
  lost: HuntItem[]; // already lost before this claim (only a reward written under the old Hunting Pouch rule has any); information only
  // Units the player owned before the inventory rule (items an old Hunting Pouch held that the inventory had no room for at load). They are NEVER left
  // behind: the claim moves what fits and the rest stays here (the reward stays pending, like a held unique) until there is space.
  owed?: Partial<Record<MaterialId, number>>;
  // Unique pieces the session rolled. The claim delivers them to the bag (a slot is reserved for them before any material), and any the bag has no
  // room for stay HERE (the reward stays pending, with everything else already paid) until there is space.
  uniques: UniqueDrop[];
  // Web build (itemAuthority.ts): the SERVER rolls the unique drops, at claim time. While this is set the reward still has to be sent to mint-item (huntLifecycle.withServerUniques) before it can
  // be claimed; `luck` is Sorte Grande's multiplier the hero had, which the server clamps to what the skill allows. Never set offline.
  uniqueRoll?: { luck: number };
  // Display only: what the hero skill strikes did in the session (times and damage) and the total damage dealt, for the "N times, x% of the damage" lines.
  skillTally?: StrikeTally;
  totalDamage?: number;
  // Fights won in the session (display only); absent on a reward written before it existed.
  kills?: number;
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

function sanitizeTonicWindows(raw: unknown): Partial<Record<TimedBuffKind, TimeWindow[]>> {
  const out: Partial<Record<TimedBuffKind, TimeWindow[]>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const kind of HUNT_BUFF_KINDS) {
    const w = sanitizeWindows((raw as Record<string, unknown>)[kind]);
    if (w.length > 0) out[kind] = w;
  }
  return out;
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
      // Gear effects: a session saved before they existed simply has none (frozen at start like everything else).
      burn: s.burn === true,
      reflect: n(s.reflect, 0, 1) ?? 0,
      hpRegenPct: n(s.hpRegenPct, 0, 1) ?? 0,
      goldBonus: n(s.goldBonus, 0, 100) ?? 0,
      xpBonus: n(s.xpBonus, 0, 100) ?? 0,
      // Hero skills (heroSkills.ts): frozen with the rest of the stats at the start of the session; a session saved before they existed has none.
      ...(n(s.bleed, 0, 1) ? { bleed: n(s.bleed, 0, 1)! } : {}),
      ...(sanitizeStrikes(s.strikes) ? { strikes: sanitizeStrikes(s.strikes)! } : {}),
      ...(n(s.block, 0, 0.9) ? { block: n(s.block, 0, 0.9)! } : {}),
      ...(s.bastion === true ? { bastion: true } : {}),
      ...(n(s.bossReduction, 0, 0.9) ? { bossReduction: n(s.bossReduction, 0, 0.9)! } : {}),
      ...(n(s.skillGold, 0, 100) ? { skillGold: n(s.skillGold, 0, 100)! } : {}),
      ...(n(s.matMult, 1, 10) && n(s.matMult, 1, 10) !== 1 ? { matMult: n(s.matMult, 1, 10)! } : {}),
      ...(n(s.uniqueMult, 1, 10) && n(s.uniqueMult, 1, 10) !== 1 ? { uniqueMult: n(s.uniqueMult, 1, 10)! } : {}),
      ...(n(s.bossLootMult, 1, 10) && n(s.bossLootMult, 1, 10) !== 1 ? { bossLootMult: n(s.bossLootMult, 1, 10)! } : {}),
      // AGI and the speed bonus feed the Haste Tonic's interval; a session saved before they existed falls back to dividing heroMs.
      ...(n(s.agi, 0, ceil) !== null ? { agi: n(s.agi, 0, ceil)!, speedBonus: n(s.speedBonus, 0, 10) ?? 0 } : {}),
    },
    blessed: r.blessed === true,
    strength: sanitizeWindows(r.strength),
    attack: sanitizeWindows(r.attack),
    pass: sanitizeWindows(r.pass),
    tonics: sanitizeTonicWindows(r.tonics),
    // saved by the old Pass model: no marker and a Pass window = it started with the longer cap
    ...(finiteNum(r.passCapHours) ? { passCapHours: r.passCapHours } : !r.storageFlat && sanitizeWindows(r.pass).length > 0 ? { passCapHours: LEGACY_PASS_CAP_HOURS } : {}),
    storageFlat: true,
    ...(finiteNum(r.passGold) && r.passGold > 0 && r.passGold <= 100 ? { passGold: r.passGold } : {}),
    ...(finiteNum(r.league) && r.league > 0 && r.league <= MAX_MS ? { league: Math.floor(r.league) } : {}),
    ...(sanitizeDatedEvents(r.datedEvents).length > 0 ? { datedEvents: sanitizeDatedEvents(r.datedEvents) } : {}),
    ...(sanitizeEventXp(r.eventXp).length > 0 ? { eventXp: sanitizeEventXp(r.eventXp) } : {}),
  };
}

const DATED_KINDS = ['hero', 'profession', 'final'] as const;
// The dated events of a session: a known kind, a short id, finite increasing moments, at most 8.
function sanitizeDatedEvents(raw: unknown): NonNullable<HuntSession['datedEvents']> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<HuntSession['datedEvents']> = [];
  for (const e of raw as { id?: unknown; kind?: unknown; startMs?: unknown; endMs?: unknown }[]) {
    if (!e || typeof e.id !== 'string' || e.id.length > 32 || !DATED_KINDS.includes(e.kind as (typeof DATED_KINDS)[number]) || !finiteNum(e.startMs) || !finiteNum(e.endMs)) continue;
    if (e.startMs <= 0 || e.endMs > MAX_MS || e.endMs <= e.startMs) continue;
    out.push({ id: e.id, kind: e.kind as (typeof DATED_KINDS)[number], startMs: Math.floor(e.startMs), endMs: Math.floor(e.endMs) });
    if (out.length >= 8) break;
  }
  return out;
}

// The event buffs of a session: finite windows, a fraction between 0 and 0.5 (no rule gives more), at most MAX_WINDOWS.
function sanitizeEventXp(raw: unknown): { from: number; to: number; pct: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { from: number; to: number; pct: number }[] = [];
  for (const w of raw as { from?: unknown; to?: unknown; pct?: unknown }[]) {
    if (w && finiteNum(w.from) && w.from > 0 && w.from <= MAX_MS && finiteNum(w.to) && w.to > w.from && w.to <= MAX_MS && finiteNum(w.pct) && w.pct > 0 && w.pct <= 0.5) out.push({ from: w.from, to: w.to, pct: w.pct });
  }
  return out.slice(-MAX_WINDOWS);
}

const MAX_REWARD = 1e12;

const TALLY_IDS = ['w_heavy_blow', 'w_fury', 'w_devastating_strike', 'g_block', 'h_light_step', 'w_bleed'] as const;
function sanitizeTally(raw: unknown): StrikeTally {
  const out: StrikeTally = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of TALLY_IDS) {
    const e = (raw as Record<string, { n?: unknown; dmg?: unknown } | undefined>)[id];
    if (e && nonNegInt(e.n, 1e12) > 0) out[id] = { n: nonNegInt(e.n, 1e12), dmg: nonNegInt(e.dmg, 1e15) };
  }
  return out;
}

// The frozen strikes of a session: numbers clamped, an empty or unusable object means none.
function sanitizeStrikes(raw: unknown): StrikeStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, max: number): number | null => (finiteNum(v) && v > 0 && v <= max ? v : null);
  const out: StrikeStats = {};
  const every = num(r.crushEvery, 1000);
  if (every && every >= 2) {
    out.crushEvery = Math.floor(every);
    out.crushBonus = finiteNum(r.crushBonus) && r.crushBonus >= 0 && r.crushBonus <= 10 ? r.crushBonus : 0;
    if (r.devastating === true) out.devastating = true;
  }
  const fury = num(r.furyPct, 10);
  if (fury) out.furyPct = fury;
  const counter = num(r.counter, 10);
  if (counter) out.counter = counter;
  const dbl = num(r.doubleChance, 1);
  if (dbl) out.doubleChance = dbl;
  return Object.keys(out).length > 0 ? out : null;
}

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
  const lost: HuntItem[] = Array.isArray(r.lost)
    ? (r.lost as HuntItem[])
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
    ...(Object.keys(sanitizeMaterialRecord(r.owed)).length > 0 ? { owed: sanitizeMaterialRecord(r.owed) } : {}),
    uniques: sanitizeUniqueDrops(r.uniques),
    ...(r.uniqueRoll && typeof r.uniqueRoll === 'object' ? { uniqueRoll: { luck: Math.min(10, Math.max(1, finiteNum((r.uniqueRoll as { luck?: unknown }).luck) ? (r.uniqueRoll as { luck: number }).luck : 1)) } } : {}),
    ...(r.skillTally && typeof r.skillTally === 'object' ? { skillTally: sanitizeTally(r.skillTally) } : {}),
    ...(nonNegInt(r.totalDamage, 1e15) > 0 ? { totalDamage: nonNegInt(r.totalDamage, 1e15) } : {}),
    ...(nonNegInt(r.kills, 1e9) > 0 ? { kills: nonNegInt(r.kills, 1e9) } : {}),
  };
}

// Do the stats a session froze at its start differ from what the hero has now? Compared as numbers, field by field: a reload rebuilds the frozen object in another key order
// (sanitizeHuntSession) and a stat the hero does not have is absent in one and 0 in the other, none of which is a difference. Multipliers of 1 count as absent.
function canonicalStat(v: unknown, key = ''): unknown {
  if (typeof v === 'number') return key.endsWith('Mult') && v === 1 ? undefined : v === 0 || !Number.isFinite(v) ? undefined : Math.round(v * 1e9) / 1e9;
  if (v === false || v === null || v === undefined) return undefined;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const c = canonicalStat((v as Record<string, unknown>)[k], k);
      if (c !== undefined && !(typeof c === 'object' && Object.keys(c as object).length === 0)) out[k] = c;
    }
    return out;
  }
  return v;
}

export function sessionStatsDiffer(frozen: CombatStats, live: CombatStats): boolean {
  return JSON.stringify(canonicalStat(frozen)) !== JSON.stringify(canonicalStat(live));
}
