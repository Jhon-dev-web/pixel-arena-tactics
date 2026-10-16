import type { AuthConfig } from '../auth.ts';
import { json } from '../http.ts';
import { HUNT_ZONES } from '../items/tables.ts';
import type { Rng } from '../items/roll.ts';
import type { TokenTake } from '../items/store.ts';
import { PACE_REJECT_FACTOR, daysAtFloor, daysAtLevel } from '../progress/bounds.ts';
import { prelude } from '../market/prelude.ts';
import { HERO_BUCKET, MATERIAL_BOUNDS, PLOT_BUCKET, UNITS_FLAG_FACTOR, dayBucket } from './bounds.ts';
import { TRADEABLE_CHANCE } from './rates.ts';
import type { MaterialStore } from './store.ts';
import { GARDEN_TABLE, HUNT_CEILING, MATERIAL_IDS, MINING_TIERS, WOODCUTTING_TIERS } from './tables.ts';
import { MATERIAL_ID_RE } from './types.ts';
import type { ClaimActivity, MaterialClaimBody, MaterialClaimResult, MaterialRefusal, MaterialSyncResult } from './types.ts';

// material-claim and material-sync. The user id comes ONLY from the verified JWT. A Hunting reward, a Mining or Woodcutting session or a Garden harvest, once claimed in the game, is REPORTED
// here (the activity, the place, the time it covers, the units that went into the bag); the server limits the report to what the game can produce, rolls which units are the tradeable variant
// with its own dice, takes them from a daily cap, credits the account's balance and answers how many. Nothing in a request body is trusted except as the thing being reported.

const DAY_MS = 86_400_000;
const REQUEST_ID_RE = /^[A-Za-z0-9_.:-]{8,64}$/;
const ELIGIBLE = new Set<string>(MATERIAL_IDS);
const ACTIVITIES: readonly ClaimActivity[] = ['hunt', 'mining', 'woodcutting', 'garden'];

export interface MaterialDeps {
  auth: AuthConfig;
  allowedOrigins: string[];
  store: MaterialStore;
  nowMs: () => number;
  /** The dice. Production passes secureRng; a test passes a scripted stream. */
  rng: Rng;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whole, non-negative units by material id; unknown or ineligible ids and non-numbers are dropped. null = the shape itself is wrong. */
export function parseUnits(raw: unknown, max: number): Record<string, number> | null {
  if (!isObj(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > 64) return null;
  const out: Record<string, number> = {};
  for (const k of keys) {
    const v = raw[k];
    if (!MATERIAL_ID_RE.test(k) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const n = Math.floor(v);
    if (n > 0 && ELIGIBLE.has(k)) out[k] = Math.min(n, max);
  }
  return out;
}

export function parseClaimBody(raw: Record<string, unknown>): MaterialClaimBody | null {
  if (typeof raw.requestId !== 'string' || !REQUEST_ID_RE.test(raw.requestId)) return null;
  if (!ACTIVITIES.includes(raw.activity as ClaimActivity)) return null;
  if (typeof raw.place !== 'string' || raw.place.length > 40) return null;
  if (typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs) || raw.durationMs < 0) return null;
  const units = parseUnits(raw.units, MATERIAL_BOUNDS.maxUnitsPerClaim);
  if (!units || Object.keys(units).length === 0) return null;
  return {
    requestId: raw.requestId,
    activity: raw.activity as ClaimActivity,
    place: raw.place,
    ...(typeof raw.depth === 'string' ? { depth: raw.depth.slice(0, 16) } : {}),
    durationMs: raw.durationMs,
    units,
  };
}

/** How many of `n` units are tradeable: n independent rolls of the server's dice, each with the chance of the material. */
export function rollTradeable(n: number, chance: number, rng: Rng): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < chance) k++;
  return k;
}

const refusalStatus = (reason: MaterialRefusal): number => (reason === 'bad_request' || reason === 'unknown_place' ? 400 : reason === 'unavailable' ? 503 : 429);

// ---- material-claim ---------------------------------------------------------------------------------------------------------------------------------------------------

export async function handleMaterialClaim(req: Request, deps: MaterialDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, cors } = pre;
  const body = parseClaimBody(pre.body);
  if (!body) return json({ ok: false, reason: 'bad_request' satisfies MaterialRefusal } satisfies MaterialClaimResult, 400, cors);

  const refuse = async (reason: MaterialRefusal, flagCode: string | null, detail: Record<string, unknown> = {}): Promise<Response> => {
    if (flagCode) await deps.store.flag(userId, flagCode, { activity: body.activity, reason, ...detail }).catch(() => undefined);
    return json({ ok: false, reason } satisfies MaterialClaimResult, refusalStatus(reason), cors);
  };

  try {
    // A request id that was already answered gets the same answer: a lost response is never a second roll.
    const replay = await deps.store.findRequest(userId, body.requestId);
    if (replay) return json({ ok: true, tradeable: replay.kind === 'claim' ? replay.tradeable : {} } satisfies MaterialClaimResult, 200, cors);

    const now = deps.nowMs();
    const startMs = await deps.store.accountStartMs(userId);
    if (startMs === null) return json({ error: 'unavailable' }, 503, cors);
    const ageDays = Math.max(0, (now - startMs) / DAY_MS);
    const tooEarly = (minDays: number): boolean => ageDays < minDays / PACE_REJECT_FACTOR;

    // 1. WHAT can be reported, and how much of it per hour: the ceiling of each material.
    let ceilingPerHour: (id: string) => number | null;
    let timeBucket: { bucket: string; perHour: number; capacity: number };
    if (body.activity === 'hunt') {
      const zone = HUNT_ZONES.find((z) => z.id === body.place);
      const ceilings = HUNT_CEILING[body.place];
      if (!zone || !ceilings) return refuse('unknown_place', null);
      if (tooEarly(Math.max(daysAtFloor(zone.unlockFloor), daysAtLevel(zone.unlockLevel)))) return refuse('too_early', 'MATERIAL_ZONE_TOO_EARLY', { zoneId: zone.id, ageDays: Math.floor(ageDays) });
      ceilingPerHour = (id) => ceilings[id] ?? null;
      timeBucket = { bucket: HERO_BUCKET, perHour: MATERIAL_BOUNDS.heroSecondsPerHour, capacity: MATERIAL_BOUNDS.heroCapacitySeconds };
    } else if (body.activity === 'mining' || body.activity === 'woodcutting') {
      const tiers = body.activity === 'mining' ? MINING_TIERS : WOODCUTTING_TIERS;
      if (!tiers.includes(body.place)) return refuse('unknown_place', null);
      ceilingPerHour = (id) => (id === body.place ? MATERIAL_BOUNDS.gatherUnitsPerHour : null); // only the tier's own material comes out of a session
      timeBucket = { bucket: HERO_BUCKET, perHour: MATERIAL_BOUNDS.heroSecondsPerHour, capacity: MATERIAL_BOUNDS.heroCapacitySeconds };
    } else {
      ceilingPerHour = (id) => GARDEN_TABLE[id]?.perPlotHour ?? null;
      timeBucket = { bucket: PLOT_BUCKET, perHour: MATERIAL_BOUNDS.plotSecondsPerHour, capacity: MATERIAL_BOUNDS.plotCapacitySeconds };
    }

    // 2. The TIME: paid for by the server clock (a partial take, like the Hunting unique drops).
    const requestedSeconds = Math.min(timeBucket.capacity, Math.floor(body.durationMs / 1000));
    let hours = 0;
    if (requestedSeconds > 0) {
      const took = await deps.store.takeTokens(userId, startMs, [{ bucket: timeBucket.bucket, cost: requestedSeconds, ratePerHour: timeBucket.perHour, capacity: timeBucket.capacity, partial: true }]);
      if ('failed' in took) return refuse('too_early', 'LIMIT_MATERIAL_TIME');
      const granted = took.granted[0] ?? 0;
      if (requestedSeconds - granted > MATERIAL_BOUNDS.flagExcessSeconds) await deps.store.flag(userId, 'MATERIAL_TIME_EXCESS', { activity: body.activity, requestedSeconds, grantedSeconds: Math.floor(granted) }).catch(() => undefined);
      hours = granted / 3600;
    }
    // (`hours` is the hero's hours, or the Garden's plot hours: the same arithmetic against the ceiling per hour or per plot hour)

    // 3. The UNITS: each material is limited to what its ceiling allows for that time; far beyond it is flagged, the part within it is eligible.
    const ids = Object.keys(body.units).sort();
    const eligible: Record<string, number> = {};
    let excess = false;
    for (const id of ids) {
      const perHour = ceilingPerHour(id);
      if (perHour === null) {
        excess = true; // a material this place does not produce
        continue;
      }
      const allowed = Math.ceil(perHour * hours);
      eligible[id] = Math.min(body.units[id], allowed);
      if (body.units[id] > allowed * UNITS_FLAG_FACTOR + 10) excess = true;
    }
    if (excess) await deps.store.flag(userId, 'MATERIAL_UNITS_EXCESS', { activity: body.activity, place: body.place }).catch(() => undefined);

    // 4. THE ROLL: the server's dice, a Binomial(eligible, chance) per material.
    const rolled: Record<string, number> = {};
    for (const id of ids) {
      const n = eligible[id] ?? 0;
      const k = n > 0 ? rollTradeable(n, TRADEABLE_CHANCE[id] ?? 0, deps.rng) : 0;
      if (k > 0) rolled[id] = k;
    }

    // 5. The DAILY CAP of each material (the bot bound): whole units only, the part over the cap is not granted.
    const granted: Record<string, number> = {};
    const rolledIds = Object.keys(rolled);
    if (rolledIds.length > 0) {
      const takes: TokenTake[] = rolledIds.map((id) => ({ bucket: dayBucket(id), cost: rolled[id], ratePerHour: MATERIAL_BOUNDS.dailyRatePerHour(id), capacity: MATERIAL_BOUNDS.dailyCapacity(id), partial: true, whole: true }));
      const took = await deps.store.takeTokens(userId, startMs, takes);
      if ('failed' in took) return refuse('too_early', 'LIMIT_MATERIAL_DAY');
      let capped = false;
      rolledIds.forEach((id, i) => {
        const g = Math.floor(took.granted[i] ?? 0);
        if (g > 0) granted[id] = g;
        if (g < rolled[id]) capped = true;
      });
      if (capped) await deps.store.flag(userId, 'LIMIT_MATERIAL_DAY', { activity: body.activity, place: body.place, rolled, granted }).catch(() => undefined);
    }

    // 6. Credit the balance and store the answer, atomically.
    const outcome = await deps.store.credit({ userId, requestId: body.requestId, credits: granted });
    if (outcome.status === 'replay') {
      const again = await deps.store.findRequest(userId, body.requestId);
      if (again) return json({ ok: true, tradeable: again.kind === 'claim' ? again.tradeable : {} } satisfies MaterialClaimResult, 200, cors);
      return json({ error: 'busy', retryAfterSeconds: 2 }, 429, { ...cors, 'retry-after': '2' });
    }
    return json({ ok: true, tradeable: granted } satisfies MaterialClaimResult, 200, cors);
  } catch (err) {
    console.error('[material-claim] failed', err instanceof Error ? err.message : 'unknown'); // message only: never a key, a token or a request body
    return json({ error: 'claim_failed' }, 502, cors);
  }
}

// ---- material-sync ----------------------------------------------------------------------------------------------------------------------------------------------------

/** { action: 'balances' } | { action: 'burn', requestId, units } | { action: 'ack', requestId, units } */
export async function handleMaterialSync(req: Request, deps: MaterialDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId, body, cors } = pre;
  try {
    if (body.action === 'balances') {
      return json({ ok: true, balances: await deps.store.balances(userId) } satisfies MaterialSyncResult, 200, cors);
    }
    if (body.action === 'burn' || body.action === 'ack') {
      if (typeof body.requestId !== 'string' || !REQUEST_ID_RE.test(body.requestId)) return json({ ok: false, reason: 'bad_request' } satisfies MaterialSyncResult, 400, cors);
      const units = parseUnits(body.units, 100_000_000);
      if (!units || Object.keys(units).length === 0) return json({ ok: false, reason: 'bad_request' } satisfies MaterialSyncResult, 400, cors);
      const r = body.action === 'burn' ? await deps.store.burn({ userId, requestId: body.requestId, units }) : await deps.store.ack({ userId, requestId: body.requestId, units });
      return json({ ok: true, balances: await deps.store.balances(userId), applied: r.applied } satisfies MaterialSyncResult, 200, cors);
    }
    return json({ ok: false, reason: 'bad_request' } satisfies MaterialSyncResult, 400, cors);
  } catch (err) {
    console.error('[material-sync] failed', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'sync_failed' }, 502, cors);
  }
}
