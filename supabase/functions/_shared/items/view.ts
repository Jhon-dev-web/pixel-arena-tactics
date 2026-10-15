import type { RarityId } from './tables.ts';
import type { CertKind, CertSource, CertStatus, CertificateView } from './types.ts';

// The item_certificates row as PostgREST (or supabase-js with the user's own RLS read) returns it, and its public view. Shared by the REST store and the game.
export interface CertRow {
  id: string;
  kind: CertKind;
  template_id: string;
  rarity: RarityId | null;
  tier: number | null;
  substats: CertificateView['substats'];
  upgrade: number;
  gold_amount: number | null;
  source: CertSource;
  status: CertStatus;
  bound: boolean;
  created_at: string;
  content_hash: string;
}

export const CERT_COLUMNS = 'id,kind,template_id,rarity,tier,substats,upgrade,gold_amount,source,status,bound,created_at,content_hash';

export const toCertificateView = (r: CertRow): CertificateView => ({
  id: r.id,
  kind: r.kind,
  templateId: r.template_id,
  rarity: r.rarity,
  tier: r.tier,
  substats: r.substats ?? [],
  upgrade: r.upgrade,
  goldAmount: r.gold_amount,
  source: r.source,
  status: r.status,
  bound: r.bound,
  createdAt: r.created_at,
  contentHash: r.content_hash,
});
