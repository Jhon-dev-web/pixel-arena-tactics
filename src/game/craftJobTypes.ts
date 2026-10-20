// The shape of the production job (craftJob.ts) and its sanitizer. A leaf module (no game imports) so engine.ts can load it without an import cycle.
//
// The hero makes the units of a Forge / Oficios batch one after another: unit i (1-based) is finished at startedAt + i x unitMs. `done` counts the units already delivered into the save; the
// others are "owed" and are delivered when the clock says so (on every tick and on load, so a closed game still finishes them), never earlier.

export type CraftJobKind = 'refine' | 'potion' | 'forge';

export interface CraftJob {
  kind: CraftJobKind;
  /** refine: the refining recipe id. potion: the potion recipe key. forge: the gear template id. */
  recipeId: string;
  /** units in the batch */
  qty: number;
  /** units already delivered */
  done: number;
  startedAt: number;
  /** ms one unit takes, frozen at the start */
  unitMs: number;
  /** forge only: use a Blacksmith's Seal on every unit while one is held */
  seal?: boolean;
}

export const MAX_CRAFT_BATCH = 9999;
const KINDS: readonly CraftJobKind[] = ['refine', 'potion', 'forge'];

export function sanitizeCraftJob(raw: unknown): CraftJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CraftJob>;
  if (!KINDS.includes(r.kind as CraftJobKind) || typeof r.recipeId !== 'string' || r.recipeId.length === 0 || r.recipeId.length > 80) return null;
  const qty = Math.floor(Number(r.qty));
  const done = Math.floor(Number(r.done));
  const startedAt = Number(r.startedAt);
  const unitMs = Number(r.unitMs);
  if (!Number.isFinite(qty) || qty < 1 || qty > MAX_CRAFT_BATCH) return null;
  if (!Number.isFinite(done) || done < 0 || done >= qty) return null;
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !Number.isFinite(unitMs) || unitMs < 50 || unitMs > 3_600_000) return null;
  return { kind: r.kind as CraftJobKind, recipeId: r.recipeId, qty, done, startedAt: Math.min(startedAt, Date.now()), unitMs, ...(r.seal === true ? { seal: true } : {}) };
}
