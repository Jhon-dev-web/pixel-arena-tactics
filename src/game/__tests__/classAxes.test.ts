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
  // choosing the ruler by the result; tier 4 is guarded above, tier 3 and 5 stay unmeasured on purpose.
  it.todo('the mage at tier 3 +8 is not more than 10 % behind on the boss and does not stop at floor 39');
});

// ALL SIX WEAPONS ON THE TABLE (29/10). The guards above read only the main weapon of each class (sword, bow, staff). The other three (axe, crossbow, scepter) are real choices the player can make, and measured
// alone they broke the design in silence: the crossbow led Hunting (the mage's axis) by 11.5 % at tier 4 and was number one on all three axes, the scepter sat 29 % under the staff in Hunting, the axe 8-9 % under the sword
// and nothing made up for it. Each build is measured exactly like the guard (same hero, same hunting zone and pin, same boss loop, same depth loop, same seeds) and read against the mean of the three MAIN builds:
// Hunting = kills an hour, Boss = speed of the four biome bosses (each over the mean of the mains at that boss, then averaged), Depth = deepest floor. scripts/tools/classAxesWide.tool.ts prints the same table.
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const BOSSES = [25, 50, 75, 100];
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
    if (clearRate(h, f, NOW, 3) < 2 / 3) break;
    reach = f;
  }
  return reach;
}

// score[axis] of each of the six builds (1.00 = the mean of the three mains), in the order warrior, warrior (axe), archer, archer (crossbow), mage, mage (scepter)
function sixBuilds(tier: number, level: number, zone: string, pin: number): { b: ClassBuild; score: Record<Axis, number> }[] {
  const builds = [CLASS_MAIN[0], CLASS_VARIANTS[0], CLASS_MAIN[1], CLASS_VARIANTS[1], CLASS_MAIN[2], CLASS_VARIANTS[2]];
  const rows = builds.map((b) => {
    const h = classHero(b, level, tier, 8, 'real');
    return { b, kph: killsPerHour(h, zone, pin), speeds: BOSSES.map((f) => 1 / bossKill(h, f, NOW, 24).ms), reach: floorReach(h) };
  });
  const mains = [0, 2, 4];
  const mean = (f: (r: (typeof rows)[number]) => number): number => mains.reduce((a, i) => a + f(rows[i]), 0) / mains.length;
  const bossRef = BOSSES.map((_, k) => mean((r) => r.speeds[k]));
  const kphRef = mean((r) => r.kph);
  const reachRef = mean((r) => r.reach);
  return rows.map((r) => ({
    b: r.b,
    score: { hunting: r.kph / kphRef, boss: r.speeds.reduce((a, s, k) => a + s / bossRef[k], 0) / BOSSES.length, depth: r.reach / reachRef },
  }));
}

describe.each([
  { label: 'tier 6 +8 (level 100)', tier: 6, level: 100, zone: 'blood_abyss', pin: 7 },
  { label: 'tier 4 +8 (level 62)', tier: 4, level: 62, zone: 'blood_abyss', pin: 5 },
])('the six weapons, $label', ({ tier, level, zone, pin }) => {
  const rows = sixBuilds(tier, level, zone, pin);
  const get = (id: string) => rows.find((r) => r.b.id === id)!;

  it('no build leads an axis that is not its class by more than 10 % (against the best build of the class that owns it)', () => {
    for (const axis of AXES) {
      const ownerBest = Math.max(...rows.filter((r) => r.b.cls === OWNER[axis]).map((r) => r.score[axis]));
      for (const r of rows.filter((x) => x.b.cls !== OWNER[axis])) {
        expect(r.score[axis] / ownerBest - 1, `${r.b.id} on ${axis}`).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("the crossbow does not lead Hunting: it stays at or under the best mage build (the archer's slow heavy weapon, not a second mage)", () => {
    const mageBest = Math.max(get('mage').score.hunting, get('mage (scepter)').score.hunting);
    expect(get('archer (crossbow)').score.hunting).toBeLessThanOrEqual(mageBest);
  });

  // SECOND ROUND (29/10). The first round fixed the crossbow, the axe and the scepter and moved the trap: the warrior no longer LED the floors (sword, axe, crossbow and scepter all reached floor 69 at tier 4: a tie), and the
  // bow became the archer's dead option (the crossbow beat it on all three axes). Both are rules of the design, and neither lit anything, so these two tests close them for all six weapons.
  it('each class leads ITS axis with every build counted, strictly: the best mage build leads Hunting, the best archer build the boss, the best warrior build the floors (leading is not tying)', () => {
    for (const axis of AXES) {
      const best = (cls: ClassBuild['cls']): number => Math.max(...rows.filter((r) => r.b.cls === cls).map((r) => r.score[axis]));
      for (const cls of (['warrior', 'archer', 'mage'] as const).filter((c) => c !== OWNER[axis])) {
        expect(best(OWNER[axis]), `${OWNER[axis]} against ${cls} on ${axis}`).toBeGreaterThan(best(cls));
      }
    }
  });

  it('every weapon beats its twin on at least one axis, in both directions (the sword and the axe, the bow and the crossbow, the staff and the scepter: a real choice, never a punishment, never a dead option)', () => {
    for (const [a, b] of [['warrior', 'warrior (axe)'], ['archer', 'archer (crossbow)'], ['mage', 'mage (scepter)']] as const) {
      for (const [winner, loser] of [[a, b], [b, a]] as const) {
        const wins = AXES.filter((axis) => get(winner).score[axis] > get(loser).score[axis]);
        expect(wins.length, `${winner} beats ${loser} on no axis`).toBeGreaterThan(0);
      }
    }
  });
});
