import { describe, expect, it } from 'vitest';
import { baseGoldValue } from '../economy';
import { computeMiningStatus, computeWoodcuttingStatus, defaultSave, normalizeSave, SaveData } from '../engine';
import { applyClaimGathering, applyStartGathering } from '../gathering';
import { MaterialId } from '../materials';
import { ORE_TIERS } from '../ores';
import { REFINING_RECIPES } from '../refining';
import { BASE_GATHER_POWER, gatherPower, skillLevel, skillXpForNextLevel, skillXpToReachLevel } from '../skills';
import T from '../tunables';
import { WOOD_TIERS } from '../woodcutting';

const HOUR = 3600 * 1000;
const T0 = new Date(2026, 5, 1, 9, 0, 0).getTime();

const fresh = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), lastMiningClaim: T0, lastWoodcuttingClaim: T0, ...patch });
const withMiningLevel = (level: number): Partial<SaveData> => ({ skillXp: { mining: skillXpToReachLevel(level, 'mining'), woodcutting: 0, gardening: 0 } });

describe('gathering sessions (pure transitions)', () => {
  it('starting a tier records it and the clock', () => {
    const r = applyStartGathering(fresh(), 'mining', 'copper', T0)!;
    expect(r.save.activeOreId).toBe('copper');
    expect(r.save.lastMiningClaim).toBe(T0);
    expect(r.claimed).toBeNull();
  });

  it('refuses a locked tier, an unknown tier, the tier already running, and a busy hero', () => {
    expect(applyStartGathering(fresh(), 'mining', 'iron', T0)).toBeNull(); // Mining 1 < 10
    expect(applyStartGathering(fresh(), 'mining', 'nope', T0)).toBeNull();
    const running = applyStartGathering(fresh(), 'mining', 'copper', T0)!.save;
    expect(applyStartGathering(running, 'mining', 'copper', T0 + HOUR)).toBeNull();
    expect(applyStartGathering(running, 'woodcutting', 'common_wood', T0 + HOUR)).toBeNull(); // mining is running
    expect(applyStartGathering({ ...fresh(), activeHuntingZone: 'demon_glade' }, 'mining', 'copper', T0)).toBeNull();
    expect(applyStartGathering(fresh(), 'mining', 'copper', NaN)).toBeNull();
    expect(applyStartGathering(fresh(), 'mining', 'copper', -5)).toBeNull();
  });

  it('BUG FIX: switching tier mid-session collects what was mined instead of throwing it away', () => {
    const s0 = fresh(withMiningLevel(10));
    const copper = applyStartGathering(s0, 'mining', 'copper', T0)!.save;
    const at = T0 + 3 * HOUR;
    const owed = computeMiningStatus(copper, at).oreReady;
    expect(owed).toBeGreaterThan(0);
    const sw = applyStartGathering(copper, 'mining', 'iron', at)!;
    expect(sw.claimed?.units).toBe(owed);
    expect(sw.save.materials.copper).toBe(owed);
    expect(sw.save.skillXp.mining).toBe(s0.skillXp.mining + owed * T.skills.xpPerUnit);
    expect(sw.save.activeOreId).toBe('iron');
    expect(sw.save.lastMiningClaim).toBe(at);
    // the new session starts from zero: nothing is double counted
    expect(computeMiningStatus(sw.save, at).oreReady).toBe(0);
  });

  it('BUG FIX: the same holds for Woodcutting', () => {
    const s0 = fresh({ skillXp: { mining: 0, woodcutting: skillXpToReachLevel(10, 'woodcutting'), gardening: 0 } });
    const a = applyStartGathering(s0, 'woodcutting', 'common_wood', T0)!.save;
    const at = T0 + 2 * HOUR;
    const owed = computeWoodcuttingStatus(a, at).woodReady;
    const sw = applyStartGathering(a, 'woodcutting', 'oak_wood', at)!;
    expect(sw.save.materials.common_wood).toBe(owed);
    expect(sw.save.activeWoodId).toBe('oak_wood');
    expect(sw.save.skillXp.woodcutting).toBe(s0.skillXp.woodcutting + owed * T.skills.xpPerUnit);
  });

  it('claim: units to the bag, XP to the skill, session over; a second claim is a no-op', () => {
    const running = applyStartGathering(fresh(), 'mining', 'copper', T0)!.save;
    const at = T0 + 2 * HOUR;
    const c = applyClaimGathering(running, 'mining', at)!;
    const expected = Math.floor(2 * gatherPower(BASE_GATHER_POWER, 0) * T.mining.oreRatePerPower);
    expect(c.units).toBe(expected);
    expect(c.save.materials.copper).toBe(expected);
    expect(c.save.skillXp.mining).toBe(expected * T.skills.xpPerUnit);
    expect(c.save.activeOreId).toBeNull();
    expect(applyClaimGathering(c.save, 'mining', at)).toBeNull();
    expect(applyClaimGathering(running, 'woodcutting', at)).toBeNull(); // nothing chopping
  });

  it('offline accrual is capped by the storage window (4 h without the pass) however long the game was closed', () => {
    const running = applyStartGathering(fresh(), 'mining', 'copper', T0)!.save;
    const capped = computeMiningStatus(running, T0 + 4 * HOUR);
    const weeks = computeMiningStatus(running, T0 + 400 * HOUR);
    expect(capped.full).toBe(true);
    expect(weeks.oreReady).toBe(capped.oreReady);
    expect(weeks.pendingMs).toBe(4 * HOUR);
  });

  it('a clock that went backwards yields nothing (never negative or NaN)', () => {
    const running = applyStartGathering(fresh(), 'mining', 'copper', T0)!.save;
    const s = computeMiningStatus(running, T0 - 5 * HOUR);
    expect(s.pendingMs).toBe(0);
    expect(s.oreReady).toBe(0);
    const c = applyClaimGathering(running, 'mining', T0 - 5 * HOUR)!;
    expect(c.units).toBe(0);
    expect(Number.isFinite(c.save.skillXp.mining)).toBe(true);
  });

  it('claiming with a full bag still delivers the material (the bag only limits NEW purchases)', () => {
    const base = fresh();
    const running = applyStartGathering(base, 'mining', 'copper', T0)!.save;
    const full = { ...running, inventoryCapacity: 1 };
    const c = applyClaimGathering(full, 'mining', T0 + 4 * HOUR)!;
    expect(c.save.materials.copper).toBe(c.units);
    expect(c.units).toBeGreaterThan(0);
  });
});

describe('skill levels', () => {
  it('BUG FIX: a corrupted XP is level 1, never the cap', () => {
    for (const id of ['mining', 'woodcutting', 'gardening'] as const) {
      expect(skillLevel(NaN, id)).toBe(1);
      expect(skillLevel(-50, id)).toBe(1);
      expect(skillLevel(0, id)).toBe(1);
    }
  });

  it('level-up lands exactly on the XP boundary, for every level and every curve', () => {
    for (const id of ['mining', 'gardening'] as const) {
      for (let l = 2; l < T.skills.maxLevel; l++) {
        const at = skillXpToReachLevel(l, id);
        expect(skillLevel(at, id)).toBe(l);
        expect(skillLevel(at - 1, id)).toBe(l - 1);
      }
      expect(skillLevel(1e12, id)).toBe(T.skills.maxLevel);
    }
  });

  it('the profession curve is continuous and monotone across the band boundaries', () => {
    let prev = 0;
    for (let l = 1; l < T.skills.maxLevel; l++) {
      const need = skillXpForNextLevel(l, 'mining');
      expect(need).toBeGreaterThanOrEqual(prev);
      prev = need;
    }
  });

  it('no level-up takes over 6 h of gathering before Nv30, nor over 24 h up to Nv60 (units/h x XP per unit)', () => {
    for (let l = 1; l < 60; l++) {
      const rate = gatherPower(BASE_GATHER_POWER, skillXpToReachLevel(l, 'mining')) * T.mining.oreRatePerPower * T.skills.xpPerUnit;
      const hours = skillXpForNextLevel(l, 'mining') / rate;
      expect(hours).toBeLessThan(l < 30 ? 6 : 24);
    }
  });
});

describe('profession gates and refining', () => {
  it('gold ore / elven wood (50) and obsidian / ancient wood are not nonsensically close', () => {
    const ore = (id: string) => ORE_TIERS.find((o) => o.id === id)!.requiredLevel;
    const wood = (id: string) => WOOD_TIERS.find((o) => o.id === id)!.requiredLevel;
    expect(ore('obsidian') - ore('gold_ore')).toBeGreaterThanOrEqual(15);
    expect(wood('ancient_wood') - wood('elven_wood')).toBeGreaterThanOrEqual(15);
    expect(ore('obsidian')).toBe(wood('ancient_wood'));
    expect(ore('obsidian')).toBeLessThan(T.skills.maxLevel);
  });

  it('ore and wood tier gates only ascend', () => {
    for (const list of [ORE_TIERS, WOOD_TIERS]) for (let i = 1; i < list.length; i++) expect(list[i].requiredLevel).toBeGreaterThan(list[i - 1].requiredLevel);
  });

  it('no refining recipe makes an output worth under 60% of its inputs plus gold (reference value)', () => {
    for (const r of REFINING_RECIPES) {
      const inputs = (Object.entries(r.input) as [MaterialId, number][]).reduce((a, [m, q]) => a + q * baseGoldValue(m), 0);
      const out = r.outputQty * baseGoldValue(r.output);
      expect(out / (inputs + r.cost), r.id).toBeGreaterThanOrEqual(0.6);
    }
  });
});

describe('Battle Pass and gathering sessions', () => {
  const withPass = (s: SaveData, until: number | null): SaveData => ({ ...s, hasBattlePass: true, battlePassExpiresAt: until });
  const lvl = (s: SaveData): SaveData => ({ ...s, skillXp: { mining: skillXpToReachLevel(30, 'mining'), woodcutting: skillXpToReachLevel(30, 'woodcutting'), gardening: 0 } });

  it('Woodcutting pays the same Battle Pass XP as Mining for the same hours (one shared rule)', () => {
    const base = lvl(fresh());
    const m = applyClaimGathering(applyStartGathering(base, 'mining', 'copper', T0)!.save, 'mining', T0 + 4 * HOUR)!;
    const w = applyClaimGathering(applyStartGathering(base, 'woodcutting', 'common_wood', T0)!.save, 'woodcutting', T0 + 4 * HOUR)!;
    expect(m.save.battlePassXp).toBeGreaterThan(0);
    expect(w.save.battlePassXp).toBe(m.save.battlePassXp);
    expect(w.units).toBe(m.units); // same power, same rate, same cap
  });

  it('a session started with the Pass keeps its 24 h cap after the Pass expires; the x1.25 stops at the expiry instant (pro-rated)', () => {
    const until = T0 + 10 * HOUR;
    const s = applyStartGathering(withPass(lvl(fresh()), until), 'mining', 'copper', T0)!.save;
    expect(s.miningPass).toEqual({ active: true, until });
    const later = T0 + 30 * HOUR; // the Pass is long gone
    const st = computeMiningStatus(s, later);
    expect(st.capMs).toBe(T.battlePass.capHours * HOUR);
    expect(st.pendingMs).toBe(T.battlePass.capHours * HOUR);
    const power = gatherPower(BASE_GATHER_POWER, s.skillXp.mining);
    const share = 10 / T.battlePass.capHours;
    expect(st.oreReady).toBe(Math.floor(T.battlePass.capHours * power * (1 + (T.battlePass.dropRateMultiplier - 1) * share)));
    // without the expiry the bonus covers the whole session
    const open = applyStartGathering(withPass(lvl(fresh()), null), 'mining', 'copper', T0)!.save;
    expect(computeMiningStatus(open, later).oreReady).toBe(Math.floor(T.battlePass.capHours * power * T.battlePass.dropRateMultiplier));
  });

  it('old saves without the snapshot: the running session gets the Pass as it is at load, never a bigger cap than the player had', () => {
    const running = { ...lvl(fresh()), activeOreId: 'copper', lastMiningClaim: T0 };
    const wire = (s: SaveData) => JSON.parse(JSON.stringify(s));
    const noPass = normalizeSave({ ...wire(running), miningPass: undefined });
    expect(noPass.miningPass).toEqual({ active: false, until: null });
    expect(computeMiningStatus(noPass, T0 + 30 * HOUR).capMs).toBe(4 * HOUR);
    const future = Date.now() + 5 * HOUR;
    const pass = normalizeSave({ ...wire(withPass(running, future)), miningPass: undefined });
    expect(pass.miningPass).toEqual({ active: true, until: future });
    // a save that never had a snapshot field at all, computed without loading, falls back to the current Pass
    const raw = { ...running } as SaveData;
    delete raw.miningPass;
    expect(computeMiningStatus(raw, T0 + 30 * HOUR).capMs).toBe(4 * HOUR);
    expect(computeMiningStatus(withPass(raw, null), T0 + 30 * HOUR).capMs).toBe(T.battlePass.capHours * HOUR);
    // nothing running: no snapshot is kept
    expect(normalizeSave(wire(fresh())).miningPass).toBeNull();
  });

  it('a Pass bought mid-session does not stretch that session: the 4 h cap stays and the longer one starts with the next session', () => {
    const s = applyStartGathering(lvl(fresh()), 'woodcutting', 'common_wood', T0)!.save;
    const bought = withPass(s, null);
    const st = computeWoodcuttingStatus(bought, T0 + 20 * HOUR);
    expect(st.capMs).toBe(4 * HOUR);
    expect(st.passCoversSession).toBe(false);
    const plain = computeWoodcuttingStatus(s, T0 + 20 * HOUR);
    expect(st.woodReady).toBe(plain.woodReady); // no bonus for that session either
    const next = applyStartGathering(applyClaimGathering(bought, 'woodcutting', T0 + 20 * HOUR)!.save, 'woodcutting', 'common_wood', T0 + 20 * HOUR)!.save;
    expect(computeWoodcuttingStatus(next, T0 + 40 * HOUR).capMs).toBe(T.battlePass.capHours * HOUR);
  });
});
