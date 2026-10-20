import type { CertificateView } from '../../../supabase/functions/_shared/items/types';
import type { SaveData } from '../engine';
import { getGear } from '../gear';
import { GearInstance, TradeBlockReason, createGearInstance, isInstanceEquipped, isInstancedItem, isTradeable, tradeBlockReason } from '../gearInstances';
import { PouchId, certifiedPouchIds, isPouchId, pouchFaceMatches } from '../goldPouch';
import { addWithOverflow, fitsBag, stockIsEmpty } from '../inventory';
import { certState, getCertificate } from '../itemCerts';
import { RARITIES } from '../rarity';

// The game's side of the market, all pure (docs/MARKET_SOLANA.md):
//   * WHAT can be sold: a certified, unbound, socket-free piece the SERVER confirms, or a certified Gold Pouch the server confirms;
//   * taking a listed item OUT of the save (the item lives on the server while it is listed);
//   * putting a bought / returned item INTO the save from its CERTIFICATE (never from the seller's save, which the seller no longer has);
//   * cleaning up an item the server says is gone (listed or sold) if the save still holds it (a crash between listing and saving).
// A save holds at most what the server's certificates say; the certificate is the truth.

export type SellableEntry =
  | { kind: 'gear' | 'unique'; certificateId: string; instance: GearInstance }
  | { kind: 'gold_pouch'; certificateId: string; pouchId: PouchId; goldAmount: number };

const sameRarity = (r: string | null): boolean => !!r && RARITIES.some((x) => x.id === r);

/** Everything the player can put up for sale right now. The server's list decides ("Certificado" is its word); the game only filters the obvious. */
export function sellableEntries(save: SaveData): SellableEntry[] {
  const out: SellableEntry[] = [];
  for (const inst of Object.values(save.gearInstances)) {
    if (!inst.certificateId || !isTradeable(inst) || isInstanceEquipped(save, inst.id)) continue;
    if (inst.sockets.length > 0) continue; // gems come out first: they would vanish with the item (docs/MARKET_FOUNDATION.md)
    if (certState(inst) !== 'verified') continue;
    const cert = getCertificate(inst.certificateId);
    if (!cert || cert.status !== 'held' || cert.bound) continue;
    out.push({ kind: cert.kind === 'unique' ? 'unique' : 'gear', certificateId: cert.id, instance: inst });
  }
  for (const pouchId of ['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l'] as const) {
    for (const id of certifiedPouchIds(save, pouchId)) {
      const row = getCertificate(id);
      if (row && row.status === 'held' && row.kind === 'gold_pouch' && row.templateId === pouchId && pouchFaceMatches(pouchId, row.goldAmount)) out.push({ kind: 'gold_pouch', certificateId: id, pouchId, goldAmount: row.goldAmount });
    }
  }
  return out;
}

/** The pieces the player owns that cannot be sold, counted by the reason (the Sell tab says why they are not on offer). Starter pieces are left out. */
export function unsellableReasons(save: SaveData): Partial<Record<TradeBlockReason, number>> {
  const out: Partial<Record<TradeBlockReason, number>> = {};
  for (const inst of Object.values(save.gearInstances)) {
    if (inst.origin === 'starter') continue;
    const why = tradeBlockReason(inst);
    if (why) out[why] = (out[why] ?? 0) + 1;
  }
  return out;
}

/** Gear pieces with gems in them that would otherwise be sellable (the screen says "take the gems out first"). */
export function socketedButCertified(save: SaveData): GearInstance[] {
  return Object.values(save.gearInstances).filter((i) => i.certificateId && isTradeable(i) && i.sockets.length > 0 && !isInstanceEquipped(save, i.id) && certState(i) === 'verified');
}

/** The save without the item of this certificate (a listing was accepted: the item now lives on the server). Returns the same object when the item is not in the save. */
export function removeListedItem(save: SaveData, cert: Pick<CertificateView, 'id' | 'kind' | 'templateId'>): SaveData {
  if (cert.kind === 'gold_pouch') {
    if (!isPouchId(cert.templateId)) return save;
    const id = cert.templateId;
    const ids = save.pouchCerts?.[id] ?? [];
    if (!ids.includes(cert.id)) return save;
    const left = ids.filter((c) => c !== cert.id);
    const pouchCerts = { ...save.pouchCerts };
    if (left.length > 0) pouchCerts[id] = left;
    else delete pouchCerts[id];
    // one pouch leaves the bag, or the stash when the bag holds none
    const inBag = save.consumables?.[id] ?? 0;
    if (inBag > 0) return { ...save, pouchCerts, consumables: { ...save.consumables, [id]: inBag - 1 } };
    const inStash = save.stash?.consumables?.[id] ?? 0;
    if (inStash > 0 && save.stash) return { ...save, pouchCerts, stash: { ...save.stash, consumables: { ...save.stash.consumables, [id]: inStash - 1 } } };
    return { ...save, pouchCerts };
  }
  const found = Object.values(save.gearInstances).find((i) => i.certificateId === cert.id);
  if (!found || isInstanceEquipped(save, found.id)) return save;
  const gearInstances = { ...save.gearInstances };
  delete gearInstances[found.id];
  return { ...save, gearInstances };
}

export type DeliverStatus = 'added' | 'present' | 'full' | 'bad';

/**
 * Puts the item of a certificate the account owns into the save. 'present' = the save already has it (an earlier delivery that was not acknowledged yet): nothing is added twice. 'full' = no room in
 * the bag: nothing is added and the certificate stays waiting. The piece is built from the certificate's own content (template, rarity, substats, refine 0, no gems) with the certificate id on it.
 */
export function deliverCertificate(save: SaveData, cert: CertificateView, now: number): { save: SaveData; status: DeliverStatus } {
  if (cert.status !== 'held') return { save, status: 'bad' };
  if (cert.kind === 'gold_pouch') {
    if (!isPouchId(cert.templateId) || !pouchFaceMatches(cert.templateId, cert.goldAmount)) return { save, status: 'bad' };
    const id = cert.templateId;
    if ((save.pouchCerts?.[id] ?? []).includes(cert.id)) return { save, status: 'present' };
    const placed = addWithOverflow(save, { consumables: { [id]: 1 } }, { now });
    if (!stockIsEmpty(placed.leftover)) return { save, status: 'full' };
    return { save: { ...placed.save, pouchCerts: { ...save.pouchCerts, [id]: [...(save.pouchCerts?.[id] ?? []), cert.id] } }, status: 'added' };
  }
  if (Object.values(save.gearInstances).some((i) => i.certificateId === cert.id)) return { save, status: 'present' };
  const item = getGear(cert.templateId);
  if (!item || !isInstancedItem(item) || !sameRarity(cert.rarity) || (cert.kind === 'unique') !== !!item.unique) return { save, status: 'bad' };
  const id = `mk_${cert.id}`;
  let instance: GearInstance;
  try {
    instance = createGearInstance(cert.templateId, { id, origin: 'drop', rarity: cert.rarity as GearInstance['rarity'], substats: cert.substats, upgrade: 0, createdAt: now, certificateId: cert.id });
  } catch {
    return { save, status: 'bad' };
  }
  const next: SaveData = { ...save, gearInstances: { ...save.gearInstances, [id]: instance } };
  if (!fitsBag(save, next, now)) return { save, status: 'full' };
  return { save: next, status: 'added' };
}

/** Is the item of this certificate in the save? (used to acknowledge a delivery only once the SERVER holds a save that has it) */
export function saveHoldsCertificate(save: SaveData | null, cert: Pick<CertificateView, 'id' | 'kind' | 'templateId'>): boolean {
  if (!save) return false;
  if (cert.kind === 'gold_pouch') return isPouchId(cert.templateId) && (save.pouchCerts?.[cert.templateId] ?? []).includes(cert.id);
  return Object.values(save.gearInstances ?? {}).some((i) => i.certificateId === cert.id);
}

/**
 * The server says some certificates are 'listed' (on the market) or 'transferred' (sold). If the save still holds their items (the game closed between the listing and the save), they go: the item
 * is not the player's any more. Equipped pieces are left alone (an unbound certificate is never equipped; a made-up save is not this function's business).
 */
export function reconcileOutgoing(save: SaveData, certs: CertificateView[]): { save: SaveData; removed: number } {
  let next = save;
  let removed = 0;
  for (const c of certs) {
    if (c.status !== 'listed' && c.status !== 'transferred') continue;
    const after = removeListedItem(next, c);
    if (after !== next) {
      next = after;
      removed++;
    }
  }
  return { save: next, removed };
}
