import type { SaveData } from './engine';
import { ConsumableId } from './consumables';
import { ownsAdventurerPass } from './entitlements';
import { addWithOverflow, stockIsEmpty } from './inventory';
import { merchantDayKey } from './merchant';
import { count, withStats } from './stats';
import T from './tunables';

// BOLSA DE OURO (round 18): Gold turned into a bag item that other players can be sold, once the player market exists (it needs a server that does not exist yet; this module is
// only the local, offline-safe half).
//
//   - CREATING: only the Adventurer Pass owner. A fixed denomination (T.goldPouch.denomSmall / Medium / Large; the smallest is also the minimum amount of a pouch). The player pays the
//     face value PLUS a fee (T.goldPouch.feePct of it, rounded up: always a Gold sink), and at most T.goldPouch.perDay pouches a local day (the same day boundary as the merchants),
//     so a pouch cannot be bulk free storage. The pouch goes into the bag like any stackable (99 per slot), so it takes bag room; nothing is created when there is none.
//   - OPENING: anyone who holds one, owner or not, for EXACTLY its face value, irreversible (the screen confirms). Opening is not "earning" Gold: it is excluded from the
//     lifetime Gold counter, or create-and-open in a loop would farm the Gold achievements.
//   - So create -> open is always a net loss of exactly the fee, and no path makes Gold out of nothing: the Gold of a pouch leaves the hero on creation and comes back once, on
//     opening. (Export / import of a save is a copy of the whole hero, outside this rule: the Gold and the pouches in it are copied together, like every other item.)
//   - A pouch is unbound by nature and tradeable: isTradeable (gearInstances.ts) is THE rule the market will ask. The merchants never buy it (sellValue 0).
//   - The Gold inside pouches is not spendable, but it is the hero's: the statistics show it as "patrimônio".

export type PouchId = Extract<ConsumableId, 'gold_pouch_s' | 'gold_pouch_m' | 'gold_pouch_l'>;
export const POUCH_IDS: readonly PouchId[] = ['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l'];

export const isPouchId = (id: string): id is PouchId => (POUCH_IDS as readonly string[]).includes(id);

const face = (id: PouchId): number => Math.max(1, Math.floor(id === 'gold_pouch_s' ? T.goldPouch.denomSmall : id === 'gold_pouch_m' ? T.goldPouch.denomMedium : T.goldPouch.denomLarge));

// What a pouch is worth when opened (and what the market values it at least): its denomination.
export const pouchFace = (id: PouchId): number => face(id);

// The smallest amount a pouch can hold.
export const pouchMinimum = (): number => Math.min(...POUCH_IDS.map(face));

// The fee in Gold on top of the face value: always at least 1 while the fee rate is positive.
export const pouchFee = (id: PouchId): number => (T.goldPouch.feePct > 0 ? Math.max(1, Math.ceil(face(id) * T.goldPouch.feePct - 1e-9)) : 0);

export const pouchCost = (id: PouchId): number => face(id) + pouchFee(id);

export const pouchPerDay = (): number => Math.max(1, Math.floor(T.goldPouch.perDay));

// The numbers the rules text prints (pt / en and the Pass perk line), all read from the same tunables as the code above.
export const pouchRuleParams = (): { min: number; fee: number; n: number } => ({ min: pouchMinimum(), fee: Math.round(T.goldPouch.feePct * 100), n: pouchPerDay() });

export interface PouchDayState {
  day: string; // toDateString() of the local day `made` belongs to
  made: number; // pouches created that day
}
export const emptyPouchDay = (): PouchDayState => ({ day: '', made: 0 });

export function sanitizePouchDay(raw: unknown, now: number): PouchDayState {
  const r = (raw ?? {}) as Partial<PouchDayState>;
  const made = Math.floor(Number(r.made));
  return r.day === merchantDayKey(now) && Number.isFinite(made) && made > 0 ? { day: r.day, made: Math.min(made, 1e6) } : emptyPouchDay();
}

export function pouchesMadeToday(save: Pick<SaveData, 'pouchDay'>, now: number): number {
  const p = save.pouchDay;
  return p && p.day === merchantDayKey(now) ? p.made : 0;
}

export const pouchesLeftToday = (save: Pick<SaveData, 'pouchDay'>, now: number): number => Math.max(0, pouchPerDay() - pouchesMadeToday(save, now));

export const canCreatePouches = (save: Pick<SaveData, 'hasBattlePass'>): boolean => ownsAdventurerPass(save);

export type PouchFailure = 'noPass' | 'limit' | 'gold' | 'bag' | 'none';
export interface PouchResult {
  ok: boolean;
  reason?: PouchFailure;
  save?: SaveData;
  gold?: number;
}

// One pouch, made. Gold -(face + fee), the pouch +1 in the bag, today's count +1; all or nothing.
export function applyCreatePouch(save: SaveData, id: PouchId, now: number): PouchResult {
  if (!canCreatePouches(save)) return { ok: false, reason: 'noPass' };
  if (pouchesLeftToday(save, now) <= 0) return { ok: false, reason: 'limit' };
  const cost = pouchCost(id);
  if (!Number.isFinite(save.gold) || save.gold < cost) return { ok: false, reason: 'gold' };
  const placed = addWithOverflow({ ...save, gold: save.gold - cost }, { consumables: { [id]: 1 } }, { now });
  if (!stockIsEmpty(placed.leftover)) return { ok: false, reason: 'bag' };
  const next: SaveData = { ...placed.save, pouchDay: { day: merchantDayKey(now), made: pouchesMadeToday(save, now) + 1 } };
  return { ok: true, save: next, gold: cost };
}

// One pouch, opened: the pouch -1, Gold +face, exactly. Anyone may. It only ever comes from the bag.
export function applyOpenPouch(save: SaveData, id: PouchId): PouchResult {
  const have = save.consumables?.[id] ?? 0;
  if (have <= 0) return { ok: false, reason: 'none' };
  const value = face(id);
  const opened = { ...save, gold: save.gold + value, consumables: { ...save.consumables, [id]: have - 1 } };
  // Opening is Gold that was already the hero's: not "earned" (trackSave subtracts exactly this from the Gold counter).
  const next = withStats(opened, (s) => ({ pouchGoldOpened: (s.pouchGoldOpened ?? 0) + count(value) }));
  return { ok: true, save: next, gold: value };
}

// Gold inside the pouches the hero holds, in the bag and in the stash: not spendable.
export function pouchGoldHeld(save: Pick<SaveData, 'consumables' | 'stash'>): number {
  let sum = 0;
  for (const id of POUCH_IDS) sum += ((save.consumables?.[id] ?? 0) + (save.stash?.consumables?.[id] ?? 0)) * face(id);
  return sum;
}

// Spendable Gold plus the Gold in pouches: the "patrimônio" line of the statistics.
export const patrimony = (save: Pick<SaveData, 'gold' | 'consumables' | 'stash'>): number => save.gold + pouchGoldHeld(save);
