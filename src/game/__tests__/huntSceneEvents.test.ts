import { describe, expect, it } from 'vitest';
import { HuntCombatBuild, HuntLiveSnapshot, HuntPotionCfg, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { SCENE_FALL_MS, SCENE_POSE_MS, SCENE_STEP_MS, SNAPSHOT_MS, sceneEvents } from '../../components/huntSceneEvents';

// The hunt scene reacts to the HP of the replay instead of running its own clock ("they freeze first and the life drops separately").
const snap = (over: Partial<HuntLiveSnapshot> = {}): HuntLiveSnapshot => ({ subLevel: 1, heroHp: 100, heroMax: 100, enemyHp: 500, enemyMax: 500, ...over });

describe('what the scene shows when the HP moves', () => {
  it('the monster lost HP: the hero strikes', () => {
    expect(sceneEvents(snap(), snap({ enemyHp: 400 }))).toEqual(['hero_strikes']);
  });
  it('the hero lost HP: the monster strikes', () => {
    expect(sceneEvents(snap(), snap({ heroHp: 80 }))).toEqual(['monster_strikes']);
  });
  it('both in the same second: one blow each, the hero first', () => {
    expect(sceneEvents(snap(), snap({ heroHp: 80, enemyHp: 400 }))).toEqual(['hero_strikes', 'monster_strikes']);
  });
  it('nothing moved, or no snapshot yet / any more: nothing is played', () => {
    expect(sceneEvents(snap(), snap())).toEqual([]);
    expect(sceneEvents(null, snap())).toEqual([]);
    expect(sceneEvents(snap(), null)).toEqual([]);
  });
  it('the monster HP went up (a new monster): it falls and the next arrives, with no blow on the hero even though his HP is back to full', () => {
    expect(sceneEvents(snap({ heroHp: 30, enemyHp: 20 }), snap())).toEqual(['new_fight']);
  });
  it('a new monster with MORE HP than the old one is a new fight, never a blow; so is a new sub-level or a different maximum', () => {
    expect(sceneEvents(snap({ enemyHp: 100 }), snap({ enemyHp: 500 }))).toEqual(['new_fight']);
    expect(sceneEvents(snap({ enemyHp: 100 }), snap({ subLevel: 2, enemyHp: 50, enemyMax: 550 }))).toEqual(['new_fight']);
    expect(sceneEvents(snap({ enemyHp: 100 }), snap({ enemyHp: 100, enemyMax: 600 }))).toEqual(['new_fight']);
  });
  it('the hero healing (potion, regeneration, life steal) is not a blow, and a heal together with a hit still shows only the hit', () => {
    expect(sceneEvents(snap({ heroHp: 50 }), snap({ heroHp: 70 }))).toEqual([]);
    expect(sceneEvents(snap({ heroHp: 50 }), snap({ heroHp: 70, enemyHp: 400 }))).toEqual(['hero_strikes']);
  });
  it('a pose never outlasts the snapshot interval, and two poses of one update fit inside it', () => {
    expect(SCENE_POSE_MS).toBeLessThanOrEqual(SNAPSHOT_MS);
    expect(SCENE_STEP_MS + SCENE_POSE_MS).toBeLessThanOrEqual(SNAPSHOT_MS);
    expect(SCENE_FALL_MS).toBeLessThanOrEqual(SNAPSHOT_MS);
  });
});

describe('against the real replay, one snapshot a second', () => {
  const build: HuntCombatBuild = { playerMax: 100, heroDmgBase: 100, critChance: 0, critMult: 2, heroMs: 1000, reduction: 0, lifestealPct: 0, burn: false, reflect: 0, hpRegenPct: 0 };
  const zone: HuntZoneCombatCfg = { baseEnemyHp: 1000, baseEnemyDmg: 30, enemyAtkMs: 1000, hpGrowth: 0, dmgGrowth: 0, depthMult: 1, goldPerHour: 0, xpPerKill: 10, xpRefKph: 1000, drops: [], depth: 'shallow', dropRateMult: 1 };
  const potions: HuntPotionCfg = { threshold: 0, priority: 'small_first', stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 }, greaterElixirHealPct: 0.5, potionHeal: 50, largePotionHeal: 150, cooldownMs: 5000 };
  const frames = (b: HuntCombatBuild, z: HuntZoneCombatCfg, seconds: number): HuntLiveSnapshot[] =>
    Array.from({ length: seconds }, (_, i) => simulateHuntingSession(b, z, { ceiling: 1, promotionWins: 0 }, (i + 1) * SNAPSHOT_MS, potions, 'seed', { maxLevel: 1, requiredWins: () => 1 }).liveSnapshot!);
  const played = (fr: HuntLiveSnapshot[]) => fr.slice(1).map((s, i) => sceneEvents(fr[i], s));

  it('a hero that dies: his HP back to full on the next monster is a change of monster, never a blow on him', () => {
    const fr = frames(build, zone, 12);
    // the hero (100 HP, hit for 30 a second) dies in the 4th second against a monster that needs 10 hits: the replay then starts a new fight with him at full HP
    expect(fr.some((s, i) => i > 0 && s.heroHp > fr[i - 1].heroHp)).toBe(true);
    const ev = played(fr);
    fr.slice(1).forEach((s, i) => {
      if (s.heroHp > fr[i].heroHp) expect(ev[i], `second ${i + 2}`).toEqual(['new_fight']);
    });
    expect(ev.flat().filter((e) => e === 'new_fight').length).toBeGreaterThan(0);
  });

  it('a fight that is won plays the hero\'s blows, then the monster falls once', () => {
    const win = frames({ ...build, playerMax: 1_000_000 }, zone, 25);
    const ev = played(win).flat();
    expect(ev.filter((e) => e === 'new_fight')).toHaveLength(2); // a kill every 10 s
    expect(ev).toContain('hero_strikes');
  });
});
