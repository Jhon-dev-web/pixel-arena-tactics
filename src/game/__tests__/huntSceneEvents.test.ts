import { describe, expect, it } from 'vitest';
import { HuntCombatBuild, HuntLiveSnapshot, HuntPotionCfg, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { FightTally, SCENE_DEFEAT_MS, SCENE_FALL_MS, SCENE_POSE_MS, SNAPSHOT_MS, SceneEvent, SceneStep, fightEnded, sceneStep } from '../../components/huntSceneEvents';

// The hunt scene reacts to the HP of the replay instead of running its own clock ("they freeze first and the life drops separately"), one side at a time ("both attack together and lose life together").
// A defeat must not look like a victory: a win and a defeat both end in a new monster at full life, so only the session's own counters (kills / defeats) can tell them apart.
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
    expect(sceneStep(snap({ heroHp: 30, enemyHp: 20 }), snap(), null, 'won').event).toBe('new_fight');
    expect(sceneStep(snap({ enemyHp: 100 }), snap({ subLevel: 2, enemyHp: 50, enemyMax: 550 }), null, 'won').event).toBe('new_fight');
    expect(sceneStep(snap({ enemyHp: 100 }), snap({ enemyHp: 100, enemyMax: 600 }), null, 'won').event).toBe('new_fight');
  });
  it('a fight that the counters say ended is a new fight even when the numbers alone look like a blow (the next monster is already hurt)', () => {
    expect(sceneStep(snap({ enemyHp: 400 }), snap({ enemyHp: 300 }), null).event).toBe('hero_strikes');
    expect(sceneStep(snap({ enemyHp: 400 }), snap({ enemyHp: 300 }), null, 'lost').event).toBe('hero_falls');
  });
  it('a heal is not a blow: the bar follows it at once, and a heal together with a hit shows only the hit', () => {
    expect(sceneStep(snap({ heroHp: 50 }), snap({ heroHp: 70 }), null)).toEqual({ event: null, shown: snap({ heroHp: 70 }) });
    expect(sceneStep(snap({ heroHp: 50 }), snap({ heroHp: 70, enemyHp: 400 }), null).event).toBe('hero_strikes');
  });
  it('a pose ends before the next update can start another', () => {
    expect(SCENE_POSE_MS).toBeLessThan(SNAPSHOT_MS);
    expect(SCENE_FALL_MS).toBeLessThan(SNAPSHOT_MS);
    expect(SCENE_DEFEAT_MS).toBeLessThan(SNAPSHOT_MS);
  });
});

describe('a lost fight reads as a lost fight', () => {
  const lostFight = snap({ heroHp: 12, enemyHp: 340 }); // the last numbers seen of the fight the hero is about to lose
  it('the hero falls and the monster is left standing, with the bars of the fight he lost', () => {
    const step = sceneStep(lostFight, snap(), null, 'lost');
    expect(step.event).toBe('hero_falls');
    expect(step.held).toEqual({ ...lostFight, heroHp: 0 }); // hero at 0, the monster with the life it still had (never 0)
    expect(step.held!.enemyHp).toBeGreaterThan(0);
    expect(step.shown).toEqual(snap()); // the numbers underneath are already the next fight's
  });
  it('a win is the opposite: the monster falls, and no hero falls', () => {
    const step = sceneStep(snap({ heroHp: 60, enemyHp: 20 }), snap(), null, 'won');
    expect(step.event).toBe('new_fight');
    expect(step.held).toBeUndefined();
  });
  it('when the counters cannot say which (fights won AND lost inside one update, or no counters at all) neither side falls: the scene does not invent a result', () => {
    for (const ended of ['mixed', undefined] as const) {
      const step = sceneStep(lostFight, snap(), null, ended);
      expect(step.event).toBe('next_fight');
      expect(step.held).toBeUndefined();
    }
  });
  it('the verdict is read from the counters: only defeats up is a loss, only kills up a win, both up is not told, none up is nothing', () => {
    const at = (kills: number, defeats: number): FightTally => ({ kills, defeats });
    expect(fightEnded(at(5, 2), at(5, 3))).toBe('lost');
    expect(fightEnded(at(5, 2), at(6, 2))).toBe('won');
    expect(fightEnded(at(5, 2), at(7, 3))).toBe('mixed');
    expect(fightEnded(at(5, 2), at(5, 2))).toBe('none');
  });
  it('no fight ended and the numbers did not move: nothing is played', () => {
    expect(sceneStep(snap(), snap(), null, 'none').event).toBeNull();
  });
});

describe('against the real replay, one snapshot a second', () => {
  const build: HuntCombatBuild = { playerMax: 100, heroDmgBase: 100, critChance: 0, critMult: 2, heroMs: 1000, reduction: 0, lifestealPct: 0, burn: false, reflect: 0, hpRegenPct: 0 };
  const zone: HuntZoneCombatCfg = { baseEnemyHp: 1000, baseEnemyDmg: 30, enemyAtkMs: 1000, hpGrowth: 0, dmgGrowth: 0, depthMult: 1, goldPerHour: 0, xpPerKill: 10, xpRefKph: 1000, drops: [], depth: 'shallow', dropRateMult: 1 };
  const potions: HuntPotionCfg = { threshold: 0, priority: 'small_first', stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 }, greaterElixirHealPct: 0.5, potionHeal: 50, largePotionHeal: 150, cooldownMs: 5000 };
  // one entry per second of the session: the snapshot the scene gets and the counters the game had at that moment
  const frames = (b: HuntCombatBuild, z: HuntZoneCombatCfg, seconds: number): { snap: HuntLiveSnapshot; tally: FightTally }[] =>
    Array.from({ length: seconds }, (_, i) => {
      const r = simulateHuntingSession(b, z, { ceiling: 1, promotionWins: 0 }, (i + 1) * SNAPSHOT_MS, potions, 'seed', { maxLevel: 1, requiredWins: () => 1 });
      return { snap: r.liveSnapshot!, tally: { kills: r.kills, defeats: r.defeats } };
    });
  // what the scene plays for each update, fed the way the hunt screen feeds it; `ended` is what the counters said for that update
  const steps = (fr: { snap: HuntLiveSnapshot; tally: FightTally }[]): (SceneStep & { ended: ReturnType<typeof fightEnded> })[] => {
    const out: (SceneStep & { ended: ReturnType<typeof fightEnded> })[] = [];
    let shown: HuntLiveSnapshot | null = fr[0].snap;
    let last: SceneEvent | null = null;
    for (let i = 1; i < fr.length; i++) {
      const ended = fightEnded(fr[i - 1].tally, fr[i].tally);
      const step = sceneStep(shown, fr[i].snap, last, ended);
      out.push({ ...step, ended });
      shown = step.shown;
      last = step.event ?? last;
    }
    return out;
  };

  it('a hero that dies: the hero is the one who falls, never a monster falling and never a blow on him', () => {
    const fr = frames(build, zone, 12);
    const tally = fr[fr.length - 1].tally;
    expect(tally.kills, 'this hero must never win, or the test says nothing about defeats').toBe(0);
    expect(tally.defeats, 'he must lose several times').toBeGreaterThan(1);
    const ev = steps(fr);
    expect(ev.filter((e) => e.event === 'hero_falls').length, 'every defeat the game counted is shown once, as the hero falling').toBe(tally.defeats);
    expect(ev.some((e) => e.event === 'new_fight'), 'every fight was lost: no monster may fall').toBe(false);
    let shownHero = 100;
    for (const e of ev) {
      // his HP back to full is a change of monster, never a blow on him and never a victory
      if (e.shown && e.shown.heroHp > shownHero) expect(['hero_falls', 'next_fight']).toContain(e.event);
      if (e.event === 'hero_falls') expect(e.held!.enemyHp, 'the monster he lost to is still standing').toBeGreaterThan(0);
      shownHero = e.shown?.heroHp ?? shownHero;
    }
  });

  it('a hero who wins some and loses some: the scene shows each end the way the game counted it, and never a fall the counters did not report', () => {
    // 25 % crits make the fights close: the same replay has wins and defeats, a second at a time
    const mixed = { ...build, playerMax: 240, critChance: 0.25 };
    const fr = frames(mixed, zone, 200);
    const last = fr[fr.length - 1].tally;
    expect(last.kills, 'wins needed').toBeGreaterThan(1);
    expect(last.defeats, 'defeats needed').toBeGreaterThan(1);
    const ev = steps(fr);
    expect(ev.some((e) => e.event === 'hero_falls')).toBe(true);
    expect(ev.some((e) => e.event === 'new_fight')).toBe(true);
    for (const e of ev) {
      if (e.event === 'hero_falls') expect(e.ended).toBe('lost'); // only defeats went up in that update
      if (e.event === 'new_fight') expect(e.ended).toBe('won'); // only wins went up in that update
      if (e.ended === 'lost') expect(e.event).toBe('hero_falls');
      if (e.ended === 'won') expect(e.event).toBe('new_fight');
    }
  });

  it('in a real fight the two never swing together: between one update and the next, at most one bar goes down', () => {
    const fr = frames({ ...build, playerMax: 1_000_000 }, zone, 25);
    const ev = steps(fr);
    expect(ev.filter((e) => e.event === 'hero_strikes').length).toBeGreaterThan(3);
    expect(ev.filter((e) => e.event === 'monster_strikes').length).toBeGreaterThan(3);
    let prev = fr[0].snap;
    for (const e of ev) {
      const down = (e.shown!.enemyHp < prev.enemyHp ? 1 : 0) + (e.shown!.heroHp < prev.heroHp ? 1 : 0);
      if (e.event !== 'new_fight') expect(down).toBeLessThanOrEqual(1);
      prev = e.shown!;
    }
  });

  it('a fight that is won plays the blows, then the monster falls, and the hero never does', () => {
    const ev = steps(frames({ ...build, playerMax: 1_000_000 }, zone, 25)).map((e) => e.event);
    expect(ev.filter((e) => e === 'new_fight').length).toBeGreaterThanOrEqual(2);
    expect(ev).toContain('hero_strikes');
    expect(ev).not.toContain('hero_falls');
  });
});
