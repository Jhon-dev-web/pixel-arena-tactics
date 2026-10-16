import type { MaterialBalances } from '../../supabase/functions/_shared/materials/types';
import type { SaveData } from './engine';
import { ItemServerUnreachable, newRequestId } from './itemServer';
import { MaterialApi } from './materialServer';
import { dropMaterialClaim } from './materialClaims';
import {
  TRADEABLE_MATERIALS,
  TradeableMap,
  addTradeableUnits,
  convertToTradeable,
  finishBurn,
  isTradeableMaterial,
  startBurn,
  tradeableOf,
} from './tradeableMaterials';
import { setTradeableReachable } from './tradeableStatus';

// The web build's tradeable-material actions (tradeableMaterials.ts, docs/MARKET_FOUNDATION.md "Materiais negociaveis"). Each one asks the SERVER and only then changes the save with exactly what
// came back: the roll of a claim (which of its units are tradeable), the burn of units the game spent, and the reconcile of the save with the account's balance. If the server cannot be reached
// nothing is invented: a claim keeps waiting in the save, a burn keeps waiting in the save, and while it is down the game refuses to SPEND tradeable units (tradeableStatus.ts).

async function ask<T>(run: () => Promise<T>): Promise<T | 'unreachable'> {
  try {
    const out = await run();
    setTradeableReachable(true);
    return out;
  } catch (err) {
    if (err instanceof ItemServerUnreachable) {
      setTradeableReachable(false);
      return 'unreachable';
    }
    throw err;
  }
}

// ---- the roll of a claim ----------------------------------------------------------------------------------------------------------------------------------------------

export interface ClaimStep {
  status: 'none' | 'unreachable' | 'applied' | 'dropped';
  save?: SaveData;
  /** the tradeable units this claim turned up, by material (only those that fit the bag) */
  found?: TradeableMap;
}

/**
 * Sends the oldest queued claim report to the server and marks the units it rolled as tradeable. The report leaves the queue in the same step as the marking, so a claim is never
 * rolled twice (and the server answers a request id once). Unreachable = the report stays queued. A refusal (a limit, a place the account cannot have reached) is final: the units stay normal.
 */
export async function resolveNextClaim(api: MaterialApi, getSave: () => SaveData): Promise<ClaimStep> {
  const claim = getSave().materialClaims?.[0];
  if (!claim) return { status: 'none' };
  const answer = await ask(() => api.claim({ requestId: claim.id, activity: claim.activity, place: claim.place, ...(claim.depth ? { depth: claim.depth } : {}), durationMs: claim.durationMs, units: claim.units as Record<string, number> }));
  if (answer === 'unreachable') return { status: 'unreachable' };
  let s = getSave();
  if (!s.materialClaims?.some((c) => c.id === claim.id)) return { status: 'none' };
  // (the app's tsconfig is not strict, so the ok / refusal union does not narrow by itself: these read the fields explicitly)
  const granted = (answer as { tradeable?: Record<string, number> }).tradeable;
  if (answer.ok !== true || !granted) {
    if ((answer as { reason?: string }).reason === 'unavailable') return { status: 'unreachable' };
    return { status: 'dropped', save: dropMaterialClaim(s, claim.id) };
  }
  const found: TradeableMap = {};
  for (const [id, k] of Object.entries(granted)) {
    if (!isTradeableMaterial(id)) continue;
    const r = convertToTradeable(s, id, k);
    s = r.save;
    if (r.converted > 0) found[id] = r.converted;
  }
  return { status: 'applied', save: dropMaterialClaim(s, claim.id), found };
}

// ---- the burn of units the game spent -----------------------------------------------------------------------------------------------------------------------------

/**
 * Sends the queued burns to the server in batches (one request id per batch, kept in the save until the server answers, so a lost answer is never burned twice). `commit` replaces the save.
 * 'unreachable' = the batch stays in the save and is sent again later.
 */
export async function flushBurns(api: MaterialApi, getSave: () => SaveData, commit: (s: SaveData) => void, newId: () => string = newRequestId): Promise<'idle' | 'ok' | 'unreachable'> {
  let result: 'idle' | 'ok' = 'idle';
  for (let round = 0; round < 5; round++) {
    if (!getSave().tradeableBurning) {
      const started = startBurn(getSave(), newId);
      if (!started) return result;
      commit(started);
    }
    const batch = getSave().tradeableBurning;
    if (!batch) return result;
    const answer = await ask(() => api.sync({ action: 'burn', requestId: batch.id, units: batch.units as Record<string, number> }));
    if (answer === 'unreachable') return 'unreachable';
    commit(finishBurn(getSave()));
    result = 'ok';
  }
  return result;
}

// ---- reconcile with the balance --------------------------------------------------------------------------------------------------------------------------------------------

export interface SyncPlan {
  save: SaveData;
  /** units the save now holds (or already held) of what the server delivered: tell the server so it stops counting them as pending */
  ack: Record<string, number>;
  /** a request id for that acknowledgement that is the same for the same delivery (retry-safe) and different for a newer one */
  ackKey: string;
}

const fnv = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};

/**
 * Makes the save agree with the server's balances (pure; tested):
 *   1. the tradeable stack of a material can never exceed what the server says the account owns: the excess simply becomes normal units (the total does not change);
 *   2. units the server delivered (a purchase, a cancelled or expired listing) are added to the save as far as the account's balance and the bag allow. Units already in the save from a
 *      delivery whose acknowledgement was lost (the stack is at the balance) are not added twice; the part the bag has no room for stays pending and comes later.
 */
export function planSync(save: SaveData, balances: MaterialBalances): SyncPlan {
  let s = save;
  const ack: Record<string, number> = {};
  const parts: string[] = [];
  for (const id of TRADEABLE_MATERIALS) {
    const qty = Math.max(0, balances[id]?.qty ?? 0);
    const pending = Math.min(Math.max(0, balances[id]?.pending ?? 0), qty);
    const have = tradeableOf(s, id);
    if (have > qty) {
      // 1. clamp: the units above the balance are normal units from now on
      const tradeable = { ...(s.tradeableMaterials ?? {}) };
      if (qty > 0) tradeable[id] = qty;
      else delete tradeable[id];
      s = { ...s, tradeableMaterials: tradeable };
      if (Object.keys(tradeable).length === 0) {
        const copy = { ...s } as SaveData;
        delete copy.tradeableMaterials;
        s = copy;
      }
    }
    if (pending <= 0) continue;
    // 2. delivery
    const headroom = Math.max(0, qty - tradeableOf(s, id));
    const deliverable = Math.min(pending, headroom);
    const stale = pending - deliverable;
    const added = deliverable > 0 ? addTradeableUnits(s, id, deliverable) : { save: s, added: 0 };
    s = added.save;
    const n = added.added + stale;
    if (n > 0) {
      ack[id] = n;
      parts.push(`${id}.${balances[id]?.seq ?? 0}.${n}`);
    }
  }
  return { save: s, ack, ackKey: `ack:${fnv(parts.sort().join('|'))}${fnv(parts.length + parts.join(''))}`.slice(0, 64) };
}

/**
 * The reconcile on load (and now and then): sends the queued burns first (so the balance already counts what was spent), reads the balances, makes the save agree and acknowledges what it
 * took in. `commit` replaces the save. Resolves 'unreachable' when the server could not be reached (nothing changes then).
 */
export async function runSync(api: MaterialApi, getSave: () => SaveData, commit: (s: SaveData) => void, newId: () => string = newRequestId): Promise<'ok' | 'unreachable'> {
  if ((await flushBurns(api, getSave, commit, newId)) === 'unreachable') return 'unreachable';
  const balances = await ask(() => api.balances());
  if (balances === 'unreachable') return 'unreachable';
  const plan = planSync(getSave(), balances);
  if (plan.save !== getSave()) commit(plan.save);
  if (Object.keys(plan.ack).length > 0) await ask(() => api.sync({ action: 'ack', requestId: plan.ackKey, units: plan.ack }));
  return 'ok';
}
