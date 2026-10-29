import { runDungeon, spendSkillPoints, withSeededRandom } from '../../../scripts/sim/driver';
import { hero } from '../../../scripts/sim/duel';
import { HuntCombatBuild, HuntPotionCfg, HuntTimeline, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { buildCombatStats, buildHuntSimSetup, computeCP, defaultSave, huntPromotionRequiredWins, normalizeSave, SaveData } from '../engine';
import { getHuntingZone } from '../huntingZones';
import type { HuntSession } from '../huntSession';

// The scenarios the abilities identity test replays. The golden file (abilitiesGolden.json) was recorded from the code as it was BEFORE the abilities engine existed (classes reform,
// phase 4); a hero with no rotation has to give every number of it again, bit for bit. `extra` is merged into every Hunting build, so the same scenarios can be replayed with
// `{ rotation: [] }` and prove that an empty rotation takes the same path as an absent one.
const HOUR = 3600 * 1000;

const noPotions: HuntPotionCfg = { threshold: 0.5, priority: 'small_first', stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 }, greaterElixirHealPct: 0.5, potionHeal: 50, largePotionHeal: 150, cooldownMs: 5000 };
const someHp: HuntPotionCfg = { ...noPotions, stock: { greater_elixir: 2, large_hp: 3, small_hp: 5 } };

const zone = (over: Partial<HuntZoneCombatCfg> = {}): HuntZoneCombatCfg => ({
  baseEnemyHp: 900,
  baseEnemyDmg: 40,
  enemyAtkMs: 1500,
  hpGrowth: 0.1,
  dmgGrowth: 0.08,
  depthMult: 1,
  goldPerHour: 100,
  xpPerKill: 10,
  xpRefKph: 1000,
  drops: [
    { material: 'leather_scrap', rarity: 'common', chance: 0.4, qty: 1 },
    { material: 'demon_claw', rarity: 'uncommon', chance: 0.1, qty: 1 },
    { material: 'beast_sinew', rarity: 'common', chance: 0.2, qty: 1, ownStream: true },
  ],
  depth: 'shallow',
  dropRateMult: 1,
  ...over,
});

const base: HuntCombatBuild = { playerMax: 1500, heroDmgBase: 120, critChance: 0.25, critMult: 2, heroMs: 900, reduction: 0.3, lifestealPct: 0, burn: false, reflect: 0, hpRegenPct: 0 };

const builds: Record<string, HuntCombatBuild> = {
  plain: base,
  gear: { ...base, burn: true, reflect: 0.1, hpRegenPct: 0.01, lifestealPct: 4, goldBonusPct: 10, xpBonusPct: 5 },
  skills: {
    ...base,
    bleed: 0.06,
    block: 0.2,
    bastion: true,
    bossReduction: 0.2,
    matMult: 1.2,
    uniqueMult: 1.3,
    strikes: { crushEvery: 4, crushBonus: 0.5, devastating: true, furyPct: 0.4, counter: 0.5, doubleChance: 0.2 },
  },
  weak: { ...base, playerMax: 400, heroDmgBase: 40, reduction: 0.05 },
};

const timeline: HuntTimeline = {
  strengthWindows: [[0, 3 * HOUR]],
  attackWindows: [[HOUR, 5 * HOUR]],
  dmgStrength: 140,
  dmgAttack: 150,
  dmgBoth: 170,
  passWindows: [[0, 2 * HOUR]],
  passDropMult: 1.5,
  hasteWindows: [[2 * HOUR, 4 * HOUR]],
  heroMsHaste: 700,
  stoneWindows: [[0, HOUR]],
  reductionStone: 0.5,
  precisionWindows: [[HOUR, 2 * HOUR]],
  critPrecision: 0.6,
  fortuneWindows: [[0, 6 * HOUR]],
  fortuneGoldPct: 20,
};

const round = (n: number): number => Math.round(n * 1e6) / 1e6;
const clean = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : typeof x === 'number' ? round(x) : x)));

export function huntScenarios(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, b] of Object.entries(builds)) {
    const build = { ...b, ...extra } as HuntCombatBuild;
    out[`${name}/plain`] = simulateHuntingSession(build, zone(), { ceiling: 1, promotionWins: 0 }, 4 * HOUR, noPotions, `seed:${name}`, { maxLevel: 5, requiredWins: () => 6 });
    out[`${name}/timeline+potions`] = simulateHuntingSession(build, zone({ uniques: [{ itemId: 'x', chance: 0.001 }] }), { ceiling: 3, promotionWins: 2 }, 7 * HOUR, someHp, `seed:${name}:b`, { maxLevel: 6, requiredWins: (c) => c + 3 }, timeline);
  }
  // The real engine path: a ladder hero (with the Warrior skills) fighting the real first zone.
  for (const [key, level, refine] of [['2', 12, 4], ['4g', 52, 6]] as [string, number, number][]) {
    const h = { ...spendSkillPoints(hero(key, refine, { level }), 'warrior'), rotation: [] }; // an EMPTY rotation (phase 5: an absent one is the automatic default now)
    // The glade AS THE GOLDEN WAS RECORDED: the entries of the later class-material streams (classStream: the glade's feather, 29/10) are left out, because this file proves the abilities engine adds nothing to a session,
    // not that the zone's drop table never grows. abilitiesGolden.json is untouched and every old number is still compared exactly.
    const zone = getHuntingZone('demon_glade')!;
    const z = { ...zone, drops: zone.drops.filter((d) => !d.classStream) };
    const session: HuntSession = { stats: buildCombatStats(h), blessed: false, strength: [], attack: [], pass: [], tonics: {} };
    const setup = buildHuntSimSetup(h, z, 'shallow', session, 0, []);
    const build = { ...setup.build, ...extra } as HuntCombatBuild;
    out[`engine/${key}`] = simulateHuntingSession(build, setup.zoneCfg, { ceiling: 1, promotionWins: 0 }, 3 * HOUR, setup.potionCfg, `engine:${key}`, { maxLevel: 4, requiredWins: huntPromotionRequiredWins }, setup.timeline);
  }
  return clean(out) as Record<string, unknown>;
}

export function dungeonScenarios(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const heroes: Record<string, SaveData> = {
    // Phase 5 (2026-10-28): every hero carries an explicit EMPTY rotation, because an ABSENT one now means the automatic default (effectiveRotation). The golden is the proof about the empty rotation.
    t2: { ...hero('2', 3, { level: 15 }), rotation: [], highestDungeonFloor: 6 },
    t3warrior: { ...spendSkillPoints(hero('3', 5, { level: 30 }), 'warrior'), rotation: [], highestDungeonFloor: 18 },
    t3guardian: { ...spendSkillPoints(hero('3', 5, { level: 30 }), 'guardian'), rotation: [], highestDungeonFloor: 18 },
    t4hunter: { ...spendSkillPoints(hero('4g', 6, { level: 52 }), 'hunter'), rotation: [], highestDungeonFloor: 30 },
  };
  for (const [name, h] of Object.entries(heroes)) {
    out[`dungeon/${name}`] = withSeededRandom(7, () => runDungeon(h, 1_700_000_000_000, 12));
    out[`stats/${name}`] = buildCombatStats(h);
    out[`cp/${name}`] = computeCP(h);
  }
  // The wall-clock stamps of a fresh save are not part of the comparison.
  const fresh = normalizeSave(JSON.parse(JSON.stringify(defaultSave()))); // stays exactly as recorded: loading a save no longer writes a rotation (phase 5, it is derived), so it still matches the golden
  out['save/default'] = JSON.parse(JSON.stringify(fresh, (_k, x) => (typeof x === 'number' && x > 1e12 ? 0 : x)));
  return clean(out) as Record<string, unknown>;
}
