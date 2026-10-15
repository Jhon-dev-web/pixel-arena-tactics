import type { RarityId, SubstatKind } from './tables.ts';

// The wire format of mint-item / bind-item, shared by the Edge Functions and the game (the client imports this file for its types and its pure checks; no Deno API is used here).

export type CertKind = 'gear' | 'unique' | 'gold_pouch';
export type CertSource = 'forge' | 'hunt_drop' | 'boss_drop' | 'pouch';
export type CertStatus = 'held' | 'listed' | 'transferred' | 'burned' | 'revoked';

export interface SubstatRoll {
  type: SubstatKind;
  value: number;
}

/** What the owner of a certificate may read (the item_certificates row, minus internals). */
export interface CertificateView {
  id: string;
  kind: CertKind;
  templateId: string;
  rarity: RarityId | null;
  tier: number | null;
  substats: SubstatRoll[];
  upgrade: number;
  goldAmount: number | null;
  source: CertSource;
  status: CertStatus;
  bound: boolean;
  createdAt: string;
  contentHash: string;
}

export type MintBody =
  | { kind: 'forge'; requestId: string; templateId: string; seal?: boolean; burnCertificateIds?: string[] }
  | { kind: 'hunt_drop'; requestId: string; zoneId: string; durationMs: number; luck?: number }
  | { kind: 'boss_drop'; requestId: string; stages: number[]; luck?: number }
  | { kind: 'pouch'; requestId: string; pouchId: string };

/** One rolled piece. `certificate` is null when the piece is not tradeable (Common / Rare forge results, a Seal piece, born bound). */
export interface MintedItem {
  templateId: string;
  rarity: RarityId;
  substats: SubstatRoll[];
  /** A piece forged with the Blacksmith's Seal is born bound. */
  bound: boolean;
  certificate: CertificateView | null;
}

export type RefusalReason =
  | 'bad_request'
  | 'unknown_template'
  | 'too_early'
  | 'forge_rate'
  | 'seal_pass_required'
  | 'seal_limit'
  | 'cert_day_limit'
  | 'hunt_time'
  | 'boss_rate'
  | 'pouch_count_limit'
  | 'pouch_gold_limit'
  | 'burn_not_held';

export type MintResult =
  | { ok: true; kind: 'forge'; item: MintedItem }
  | { ok: true; kind: 'hunt_drop' | 'boss_drop'; items: MintedItem[]; rolls: number }
  | { ok: true; kind: 'pouch'; pouchId: string; goldAmount: number; certificate: CertificateView }
  | { ok: false; reason: RefusalReason; retryAfterSeconds?: number };

export type BindAction = 'bind' | 'void' | 'burn';

export interface BindBody {
  action: BindAction;
  certificateIds: string[];
  /** void only: why the certificate no longer describes the piece. Free text for the audit, bounded to 64 characters. */
  reason?: string;
}

export type BindResult =
  | { ok: true; certificates: { id: string; status: CertStatus; bound: boolean }[] }
  | { ok: false; reason: 'bad_request' | 'not_found' | 'not_held' | 'listed' };

/** The stored shape of a request's answer without the certificate bodies (those are rows of item_certificates, by request_index). */
export type StoredItem = Omit<MintedItem, 'certificate'> & { certIndex: number | null };
export type StoredTemplate =
  | { kind: 'forge'; item: StoredItem }
  | { kind: 'hunt_drop' | 'boss_drop'; items: StoredItem[]; rolls: number }
  | { kind: 'pouch'; pouchId: string; goldAmount: number };
