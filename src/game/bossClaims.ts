import type { SaveData } from './engine';

// Web build (itemAuthority.ts): the unique drops of the Dungeon bosses are rolled by the SERVER, when a run is banked (mint-item boss_drop). A run that cleared bosses leaves a claim in the
// save until the server has answered, so a closed tab or a server that is down for a minute never loses the roll: the claim is sent again, with the SAME request id (the server answers a
// request id once). The claim carries no result and no number the server believes except the stages themselves, which it validates and rate-limits (supabase/functions/_shared/items).

export interface PendingBossClaim {
  id: string;
  stages: number[];
  luck: number;
  at: number;
}

export const MAX_PENDING_BOSS_CLAIMS = 10;
export const MAX_STAGES_PER_CLAIM = 60;
const ID_RE = /^[A-Za-z0-9_.:-]{8,64}$/;

export function sanitizeBossClaims(raw: unknown): PendingBossClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: PendingBossClaim[] = [];
  for (const c of raw as Partial<PendingBossClaim>[]) {
    if (!c || typeof c.id !== 'string' || !ID_RE.test(c.id) || !Array.isArray(c.stages)) continue;
    const stages = c.stages.filter((s): s is number => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 100_000).slice(0, MAX_STAGES_PER_CLAIM);
    if (stages.length === 0) continue;
    const luck = typeof c.luck === 'number' && Number.isFinite(c.luck) ? Math.min(10, Math.max(1, c.luck)) : 1;
    out.push({ id: c.id, stages, luck, at: typeof c.at === 'number' && Number.isFinite(c.at) ? c.at : 0 });
    if (out.length >= MAX_PENDING_BOSS_CLAIMS) break;
  }
  return out;
}

/** Adds the claim of a banked run (split into several claims when it cleared more bosses than one request may carry). */
export function queueBossClaims(save: SaveData, stages: number[], luck: number, at: number, newId: () => string): SaveData {
  if (stages.length === 0) return save;
  const claims = [...(save.pendingBossClaims ?? [])];
  for (let i = 0; i < stages.length; i += MAX_STAGES_PER_CLAIM) {
    if (claims.length >= MAX_PENDING_BOSS_CLAIMS) break;
    claims.push({ id: newId(), stages: stages.slice(i, i + MAX_STAGES_PER_CLAIM), luck, at });
  }
  return { ...save, pendingBossClaims: claims };
}

export function dropBossClaim(save: SaveData, id: string): SaveData {
  const claims = (save.pendingBossClaims ?? []).filter((c) => c.id !== id);
  const { pendingBossClaims: _old, ...rest } = save;
  void _old;
  return claims.length > 0 ? { ...rest, pendingBossClaims: claims } : (rest as SaveData);
}
