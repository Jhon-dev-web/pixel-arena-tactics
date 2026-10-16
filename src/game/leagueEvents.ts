import type { SaveData } from './engine';
import { getLeagueEpoch } from './leagueClock';

// LEAGUE EVENTS (Rodada 22, docs/BALANCE_CHANGES.md and docs/SEASON_RANKING.md). A calendar for days 25 to 60 of the League, one event at a time, hero events (Hunting XP) and profession
// events (Mining / Woodcutting / Garden) taking turns, announced ahead in the game ("Eventos" panel) and readable by the portal (public.league_events(), migration 0014).
//
// THE CLOCK. Every event is a fixed offset, in hours, from the SERVER's League opening (leagueClock.ts, public.league_reset_at()). Nothing reads the device clock: a hero cannot move an event by
// setting his phone forward, and the offline / desktop build (no League) has no events at all. The SQL function and this table are the same calendar; migration0014.test.ts compares them.
//
// EVERY BONUS IS SMALL AND IT IS BOUNDED. The numbers below are what the anti-cheat bound has to allow (supabase/functions/_shared/progress/bounds.ts eventXpFactor / eventProfessionFactor), so an
// honest player is never flagged for playing an event. Events do not make buying items more decisive: the hero bonuses either need nothing a set gives (a streak of won fights, a bought-by-time
// buff) or are capped at +15% hunting XP together (EVENT_XP_CAP), and only ONE target fight an hour and a half is out of reach of a hero without the CP.

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** League day on which the calendar starts, and the last League day. */
export const EVENTS_FROM_DAY = 25;
export const LEAGUE_LAST_DAY = 60;

export type LeagueEventId = 'invasion' | 'target_hunt' | 'dungeon_race' | 'grand_delivery' | 'time_rift' | 'mining_fever' | 'crafts_festival' | 'profession_week' | 'final_race';
/** hero: Hunting XP. profession: Mining / Woodcutting / Garden. final: the last five days, a small bonus for meeting the daily goals. */
export type LeagueEventKind = 'hero' | 'profession' | 'final';

export interface LeagueEventSlot {
  id: LeagueEventId;
  kind: LeagueEventKind;
  /** Hours after the League opened (league day 1 starts at hour 0, league day 25 at hour 576). */
  startHour: number;
  hours: number;
}

const day = (leagueDay: number): number => (leagueDay - 1) * 24;

/**
 * The calendar. One event at a time, a day of rest between two events, hero and profession events taking turns and never the same event twice in a row. Four of the events come twice
 * (Invasao, Febre da Mineracao, Semana das Profissoes). The Corrida Final owns the last five days (days 56 to 60), after a hero event and a day of rest.
 */
export const LEAGUE_EVENT_SLOTS: readonly LeagueEventSlot[] = [
  { id: 'invasion', kind: 'hero', startHour: day(25), hours: 48 },
  { id: 'mining_fever', kind: 'profession', startHour: day(28), hours: 24 },
  { id: 'target_hunt', kind: 'hero', startHour: day(30), hours: 48 },
  { id: 'profession_week', kind: 'profession', startHour: day(33), hours: 72 },
  { id: 'dungeon_race', kind: 'hero', startHour: day(37), hours: 36 },
  { id: 'crafts_festival', kind: 'profession', startHour: day(40), hours: 48 },
  { id: 'grand_delivery', kind: 'hero', startHour: day(43), hours: 24 },
  { id: 'mining_fever', kind: 'profession', startHour: day(45), hours: 24 },
  { id: 'time_rift', kind: 'hero', startHour: day(47), hours: 24 },
  { id: 'profession_week', kind: 'profession', startHour: day(49), hours: 72 },
  { id: 'invasion', kind: 'hero', startHour: day(53), hours: 48 },
  { id: 'final_race', kind: 'final', startHour: day(56), hours: 5 * 24 },
];

// ---- the rules (every number of every event) ----------------------------------------------------------------------------------------------------

/** All the event bonuses to hero XP together can never be more than this at any moment (the anti-cheat bound allows exactly this). */
export const EVENT_XP_CAP = 0.15;

/** How a hero event changes the Hunting fights of its window (huntCombat.ts reads these). Absent field = no such effect. */
export interface HuntEventRules {
  /** Streak: +streakGain XP (a fraction) for every streakStep fights won in a row since the last defeat (or the start of the session), up to streakCap. */
  streakStep?: number;
  streakGain?: number;
  streakCap?: number;
  /** Modifier: the enemies deal this much more damage for the whole window. */
  enemyDmgPct?: number;
  /** Escalating waves: every escalateEvery fights won in a row the enemy has escalatePct more HP and damage, up to escalateCap (the streak is also the wave). */
  escalateEvery?: number;
  escalatePct?: number;
  escalateCap?: number;
  /** The Target: after targetEvery won fights in the window the next fight is a single enemy with targetHp x the HP and targetDmg x the damage of the sub-level being farmed; winning it gives
   * +targetBuffPct XP for targetBuffHours (a loss costs only that fight). */
  targetEvery?: number;
  targetHp?: number;
  targetDmg?: number;
  targetBuffPct?: number;
  targetBuffHours?: number;
}

export const HUNT_EVENT_RULES: Partial<Record<LeagueEventId, HuntEventRules>> = {
  // Invasao de Monstros (48 h): the waves escalate with every fight won in a row; the further the hero stands without falling, the more XP (+1% per 50 fights, up to +10%). A defeat ends the wave.
  invasion: { streakStep: 50, streakGain: 0.01, streakCap: 0.1, escalateEvery: 100, escalatePct: 0.03, escalateCap: 0.3 },
  // Cacada ao Alvo (48 h): a rare monster every 300 fights that only a hero with the power beats; +8% XP for an hour and a half when he does.
  target_hunt: { targetEvery: 300, targetHp: 2, targetDmg: 1.5, targetBuffPct: 0.08, targetBuffHours: 1.5 },
  // Fenda Temporal (24 h): the enemies hit 25% harder, and a streak of won fights during the automatic hunt raises XP (+1% per 25 fights, up to +10%).
  time_rift: { streakStep: 25, streakGain: 0.01, streakCap: 0.1, enemyDmgPct: 0.25 },
};

/** The events that hand out a timed Hunting XP buff when the player does something (the buff itself is a window of the hero save, see grantEventBuff). */
export type EventBuffSource = 'dungeon_race' | 'grand_delivery' | 'final_race';
export interface EventBuffRule {
  pct: number;
  hours: number;
  /** Gold per boss floor cleared (Corrida da Masmorra pays Gold, not XP). */
  goldPerBoss?: number;
}
export const EVENT_BUFF_RULES: Record<EventBuffSource, EventBuffRule> = {
  // Corrida da Masmorra (36 h): each Dungeon boss (floors 25 / 50 / 75 / 100 and the depth bosses) cleared in the window pays 120 Gold and +8% Hunting XP for 4 hours.
  dungeon_race: { pct: 0.08, hours: 4, goldPerBoss: 120 },
  // Grande Entrega (24 h): each delivery order collected in the window pays +10% Hunting XP for 3 hours (the order still eats its materials, which is the choice).
  grand_delivery: { pct: 0.1, hours: 3 },
  // Corrida Final (days 56 to 60): the day all four daily goals are claimed, +5% Hunting XP for 24 hours.
  final_race: { pct: 0.05, hours: 24 },
};

/** Profession events: the bonus to the units gathered (Mining / Woodcutting) and to the skill XP of the profession. */
export type ProfessionId = 'mining' | 'woodcutting' | 'gardening';
export const PROFESSION_IDS: readonly ProfessionId[] = ['mining', 'woodcutting', 'gardening'];
export const PROFESSION_EVENT_RULES = {
  /** Febre da Mineracao (24 h): +25% Mining units (and so +25% Mining XP). */
  mining_fever: { miningUnitsPct: 0.25 },
  /** Festival dos Oficios (48 h): +15% skill XP in all three professions. */
  crafts_festival: { skillXpPct: 0.15 },
  /** Semana das Profissoes (72 h): the player picks ONE profession (pickProfession) and gets +25% skill XP in it. */
  profession_week: { pickedSkillXpPct: 0.25 },
} as const;

/** The most the profession events add to a profession's XP rate (the largest of the three above); the anti-cheat bound multiplies by it. */
export const EVENT_PROFESSION_FACTOR = 1.25;
/** The most the hero events add to the Hunting XP rate (EVENT_XP_CAP). */
export const EVENT_HERO_FACTOR = 1 + EVENT_XP_CAP;

// ---- the calendar in absolute time --------------------------------------------------------------------------------------------------------------

export interface LeagueEventWindow {
  id: LeagueEventId;
  kind: LeagueEventKind;
  /** Position in LEAGUE_EVENT_SLOTS (a stable key for the same event twice). */
  index: number;
  startMs: number;
  endMs: number;
}

export function leagueEventWindows(epoch: number): LeagueEventWindow[] {
  return LEAGUE_EVENT_SLOTS.map((s, index) => ({ id: s.id, kind: s.kind, index, startMs: epoch + s.startHour * HOUR_MS, endMs: epoch + (s.startHour + s.hours) * HOUR_MS }));
}

/** League day (1 = the day the League opened) at `now`; 0 or less before it opened. */
export const leagueDayAt = (epoch: number, now: number): number => Math.floor((now - epoch) / DAY_MS) + 1;

/** The event running at `now` (start inclusive, end exclusive), or null. */
export function eventAt(epoch: number, now: number): LeagueEventWindow | null {
  return leagueEventWindows(epoch).find((w) => w.startMs <= now && now < w.endMs) ?? null;
}

/** The next event that has not started at `now`, or null when the calendar is over. */
export function nextEventAfter(epoch: number, now: number): LeagueEventWindow | null {
  return leagueEventWindows(epoch).find((w) => w.startMs > now) ?? null;
}

/** The running event and the next one, for the "Eventos" panel. */
export function eventsNow(epoch: number, now: number): { current: LeagueEventWindow | null; next: LeagueEventWindow | null } {
  return { current: eventAt(epoch, now), next: nextEventAfter(epoch, now) };
}

/** The same calendar before the League opens, in League days and hours (the panel shows it as "na Liga"). */
export function leagueEventPreview(): { id: LeagueEventId; kind: LeagueEventKind; fromDay: number; toDay: number; hours: number }[] {
  return LEAGUE_EVENT_SLOTS.map((s) => ({ id: s.id, kind: s.kind, fromDay: Math.floor(s.startHour / 24) + 1, toDay: Math.ceil((s.startHour + s.hours) / 24), hours: s.hours }));
}

const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// ---- Hunting -----------------------------------------------------------------------------------------------------------------------------------

/** A hero event window of a Hunting session, as session-relative ms (huntCombat.ts reads them). */
export interface HuntEventWindow extends HuntEventRules {
  id: LeagueEventId;
  from: number;
  to: number;
}

/** The hero events that overlap [startedAt, startedAt + horizonMs], as windows relative to the session start. */
export function huntEventWindows(epoch: number, startedAt: number, horizonMs: number): HuntEventWindow[] {
  const out: HuntEventWindow[] = [];
  for (const w of leagueEventWindows(epoch)) {
    const rules = HUNT_EVENT_RULES[w.id];
    if (!rules || w.endMs <= startedAt || w.startMs >= startedAt + horizonMs) continue;
    out.push({ id: w.id, ...rules, from: Math.max(0, w.startMs - startedAt), to: w.endMs - startedAt });
  }
  return out;
}

/** A timed Hunting XP buff the player earned (save.eventBuffs); `pct` is a fraction. */
export interface EventBuff {
  from: number;
  to: number;
  pct: number;
}
export type EventBuffs = Partial<Record<EventBuffSource, EventBuff>>;

const BUFF_SOURCES: readonly EventBuffSource[] = ['dungeon_race', 'grand_delivery', 'final_race'];

export function sanitizeEventBuffs(raw: unknown): EventBuffs {
  const out: EventBuffs = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const src of BUFF_SOURCES) {
    const b = (raw as Record<string, unknown>)[src] as Partial<EventBuff> | undefined;
    const rule = EVENT_BUFF_RULES[src];
    if (!b || typeof b.from !== 'number' || typeof b.to !== 'number' || !Number.isFinite(b.from) || !Number.isFinite(b.to) || b.from <= 0 || !(b.to > b.from)) continue;
    // never longer than the rule gives, never a bigger bonus
    out[src] = { from: Math.floor(b.from), to: Math.floor(Math.min(b.to, b.from + rule.hours * HOUR_MS)), pct: rule.pct };
  }
  return out;
}

/** The buffs of the save that are still running at `now`, as windows for a Hunting session starting then. */
export function activeEventBuffs(save: Pick<SaveData, 'eventBuffs'>, now: number): EventBuff[] {
  return BUFF_SOURCES.flatMap((src) => {
    const b = save.eventBuffs?.[src];
    return b && b.to > now ? [{ from: Math.max(b.from, now), to: b.to, pct: b.pct }] : [];
  });
}

/**
 * Pays the buff of `src` (a new window of its hours from `now`, replacing the one it had) when the matching event is running at `now`. Returns the same save when there is no League clock, no such
 * event right now, or the save is not one that may get it. A Hunting session that is running gets the window from now on, never for the time already hunted.
 */
export function grantEventBuff(save: SaveData, src: EventBuffSource, now: number, epoch: number | null = getLeagueEpoch()): SaveData {
  if (epoch === null || !Number.isFinite(now)) return save;
  const running = eventAt(epoch, now);
  if (!running || running.id !== src) return save;
  const rule = EVENT_BUFF_RULES[src];
  const buff: EventBuff = { from: now, to: now + rule.hours * HOUR_MS, pct: rule.pct };
  const session = save.huntSession;
  return {
    ...save,
    eventBuffs: { ...(save.eventBuffs ?? {}), [src]: buff },
    ...(session ? { huntSession: { ...session, eventXp: [...(session.eventXp ?? []), buff].slice(-16) } } : {}),
  };
}

/** Boss stages cleared by a Dungeon run: biome bosses (25 / 50 / 75 / 100) and, past floor 100, every tenth depth. */
export function bossStagesCleared(startFloor: number, stages: number): number {
  let n = 0;
  for (let s = startFloor + 1; s <= startFloor + stages; s++) {
    if (s <= 100 ? s % 25 === 0 : (s - 100) % 10 === 0) n++;
  }
  return n;
}

/** Corrida da Masmorra: the Gold and the buff a finished Dungeon run earns for the bosses it cleared. `gold` 0 and the same save when there is nothing to pay. */
export function applyDungeonRace(save: SaveData, startFloor: number, stages: number, now: number, epoch: number | null = getLeagueEpoch()): { save: SaveData; gold: number } {
  if (epoch === null || stages <= 0) return { save, gold: 0 };
  const bosses = bossStagesCleared(startFloor, stages);
  if (bosses <= 0 || eventAt(epoch, now)?.id !== 'dungeon_race') return { save, gold: 0 };
  const gold = bosses * (EVENT_BUFF_RULES.dungeon_race.goldPerBoss ?? 0);
  const paid = grantEventBuff({ ...save, gold: save.gold + gold }, 'dungeon_race', now, epoch);
  return { save: paid, gold };
}

/** Corrida Final: the day the fourth daily goal is claimed the buff starts (a second claim the same day just renews it). */
export function applyFinalRaceClaim(save: SaveData, now: number, epoch: number | null = getLeagueEpoch()): SaveData {
  if (epoch === null || eventAt(epoch, now)?.id !== 'final_race') return save;
  return save.quests.dailyClaimed.length >= 4 ? grantEventBuff(save, 'final_race', now, epoch) : save;
}

// ---- professions -------------------------------------------------------------------------------------------------------------------------------

/** The profession the player picked for one Semana das Profissoes (`at` = the start of THAT event, so a second Semana asks again). */
export interface EventPick {
  at: number;
  profession: ProfessionId;
}

export function sanitizeEventPick(raw: unknown): EventPick | undefined {
  const r = raw as Partial<EventPick> | null | undefined;
  if (!r || typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at <= 0 || !PROFESSION_IDS.includes(r.profession as ProfessionId)) return undefined;
  return { at: Math.floor(r.at), profession: r.profession as ProfessionId };
}

/** The Semana das Profissoes window that is running (or the next one) and the pick the save holds for it, or null. */
export function pickedProfession(save: Pick<SaveData, 'eventPick'>, window: LeagueEventWindow): ProfessionId | null {
  return window.id === 'profession_week' && save.eventPick?.at === window.startMs ? save.eventPick.profession : null;
}

/** Picks `profession` for the Semana das Profissoes running at `now` (the pick is final for that week). null when no such week is running or one profession was already picked. */
export function applyProfessionPick(save: SaveData, profession: ProfessionId, now: number, epoch: number | null = getLeagueEpoch()): SaveData | null {
  if (epoch === null || !PROFESSION_IDS.includes(profession)) return null;
  const week = eventAt(epoch, now);
  if (!week || week.id !== 'profession_week' || pickedProfession(save, week)) return null;
  return { ...save, eventPick: { at: week.startMs, profession } };
}

/**
 * Extra effective hours the profession events give a Mining / Woodcutting session that accrued during [startMs, startMs + pendingMs]: the overlap with a Febre da Mineracao x its +25% (Mining
 * only). Like the Gatherer Brew it only counts the part of the session the event really covered.
 */
export function eventGatherBonusHours(kind: 'mining' | 'woodcutting', startMs: number, pendingMs: number, epoch: number | null = getLeagueEpoch()): number {
  if (epoch === null || kind !== 'mining' || !(pendingMs > 0) || !Number.isFinite(startMs)) return 0;
  let hours = 0;
  for (const w of leagueEventWindows(epoch)) if (w.id === 'mining_fever') hours += (overlap(startMs, startMs + pendingMs, w.startMs, w.endMs) / HOUR_MS) * PROFESSION_EVENT_RULES.mining_fever.miningUnitsPct;
  return hours;
}

/**
 * The multiplier on the skill XP of `profession` earned over [startMs, endMs]: 1 + the bonus of every event window weighted by how much of the span it covers. A harvest (an instant) passes
 * startMs = endMs and counts the window it falls in whole.
 */
export function eventSkillXpMultiplier(save: Pick<SaveData, 'eventPick'>, profession: ProfessionId, startMs: number, endMs: number, epoch: number | null = getLeagueEpoch()): number {
  if (epoch === null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return 1;
  const span = endMs - startMs;
  let bonus = 0;
  for (const w of leagueEventWindows(epoch)) {
    let pct = 0;
    if (w.id === 'crafts_festival') pct = PROFESSION_EVENT_RULES.crafts_festival.skillXpPct;
    else if (w.id === 'profession_week' && pickedProfession(save, w) === profession) pct = PROFESSION_EVENT_RULES.profession_week.pickedSkillXpPct;
    else if (w.id === 'mining_fever') continue; // its bonus is in the units, not in the XP per unit
    if (pct <= 0) continue;
    const share = span > 0 ? overlap(startMs, endMs, w.startMs, w.endMs) / span : w.startMs <= startMs && startMs < w.endMs ? 1 : 0;
    bonus += pct * share;
  }
  return 1 + bonus;
}
