// The ids of the server credits (promo rewards, migration 0028) this save has already applied: the "exactly once" memory. Dependency-free so the engine can load it without importing the rewards code.
// See promoRewards.ts for the whole story.

/** How many applied credit ids the save keeps. More than the 100 rows / 30 days the server hands back, so an id never falls out of the list while it could come back. */
export const APPLIED_CREDITS_CAP = 400;

export const CREDIT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids the save already applied (a list of uuid-shaped strings, oldest first, capped). Garbage and duplicates are dropped. */
export function sanitizeAppliedCredits(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) if (typeof v === 'string' && CREDIT_ID_RE.test(v) && !out.includes(v.toLowerCase())) out.push(v.toLowerCase());
  return out.slice(-APPLIED_CREDITS_CAP);
}

/** The field to spread into a loaded save: nothing when no credit was ever applied, so every save without a promo reward stays exactly as it was. */
export const appliedCreditsField = (raw: unknown): { appliedCredits?: string[] } => {
  const ids = sanitizeAppliedCredits(raw);
  return ids.length > 0 ? { appliedCredits: ids } : {};
};
