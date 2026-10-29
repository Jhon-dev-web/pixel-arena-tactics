import { describe, expect, it } from 'vitest';
import { axisLeads } from '../../../scripts/sim/classAxes';
import { bossKill } from '../../../scripts/sim/duel';
import { clearRate } from '../../../scripts/sim/ladder';
import { CLASS_MAIN, CLASS_VARIANTS, classHero, ClassBuild } from '../../../scripts/sim/classHero';
import { buildHuntSession, computeHuntingStatus, huntProgressKey, SaveData } from '../engine';
import T from '../tunables';

// THE PROMISE THE CLASSES REFORM MAKES (docs/CLASSES_E_EQUIPAMENTOS.md 2.5, 28/10): each class is 15-20 % better than the others on ITS OWN axis and not more than 10 % behind on the other two. Not "the same CP":
// CP counts damage and effective HP as equals, and in Hunting and against a boss nobody dies, so it approves an imbalance forever (the phase 8 measurement: at the same CP the archer killed 50 % faster than the
// warrior and the mage 16 % slower). This guard measures the axes themselves, at the reference tier (tier 6 +8, level 100), with the real Hunting engine and the real Dungeon loop, and lights when a change of gear,
// ability or class leaves the archer a boss-killer by 50 % or the mage with no area. The ranges have a few points of room around 15-20 for the discrete steps (a sub-level, a floor).
//   Axis            leader     measure
//   Hunting         mage       kills an hour (pinned sub-level 7 of the abyss)
//   Boss            archer     speed of the four biome bosses
//   Depth           warrior    only where the axis discriminates (tiers 2 to 5, guarded at tier 4); at tier 6 it SATURATES, see the note at the end
describe('class axes at tier 6 +8', () => {
  const leads = axisLeads(6, 100, 8);
  const [warrior, archer, mage] = [0, 1, 2];

  it('the mage leads Hunting by 12 to 24 %', () => {
    expect(leads.hunting[mage]).toBeGreaterThanOrEqual(0.12);
    expect(leads.hunting[mage]).toBeLessThanOrEqual(0.24);
  });

  it('the archer leads the boss by 12 to 25 %', () => {
    expect(leads.boss[archer]).toBeGreaterThanOrEqual(0.12);
    expect(leads.boss[archer]).toBeLessThanOrEqual(0.25);
  });

  it('no class falls more than 10 % behind the other two on any axis', () => {
    for (const axis of ['hunting', 'boss', 'depth'] as const) {
      expect(leads[axis][warrior], `warrior ${axis}`).toBeGreaterThanOrEqual(-0.1);
      expect(leads[axis][archer], `archer ${axis}`).toBeGreaterThanOrEqual(-0.1);
      expect(leads[axis][mage], `mage ${axis}`).toBeGreaterThanOrEqual(-0.1);
    }
  });

  it('the archer does not also win Hunting (its lead there stays under 10 %: one class, one axis)', () => {
    expect(leads.hunting[archer]).toBeLessThanOrEqual(0.1);
  });

  // TIER 4 +8 (level 62, the middle of the game). Cooldowns count AVERAGE swings since 28/10 (abilities.ts abilityCdScale), which is what lets tier 4 close at all: with fixed cooldowns the warrior's Firm Strike
  // took the boss axis from the archer. All three leads close, and so does the mage's weak side (the boss and the floors), which needed the abilities and the staff dial of the 28/10 round and the shorter opening shot of the archer (see docs/CLASSES_E_EQUIPAMENTOS.md 5.1.6).
  describe('tier 4 +8', () => {
    const t4 = axisLeads(4, 62, 8, 'blood_abyss', 5);
    it('the mage leads Hunting by 12 to 24 %, the archer leads the boss by 12 to 25 %, the warrior leads the depth by 12 to 25 %', () => {
      expect(t4.hunting[mage]).toBeGreaterThanOrEqual(0.12);
      expect(t4.hunting[mage]).toBeLessThanOrEqual(0.24);
      expect(t4.boss[archer]).toBeGreaterThanOrEqual(0.12);
      expect(t4.boss[archer]).toBeLessThanOrEqual(0.25);
      expect(t4.depth[warrior]).toBeGreaterThanOrEqual(0.12);
      expect(t4.depth[warrior]).toBeLessThanOrEqual(0.25);
    });
    it('no class falls more than 10 % behind the other two on any axis, and the archer does not also win Hunting', () => {
      for (const axis of ['hunting', 'boss', 'depth'] as const) {
        expect(t4[axis][warrior], `warrior ${axis}`).toBeGreaterThanOrEqual(-0.1);
        expect(t4[axis][archer], `archer ${axis}`).toBeGreaterThanOrEqual(-0.1);
        expect(t4[axis][mage], `mage ${axis}`).toBeGreaterThanOrEqual(-0.1);
      }
      expect(t4.hunting[archer]).toBeLessThanOrEqual(0.1);
    });
    // The floors of this tier are discrete (a class stops at 59, 69, 74...: the walls are the checkpoints 60 and 70 and the boss of 75), so the leads above come out of the triple of reaches: the one that closes the three
    // rules is warrior 69 / archer 59 / mage 59 (+16.9 / -7.8 / -7.8 %); any other triple the game can reach breaks one (74 / 69 / 59 is +15.6 / +3.8 / -17.5). If a depth line lights after a change of survival, look at the reaches first.
  });

  // DEPTH AXIS. At tier 6 every class stops between floor 84 and 89 (the content saturates: nobody gets past about floor 86 with a common tier 6 set), so there is no room to tell the classes apart there, and the lead of the
  // warrior is +3 to +5 %. The 15-20 % target of the depth is meant where the axis discriminates (tier 2 to 5; at tier 3 +8 the floors are 59 / 59 / 39). Measuring it somewhere else to manufacture a difference would be
  // choosing the ruler by the result; tier 4 is guarded above; tiers 2, 3 and 5 are read only for the twin rule below.
  it.todo('the mage at tier 3 +8 is not more than 10 % behind on the boss and does not stop at floor 39');
});

// ALL SIX WEAPONS ON THE TABLE (29/10, rewritten 30/10). The guards above read only the main weapon of each class (sword, bow, staff). The other three (axe, crossbow, scepter) are real choices the player can make, and measured
// alone they broke the design in silence: the crossbow led Hunting (the mage's axis) by 11.5 % at tier 4 and was number one on all three axes, the scepter sat 29 % under the staff in Hunting, the axe 8-9 % under the sword.
// Each build is measured exactly like the guard (same hero, same hunting zone and pin) and read against the mean of the three MAIN builds: Hunting = kills an hour, Boss = speed of the four biome bosses (each over the mean of the mains
// at that boss, then averaged), Depth = deepest floor. scripts/tools/classAxesWide.tool.ts prints the same table (and the same noise).
//
// WHAT THE TABLE CAN AND CANNOT JUDGE (30/10, measured with that tool at tiers 2-6). It compares CLASSES well. It cannot tell two TWINS of one class apart by a declared sign (the short-fight weapon wins Hunting, the long-fight
// one the boss): that was tried for a whole round and it does not exist in this engine. (1) The overkill of a huge swing on a nearly dead enemy, which was supposed to separate the two, is too small: the same average power in a longer
// shape (3.0 / 20 s against 2.0 / 10 s) moves Hunting by 1-2 points and takes the boss DOWN. (2) The "Boss" axis is the mean of four different fights: at floors 25 and 50 the fight lasts 1 to 3 swings with the abilities already spent on the
// four floors before it (what counts is the attack interval: the bow wins there by 5-13 %), at floors 75 and 100 it lasts 20-100 s and counts the sustained power exactly like Hunting. (3) The one mechanic that only Hunting rewards is the
// carry, and only the staff and the axe have it; sword, bow and crossbow have none, so in those pairs Hunting and boss measure the same power and there is no sign to calibrate with a cooldown.
// So the rule for twins is the one that protects the player from the real defect, a dead option: NO WEAPON IS WORSE THAN ITS TWIN ON ALL THREE AXES AT ONCE, each "worse" counted past the seed noise.
//
// THE MARGINS COME FROM THE NOISE (measured with AXES_NOISE=8 of the tool: the same measurement with 8 different seed sets, 96 seeds a boss, 9 runs a floor, 3 hunting starts, every pair of twins at tiers 2-6):
//   Hunting  standard deviation of the gap between twins 0.09 to 0.43 points  -> margin 1.5 points (3.5 x the worst)
//   Boss     0.09 to 1.90 points at 96 seeds (with 24 seeds, what this file used to run: up to 5.6)  -> margin 4 points (2.1 x the worst); the boss runs 96 seeds a fight for that reason
//   Depth    the reach is an integer floor and a tie is what a seed makes of a one-floor edge, so "worse" is a whole floor lower, and a floor-lead that vanishes with the seeds is not asserted (see the class block)
// A margin under 2 standard deviations is a test that lights or sleeps on the seed, not on the game.
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const BOSSES = [25, 50, 75, 100];
const BOSS_SEEDS = 96;
const DEPTH_SEEDS = 9;
const HUNT_MARGIN = 0.015;
const BOSS_MARGIN = 0.04;
type Axis = 'hunting' | 'boss' | 'depth';
const AXES: Axis[] = ['hunting', 'boss', 'depth'];
const OWNER: Record<Axis, ClassBuild['cls']> = { hunting: 'mage', boss: 'archer', depth: 'warrior' };

function killsPerHour(h: SaveData, zoneId: string, pin: number): number {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = pin;
  try {
    let kills = 0;
    let hours = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = NOW + i * 7_919_000;
      let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: 'shallow', huntingOfflineStart: t0 };
      save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, 'shallow')]: { ceiling: pin, promotionWins: 0 } } };
      save = { ...save, huntSession: buildHuntSession(save, t0) };
      const st = computeHuntingStatus(save, t0 + 4 * 3600 * 1000);
      kills += st.kills;
      hours += st.pendingMs / 3600_000;
    }
    return kills / hours;
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}

function floorReach(h: SaveData): number {
  let reach = 0;
  for (let f = 1; f <= 100; f++) {
    if (clearRate(h, f, NOW, DEPTH_SEEDS) < 2 / 3) break;
    reach = f;
  }
  return reach;
}

interface Six {
  b: ClassBuild;
  score: Record<Axis, number>; // 1.00 = the mean of the three mains (Hunting, Boss)
  reach: number; // Depth in floors (the integer the margin of a floor is read on)
}
// the six builds in the order warrior, warrior (axe), archer, archer (crossbow), mage, mage (scepter)
function sixBuilds(tier: number, level: number, refine: number, zone: string, pin: number): Six[] {
  const builds = [CLASS_MAIN[0], CLASS_VARIANTS[0], CLASS_MAIN[1], CLASS_VARIANTS[1], CLASS_MAIN[2], CLASS_VARIANTS[2]];
  const rows = builds.map((b) => {
    const h = classHero(b, level, tier, refine, 'real');
    return { b, kph: killsPerHour(h, zone, pin), speeds: BOSSES.map((f) => 1 / bossKill(h, f, NOW, BOSS_SEEDS).ms), reach: floorReach(h) };
  });
  const mains = [0, 2, 4];
  const mean = (f: (r: (typeof rows)[number]) => number): number => mains.reduce((a, i) => a + f(rows[i]), 0) / mains.length;
  const bossRef = BOSSES.map((_, k) => mean((r) => r.speeds[k]));
  const kphRef = mean((r) => r.kph);
  const reachRef = mean((r) => r.reach);
  return rows.map((r) => ({
    b: r.b,
    reach: r.reach,
    score: { hunting: r.kph / kphRef, boss: r.speeds.reduce((a, s, k) => a + s / bossRef[k], 0) / BOSSES.length, depth: r.reach / reachRef },
  }));
}

// The twin rule as a function, so the red / green proof is one place: a weapon is dead when its twin beats it on Hunting by the margin AND on the boss by the margin AND reaches at least a floor deeper.
function deadWeapons(rows: Six[]): string[] {
  const dead: string[] = [];
  for (const [a, b] of [['warrior', 'warrior (axe)'], ['archer', 'archer (crossbow)'], ['mage', 'mage (scepter)']] as const) {
    const A = rows.find((r) => r.b.id === a)!;
    const B = rows.find((r) => r.b.id === b)!;
    for (const [w, t] of [[A, B], [B, A]] as const) {
      const worseHunting = w.score.hunting / t.score.hunting - 1 <= -HUNT_MARGIN;
      const worseBoss = w.score.boss / t.score.boss - 1 <= -BOSS_MARGIN;
      const worseDepth = w.reach <= t.reach - 1;
      if (worseHunting && worseBoss && worseDepth) dead.push(`${w.b.id} (worse than ${t.b.id} on all three axes)`);
    }
  }
  return dead;
}

// Tier setups: the guard's own (4 and 6) and the three the tool added (2, 3, 5), same level, refine, zone and pinned sub-level as scripts/tools/classAxesWide.tool.ts.
const SETUPS = [
  { tier: 2, label: 'tier 2 +4 (level 20)', level: 20, refine: 4, zone: 'blood_marsh', pin: 10 },
  { tier: 3, label: 'tier 3 +8 (level 45)', level: 45, refine: 8, zone: 'demon_rift', pin: 10 },
  { tier: 4, label: 'tier 4 +8 (level 62)', level: 62, refine: 8, zone: 'blood_abyss', pin: 5 },
  { tier: 5, label: 'tier 5 +8 (level 75)', level: 75, refine: 8, zone: 'blood_abyss', pin: 6 },
  { tier: 6, label: 'tier 6 +8 (level 100)', level: 100, refine: 8, zone: 'blood_abyss', pin: 7 },
];

describe.each(SETUPS)('the six weapons, $label', ({ tier, level, refine, zone, pin }) => {
  const rows = sixBuilds(tier, level, refine, zone, pin);
  const get = (id: string) => rows.find((r) => r.b.id === id)!;
  const best = (axis: Axis, cls: ClassBuild['cls']): number => Math.max(...rows.filter((r) => r.b.cls === cls).map((r) => r.score[axis]));

  it('no weapon is worse than its twin on all three axes at once (a dead option): the sword and the axe, the bow and the crossbow, the staff and the scepter', () => {
    expect(deadWeapons(rows)).toEqual([]);
  });

  it("the crossbow does not lead Hunting: it stays at or under the best mage build (the archer's slow heavy weapon, not a second mage)", () => {
    expect(get('archer (crossbow)').score.hunting).toBeLessThanOrEqual(Math.max(get('mage').score.hunting, get('mage (scepter)').score.hunting));
  });

  // The class rules are read at the two reference tiers only. At tiers 2, 3 and 5 they do not hold and never did (measured: the archer is 3 to 7 % BEHIND on the boss at tiers 2 and 3, the floors of tiers 2 and 5 are a tie of
  // everybody at 24-25 and 77-79): asserting them there would be inventing a promise.
  if (tier === 4 || tier === 6) {
    it('no build leads an axis that is not its class by more than 10 % (against the best build of the class that owns it)', () => {
      for (const axis of AXES) {
        const ownerBest = best(axis, OWNER[axis]);
        for (const r of rows.filter((x) => x.b.cls !== OWNER[axis])) {
          expect(r.score[axis] / ownerBest - 1, `${r.b.id} on ${axis}`).toBeLessThanOrEqual(0.1);
        }
      }
    });

    // Hunting: the best mage build leads, clear of the noise, at both tiers (measured +13 to +17 % over 8 seed sets).
    it('the best mage build leads Hunting over the best build of any other class by more than the Hunting margin', () => {
      const others = (['warrior', 'archer'] as const).map((c) => best('hunting', c));
      expect(best('hunting', 'mage') / Math.max(...others) - 1).toBeGreaterThan(HUNT_MARGIN);
    });

    // Boss: at tier 6 the best archer build leads, clear of the noise (measured +12 to +15 % over 8 seed sets). At tier 4 the lead is +0.4 to +5.3 % across the seed sets, so it is NOT asserted as a lead: it is a band, the
    // archer is not behind any other class by more than the boss margin (the honest version of the claim; the +13 % of the 24-seed measure of the guard above was luck of the seeds).
    it(tier === 6 ? 'the best archer build leads the boss over the best build of any other class by more than the boss margin' : 'the best archer build is not more than the boss margin behind the best build of any other class', () => {
      const others = (['warrior', 'mage'] as const).map((c) => best('boss', c));
      const lead = best('boss', 'archer') / Math.max(...others) - 1;
      if (tier === 6) expect(lead).toBeGreaterThan(BOSS_MARGIN);
      else expect(lead).toBeGreaterThanOrEqual(-BOSS_MARGIN);
    });

    // Floors: the warrior's lead is +0.0 to +7.2 % at tier 4 and +0.0 to +2.3 % at tier 6 across 8 seed sets (9 runs a floor): a tie in the unlucky sets, a floor or two in the others, and it never goes BEHIND. So the claim
    // that survives the seeds is "nobody reaches deeper than the warrior"; "the warrior leads" is not asserted, because on the seeds it is not true every time.
    it('no other class reaches a deeper floor than the best warrior build (a tie is allowed: the lead is within the seed noise)', () => {
      const warrior = Math.max(...rows.filter((r) => r.b.cls === 'warrior').map((r) => r.reach));
      for (const r of rows.filter((x) => x.b.cls !== 'warrior')) expect(r.reach, `${r.b.id} floors`).toBeLessThanOrEqual(warrior);
    });
  }
});
