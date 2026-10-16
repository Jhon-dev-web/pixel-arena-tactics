import type { SaveData } from './engine';
import { ConsumableId } from './consumables';
import { ownsAdventurerPass } from './entitlements';
import { addWithOverflow, stockIsEmpty } from './inventory';
import { isCertificateId } from './gearInstances';
import { merchantDayKey } from './merchant';
import { count, withStats } from './stats';
import T from './tunables';

// BOLSA DE OURO (round 18): Gold turned into a bag item that other players can be sold, once the player market exists (it needs a server that does not exist yet; this module is
// only the local, offline-safe half).
//
//   - CREATING: any player. A fixed denomination (T.goldPouch.denomSmall / Medium / Large; the smallest is also the minimum amount of a pouch). The player pays the
//     face value PLUS a fee (T.goldPouch.feePctFree of it, 10%; the Adventurer Pass owner pays T.goldPouch.feePct, 5%; rounded up: always a Gold sink), and at most T.goldPouch.perDay pouches a local day (the same day boundary as the merchants),
//     so a pouch cannot be bulk free storage. The pouch goes into the bag like any stackable (99 per slot), so it takes bag room; nothing is created when there is none.
//   - OPENING: anyone who holds one, owner or not, for EXACTLY its face value, irreversible (the screen confirms). Opening is not "earning" Gold: it is excluded from the
//     lifetime Gold counter, or create-and-open in a loop would farm the Gold achievements.
//   - So create -> open is always a net loss of exactly the fee, and no path makes Gold out of nothing: the Gold of a pouch leaves the hero on creation and comes back once, on
//     opening. (Export / import of a save is a copy of the whole hero, outside this rule: the Gold and the pouches in it are copied together, like every other item.)
//   - A pouch is unbound by nature and tradeable: isTradeable (gearInstances.ts) is THE rule the market will ask. The merchants never buy it (sellValue 0).
//   - CERTIFIED POUCHES (docs/MARKET_FOUNDATION.md): in the web build the SERVER creates a pouch (mint-item, which limits how much Gold can become pouches) and certifies it with its face value;
//     `save.pouchCerts` keeps the certificate ids by pouch id. Opening a certified pouch burns its certificate on the server first. A pouch with no certificate (made offline, or before this
//     existed) opens exactly as before and can never be sold. Uncertified ones are opened first, so a certified pouch is never spent by accident.
//   - The Gold inside pouches is not spendable, but it is the hero's: the statistics show it as "patrimônio".

export type PouchId = Extract<ConsumableId, 'gold_pouch_s' | 'gold_pouch_m' | 'gold_pouch_l'>;
export const POUCH_IDS: readonly PouchId[] = ['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l'];

export const isPouchId = (id: string): id is PouchId => (POUCH_IDS as readonly string[]).includes(id);

// The faces before Rodada 22. Pouches minted at them (certificates kept by the server) keep their value, and an old save's uncertified pouches were settled at them (migratePouchFaces).
export const LEGACY_POUCH_FACES: Record<PouchId, number> = { gold_pouch_s: 10000, gold_pouch_m: 50000, gold_pouch_l: 100000 };

const face = (id: PouchId): number => Math.max(1, Math.floor(id === 'gold_pouch_s' ? T.goldPouch.denomSmall : id === 'gold_pouch_m' ? T.goldPouch.denomMedium : T.goldPouch.denomLarge));

// What a pouch is worth when opened (and what the market values it at least): its denomination.
export const pouchFace = (id: PouchId): number => face(id);

// Does a certificate of `goldAmount` describe a pouch of this kind: its current face, or the face it had before Rodada 22.
export const pouchFaceMatches = (id: PouchId, goldAmount: number): boolean => goldAmount === face(id) || goldAmount === LEGACY_POUCH_FACES[id];

// The smallest amount a pouch can hold.
export const pouchMinimum = (): number => Math.min(...POUCH_IDS.map(face));

// The fee in Gold on top of the face value: always at least 1 while the fee rate is positive.
// `owner`: the Adventurer Pass owner pays the lower rate.
export const feeRate = (owner: boolean): number => (owner ? T.goldPouch.feePct : T.goldPouch.feePctFree);
export const pouchFee = (id: PouchId, owner: boolean): number => (feeRate(owner) > 0 ? Math.max(1, Math.ceil(face(id) * feeRate(owner) - 1e-9)) : 0);

export const pouchCost = (id: PouchId, owner: boolean): number => face(id) + pouchFee(id, owner);

export const pouchPerDay = (): number => Math.max(1, Math.floor(T.goldPouch.perDay));

// The numbers the rules text prints (pt / en and the Pass perk line), all read from the same tunables as the code above. `fee` is the Pass owner's rate, `free` everyone else's.
export const pouchRuleParams = (): { min: number; fee: number; free: number; n: number } => ({ min: pouchMinimum(), fee: Math.round(T.goldPouch.feePct * 100), free: Math.round(T.goldPouch.feePctFree * 100), n: pouchPerDay() });

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

// The Pass does not gate creating a pouch any more, only the fee.
export const paysPassFee = (save: Pick<SaveData, 'hasBattlePass'>): boolean => ownsAdventurerPass(save);

// The certificate ids the hero holds, by pouch id (bag and stash together). A pouch with no id here is an uncertified one.
export type PouchCerts = Partial<Record<PouchId, string[]>>;

export function sanitizePouchCerts(raw: unknown): PouchCerts {
  const out: PouchCerts = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of POUCH_IDS) {
    const list = (raw as Record<string, unknown>)[id];
    if (!Array.isArray(list)) continue;
    const ids = Array.from(new Set((list as unknown[]).filter(isCertificateId))).slice(0, 500);
    if (ids.length > 0) out[id] = ids;
  }
  return out;
}

const pouchTotal = (save: Pick<SaveData, 'consumables' | 'stash'>, id: PouchId): number => (save.consumables?.[id] ?? 0) + (save.stash?.consumables?.[id] ?? 0);

/** The certificate ids of the pouches of this kind the hero holds (never more than the pouches he really has). */
export const certifiedPouchIds = (save: Pick<SaveData, 'consumables' | 'stash' | 'pouchCerts'>, id: PouchId): string[] => (save.pouchCerts?.[id] ?? []).slice(0, pouchTotal(save, id));

/** How many of the pouches of this kind have no certificate. */
export const uncertifiedPouchCount = (save: Pick<SaveData, 'consumables' | 'stash' | 'pouchCerts'>, id: PouchId): number => Math.max(0, pouchTotal(save, id) - certifiedPouchIds(save, id).length);

/** The certificate that opening one pouch of this kind would burn: null while an uncertified one is left (it is opened first) or when none is certified. */
export function certificateToBurnOnOpen(save: Pick<SaveData, 'consumables' | 'stash' | 'pouchCerts'>, id: PouchId): string | null {
  if (uncertifiedPouchCount(save, id) > 0) return null;
  const list = certifiedPouchIds(save, id);
  return list.length > 0 ? list[list.length - 1] : null;
}

export type PouchFailure = 'limit' | 'gold' | 'bag' | 'none' | 'certified';
export interface PouchResult {
  ok: boolean;
  reason?: PouchFailure;
  save?: SaveData;
  gold?: number;
}

// One pouch, made (any player; the fee is the Pass owner's or the regular one). Gold -(face + fee), the pouch +1 in the bag, today's count +1; all or nothing.
// `certificateId`: the id the server gave this pouch (mint-item); without one the pouch is uncertified.
export function applyCreatePouch(save: SaveData, id: PouchId, now: number, certificateId?: string): PouchResult {
  if (pouchesLeftToday(save, now) <= 0) return { ok: false, reason: 'limit' };
  const cost = pouchCost(id, paysPassFee(save));
  if (!Number.isFinite(save.gold) || save.gold < cost) return { ok: false, reason: 'gold' };
  const placed = addWithOverflow({ ...save, gold: save.gold - cost }, { consumables: { [id]: 1 } }, { now });
  if (!stockIsEmpty(placed.leftover)) return { ok: false, reason: 'bag' };
  const next: SaveData = { ...placed.save, pouchDay: { day: merchantDayKey(now), made: pouchesMadeToday(save, now) + 1 } };
  if (isCertificateId(certificateId)) next.pouchCerts = { ...save.pouchCerts, [id]: [...(save.pouchCerts?.[id] ?? []), certificateId] };
  return { ok: true, save: next, gold: cost };
}

// One pouch, opened: the pouch -1, Gold +face, exactly. Anyone may. It only ever comes from the bag.
// `burnedCertificateId`: the certificate of the pouch being opened, already burned on the server. Opening a CERTIFIED pouch without it is refused ('certified'): its certificate has to be burned
// first (bind-item), otherwise the pouch could be opened here and still sold.
export function applyOpenPouch(save: SaveData, id: PouchId, burnedCertificateId?: string): PouchResult {
  const have = save.consumables?.[id] ?? 0;
  if (have <= 0) return { ok: false, reason: 'none' };
  const certs = certifiedPouchIds(save, id);
  // a pouch minted at the old face (its certificate is on the save's legacy list) opens for that face
  const value = burnedCertificateId && save.legacyPouchCerts?.includes(burnedCertificateId) ? LEGACY_POUCH_FACES[id] : face(id);
  let pouchCerts = save.pouchCerts;
  if (uncertifiedPouchCount(save, id) <= 0 && certs.length > 0) {
    if (!burnedCertificateId || !certs.includes(burnedCertificateId)) return { ok: false, reason: 'certified' };
    pouchCerts = { ...pouchCerts, [id]: certs.filter((c) => c !== burnedCertificateId) };
  }
  const legacyLeft = burnedCertificateId && save.legacyPouchCerts?.includes(burnedCertificateId) ? (save.legacyPouchCerts ?? []).filter((c) => c !== burnedCertificateId) : undefined;
  const opened: SaveData = { ...save, gold: save.gold + value, consumables: { ...save.consumables, [id]: have - 1 }, ...(pouchCerts !== save.pouchCerts ? { pouchCerts } : {}) };
  if (legacyLeft) {
    if (legacyLeft.length > 0) opened.legacyPouchCerts = legacyLeft;
    else delete opened.legacyPouchCerts;
  }
  // Opening is Gold that was already the hero's: not "earned" (trackSave subtracts exactly this from the Gold counter).
  const next = withStats(opened, (s) => ({ pouchGoldOpened: (s.pouchGoldOpened ?? 0) + count(value) }));
  return { ok: true, save: next, gold: value };
}

// Gold inside the pouches the hero holds, in the bag and in the stash: not spendable. A pouch minted at the old face counts that face.
export function pouchGoldHeld(save: Pick<SaveData, 'consumables' | 'stash'> & Partial<Pick<SaveData, 'pouchCerts' | 'legacyPouchCerts'>>): number {
  let sum = 0;
  for (const id of POUCH_IDS) {
    const total = (save.consumables?.[id] ?? 0) + (save.stash?.consumables?.[id] ?? 0);
    const legacy = save.legacyPouchCerts ?? [];
    const legacyHeld = legacy.length > 0 ? certifiedPouchIds({ consumables: save.consumables, stash: save.stash, pouchCerts: save.pouchCerts }, id).filter((c) => legacy.includes(c)).length : 0;
    sum += (total - legacyHeld) * face(id) + legacyHeld * LEGACY_POUCH_FACES[id];
  }
  return sum;
}

export function sanitizeLegacyPouchCerts(raw: unknown): string[] {
  return Array.isArray(raw) ? Array.from(new Set((raw as unknown[]).filter(isCertificateId))).slice(0, 500) : [];
}

// ONE-TIME SETTLEMENT of the Rodada 22 faces (10,000 / 50,000 / 100,000 became 2,000 / 5,000 / 20,000). A save without `pouchFacesV2` is settled once, on load:
//   - an UNCERTIFIED pouch (made offline, or before certificates) becomes Gold at the face it had when it was made: nothing is lost, and the Gold is not "earned" (it was the hero's: it
//     counts like opening a pouch), taken from the bag first and then from the stash;
//   - a CERTIFIED pouch stays a pouch (its certificate lives on the server, and burning it needs the server): its certificate goes on `legacyPouchCerts`, and when it is opened it pays the OLD
//     face, so it is worth what it was when it was minted (the market lists it at the certificate's own amount).
// A save that has the marker (every new hero, every save settled before) is returned as it is.
export function migratePouchFaces(save: SaveData): SaveData {
  if (save.pouchFacesV2) return save;
  const consumables = { ...save.consumables };
  const stashConsumables = { ...(save.stash?.consumables ?? {}) };
  const legacy: string[] = [];
  let gold = 0;
  for (const id of POUCH_IDS) {
    const inBag = consumables[id] ?? 0;
    const inStash = stashConsumables[id] ?? 0;
    const total = inBag + inStash;
    if (total <= 0) continue;
    const certs = (save.pouchCerts?.[id] ?? []).slice(0, total);
    legacy.push(...certs);
    const uncertified = total - certs.length;
    if (uncertified <= 0) continue;
    const fromBag = Math.min(inBag, uncertified);
    consumables[id] = inBag - fromBag;
    stashConsumables[id] = inStash - (uncertified - fromBag);
    gold += uncertified * LEGACY_POUCH_FACES[id];
  }
  const settled: SaveData = {
    ...save,
    gold: save.gold + gold,
    consumables,
    stash: save.stash ? { ...save.stash, consumables: stashConsumables } : save.stash,
    pouchFacesV2: true,
    ...(legacy.length > 0 ? { legacyPouchCerts: Array.from(new Set([...(save.legacyPouchCerts ?? []), ...legacy])) } : {}),
  };
  return gold > 0 ? withStats(settled, (s) => ({ pouchGoldOpened: (s.pouchGoldOpened ?? 0) + count(gold) })) : settled;
}

// Spendable Gold plus the Gold in pouches: the "patrimônio" line of the statistics.
export const patrimony = (save: Pick<SaveData, 'gold' | 'consumables' | 'stash'> & Partial<Pick<SaveData, 'pouchCerts' | 'legacyPouchCerts'>>): number => save.gold + pouchGoldHeld(save);

// DISCARDING pouches from the stack menu (bagActions.applyDiscard just lowers the count). A certified pouch that is thrown away must burn its certificate, or the server would keep a "held"
// certificate for a pouch that no longer exists (and it could, in principle, still be listed). The pouches thrown away are the uncertified ones first, then the certified ones from the end of
// the list (the same order opening uses), so this returns exactly the certificates that have to be burned for `n` pouches to go.
export function certificatesToBurnOnDiscard(save: Pick<SaveData, 'consumables' | 'stash' | 'pouchCerts'>, id: PouchId, qty: number | 'all'): string[] {
  const inBag = save.consumables?.[id] ?? 0;
  const n = Math.min(inBag, qty === 'all' ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(qty)));
  if (n <= 0) return [];
  const certs = certifiedPouchIds(save, id);
  const uncertified = uncertifiedPouchCount(save, id);
  const fromCerts = Math.max(0, n - uncertified);
  return fromCerts > 0 ? certs.slice(Math.max(0, certs.length - fromCerts)) : [];
}

/** Takes the burned certificate ids out of the save's list for this pouch (after the server confirmed the burn). */
export function withoutPouchCertificates<S extends Pick<SaveData, 'pouchCerts'>>(save: S, id: PouchId, burned: string[]): S {
  if (burned.length === 0 || !save.pouchCerts?.[id]) return save;
  const left = save.pouchCerts[id]!.filter((c) => !burned.includes(c));
  const pouchCerts = { ...save.pouchCerts };
  if (left.length > 0) pouchCerts[id] = left;
  else delete pouchCerts[id];
  return { ...save, pouchCerts };
}
