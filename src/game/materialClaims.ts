import type { SaveData } from './engine';
import { isServerItemAuthority } from './itemAuthority';
import { MaterialId } from './materials';
import { isTradeableMaterial } from './tradeableMaterials';

// Web build (itemAuthority.ts): the SERVER decides which units of a claim are the tradeable variant (docs/MARKET_FOUNDATION.md, "Materiais negociaveis"). Every claim that puts materials in the
// bag (a Hunting reward, a Mining or Woodcutting session, a Garden harvest) leaves a small report in the save. The app sends it to the server (material-claim) with the SAME request id each
// time, so a closed tab or a server that is down never loses the roll and a retry is never a second roll; the answer says how many of the units are tradeable, the game marks that many, and
// the report leaves the queue in the same step.
//
// The report carries WHAT was claimed (the activity, the place, the time it covers, the units that went in the bag). It carries no result: the server validates the time and the units
// against the most the game can produce and rolls the dice itself. The id is deterministic, so the reducers that write it stay pure.

export type ClaimActivity = 'hunt' | 'mining' | 'woodcutting' | 'garden';

export interface PendingMaterialClaim {
  /** unique per claim, 8 to 64 characters of [A-Za-z0-9_.:-] */
  id: string;
  activity: ClaimActivity;
  /** hunt: the zone id. Mining / Woodcutting: the tier (the ore or wood material id). Garden: empty. */
  place: string;
  /** hunt only: shallow | dense | deep */
  depth?: string;
  /** the time the claim covers: hunt, mining, woodcutting = the session time; garden = the plot time of the harvested plants, added up */
  durationMs: number;
  /** the units that went into the bag, by material */
  units: Partial<Record<MaterialId, number>>;
  at: number;
}

export const MAX_PENDING_MATERIAL_CLAIMS = 12;
const ID_RE = /^[A-Za-z0-9_.:-]{8,64}$/;
const ACTIVITIES: readonly ClaimActivity[] = ['hunt', 'mining', 'woodcutting', 'garden'];

export const claimId = (prefix: string, ...parts: (string | number)[]): string => `${prefix}:${parts.map((p) => String(p).replace(/[^A-Za-z0-9_.-]/g, '_')).join(':')}`.slice(0, 64);

function cleanUnits(raw: unknown): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.floor(Number(v));
    if (isTradeableMaterial(id) && Number.isFinite(n) && n > 0) out[id] = Math.min(n, 1_000_000);
  }
  return out;
}

export function sanitizeMaterialClaims(raw: unknown): PendingMaterialClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: PendingMaterialClaim[] = [];
  for (const c of raw as Partial<PendingMaterialClaim>[]) {
    if (!c || typeof c.id !== 'string' || !ID_RE.test(c.id) || !ACTIVITIES.includes(c.activity as ClaimActivity)) continue;
    const units = cleanUnits(c.units);
    if (Object.keys(units).length === 0) continue;
    const durationMs = typeof c.durationMs === 'number' && Number.isFinite(c.durationMs) ? Math.min(Math.max(0, Math.floor(c.durationMs)), 30 * 86_400_000) : 0;
    out.push({
      id: c.id,
      activity: c.activity as ClaimActivity,
      place: typeof c.place === 'string' ? c.place.slice(0, 40) : '',
      ...(typeof c.depth === 'string' ? { depth: c.depth.slice(0, 16) } : {}),
      durationMs,
      units,
      at: typeof c.at === 'number' && Number.isFinite(c.at) ? c.at : 0,
    });
    if (out.length >= MAX_PENDING_MATERIAL_CLAIMS) break;
  }
  return out;
}

/**
 * Adds the report of a claim that has just put `units` in the bag. Only the web build (a server to roll with) does; every other build, a claim with nothing eligible in it, a claim already queued
 * and a full queue leave the save as it is (the units simply stay normal).
 */
export function queueMaterialClaim(save: SaveData, claim: Omit<PendingMaterialClaim, 'units'> & { units: Partial<Record<MaterialId, number>> }): SaveData {
  if (!isServerItemAuthority()) return save;
  const units = cleanUnits(claim.units);
  if (Object.keys(units).length === 0) return save;
  const queue = save.materialClaims ?? [];
  if (queue.length >= MAX_PENDING_MATERIAL_CLAIMS || queue.some((c) => c.id === claim.id)) return save;
  return { ...save, materialClaims: [...queue, { ...claim, units, durationMs: Math.max(0, Math.floor(claim.durationMs)) }] };
}

export function dropMaterialClaim(save: SaveData, id: string): SaveData {
  const claims = (save.materialClaims ?? []).filter((c) => c.id !== id);
  const { materialClaims: _old, ...rest } = save;
  void _old;
  return claims.length > 0 ? { ...rest, materialClaims: claims } : (rest as SaveData);
}
