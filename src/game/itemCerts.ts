import { useSyncExternalStore } from 'react';
import type { CertificateView } from '../../supabase/functions/_shared/items/types';
import { getGear } from './gear';
import type { GearInstance } from './gearInstances';
import { PouchId, certifiedPouchIds, pouchFaceMatches } from './goldPouch';

// The certificates the SERVER holds for this account (public.item_certificates, readable by its owner only). The game keeps a copy so the screens can say "Certificado" -- and it says it ONLY
// when the piece carries a certificate id that is in this list AND the certificate describes exactly this piece. The save is the player's to edit; this list is the server's word.

const byId = new Map<string, CertificateView>();
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/** Replaces the whole list with what the server just said. */
export function setCertificates(list: CertificateView[]): void {
  byId.clear();
  for (const c of list) byId.set(c.id, c);
  loaded = true;
  emit();
}

/** Adds / updates certificates (a mint answered, a bind answered). */
export function upsertCertificates(list: CertificateView[]): void {
  if (list.length === 0) return;
  for (const c of list) byId.set(c.id, c);
  emit();
}

/** The server said a certificate is now in this state (bind / void / burn answered). */
export function patchCertificate(id: string, patch: Partial<Pick<CertificateView, 'status' | 'bound'>>): void {
  const c = byId.get(id);
  if (!c) return;
  byId.set(id, { ...c, ...patch });
  emit();
}

export const getCertificate = (id: string | undefined | null): CertificateView | undefined => (id ? byId.get(id) : undefined);
export const certificatesLoaded = (): boolean => loaded;
export const clearCertificates = (): void => {
  byId.clear();
  loaded = false;
  emit();
};

/** Re-renders a component when the list changes. */
export function useCertificatesVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version, // (server rendering: only the tests render this on a server)
  );
}

const sameSubstats = (a: CertificateView['substats'], b: GearInstance['substats']): boolean => a.length === b.length && a.every((s, i) => s.type === b[i]?.type && s.value === b[i]?.value);

/**
 * Does this certificate describe exactly this piece, as it is now? The same template, rarity, rolls and refine level, and the piece was never reforged or lapidated since. A piece changed
 * in any way after it was certified (the game voids its certificate first) no longer matches, even if a reroll happened to land on the same numbers.
 */
export function certificateDescribes(inst: GearInstance, cert: CertificateView): boolean {
  if (cert.status !== 'held' && cert.status !== 'listed') return false;
  const unique = !!getGear(inst.templateId)?.unique;
  if (cert.kind !== (unique ? 'unique' : 'gear')) return false;
  return (
    cert.templateId === inst.templateId &&
    cert.rarity === inst.rarity &&
    cert.upgrade === inst.upgrade &&
    sameSubstats(cert.substats, inst.substats) &&
    inst.reforgeCount === 0 &&
    (inst.lapidarCount ?? 0) === 0
  );
}

export type CertState =
  /** the id is in the server's list and the certificate describes this piece */
  | 'verified'
  /** the piece carries an id the server does not confirm (not loaded yet, not the account's, burned, or the piece changed) */
  | 'unverified'
  /** no certificate id: rolled on a device, or an older save */
  | 'none';

export function certState(inst: GearInstance): CertState {
  if (!inst.certificateId) return 'none';
  const cert = byId.get(inst.certificateId);
  return cert && certificateDescribes(inst, cert) ? 'verified' : 'unverified';
}

/** How many of the pouches of this kind the SERVER confirms: the id is in its list, held, and it is a pouch of this face value. The rest are shown as "no certificate". */
export function verifiedPouchCount(save: Parameters<typeof certifiedPouchIds>[0], id: PouchId): number {
  return certifiedPouchIds(save, id).filter((c) => {
    const row = byId.get(c);
    return !!row && row.status === 'held' && row.kind === 'gold_pouch' && row.templateId === id && pouchFaceMatches(id, row.goldAmount);
  }).length;
}

/** The save's piece without the certificate id (after the server revoked it: the piece was changed, so it stays usable and untradeable). */
export function withoutCertificate<S extends { gearInstances: Record<string, GearInstance> }>(save: S, instanceId: string): S {
  const inst = save.gearInstances[instanceId];
  if (!inst?.certificateId) return save;
  const { certificateId: _gone, ...rest } = inst;
  void _gone;
  return { ...save, gearInstances: { ...save.gearInstances, [instanceId]: rest } };
}
