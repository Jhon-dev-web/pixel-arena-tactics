import type { CertKind, CertSource, SubstatRoll } from './types.ts';
import type { RarityId } from './tables.ts';

/** Stable JSON (keys sorted) so equal values always hash equal. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The content a certificate pins (migration 0010: the immutable columns). `upgrade` is always 0 at issue. */
export interface CertificateContent {
  kind: CertKind;
  templateId: string;
  rarity: RarityId | null;
  tier: number | null;
  substats: SubstatRoll[];
  upgrade: number;
  goldAmount: number | null;
  source: CertSource;
}

export const certificateContentHash = (c: CertificateContent): Promise<string> =>
  sha256Hex(canonicalJson({ kind: c.kind, templateId: c.templateId, rarity: c.rarity, tier: c.tier, substats: c.substats, upgrade: c.upgrade, goldAmount: c.goldAmount, source: c.source }));
