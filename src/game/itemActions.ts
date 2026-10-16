import type { CertificateView } from '../../supabase/functions/_shared/items/types';
import type { SaveData } from './engine';
import { getGear } from './gear';
import { ForgeRoll, GearInstance, applyEquipInstance, applyForge, isCertificateId, isInstancedItem } from './gearInstances';
import { PouchId, applyCreatePouch, applyOpenPouch, certificateToBurnOnOpen, certificatesToBurnOnDiscard, withoutPouchCertificates } from './goldPouch';
import { applyDiscard } from './bagActions';
import { clearIntent, intentRequestId } from './mintIntents';
import { needsServerUniques, withServerUniques } from './huntLifecycle';
import { ItemApi, ItemServerUnreachable, newRequestId } from './itemServer';
import { isServerItemAuthority } from './itemAuthority';
import { patchCertificate, upsertCertificates, withoutCertificate } from './itemCerts';
import { PendingBossClaim, dropBossClaim } from './bossClaims';
import { UniqueDrop, addUniqueInstance } from './uniques';
import { withStats } from './stats';

// The web build's item actions (docs/MARKET_FOUNDATION.md). Each one asks the SERVER for what it has to roll or record, and only then applies the pure reducer of the game to the save with
// exactly what came back. If the server cannot be reached the action is BLOCKED (`blocked: 'unreachable'`) and the save is untouched: there is no local fallback that could create a
// tradeable item. Every function takes `getSave` (the save as it is NOW: the app may have changed it while the request was in flight) and an injectable api (tests pass a fake server).
//
// What happens to a certified piece the player changes (the rule is explained in docs/MARKET_FOUNDATION.md, "Refinar, reforjar, lapidar"):
//   * equipping BINDS it on the server first (irreversible; a bound certificate can never be listed);
//   * refining, reforging or lapidating an UNBOUND certified piece VOIDS its certificate first (the piece stays in the save, usable, and is never tradeable again);
//   * salvaging, discarding, using it as a recipe ingredient, or opening a certified Gold Pouch BURNS the certificate.
// A bound piece needs no void (it can never be sold anyway). A piece with no certificate (offline, or from before certificates) never calls the server for any of this.

export type Blocked = 'unreachable' | 'refused' | 'game' | 'listed';
export interface ActionFail {
  ok: false;
  blocked: Blocked;
  /** The server's refusal code (RefusalReason) or the reducer's reason, for the message. */
  reason?: string;
}
// One flat shape (tsconfig.app.json is not strict, so a ok / blocked union would not narrow): `ok` true = `save` and the extra fields are set; false = `blocked` says why.
export type ActionResult<T extends object = object> = { ok: boolean; save?: SaveData; blocked?: Blocked; reason?: string } & Partial<T>;

const unreachable = (): ActionFail => ({ ok: false, blocked: 'unreachable' });

// (tsconfig.app.json is not strict, so the ok / reason unions do not narrow by themselves: these read them explicitly.)
const refusal = (a: { ok: boolean }): string => String((a as { reason?: string }).reason ?? 'bad_request');

async function ask<T>(run: () => Promise<T>): Promise<T | 'unreachable'> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ItemServerUnreachable) return 'unreachable';
    throw err;
  }
}

const rememberCertificate = (c: CertificateView | null | undefined): void => {
  if (c) upsertCertificates([c]);
};

// ---- bind / void / burn of one certificate ----------------------------------------------------------------------------------------------------------------------------

type Transition = 'ok' | 'dead' | 'listed' | 'unreachable';

/** 'dead' = the server says that certificate is not a live one of this account (already burned / revoked, or unknown): there is nothing to protect, the piece just has no certificate any more. */
async function transition(api: ItemApi, action: 'bind' | 'void' | 'burn', certificateId: string, reason: string): Promise<Transition> {
  const r = await ask(() => api.bind(action, [certificateId], reason));
  if (r === 'unreachable') return 'unreachable';
  if (r.ok) {
    for (const c of r.certificates) patchCertificate(c.id, { status: c.status, bound: c.bound });
    return 'ok';
  }
  return refusal(r) === 'listed' ? 'listed' : 'dead';
}

const certifiedUnbound = (inst: GearInstance | undefined): inst is GearInstance & { certificateId: string } => isServerItemAuthority() && !!inst && isCertificateId(inst.certificateId) && !inst.bound;

/** The pieces whose certificate would be voided if the player changed them now (the UI asks before). */
export const changeVoidsCertificate = (inst: GearInstance | undefined): boolean => certifiedUnbound(inst);

/** Equip: a certified piece is bound on the server first. Equipping a piece with no live certificate works as always. */
export async function equipAction(api: ItemApi, getSave: () => SaveData, instanceId: string): Promise<ActionResult> {
  const inst = getSave().gearInstances[instanceId];
  if (!inst) return { ok: false, blocked: 'game' };
  let dead = false;
  if (certifiedUnbound(inst)) {
    const t = await transition(api, 'bind', inst.certificateId, 'equip');
    if (t === 'unreachable') return unreachable();
    if (t === 'listed') return { ok: false, blocked: 'listed' };
    dead = t === 'dead';
  }
  let s = getSave();
  if (dead) s = withoutCertificate(s, instanceId);
  const next = applyEquipInstance(s, instanceId);
  return next ? { ok: true, save: next } : { ok: false, blocked: 'game' };
}

/**
 * Refine / reforge / lapidate: an unbound certified piece loses its certificate first. `canApply` is a DRY RUN of the game's own reducer (false = it would refuse): a refused change must not cost
 * the player his certificate, so nothing is voided unless the change can happen. Resolves with the save to apply the real reducer to (the piece without the certificate id), computed from
 * the save as it is when the server answered.
 */
export async function changeAction(api: ItemApi, getSave: () => SaveData, instanceId: string, reason: 'refine' | 'reforge' | 'lapidar', canApply: (save: SaveData) => boolean): Promise<ActionResult> {
  const inst = getSave().gearInstances[instanceId];
  if (!inst || !canApply(getSave())) return { ok: false, blocked: 'game' };
  if (!certifiedUnbound(inst)) return { ok: true, save: getSave() };
  const t = await transition(api, 'void', inst.certificateId, reason);
  if (t === 'unreachable') return unreachable();
  if (t === 'listed') return { ok: false, blocked: 'listed' };
  return { ok: true, save: withoutCertificate(getSave(), instanceId) };
}

/** Salvage / discard: a certified piece is burned on the server first (so it cannot be sold after it is gone). Resolves with the current save; the caller applies the reducer to it. */
export async function removeAction(api: ItemApi, getSave: () => SaveData, instanceId: string, reason: 'salvage' | 'discard', canApply: (save: SaveData) => boolean): Promise<ActionResult> {
  const inst = getSave().gearInstances[instanceId];
  if (!inst || !canApply(getSave())) return { ok: false, blocked: 'game' };
  if (isServerItemAuthority() && isCertificateId(inst.certificateId)) {
    const t = await transition(api, 'burn', inst.certificateId, reason);
    if (t === 'unreachable') return unreachable();
    if (t === 'listed') return { ok: false, blocked: 'listed' };
  }
  return { ok: true, save: getSave() };
}

// ---- forge ------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface ForgeActionOpts {
  level: number;
  consumedIds?: string[];
  seal?: boolean;
  now?: number;
}

/** Forge. Web build: the server rolls the rarity and substats (and burns the certified recipe ingredients); the save gets exactly that. Offline: the device rolls, as it always did. */
export async function forgeAction(api: ItemApi, getSave: () => SaveData, templateId: string, opts: ForgeActionOpts): Promise<ActionResult<{ instance: GearInstance | null; sealUsed: boolean }>> {
  const s0 = getSave();
  const item = getGear(templateId);
  const base = { level: opts.level, consumedIds: opts.consumedIds, seal: opts.seal, now: opts.now };
  if (!isServerItemAuthority() || !item || !isInstancedItem(item)) {
    const r = applyForge(s0, templateId, base);
    return r.ok && r.save ? { ok: true, save: r.save, instance: r.instance ?? null, sealUsed: !!r.sealUsed } : { ok: false, blocked: 'game', reason: r.reason };
  }
  // In the web build a forge without a roll is a preview: it checks the Gold, the materials, the ingredients and the bag, and rolls nothing.
  const pre = applyForge(s0, templateId, base);
  if (!pre.ok) return { ok: false, blocked: 'game', reason: pre.reason };
  const burn = Array.from(new Set((pre.consumed ?? []).map((i) => i.certificateId).filter(isCertificateId)));
  const sealWanted = !!opts.seal && (s0.consumables.forge_seal ?? 0) > 0;
  // The request id outlives a lost answer (mintIntents.ts): asking again for the SAME forge returns what the server already rolled instead of rolling (and certifying) a second piece.
  const intentKey = `forge:${templateId}:${sealWanted ? 1 : 0}:${[...burn].sort().join(',')}`;
  const answer = await ask(() => api.mint({ kind: 'forge', requestId: intentRequestId(intentKey, newRequestId), templateId, seal: sealWanted, ...(burn.length > 0 ? { burnCertificateIds: burn } : {}) }));
  if (answer === 'unreachable') return unreachable(); // the id is kept: the next try fetches the stored result
  if (!answer.ok) {
    clearIntent(intentKey); // a refusal is final (nothing was stored)
    return { ok: false, blocked: 'refused', reason: refusal(answer) };
  }
  if (answer.kind !== 'forge') {
    clearIntent(intentKey);
    return { ok: false, blocked: 'refused', reason: 'bad_request' };
  }
  const roll: ForgeRoll = { rarity: answer.item.rarity, substats: answer.item.substats, bound: answer.item.bound, certificateId: answer.item.certificate?.id };
  rememberCertificate(answer.item.certificate);
  for (const id of burn) patchCertificate(id, { status: 'burned' });
  const r = applyForge(getSave(), templateId, { ...base, roll });
  if (!r.ok || !r.save) return { ok: false, blocked: 'game', reason: r.reason };
  // The pieces the recipe really consumed must be exactly the ones the server burned (the save may have changed while the request was in flight).
  const leaked = (r.consumed ?? []).some((i) => isCertificateId(i.certificateId) && !burn.includes(i.certificateId));
  if (leaked) return { ok: false, blocked: 'game', reason: 'ingredients' };
  clearIntent(intentKey); // applied: this action is finished (if the game refused above, the id stays so a retry gets the same piece)
  return { ok: true, save: r.save, instance: r.instance ?? null, sealUsed: !!r.sealUsed };
}

// ---- Hunting: the unique drops of a reward --------------------------------------------------------------------------------------------------------------------------

const dropOf = (item: { templateId: string; rarity: UniqueDrop['rarity']; substats: UniqueDrop['substats']; certificate: CertificateView | null }): UniqueDrop => ({
  templateId: item.templateId,
  rarity: item.rarity,
  substats: item.substats,
  ...(item.certificate ? { certificateId: item.certificate.id } : {}),
});

const safeRequestId = (prefix: string, id: string): string => `${prefix}:${id}`.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 64);

/**
 * Web build: sends the pending Hunting reward to the server, which rolls its unique drops (bounded by server-observed time) and certifies them; the reward then carries them and can be
 * claimed as always. A reward with nothing to roll passes through. Unreachable = blocked (the reward stays pending, nothing is lost). A refusal (a limit, a zone the account cannot have
 * reached) does NOT block the gold and the materials: the reward is claimed without uniques.
 */
export async function resolveHuntUniques(api: ItemApi, getSave: () => SaveData): Promise<ActionResult<{ uniques: number; refused?: string }>> {
  const s = getSave();
  const p = s.pendingHuntReward;
  if (!p || !needsServerUniques(p)) return { ok: true, save: s, uniques: 0 };
  const answer = await ask(() => api.mint({ kind: 'hunt_drop', requestId: safeRequestId('hunt', p.id), zoneId: p.zoneId, durationMs: p.pendingMs, luck: p.uniqueRoll?.luck ?? 1 }));
  if (answer === 'unreachable') return unreachable();
  let drops: UniqueDrop[] = [];
  let refused: string | undefined;
  if (answer.ok && (answer.kind === 'hunt_drop' || answer.kind === 'boss_drop')) {
    drops = answer.items.map(dropOf);
    for (const it of answer.items) rememberCertificate(it.certificate);
  } else if (!answer.ok) refused = refusal(answer); // a refusal (a limit, a zone not reachable yet) is final for this reward: it is paid without uniques, and the owner's audit list has the flag
  const next = withServerUniques(getSave(), p.id, drops);
  return next ? { ok: true, save: next, uniques: drops.length, ...(refused ? { refused } : {}) } : { ok: false, blocked: 'game' };
}

// ---- Dungeon bosses -------------------------------------------------------------------------------------------------------------------------------------------------

/** Sends one banked run's boss claim to the server and puts the uniques it rolled in the bag (a full bag never costs the drop, like every Dungeon loot). Unreachable = the claim stays queued. */
export async function settleBossClaim(api: ItemApi, getSave: () => SaveData, claim: PendingBossClaim, now: number): Promise<ActionResult<{ uniques: number; refused?: string }>> {
  const answer = await ask(() => api.mint({ kind: 'boss_drop', requestId: claim.id, stages: claim.stages, luck: claim.luck }));
  if (answer === 'unreachable') return unreachable();
  let s = getSave();
  if (!answer.ok) return { ok: true, save: dropBossClaim(s, claim.id), uniques: 0, refused: refusal(answer) };
  if (answer.kind !== 'boss_drop' && answer.kind !== 'hunt_drop') return { ok: true, save: dropBossClaim(s, claim.id), uniques: 0, refused: 'bad_request' };
  answer.items.forEach((it, i) => {
    rememberCertificate(it.certificate);
    s = addUniqueInstance(s, dropOf(it), `sv${claim.id}_${i}`, now);
  });
  if (answer.items.length > 0) s = withStats(s, (st) => ({ uniquesFound: st.uniquesFound + answer.items.length }));
  return { ok: true, save: dropBossClaim(s, claim.id), uniques: answer.items.length };
}

// ---- Gold Pouch --------------------------------------------------------------------------------------------------------------------------------------------------------

/** Create a pouch. Web build: the server limits how much Gold can become pouches and certifies the pouch with its face value. */
export async function createPouchAction(api: ItemApi, getSave: () => SaveData, id: PouchId, now: number): Promise<ActionResult<{ gold: number }>> {
  const s0 = getSave();
  const pre = applyCreatePouch(s0, id, now);
  if (!pre.ok) return { ok: false, blocked: 'game', reason: pre.reason };
  if (!isServerItemAuthority()) return { ok: true, save: pre.save!, gold: pre.gold ?? 0 };
  const intentKey = `pouch:${id}`;
  const answer = await ask(() => api.mint({ kind: 'pouch', requestId: intentRequestId(intentKey, newRequestId), pouchId: id }));
  if (answer === 'unreachable') return unreachable(); // the id is kept: the next try fetches the stored pouch instead of minting a second one
  if (!answer.ok) {
    clearIntent(intentKey);
    return { ok: false, blocked: 'refused', reason: refusal(answer) };
  }
  if (answer.kind !== 'pouch') {
    clearIntent(intentKey);
    return { ok: false, blocked: 'refused', reason: 'bad_request' };
  }
  rememberCertificate(answer.certificate);
  const r = applyCreatePouch(getSave(), id, now, answer.certificate.id);
  if (r.ok && r.save) {
    clearIntent(intentKey);
    return { ok: true, save: r.save, gold: r.gold ?? 0 };
  }
  return { ok: false, blocked: 'game', reason: r.reason };
}

/** Open a pouch. An uncertified one opens as always; a certified one is burned on the server first. */
export async function openPouchAction(api: ItemApi, getSave: () => SaveData, id: PouchId): Promise<ActionResult<{ gold: number }>> {
  const s0 = getSave();
  const certId = isServerItemAuthority() ? certificateToBurnOnOpen(s0, id) : null;
  if (certId) {
    const t = await transition(api, 'burn', certId, 'open_pouch');
    if (t === 'unreachable') return unreachable();
    if (t === 'listed') return { ok: false, blocked: 'listed' };
  }
  // Offline (or uncertified), a certified pouch cannot be opened locally: applyOpenPouch refuses it without a burned certificate.
  const r = applyOpenPouch(getSave(), id, certId ?? undefined);
  return r.ok && r.save ? { ok: true, save: r.save, gold: r.gold ?? 0 } : { ok: false, blocked: 'game', reason: r.reason };
}

/**
 * Discard part or all of a stack of Gold Pouches from the stack menu (the lost gap of the foundation round): the certificates of the pouches thrown away are burned on the server FIRST, so a
 * pouch that no longer exists cannot keep a live certificate. Uncertified pouches go first, then the certified ones from the end of the list (the order opening uses). Unreachable = blocked, nothing
 * is thrown away. The burn is idempotent, so a retry after a partial failure is safe.
 */
export async function discardPouchAction(api: ItemApi, getSave: () => SaveData, id: PouchId, qty: number | 'all'): Promise<ActionResult> {
  const s0 = getSave();
  if (!applyDiscard(s0, 'consumable', id, qty)) return { ok: false, blocked: 'game' };
  const ids = isServerItemAuthority() ? certificatesToBurnOnDiscard(s0, id, qty) : [];
  for (let i = 0; i < ids.length; i += 16) {
    const chunk = ids.slice(i, i + 16);
    const r = await ask(() => api.bind('burn', chunk, 'discard_pouch'));
    if (r === 'unreachable') return unreachable();
    if (r.ok) {
      for (const c of r.certificates) patchCertificate(c.id, { status: c.status, bound: c.bound });
    } else if (refusal(r) === 'listed') return { ok: false, blocked: 'listed' };
    // 'not_found' / 'not_held' = the server does not hold it as a live certificate of this account: there is nothing left to protect
  }
  const now = getSave();
  const next = applyDiscard(now, 'consumable', id, qty);
  return next ? { ok: true, save: withoutPouchCertificates(next, id, ids) } : { ok: false, blocked: 'game' };
}
