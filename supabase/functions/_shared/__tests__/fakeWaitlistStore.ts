import { WAITLIST_LIMITS, withinLimit } from '../waitlist/logic.ts';
import type { JoinRequest, WaitlistStore } from '../waitlist/store.ts';

// In-memory stand-in for migration 0016: the same decisions as public.waitlist_join (limits first, short-circuiting like the SQL `or`, then insert-if-absent; an unsubscribed address stays unsubscribed).
export interface Row {
  id: string;
  email: string;
  locale: string;
  source: string | null;
  ipHash: string | null;
  subnetHash: string | null;
  unsubscribedAt: number | null;
}

export function createFakeWaitlistStore() {
  const rows: Row[] = [];
  const hits = new Map<string, number>();
  let seq = 0;
  const hit = (bucket: string, max: number) => {
    const n = (hits.get(bucket) ?? 0) + 1;
    hits.set(bucket, n);
    return withinLimit(n, max);
  };
  const store: WaitlistStore = {
    async join(req: JoinRequest) {
      const L = WAITLIST_LIMITS;
      if (!hit('global', L.global) || !hit('ip:' + (req.ipHash ?? 'none'), L.perIp) || !hit('subnet:' + (req.subnetHash ?? 'none'), L.perSubnet) || !hit('email:' + req.emailKey, L.perEmail)) {
        return { status: 'rate_limited' as const };
      }
      const email = req.email.toLowerCase();
      if (rows.some((r) => r.email === email)) return { status: 'exists' as const };
      rows.push({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, email, locale: req.locale, source: req.source, ipHash: req.ipHash, subnetHash: req.subnetHash, unsubscribedAt: null });
      return { status: 'joined' as const };
    },
    async unsubscribe(id: string, ipKey: string | null) {
      if (!hit('unsub:' + (ipKey ?? 'none'), 30)) return { status: 'rate_limited' as const };
      const row = rows.find((r) => r.id === id);
      if (row && row.unsubscribedAt === null) row.unsubscribedAt = 1;
      return { status: 'ok' as const };
    },
  };
  return { store, rows };
}
