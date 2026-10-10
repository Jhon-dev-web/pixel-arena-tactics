import { BUFF_ITEM, buffExpiry, buffMinutes, BuffKind, HUNT_BUFF_KINDS, isTimedKind, TimedBuffKind, withBuff } from './buffs';
import type { SaveData } from './engine';
import { MAX_DURABILITY } from './gear';
import T from './tunables';
import { withSessionWindow } from './huntSession';

// Timed consumables used by hand from the bag, one machinery for all of them (the kinds and their durations live in buffs.ts):
//   strength_elixir (+damage), atk_elixir (+damage)                     -> save.activeBuff / save.attackBuff
//   stoneskin / fortune / haste / gatherer / precision (Garden 3.0)    -> save.buffs[kind]
// Using one again while it is active never stacks the bonus: it only renews the duration from now (and costs one more). Buffs of DIFFERENT kinds
// coexist; the damage ones multiply like every other damage modifier, the stat ones add in their own place (see buffs.ts withTonicStats).

export type ElixirId = 'strength_elixir' | 'atk_elixir' | 'stoneskin_tonic' | 'fortune_tonic' | 'haste_tonic' | 'gatherer_brew' | 'precision_elixir';

const MS_PER_MINUTE = 60 * 1000;
// A second use of the same item within this long of activating it is a stray double tap, not a renewal: it does nothing
// and spends nothing. After that, using it again renews the full duration (and costs a unit) as designed.
export const ELIXIR_DOUBLE_TAP_MS = 3000;

export function isBuffItem(id: string): id is ElixirId {
  return id in BUFF_ITEM;
}

// Pure and atomic: returns the next save, or null when there is nothing to use (no unit, bad clock, or a stray double tap
// right after activating). One call consumes at most ONE unit, read from the save it is given.
export function applyElixir(save: SaveData, id: ElixirId, now: number): SaveData | null {
  const qty = save.consumables[id] ?? 0;
  const kind: BuffKind | undefined = BUFF_ITEM[id];
  if (!kind || !(qty > 0) || typeof now !== 'number' || !Number.isFinite(now) || now <= 0) return null;
  const duration = buffMinutes(kind) * MS_PER_MINUTE;
  const expiresAt = now + duration;
  const current = buffExpiry(save, kind);
  const remaining = current !== null ? current - now : 0;
  if (remaining > 0 && remaining <= duration && remaining >= duration - ELIXIR_DOUBLE_TAP_MS) return null;
  const next: SaveData = withBuff({ ...save, consumables: { ...save.consumables, [id]: qty - 1 } }, kind, now, expiresAt);
  // A running Hunting session only gets the bonus from now on (never for the time already hunted). The gatherer brew is read when Mining /
  // Woodcutting is collected, not by Hunting.
  const huntKind = kind === 'strength' || kind === 'attack' ? kind : isTimedKind(kind) && HUNT_BUFF_KINDS.includes(kind as TimedBuffKind) ? (kind as TimedBuffKind) : null;
  return {
    ...next,
    huntSession: next.huntSession && huntKind ? withSessionWindow(next.huntSession, huntKind, { from: now, to: expiresAt }) : next.huntSession,
  };
}

// Whetstone Oil: restores T.tonics.whetstoneDurability durability points (30 of 100) to the equipped weapon AND armor at once, capped at full. It is the
// cheap partial alternative to the Forge repair (full repair of one piece: repairCost(tier) gold each). null = nothing happens and nothing is spent: no unit,
// bad clock-free input, or both pieces already at full durability.
export function applyWhetstoneOil(save: SaveData): SaveData | null {
  const qty = save.consumables.whetstone_oil ?? 0;
  if (!(qty > 0)) return null;
  let instances = save.gearInstances;
  let restored = false;
  for (const slot of ['weapon', 'armor'] as const) {
    const id = save.equipped[slot];
    const inst = id ? instances[id] : undefined;
    if (!id || !inst || inst.durability >= MAX_DURABILITY) continue;
    instances = { ...instances, [id]: { ...inst, durability: Math.min(MAX_DURABILITY, inst.durability + T.tonics.whetstoneDurability) } };
    restored = true;
  }
  if (!restored) return null;
  return { ...save, gearInstances: instances, consumables: { ...save.consumables, whetstone_oil: qty - 1 } };
}
