import { describe, expect, it } from 'vitest';
import { HuntCombatBuild, HuntLiveSnapshot, HuntPotionCfg, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { SCENE_FALL_MS, SCENE_POSE_MS, SNAPSHOT_MS, SceneEvent, SceneStep, sceneStep } from '../../components/huntSceneEvents';

// The hunt scene reacts to the HP of the replay instead of running its own clock ("they freeze first and the life drops separately"), one side at a time ("both attack together and lose life together").
const snap = (over: Partial<HuntLiveSnapshot> = {}): HuntLiveSnapshot => ({ subLevel: 1, heroHp: 100, heroMax: 100, enemyHp: 500, enemyMax: 500, ...over });

describe('what the scene shows when the HP moves', () => {
  it('the monster lost HP: the hero strikes, and only the monster bar moves', () => {
    expect(sceneStep(snap(), snap({ enemyHp: 400 }), null)).toEqual({ event: 'hero_strikes', shown: snap({ enemyHp: 400 }) });
  });
  it('the hero lost HP: the monster strikes, and only the hero bar moves', () => {
    expect(sceneStep(snap(), snap({ heroHp: 80 }), null)).toEqual({ event: 'monster_strikes', shown: snap({ heroHp: 80 }) });
  });
  it('both lost HP in the same second: ONE blow and ONE bar, and the other side goes on the next update', () => {
    const live = snap({ heroHp: 80, enemyHp: 400 });
    const first = sceneStep(snap(), live, null);
    expect(first).toEqual({ event: 'hero_strikes', shown: snap({ enemyHp: 400 }) });
    expect(sceneStep(first.shown, live, first.event)).toEqual({ event: 'monster_strikes', shown: live });
  });
  it('they take turns while both keep losing HP', () => {
    expect(sceneStep(snap(), snap({ heroHp: 80, enemyHp: 400 }), 'hero_strikes').event).toBe('monster_strikes');
    expect(sceneStep(snap(), snap({ heroHp: 80, enemyHp: 400 }), 'monster_strikes').event).toBe('hero_strikes');
  });
  it('nothing moved, or no snapshot: nothing is played', () => {
    expect(sceneStep(snap(), snap(), null).event).toBeNull();
    expect(sceneStep(null, snap(), null)).toEqual({ event: null, shown: snap() });
    expect(sceneStep(snap(), null, null)).toEqual({ event: null, shown: null });
  });
  it('a new monster is a new fight and not a blow, even with the hero back to full; so is a new sub-level or a different maximum', () => {
    expect(sceneStep(snap({ heroHp: 30, enemyHp: 20 }), snap(), null).event).toBe('new_fight');
    expect(sceneStep(snap({ enemyHp: 100 }), snap({ subLevel: 2, enemyHp: 50, enemyMax: 550 }), null).event).toBe('new_fight');
    expect(sceneStep(snap({ enemyHp: 100 }), snap({ enemyHp: 100, enemyMax: 600 }), null).event).toBe('new_fight');
  });
  it('a heal is not a blow: the bar follows it at once, and a heal together with a hit shows only the hit', () => {
    expect(sceneStep(snap({ heroHp: 50 }), snap({ heroHp: 70 }), null)).toEqual({ event: null, shown: snap({ heroHp: 70 }) });
    expect(sceneStep(snap({ heroHp: 50 }), snap({ heroHp: 70, enemyHp: 400 }), null).event).toBe('hero_strikes');
  });
  it('a pose ends before the next update can start another', () => {
    expect(SCENE_POSE_MS).toBeLessThan(SNAPSHOT_MS);
    expect(SCENE_FALL_MS).toBeLessThan(SNAPSHOT_MS);
  });
});

describe('against the real replay, one snapshot a second', () => {
  const build: HuntCombatBuild = { playerMax: 100, heroDmgBase: 100, critChance: 0, critMult: 2, heroMs: 1000, reduction: 0, lifestealPct: 0, burn: false, reflect: 0, hpRegenPct: 0 };
  const zone: HuntZoneCombatCfg = { baseEnemyHp: 1000, baseEnemyDmg: 30, enemyAtkMs: 1000, hpGrowth: 0, dmgGrowth: 0, depthMult: 1, goldPerHour: 0, xpPerKill: 10, xpRefKph: 1000, drops: [], depth: 'shallow', dropRateMult: 1 };
  const potions: HuntPotionCfg = { threshold: 0, priority: 'small_first', stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 }, greaterElixirHealPct: 0.5, potionHeal: 50, largePotionHeal: 150, cooldownMs: 5000 };
  const frames = (b: HuntCombatBuild, z: HuntZoneCombatCfg, seconds: number): HuntLiveSnapshot[] =>
    Array.from({ length: seconds }, (_, i) => simulateHuntingSession(b, z, { ceiling: 1, promotionWins: 0 }, (i + 1) * SNAPSHOT_MS, potions, 'seed', { maxLevel: 1, requiredWins: () => 1 }).liveSnapshot!);
  const steps = (fr: HuntLiveSnapshot[]): SceneStep[] => {
    const out: SceneStep[] = [];
    let shown: HuntLiveSnapshot | null = fr[0];
    let last: SceneEvent | null = null;
    for (const live of fr.slice(1)) {
      const step = sceneStep(shown, live, last);
      out.push(step);
      shown = step.shown;
      last = step.event ?? last;
    }
    return out;
  };

  it('a hero that dies: his HP back to full is a change of monster, never a blow on him', () => {
    const ev = steps(frames(build, zone, 12));
    expect(ev.some((e) => e.event === 'new_fight')).toBe(true);
    let shownHero = 100;
    for (const e of ev) {
      if (e.shown && e.shown.heroHp > shownHero) expect(e.event).toBe('new_fight');
      shownHero = e.shown?.heroHp ?? shownHero;
    }
  });

  it('in a real fight the two never swing together: between one update and the next, at most one bar goes down', () => {
    const fr = frames({ ...build, playerMax: 1_000_000 }, zone, 25);
    const ev = steps(fr);
    expect(ev.filter((e) => e.event === 'hero_strikes').length).toBeGreaterThan(3);
    expect(ev.filter((e) => e.event === 'monster_strikes').length).toBeGreaterThan(3);
    let prev = fr[0];
    for (const e of ev) {
      const down = (e.shown!.enemyHp < prev.enemyHp ? 1 : 0) + (e.shown!.heroHp < prev.heroHp ? 1 : 0);
      if (e.event !== 'new_fight') expect(down).toBeLessThanOrEqual(1);
      prev = e.shown!;
    }
  });

  it('a fight that is won plays the blows, then the monster falls', () => {
    const ev = steps(frames({ ...build, playerMax: 1_000_000 }, zone, 25)).map((e) => e.event);
    expect(ev.filter((e) => e === 'new_fight').length).toBeGreaterThanOrEqual(2);
    expect(ev).toContain('hero_strikes');
  });
});
