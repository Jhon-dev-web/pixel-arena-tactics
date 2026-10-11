import { computeHuntingStatus, computeMiningStatus, computeWoodcuttingStatus, SaveData } from './engine';
import { ownsAdventurerPass } from './entitlements';
import { applyDeliveryClaim, ensureDeliveryOffers, isDeliveryReady } from './deliveries';
import { applyHarvest, readySlots } from './gardenActions';
import { applyClaimGathering, GatherKind } from './gathering';
import { applyHuntClaim, applyHuntStop, huntClaimBlocked, planHuntClaim } from './huntLifecycle';
import { MaterialId } from './materials';

// "Resgatar tudo" on the Home screen (an Adventurer Pass convenience): one action that collects every FINISHED activity - the hunt reward waiting (or a hunt that
// reached its storage cap), a mining / woodcutting session at its cap, the ready garden plots and a finished delivery order - through the very same transitions
// as the buttons of each screen, so every full-bag rule stays as it is. It changes no number: it only saves the trips. Rolls nothing of its own.

export type ClaimAllLine =
  | { kind: 'delivery'; gold: number; xp: number; shards: number }
  | { kind: 'hunt'; gold: number; xp: number; items: number; leftBehind: number; held: boolean }
  | { kind: GatherKind; material: MaterialId; units: number; leftBehind: number }
  | { kind: 'garden'; harvested: number; blocked: number };

export interface ClaimAllResult {
  save: SaveData;
  lines: ClaimAllLine[];
}

export interface ReadyActivities {
  delivery: boolean;
  hunt: boolean;
  mining: boolean;
  woodcutting: boolean;
  garden: number; // ready plots
  count: number; // how many of the above
}

// What "Resgatar tudo" would collect right now (a hunt only once its storage is full or its reward is already waiting; gathering only at its cap).
export function readyActivities(save: SaveData, now: number): ReadyActivities {
  const delivery = isDeliveryReady(save, now);
  let hunt = !!save.pendingHuntReward;
  if (!hunt && save.activeHuntingZone) {
    const st = computeHuntingStatus(save, now);
    hunt = st.full && st.capMs > 0;
  }
  const mining = !!save.activeOreId && computeMiningStatus(save, now).full;
  const woodcutting = !!save.activeWoodId && computeWoodcuttingStatus(save, now).full;
  const garden = readySlots(save, now).length;
  return { delivery, hunt, mining, woodcutting, garden, count: [delivery, hunt, mining, woodcutting, garden > 0].filter(Boolean).length };
}

// Owners only (entitlements.ts); anyone else gets the save back untouched.
export function applyClaimAll(save: SaveData, now: number): ClaimAllResult {
  if (!ownsAdventurerPass(save)) return { save, lines: [] };
  let s = save;
  const lines: ClaimAllLine[] = [];

  if (isDeliveryReady(s, now)) {
    const claim = applyDeliveryClaim(s, now);
    if (claim) {
      s = ensureDeliveryOffers(claim.save, now, Math.random, true);
      lines.push({ kind: 'delivery', gold: claim.offer.gold, xp: claim.xpGained, shards: claim.offer.shards });
    }
  }

  if (!s.pendingHuntReward && s.activeHuntingZone) {
    const st = computeHuntingStatus(s, now);
    if (st.full && st.capMs > 0) s = applyHuntStop(s, now) ?? s;
  }
  const pending = s.pendingHuntReward;
  if (pending) {
    const plan = planHuntClaim(s, pending);
    const claimed = applyHuntClaim(s, pending.id);
    if (claimed) {
      s = claimed;
      lines.push({
        kind: 'hunt',
        gold: pending.gold,
        xp: pending.xp,
        items: Object.values(plan.added).reduce((a, n) => a + (n ?? 0), 0),
        leftBehind: plan.leftBehind.reduce((a, i) => a + i.count, 0),
        held: huntClaimBlocked(claimed),
      });
    }
  }

  for (const kind of ['mining', 'woodcutting'] as const) {
    const running = kind === 'mining' ? s.activeOreId && computeMiningStatus(s, now).full : s.activeWoodId && computeWoodcuttingStatus(s, now).full;
    if (!running) continue;
    const claim = applyClaimGathering(s, kind, now);
    if (claim) {
      s = claim.save;
      lines.push({ kind, material: claim.material, units: claim.units, leftBehind: claim.leftBehind });
    }
  }

  const ready = readySlots(s, now);
  if (ready.length > 0) {
    const res = applyHarvest(s, ready, now);
    if (res && (res.harvested.length > 0 || res.blocked.length > 0)) {
      s = res.save;
      lines.push({ kind: 'garden', harvested: res.harvested.length, blocked: res.blocked.length });
    }
  }
  return { save: s, lines };
}
