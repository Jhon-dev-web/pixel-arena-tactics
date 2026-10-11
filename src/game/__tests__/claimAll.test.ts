import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { applyClaimAll, readyActivities } from '../claimAll';
import { applyHuntStart, applyHuntStop } from '../huntLifecycle';
import { applyStartGathering } from '../gathering';
import { applyPlant } from '../gardenActions';
import { applyDeliveryAccept, ensureDeliveryOffers } from '../deliveries';
import { HUNTING_ZONES } from '../huntingZones';
import { emptyMaterials, MaterialId } from '../materials';
import { inventoryCapacity } from '../inventory';
import { skillXpToReachLevel } from '../skills';
import { mulberry32 } from '../../../scripts/sim/driver';

const HOUR = 3600 * 1000;
const T0 = new Date(2026, 9, 10, 9, 0, 0).getTime();
const base = (own: boolean): SaveData => ({
  ...defaultSave(),
  hasBattlePass: own,
  lastMiningClaim: T0,
  lastWoodcuttingClaim: T0,
  huntingOfflineStart: T0,
  skillXp: { mining: skillXpToReachLevel(5, 'mining'), woodcutting: 0, gardening: skillXpToReachLevel(5, 'gardening') },
});

describe('Home "Resgatar tudo" (claimAll.ts)', () => {
  it('is an Adventurer Pass perk: a non-owner gets the save back untouched', () => {
    const s = applyStartGathering(base(false), 'mining', 'copper', T0)!.save;
    const r = applyClaimAll(s, T0 + 30 * HOUR);
    expect(r.save).toBe(s);
    expect(r.lines).toEqual([]);
  });

  it('nothing finished: nothing happens; unfinished gathering and a partial hunt are left running', () => {
    const s = applyStartGathering(base(true), 'mining', 'copper', T0)!.save;
    expect(readyActivities(s, T0 + HOUR).count).toBe(0);
    const r = applyClaimAll(s, T0 + HOUR);
    expect(r.lines).toEqual([]);
    expect(r.save.activeOreId).toBe('copper');
  });

  it('collects a gathering session that reached its cap, through the same transition as its button', () => {
    const s = applyStartGathering(base(true), 'mining', 'copper', T0)!.save;
    const at = T0 + 30 * HOUR;
    expect(readyActivities(s, at)).toMatchObject({ mining: true, count: 1 });
    const r = applyClaimAll(s, at);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ kind: 'mining', material: 'copper' });
    expect(r.save.activeOreId).toBeNull();
    expect(r.save.materials.copper).toBeGreaterThan(0);
    // idempotent: a second press finds nothing
    expect(applyClaimAll(r.save, at).lines).toEqual([]);
  });

  it('a full bag keeps the rules: gathering leaves the excess behind and says so, the hunt reward holds what does not fit', () => {
    const s0 = applyStartGathering(base(true), 'mining', 'copper', T0)!.save;
    const full: SaveData = { ...s0, materials: { ...s0.materials, iron: 99 * inventoryCapacity(s0) } };
    const r = applyClaimAll(full, T0 + 30 * HOUR);
    const line = r.lines.find((l) => l.kind === 'mining');
    expect(line && line.kind === 'mining' && line.leftBehind).toBeGreaterThan(0);
  });

  it('claims a hunt reward that is already waiting and a hunt that reached its storage cap', () => {
    const zone = HUNTING_ZONES[0];
    const started = applyHuntStart(base(true), zone.id, 'shallow', T0)!;
    const full = T0 + 30 * HOUR;
    expect(readyActivities(started, full)).toMatchObject({ hunt: true });
    const r = applyClaimAll(started, full);
    const hunt = r.lines.find((l) => l.kind === 'hunt');
    expect(hunt).toBeDefined();
    expect(r.save.activeHuntingZone).toBeNull();
    expect(r.save.pendingHuntReward).toBeNull();
    // a stopped session whose reward waits is claimed too
    const stopped = applyHuntStop(started, T0 + 2 * HOUR)!;
    expect(stopped.pendingHuntReward).not.toBeNull();
    expect(readyActivities(stopped, T0 + 2 * HOUR).hunt).toBe(true);
    expect(applyClaimAll(stopped, T0 + 2 * HOUR).save.pendingHuntReward).toBeNull();
  });

  it('a hunt still inside its storage is not cut short', () => {
    const started = applyHuntStart(base(true), HUNTING_ZONES[0].id, 'shallow', T0)!;
    expect(readyActivities(started, T0 + HOUR).hunt).toBe(false);
    expect(applyClaimAll(started, T0 + HOUR).lines).toEqual([]);
  });

  it('harvests ready garden plots and pays a finished delivery order in the same press, one summary line each', () => {
    let s = base(true);
    s = applyPlant(s, 'common_herb', [0], T0)!;
    // a delivery order accepted at T0
    s = ensureDeliveryOffers(s, T0, mulberry32(1), true);
    const offer = s.deliveries.offers[0];
    s = { ...s, materials: { ...emptyMaterials(), ...Object.fromEntries(Object.entries(offer.items).map(([m, q]) => [m, (q as number) + 5])) } as SaveData['materials'] };
    s = applyDeliveryAccept(s, offer.id, T0, mulberry32(2), true)!;
    const at = T0 + 200 * HOUR;
    const ready = readyActivities(s, at);
    expect(ready.garden).toBeGreaterThan(0);
    expect(ready.delivery).toBe(true);
    const goldBefore = s.gold;
    const r = applyClaimAll(s, at);
    expect(r.lines.map((l) => l.kind).sort()).toEqual(['delivery', 'garden']);
    expect(r.save.gold).toBeGreaterThan(goldBefore);
    expect(r.save.deliveries.active).toBeNull();
    expect(r.save.deliveries.offers.length).toBeGreaterThan(0); // the board refills, as the delivery button does
    expect((r.save.materials as Record<MaterialId, number>).common_herb).toBeGreaterThan(0);
  });
});
