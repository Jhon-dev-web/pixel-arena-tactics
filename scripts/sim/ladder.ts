// A ladder of "reasonable builds" used to measure how much CP a Dungeon floor really asks for (the recommended-CP table is
// generated from it, see cpTable.gen.ts) and to probe the floor-25 boss. A build is a hero of a given level with the
// attribute points spread like the sim player does (driver.ts ATTR_WEIGHTS), wearing the full set of one tier (weapon, armor, helmet, gloves, boots, ring, shield) of common-rarity
// weapon + armor of one tier refined to a given level, no gems, no substats, no potions, full HP.
import { computeCP, defaultSave, SaveData, xpToReachLevel } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear } from '../../src/game/gear';
import { dungeonEnemyKindForFloor, isDungeonBoss, isDungeonCheckpoint } from '../../src/game/dungeon';
import { getEnemyDef } from '../../src/game/enemies';
import { stageEnemyDmg, stageEnemyHp } from '../../src/game/waves';
import { runDungeon, spendAttributePoints, withSeededRandom } from './driver';
import { gearOnly } from './duel';

export const TIER_GEAR: Record<number, [string, string]> = {
  1: ['bronze_dagger', 'bronze_leather'],
  2: ['iron_short_sword', 'iron_chainmail'],
  3: ['steel_greatsword', 'steel_plate'],
  4: ['gilded_warblade', 'gilded_aegis'],
  5: ['voidsteel_blade', 'voidsteel_plate'],
  6: ['abyssal_greatblade', 'abyssal_bulwark'],
};

// The helmet / gloves / boots / ring / shield of each tier (common, same refine as the weapon): the ladder describes a hero that has filled every slot of
// the tier, which is the player the Dungeon curve is balanced around (docs/BALANCE_CHANGES.md Rodada 3; the shield joined in Rodada 6).
export const TIER_EXTRAS: Record<number, [string, string][]> = {
  1: [['helmet', 'bronze_helm'], ['gloves', 'leather_gloves'], ['boots', 'leather_boots'], ['ring', 'copper_ring'], ['shield', 'bronze_buckler']],
  2: [['helmet', 'iron_helm'], ['gloves', 'iron_gauntlets'], ['boots', 'iron_greaves'], ['ring', 'silver_ring'], ['shield', 'iron_shield']],
  3: [['helmet', 'steel_helm'], ['gloves', 'steel_gauntlets'], ['boots', 'steel_greaves'], ['ring', 'gold_ring'], ['shield', 'steel_kite_shield']],
  4: [['helmet', 'gilded_helm'], ['gloves', 'gilded_gauntlets'], ['boots', 'gilded_greaves'], ['ring', 'ruby_ring'], ['shield', 'gilded_shield']],
  5: [['helmet', 'voidsteel_helm'], ['gloves', 'voidsteel_gauntlets'], ['boots', 'voidsteel_greaves'], ['ring', 'obsidian_ring'], ['shield', 'voidsteel_shield']],
  6: [['helmet', 'abyssal_helm'], ['gloves', 'abyssal_gauntlets'], ['boots', 'abyssal_greaves'], ['ring', 'abyssal_ring'], ['shield', 'abyssal_shield']],
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
    const pieces: [string, string][] = [['weapon', TIER_GEAR[tier][0]], ['armor', TIER_GEAR[tier][1]], ...TIER_EXTRAS[tier]];
    for (const [slot, tpl] of pieces) {
      const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
      instances[inst.id] = inst;
      (equipped as unknown as Record<string, string>)[slot] = inst.id;
    }
    hero = { ...hero, gearInstances: instances, equipped };
  }
  return gearOnly(spendAttributePoints(hero)); // gear-only: see duel.ts gearOnly (and the REVIEW IN PHASE 8 of recommendedCp.ts)
}

const LEVELS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 23, 26, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100];
const REFINES = [0, 4, 8];
// Round 17: the refinement past +8 (tier 5 and 6 pieces, from hero level 60) is part of what a player of floors 87-100 wears, so the ladder has those builds too: without them the
// floors 87-100 were all "no build clears this" and took the extrapolated value.
const DEEP_REFINES = [10, 12];

export function ladder(): LadderBuild[] {
  // The brand-new hero, with its first three attribute points still unspent (CP 58): this is the CP a new player sees on floor 1.
  const fresh = gearOnly({ ...defaultSave(), highestDungeonFloor: 1 });
  const out: LadderBuild[] = [{ label: 'fresh (points unspent)', level: 1, tier: 0, refine: 0, cp: computeCP(fresh), hero: fresh }];
  for (const level of LEVELS) {
    out.push(mk(level, 0, 0));
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      // a build only exists once the level lets the player craft that tier (the weapon's recipe level)
      if (level < (getGear(TIER_GEAR[tier][0]).recipe?.requiredLevel ?? 0)) continue;
      for (const r of REFINES) out.push(mk(level, tier, r));
      if (tier >= 5 && level >= 60) for (const r of DEEP_REFINES) out.push(mk(level, tier, r));
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

// log(CP) = a + b * log(HP x damage) over the floors from 26 up that the ladder really measures (clearly below its top).
function powerFit(raw: number[], top: number): { a: number; b: number } {
  const pts: [number, number][] = [];
  raw.forEach((v, i) => {
    if (i + 1 >= 26 && Number.isFinite(v) && v < top * 0.9) pts.push([Math.log(stagePower(i + 1)), Math.log(v)]);
  });
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return { a: my - b * mx, b };
}

// A checkpoint (floor 10, 20, 30 ...) is a mini-boss with +50% HP and +25% damage: its measured CP sits ~25% above both neighbours. Letting it
// raise the running maximum would overstate the next ~10 floors by up to 37%, so a checkpoint is a one-floor spike: it is never below the
// floors before it, but the floors after it continue from the previous non-checkpoint value. Boss floors (25/50/75/100) carry on normally.
export const isSpikeFloor = (floor: number): boolean => isDungeonCheckpoint(floor) && !isDungeonBoss(floor);

// All 100 floors: raw values, then a running maximum over the non-spike floors (see above), rounded up to a whole number. A floor that
// no build of the ladder clears gets the CP of the strongest build (the ladder is capped).
export function recommendedTable(builds: LadderBuild[], now: number): { raw: number[]; table: number[] } {
  const raw: number[] = [];
  for (let f = 1; f <= MAX_FLOOR; f++) raw.push(probeFloor(builds, f, now));
  const top = builds[builds.length - 1].cp;
  // Round 15: past floor ~86 no build of the ladder (it stops at level 100, tier 6 +8) clears the floor, and a table that says "the strongest build" for all of them would tell the
  // player that floor 100 asks what floor 87 asks. A floor the ladder cannot measure (or only measures at its very top) takes the CP a power law over the measured floors 26+ asks of it.
  const fit = powerFit(raw, top);
  const table: number[] = [];
  let run = 0;
  raw.forEach((rv, i) => {
    const measured = Number.isFinite(rv) && rv < top * 0.9;
    const v = measured ? rv : Math.max(Number.isFinite(rv) ? rv : top, Math.round(Math.exp(fit.a + fit.b * Math.log(stagePower(i + 1)))));
    if (isSpikeFloor(i + 1)) {
      table.push(Math.ceil(Math.max(run, v)));
    } else {
      run = Math.max(run, v);
      table.push(Math.ceil(run));
    }
  });
  return { raw, table };
}

// ---- floors no (or only the very top) ladder build clears: best build + extrapolated CP ---------------------------------------------------------------------------

export interface UnclearedFloor {
  floor: number;
  power: number; // enemy HP x damage per hit
  bestBuild: string;
  bestCp: number;
  bestWinRate: number; // share of 10 seeded runs the best build wins, in %
  neededCp: number; // CP extrapolated from the measured floors (power law fitted on the floors 26..100 the ladder does clear)
}

const stagePower = (floor: number): number => {
  const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
  return stageEnemyHp(def, floor) * stageEnemyDmg(def, floor);
};

export function uncleared(builds: LadderBuild[], raw: number[], now: number): { floors: UnclearedFloor[]; fit: { a: number; b: number } } {
  // log(raw CP) = a + b * log(power), least squares over the measured floors from 26 up
  const pts: [number, number][] = [];
  raw.forEach((v, i) => {
    if (i + 1 >= 26 && Number.isFinite(v)) pts.push([Math.log(stagePower(i + 1)), Math.log(v)]);
  });
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const a = my - b * mx;
  const floors: UnclearedFloor[] = [];
  const top = builds[builds.length - 1].cp;
  raw.forEach((v, i) => {
    // listed: floors the ladder never clears, plus floors only its strongest build(s) clear (raw value = the top of the ladder)
    if (Number.isFinite(v) && v < top * 0.99) return;
    const floor = i + 1;
    let best = builds[0];
    let bestRate = -1;
    for (const bd of builds) {
      const r = clearRate(bd.hero, floor, now, 10);
      if (r > bestRate || (r === bestRate && bd.cp > best.cp)) {
        best = bd;
        bestRate = r;
      }
    }
    floors.push({ floor, power: stagePower(floor), bestBuild: best.label, bestCp: best.cp, bestWinRate: Math.round(bestRate * 100), neededCp: Math.round(Math.exp(a + b * Math.log(stagePower(floor)))) });
  });
  return { floors, fit: { a, b } };
}
