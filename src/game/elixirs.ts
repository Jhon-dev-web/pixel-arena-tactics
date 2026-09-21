import type { SaveData } from './engine';
import { withSessionWindow } from './huntSession';
import T from './tunables';

// Timed damage elixirs, used by hand from the bag. Both work the same way and share the engine's buff machinery
// (expiry timestamp, combatModifiersFromSave for the Dungeon, session windows for Hunting):
//   strength_elixir -> +T.battle.strengthElixirDmgPct for T.battle.strengthElixirMinutes   (save.activeBuff)
//   atk_elixir      -> +T.battle.attackElixirDmgPct   for T.battle.attackElixirMinutes     (save.attackBuff)
// Using one again while it is active never stacks the bonus: it only renews the duration from now (and costs one more).
// The two different elixirs coexist and multiply, like every other damage modifier.

export type ElixirId = 'strength_elixir' | 'atk_elixir';

const MS_PER_MINUTE = 60 * 1000;
// A second use of the same elixir within this long of activating it is a stray double tap, not a renewal: it does nothing
// and spends nothing. After that, using it again renews the full duration (and costs a unit) as designed.
export const ELIXIR_DOUBLE_TAP_MS = 3000;

// Pure and atomic: returns the next save, or null when there is nothing to use (no unit, bad clock, or a stray double tap
// right after activating). One call consumes at most ONE unit, read from the save it is given.
export function applyElixir(save: SaveData, id: ElixirId, now: number): SaveData | null {
  const qty = save.consumables[id] ?? 0;
  if (!(qty > 0) || typeof now !== 'number' || !Number.isFinite(now) || now <= 0) return null;
  const isAttack = id === 'atk_elixir';
  const minutes = isAttack ? T.battle.attackElixirMinutes : T.battle.strengthElixirMinutes;
  const expiresAt = now + minutes * MS_PER_MINUTE;
  const current = isAttack ? save.attackBuff : save.activeBuff;
  const remaining = current ? current.expiresAt - now : 0;
  if (remaining > 0 && remaining <= minutes * MS_PER_MINUTE && remaining >= minutes * MS_PER_MINUTE - ELIXIR_DOUBLE_TAP_MS) return null;
  const buff = { type: isAttack ? ('attack' as const) : ('strength' as const), expiresAt };
  return {
    ...save,
    consumables: { ...save.consumables, [id]: qty - 1 },
    ...(isAttack ? { attackBuff: buff } : { activeBuff: buff }),
    // A running Hunting session only gets the bonus from now on (never for the time already hunted).
    huntSession: save.huntSession ? withSessionWindow(save.huntSession, buff.type, { from: now, to: expiresAt }) : save.huntSession,
  };
}
