import { emptyMaterials, MaterialId } from './materials';
import T from './tunables';

// Persisted shape of the delivery-orders system (deliveries.ts has the generator and the reducers). Kept free of any
// engine import so engine.ts can own it in SaveData without an import cycle.
//
// An offer is generated once and then FROZEN: what it asks for and what it pays never changes afterwards (not even if
// a tunable changes), and nothing is rolled at claim time. Accepting one snapshots the whole offer into `active`.

export type DeliveryArchetype = 'medicinal' | 'alquimico' | 'alq_raro' | 'militar' | 'armadura' | 'raro' | 'forja' | 'comercial';
export type DeliveryDistance = 'local' | 'curta' | 'regional' | 'longa' | 'especial';
export type DeliveryClass = 'simple' | 'mid' | 'hard';

export const DELIVERY_ARCHETYPES: DeliveryArchetype[] = ['medicinal', 'alquimico', 'alq_raro', 'militar', 'armadura', 'raro', 'forja', 'comercial'];
export const DELIVERY_DISTANCES: DeliveryDistance[] = ['local', 'curta', 'regional', 'longa', 'especial'];
export const DELIVERY_CLASSES: DeliveryClass[] = ['simple', 'mid', 'hard'];
export const DELIVERY_DESTINATIONS = 3; // flavor names per archetype (locale keys deliveries.dest_<archetype>_<n>)

export interface DeliveryOffer {
  id: string;
  arch: DeliveryArchetype;
  dist: DeliveryDistance;
  cls: DeliveryClass;
  tier: number; // 0..3, from the highest Dungeon floor when it was generated
  items: Partial<Record<MaterialId, number>>;
  gold: number;
  xp: number;
  shards: number; // fixed here, so the player knows it before accepting
  durationMs: number;
  bornAt: number;
  dest: number;
}

export interface ActiveDelivery {
  offer: DeliveryOffer;
  startedAt: number;
  endsAt: number;
}

export interface DeliveryState {
  seq: number; // last offer number handed out (ids are `d<seq>`)
  offers: DeliveryOffer[];
  active: ActiveDelivery | null;
  rerollDay: string; // local calendar day (Date.toDateString) the counter below belongs to: that day is the reroll "cycle"
  rerollsUsed: number;
}

const HOUR = 3600 * 1000;
const MAX_DURATION_MS = 48 * HOUR;

export function emptyDeliveries(): DeliveryState {
  return { seq: 0, offers: [], active: null, rerollDay: '', rerollsUsed: 0 };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const posInt = (v: unknown, max: number): number => (isNum(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

function sanitizeOffer(raw: unknown, now: number): DeliveryOffer | null {
  const o = raw as Partial<DeliveryOffer> | null | undefined;
  if (!o || typeof o.id !== 'string' || !o.id) return null;
  if (!DELIVERY_ARCHETYPES.includes(o.arch as DeliveryArchetype)) return null;
  if (!DELIVERY_DISTANCES.includes(o.dist as DeliveryDistance)) return null;
  if (!DELIVERY_CLASSES.includes(o.cls as DeliveryClass)) return null;
  if (!isNum(o.durationMs) || o.durationMs < 60 * 1000) return null;
  const known = emptyMaterials();
  const items: Partial<Record<MaterialId, number>> = {};
  for (const [k, v] of Object.entries(o.items ?? {})) {
    const n = posInt(v, 100000);
    if (k in known && n > 0) items[k as MaterialId] = n;
  }
  if (Object.keys(items).length === 0) return null;
  const D = T.deliveries;
  const maxGold = Math.ceil(48 * (D.goldPerHourBase + D.goldPerHourTier * 3 + 30));
  return {
    id: o.id,
    arch: o.arch as DeliveryArchetype,
    dist: o.dist as DeliveryDistance,
    cls: o.cls as DeliveryClass,
    tier: posInt(o.tier, 3),
    items,
    // A tampered save cannot mint an absurd reward: every field is bounded by what any order could ever pay.
    gold: posInt(o.gold, maxGold),
    xp: posInt(o.xp, 48 * 400000),
    shards: posInt(o.shards, 10),
    durationMs: Math.min(MAX_DURATION_MS, Math.floor(o.durationMs)),
    bornAt: isNum(o.bornAt) ? Math.min(o.bornAt, now) : now,
    dest: posInt(o.dest, DELIVERY_DESTINATIONS - 1),
  };
}

export function sanitizeDeliveries(raw: unknown, now: number): DeliveryState {
  const r = raw as Partial<DeliveryState> | null | undefined;
  if (!r || typeof r !== 'object') return emptyDeliveries();
  const seen = new Set<string>();
  const offers: DeliveryOffer[] = [];
  for (const x of Array.isArray(r.offers) ? r.offers : []) {
    const o = sanitizeOffer(x, now);
    if (o && !seen.has(o.id)) {
      seen.add(o.id);
      offers.push(o);
    }
  }
  let active: ActiveDelivery | null = null;
  const a = r.active as Partial<ActiveDelivery> | null | undefined;
  if (a) {
    const offer = sanitizeOffer(a.offer, now);
    if (offer && isNum(a.startedAt) && isNum(a.endsAt)) {
      // The clock can never make a delivery last longer than its own duration (a save edited to push endsAt far away).
      const startedAt = Math.min(a.startedAt, now);
      active = { offer, startedAt, endsAt: Math.max(startedAt, Math.min(a.endsAt, startedAt + offer.durationMs)) };
    }
  }
  return {
    seq: posInt(r.seq, 1e9),
    offers: offers.filter((o) => !active || o.id !== active.offer.id),
    active,
    rerollDay: typeof r.rerollDay === 'string' ? r.rerollDay : '',
    rerollsUsed: posInt(r.rerollsUsed, 1000),
  };
}
