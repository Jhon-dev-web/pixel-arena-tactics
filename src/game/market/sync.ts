import type { CertificateView } from '../../../supabase/functions/_shared/items/types';
import type { SaveData } from '../engine';
import { MarketApi } from './api';
import { DeliverStatus, SellableEntry, deliverCertificate, reconcileOutgoing, removeListedItem, saveHoldsCertificate } from './items';

// The game keeps its save and the server's certificates in line (docs/MARKET_SOLANA.md). One pass does, in this order:
//   1. an item the server says is on the market or sold, but the save still holds (the game closed between the listing and the save): taken out of the save;
//   2. an item the server holds FOR this account (a purchase, a cancelled or expired listing): built from its certificate and put in the save (a full bag leaves it waiting);
//   3. the delivery is ACKNOWLEDGED only when the save the SERVER holds (the last one that was saved successfully) already has the item, so a crash between "added" and "saved" can never lose it:
//      the certificate stays "not in save" on the server and the next pass adds it again.

export interface SyncDeps {
  api: MarketApi;
  getSave: () => SaveData;
  /** the save as the server last confirmed it (App's setSyncedSave), or null before the first successful save */
  getSynced: () => SaveData | null;
  /** commits a new save to the app (the autosave persists it) */
  applySave: (next: SaveData) => void;
  /** the account's certificates, straight from the server's table (replaces the game's copy) */
  loadCertificates: () => Promise<CertificateView[]>;
  now: () => number;
}

export interface SyncResult {
  ok: boolean;
  /** items put in the save from a certificate this pass */
  added: number;
  /** items taken out of the save because they are on the market or sold */
  removed: number;
  /** certificates waiting because the bag is full */
  waitingForRoom: number;
  acked: number;
}

export async function syncMarketOnce(d: SyncDeps): Promise<SyncResult> {
  const result: SyncResult = { ok: false, added: 0, removed: 0, waitingForRoom: 0, acked: 0 };
  const certs = await d.loadCertificates();
  const overview = await d.api.overview();
  if (!overview.ok) return result;

  const gone = reconcileOutgoing(d.getSave(), certs);
  if (gone.removed > 0) {
    d.applySave(gone.save);
    result.removed = gone.removed;
  }

  const toAck: string[] = [];
  for (const cert of overview.pending) {
    const before = d.getSave();
    const out = deliverCertificate(before, cert, d.now());
    const status: DeliverStatus = out.status;
    if (status === 'added') {
      d.applySave(out.save);
      result.added++;
    } else if (status === 'full') result.waitingForRoom++;
    // 'present' and 'added' both wait for the server-confirmed save before the ack
    if (status === 'present' || status === 'added') toAck.push(cert.id);
  }

  const synced = d.getSynced();
  const ackable = overview.pending.filter((c) => toAck.includes(c.id) && saveHoldsCertificate(synced, c)).map((c) => c.id);
  if (ackable.length > 0) {
    const r = await d.api.ack(ackable.slice(0, 50));
    if (r.ok) result.acked = r.acked;
  }
  result.ok = true;
  return result;
}

/** A refusal of the server; `floorLamports` comes with 'below_pouch_floor' (the least a Gold Pouch may cost right now). */
export type ListOutcome = { ok: true; listingId: string; expiresAt: string } | { ok: false; reason: string; floorLamports?: number };

/**
 * Puts one entry on the market: the SERVER lists it first (it checks the certificate, the wallet, the limits), and only then the item leaves the save. If the game closes in between,
 * syncMarketOnce takes it out on the next start. Returns the server's refusal untouched.
 */
export async function listForSale(d: Pick<SyncDeps, 'api' | 'getSave' | 'applySave'>, entry: SellableEntry, certificate: Pick<CertificateView, 'id' | 'kind' | 'templateId'>, priceLamports: number): Promise<ListOutcome> {
  const r = await d.api.list(entry.certificateId, priceLamports);
  if ('reason' in r) return { ok: false, reason: r.reason, ...(typeof r.extra?.floorLamports === 'number' ? { floorLamports: r.extra.floorLamports } : {}) };
  const next = removeListedItem(d.getSave(), certificate);
  if (next !== d.getSave()) d.applySave(next);
  return { ok: true, listingId: r.listingId, expiresAt: r.expiresAt };
}

let inflight: Promise<SyncResult> | null = null;

/** syncMarketOnce, but never two at once (the background pass and the market screen would otherwise both add the same delivery). */
export function syncMarket(d: SyncDeps): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = syncMarketOnce(d).finally(() => {
    inflight = null;
  });
  return inflight;
}
