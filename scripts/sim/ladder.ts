// A ladder of "reasonable builds" used to measure how much CP a Dungeon floor really asks for (the recommended-CP table is
// generated from it, see cpTable.gen.ts) and to probe the floor-25 boss. A build is a hero of a given level with the
// attribute points spread like the sim player does (driver.ts ATTR_WEIGHTS), wearing a matching pair of common-rarity
// weapon + armor of one tier refined to a given level, no gems, no substats, no potions, full HP.
import { computeCP, defaultSave, SaveData, xpToReachLevel } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear } from '../../src/game/gear';
import { runDungeon, spendAttributePoints, withSeededRandom } from './driver';

export const TIER_GEAR: Record<number, [string, string]> = {
  1: ['bronze_dagger', 'bronze_leather'],
  2: ['iron_short_sword', 'iron_chainmail'],
  3: ['steel_greatsword', 'steel_plate'],
  4: ['gilded_warblade', 'gilded_aegis'],
  5: ['voidsteel_blade', 'voidsteel_plate'],
  6: ['abyssal_greatblade', 'abyssal_bulwark'],
};

export interface LadderBuild {
  label: string;
  level: number;
  tier: number; // 0 = the starter wooden club + rags
  refine: number;
  cp: number;
  hero: SaveData;
}

export function buildHero(level: number, tier: number, refine: number, floor = 1): SaveData {
  let hero: SaveData = { ...defaultSave(), xp: xpToReachLevel(level), highestDungeonFloor: floor };
  if (tier > 0) {
    const instances = { ...hero.gearInstances };
    const equipped = { ...hero.equipped };
    for (const [slot, tpl] of [['weapon', TIER_GEAR[tier][0]], ['armor', TIER_GEAR[tier][1]]] as const) {
      const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
      instances[inst.id] = inst;
      equipped[slot] = inst.id;
    }
    hero = { ...hero, gearInstances: instances, equipped };
  }
  return spendAttributePoints(hero);
}

const LEVELS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 23, 26, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100];
const REFINES = [0, 4, 8];

export function ladder(): LadderBuild[] {
  // The brand-new hero, with its first three attribute points still unspent (CP 58): this is the CP a new player sees on floor 1.
  const fresh = { ...defaultSave(), highestDungeonFloor: 1 };
  const out: LadderBuild[] = [{ label: 'fresh (points unspent)', level: 1, tier: 0, refine: 0, cp: computeCP(fresh), hero: fresh }];
  for (const level of LEVELS) {
    out.push(mk(level, 0, 0));
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      // a build only exists once the level lets the player craft that tier (the weapon's recipe level)
      if (level < (getGear(TIER_GEAR[tier][0]).recipe?.requiredLevel ?? 0)) continue;
      for (const r of REFINES) out.push(mk(level, tier, r));
    }
  }
  return out.sort((a, b) => a.cp - b.cp);
}

function mk(level: number, tier: number, refine: number): LadderBuild {
  const hero = buildHero(level, tier, refine);
  return { label: tier === 0 ? `Lv${level} starter` : `Lv${level} T${tier}+${refine}`, level, tier, refine, cp: computeCP(hero), hero };
}

// Fraction of `n` seeded runs in which the hero, starting `floor` at full HP, clears that one floor.
export function clearRate(hero: SaveData, floor: number, now: number, n = 3): number {
  let wins = 0;
  const start = { ...hero, highestDungeonFloor: floor };
  for (let i = 0; i < n; i++) {
    const run = withSeededRandom(900 + i, () => runDungeon(start, now, 1));
    if (run.stages >= 1) wins++;
  }
  return wins / n;
}

export const CP_WINDOW = 1.1; // a build "represents" the builds whose CP is up to 10% above its own
export const WIN_SHARE = 0.8; // recommended CP = the lowest CP from which at least 80% of the builds in that window win the floor
export const MAX_FLOOR = 100;

export interface FloorProbe {
  floor: number;
  raw: number; // lowest CP meeting the rule, before smoothing (Infinity when even the top of the ladder fails)
}

// Raw (unsmoothed) recommended CP of one floor. `builds` must be sorted by CP.
export function probeFloor(builds: LadderBuild[], floor: number, now: number): number {
  const wins = builds.map((b) => clearRate(b.hero, floor, now) >= WIN_SHARE);
  for (let i = 0; i < builds.length; i++) {
    let n = 0;
    let w = 0;
    for (let j = i; j < builds.length && builds[j].cp <= builds[i].cp * CP_WINDOW + 1e-9; j++) {
      n++;
      if (wins[j]) w++;
    }
    if (w / n >= WIN_SHARE) return builds[i].cp;
  }
  return Infinity;
}

// All 100 floors: raw values, then made monotonically non-decreasing (running maximum) and rounded up to a whole number. A floor that
// no build of the ladder clears gets the CP of the strongest build (the ladder is capped).
export function recommendedTable(builds: LadderBuild[], now: number): { raw: number[]; table: number[] } {
  const raw: number[] = [];
  for (let f = 1; f <= MAX_FLOOR; f++) raw.push(probeFloor(builds, f, now));
  const top = builds[builds.length - 1].cp;
  const table: number[] = [];
  let run = 0;
  for (const v of raw) {
    run = Math.max(run, Number.isFinite(v) ? v : top);
    table.push(Math.ceil(run));
  }
  return { raw, table };
}
