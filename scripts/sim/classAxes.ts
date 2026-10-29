// The axis table of the classes reform (docs/CLASSES_E_EQUIPAMENTOS.md 2.5), as a function the balance guard (classAxes.test.ts) can call. The same measures as classBalance.sim.ts, trimmed to what a test can afford:
//   hunting  kills per hour of a 4 h session of the real Hunting engine, the zone's shallow depth pinned at a sub-level every class wins (no promotion), averaged over a few session seeds
//   boss     speed (1 / time to kill) of the four biome bosses through the real Dungeon loop, hero immortal, arriving after four floors of the biome
//   depth    deepest floor of an unbroken run of floors cleared from full HP with no potion (2 of 3 seeded runs)
// Each class is read against the MEAN OF THE OTHER TWO (a lead of 0.15 = 15 % better). Heroes: the full set of one weight and the weapon of its family, common, rotation and affinity on (classHero.ts).
import { buildHuntSession, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import type { HuntingDepth } from '../../src/game/huntingZones';
import T from '../../src/game/tunables';
import { bossKill, HeroMode } from './duel';
import { clearRate } from './ladder';
import { CLASS_MAIN, classHero } from './classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

function killsPerHour(h: SaveData, zoneId: string, depth: HuntingDepth, pin: number, starts: number): number {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = pin;
  try {
    let kills = 0;
    let hours = 0;
    for (let i = 0; i < starts; i++) {
      const t0 = NOW + i * 7_919_000;
      let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: t0 };
      save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, depth)]: { ceiling: pin, promotionWins: 0 } } };
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

const lead = (v: number[], i: number): number => v[i] / ((v.reduce((a, b) => a + b, 0) - v[i]) / (v.length - 1)) - 1;

export interface AxisLeads {
  hunting: number[]; // per class (warrior, archer, mage)
  boss: number[];
  depth: number[];
}

export function axisLeads(tier: number, level: number, refine: number, zoneId = 'blood_abyss', pin = 7, mode: HeroMode = 'real'): AxisLeads {
  const heroes = CLASS_MAIN.map((b) => classHero(b, level, tier, refine, mode));
  const kph = heroes.map((h) => killsPerHour(h, zoneId, 'shallow', pin, 3));
  const boss = [25, 50, 75, 100].map((f) => heroes.map((h) => 1 / bossKill(h, f, NOW, 24).ms));
  const reach = heroes.map((h) => floorReach(h));
  return {
    hunting: heroes.map((_, i) => lead(kph, i)),
    boss: heroes.map((_, i) => boss.reduce((a, row) => a + lead(row, i), 0) / boss.length),
    depth: heroes.map((_, i) => lead(reach, i)),
  };
}
