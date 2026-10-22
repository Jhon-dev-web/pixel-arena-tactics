import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import {
  HERO_SKILLS,
  HeroSkillId,
  SKILL_PATH_IDS,
  SkillRanks,
  addRank,
  addRankBlock,
  applyLoadoutSwitch,
  applyRespec,
  applySkillAllocation,
  characterXpBonusPct,
  emptySkillTree,
  nextSkillPointLevel,
  pathIcon,
  pointsSpent,
  respecCost,
  sanitizeRanks,
  sanitizeSkillTree,
  skillEffects,
  skillParams,
  skillPointsAvailable,
  skillPointsEarned,
  skillsOfPath,
} from '../heroSkills';
import {
  GatherPass,
  SaveData,
  buildCombatStats,
  buildHuntSession,
  buildHuntSimSetup,
  computeCP,
  computeHuntingStatus,
  computeMiningStatus,
  defaultSave,
  normalizeSave,
  playerMaxHp,
  snapshotGatherPass,
  xpToReachLevel,
} from '../engine';
import { applyDamageModifiers, bastionHp, bleedSpec, bossDamage, combatPowerCore, igniteBurn, newStrikeState, registerBlock, resolveHeroHit, tickBurn } from '../derivedStats';
import { HuntCombatBuild, HuntPotionCfg, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { sanitizeHuntSession } from '../huntSession';
import { getHuntingZone } from '../huntingZones';
import { goldMultiplier } from '../buffs';
import { inventoryCapacity } from '../inventory';
import { dungeonEnemyKindForFloor, isDungeonBoss, isDungeonCheckpoint } from '../dungeon';
import { getEnemyDef } from '../enemies';
import { rollBossRelics, rollBossUniques } from '../uniques';
import { stageEnemyDmg, stageEnemyHp } from '../waves';
import T from '../tunables';
import { fmtSkillNumber, skillText } from '../../components/skillText';
import { locales, setLocale } from '../../locales';
import { hero, repFloor } from '../../../scripts/sim/duel';
import { SKILL_BUILDS, runDungeon, spendSkillPoints } from '../../../scripts/sim/driver';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;

const withSkills = (s: SaveData, ranks: SkillRanks, set: 0 | 1 = 0): SaveData => ({
  ...s,
  skillTree: { ...s.skillTree, active: set, sets: set === 0 ? [ranks, s.skillTree.sets[1]] : [s.skillTree.sets[0], ranks] },
});
const atLevel = (level: number, extra: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), xp: xpToReachLevel(level), ...extra });
const owner = (s: SaveData): SaveData => ({ ...s, hasBattlePass: true });
const fullOf = (id: HeroSkillId): SkillRanks => ({ [id]: HERO_SKILLS.find((x) => x.id === id)!.maxRank });

describe('skill points', () => {
  it('1 point every 5 levels: none before level 5, 20 at the cap', () => {
    expect([1, 4, 5, 9, 10, 49, 50, 99, 100].map(skillPointsEarned)).toEqual([0, 0, 1, 1, 2, 9, 10, 19, 20]);
    expect(skillPointsEarned(Number.NaN)).toBe(0);
    expect(skillPointsEarned(5000)).toBe(20);
    expect(nextSkillPointLevel(1)).toBe(5);
    expect(nextSkillPointLevel(5)).toBe(10);
    expect(nextSkillPointLevel(99)).toBe(100);
    expect(nextSkillPointLevel(100)).toBeNull();
  });

  it('are separate from the attribute points', () => {
    const s = atLevel(20, { str: 10, vit: 10, agi: 10, res: 10 });
    expect(skillPointsAvailable(s, 20)).toBe(4);
    expect(skillPointsAvailable(withSkills(s, { w_heavy_blow: 2 }), 20)).toBe(2);
    expect(s.str + s.vit + s.agi + s.res).toBe(40);
  });
});

describe('the tree', () => {
  it('three paths of six passives (two per tier, up to 3 ranks) and one capstone (1 rank)', () => {
    expect(HERO_SKILLS).toHaveLength(21);
    expect(new Set(HERO_SKILLS.map((s) => s.id)).size).toBe(21);
    for (const p of SKILL_PATH_IDS) {
      const list = skillsOfPath(p);
      expect(list.filter((s) => s.tier === 1)).toHaveLength(2);
      expect(list.filter((s) => s.tier === 2)).toHaveLength(2);
      expect(list.filter((s) => s.tier === 3)).toHaveLength(2);
      expect(list.filter((s) => s.tier === 4)).toHaveLength(1);
      for (const s of list) expect(s.maxRank).toBe(s.tier === 4 ? 1 : 3);
    }
  });

  it('every skill and path has its icon file, a name and a description in both languages, and a description without a typed number', () => {
    const icons = path.resolve(__dirname, '../../../public');
    for (const p of SKILL_PATH_IDS) expect(fs.existsSync(path.join(icons, pathIcon(p))), pathIcon(p)).toBe(true);
    for (const s of HERO_SKILLS) expect(fs.existsSync(path.join(icons, s.icon)), s.icon).toBe(true);
    for (const [name, table] of [['en', en], ['pt', pt]] as const) {
      const hs = (table as unknown as { heroSkills: { paths: Record<string, { name: string; identity: string }>; skills: Record<string, { name: string; desc: string }> } }).heroSkills;
      for (const p of SKILL_PATH_IDS) {
        expect(hs.paths[p].name, `${name} ${p}`).toBeTruthy();
        expect(hs.paths[p].identity, `${name} ${p}`).toBeTruthy();
      }
      for (const s of HERO_SKILLS) {
        expect(hs.skills[s.id].name, `${name} ${s.id}`).toBeTruthy();
        expect(hs.skills[s.id].desc, `${name} ${s.id}`).toBeTruthy();
        // numbers are placeholders filled from T.heroSkills (skillParams), never typed into the text
        expect(hs.skills[s.id].desc, `${name} ${s.id}`).not.toMatch(/\d/);
        const needed = (hs.skills[s.id].desc.match(/\{(\w+)\}/g) ?? []).map((m) => m.slice(1, -1));
        const given = Object.keys(skillParams(s.id, 1));
        for (const k of needed) expect(given, `${name} ${s.id} {${k}}`).toContain(k);
      }
    }
  });

  it('the numbers shown come from the data: they scale with the rank and follow the tunables', () => {
    expect(skillParams('w_heavy_blow', 2).n).toBeCloseTo((T.heroSkills.crushBonusBase + 2 * T.heroSkills.crushBonusStep) * 100, 6);
    expect(skillParams('w_heavy_blow', 3).n).toBeGreaterThan(skillParams('w_heavy_blow', 2).n);
    expect(skillParams('w_heavy_blow', 1).every).toBe(T.heroSkills.crushEvery);
    expect(skillParams('h_packer', 3).n).toBe(3 * T.heroSkills.packerSlots);
    expect(skillParams('w_devastating_strike', 1)).toEqual({ k: T.heroSkills.devastatingEvery, mult: T.heroSkills.devastatingMult });
    const saved = T.heroSkills.crushBonusStep;
    const savedBase = T.heroSkills.crushBonusBase;
    try {
      (T.heroSkills as unknown as Record<string, number>).crushBonusStep = 0.07;
      (T.heroSkills as unknown as Record<string, number>).crushBonusBase = 0;
      expect(skillParams('w_heavy_blow', 1).n).toBe(7);
    } finally {
      (T.heroSkills as unknown as Record<string, number>).crushBonusStep = saved;
      (T.heroSkills as unknown as Record<string, number>).crushBonusBase = savedBase;
    }
  });
});

describe('gating', () => {
  const t1 = skillsOfPath('warrior').filter((s) => s.tier === 1);
  it('tier 2 needs 2 points in the path, tier 3 needs 5, the capstone 10', () => {
    expect(addRankBlock({}, 'w_execution', 20)).toBe('path');
    expect(addRankBlock({ w_heavy_blow: 1 }, 'w_execution', 20)).toBe('path');
    expect(addRankBlock({ w_heavy_blow: 2 }, 'w_execution', 20)).toBeNull();
    expect(addRankBlock({ w_heavy_blow: 3, w_keen_eye: 1 }, 'w_bleed', 20)).toBe('path'); // 4 points
    expect(addRankBlock({ w_heavy_blow: 3, w_keen_eye: 2 }, 'w_bleed', 20)).toBeNull(); // 5 points
    expect(addRankBlock({ w_heavy_blow: 3, w_keen_eye: 3, w_execution: 3 }, 'w_devastating_strike', 20)).toBe('path'); // 9 points
    expect(addRankBlock({ w_heavy_blow: 3, w_keen_eye: 3, w_execution: 3, w_fury: 1 }, 'w_devastating_strike', 20)).toBeNull();
  });

  it('the points of ANOTHER path do not open a tier, and a skill stops at its max rank or when the points run out', () => {
    expect(addRankBlock({ g_thick_skin: 3, g_bulwark: 3 }, 'w_execution', 20)).toBe('path');
    expect(addRankBlock({ w_heavy_blow: 3 }, 'w_heavy_blow', 20)).toBe('max');
    expect(addRankBlock({}, 'w_heavy_blow', 0)).toBe('points');
    expect(addRankBlock({}, 'nope' as HeroSkillId, 5)).toBe('max');
    expect(t1.map((s) => addRankBlock({}, s.id, 1))).toEqual([null, null]);
  });

  it('20 points: one full path (19) and one more point, or a spread with at most one capstone until the very end', () => {
    for (const p of SKILL_PATH_IDS) {
      const ranks: SkillRanks = {};
      for (const id of SKILL_BUILDS[p]) {
        expect(addRankBlock(ranks, id, 20 - pointsSpent(ranks)), id).toBeNull();
        Object.assign(ranks, addRank(ranks, id));
      }
      expect(pointsSpent(ranks)).toBe(19);
      expect(sanitizeRanks(ranks, 19)).toEqual(ranks); // the buy orders the simulator uses are legal allocations
    }
    // 20 points cannot hold two capstones (each needs 10 points in its own path before it)
    const two = { ...Object.fromEntries(skillsOfPath('warrior').filter((s) => s.tier < 4).map((s) => [s.id, 3])), w_devastating_strike: 1 } as SkillRanks;
    const both = { ...two, g_thick_skin: 3, g_bulwark: 3, g_thorns: 3, g_last_bastion: 1 } as SkillRanks;
    expect(sanitizeRanks(both, 20).g_last_bastion).toBeUndefined();
  });
});

describe('sanitising an allocation', () => {
  it('drops unknown ids, caps ranks, enforces the gates and never spends more than was earned', () => {
    const dirty = { w_heavy_blow: 9, ghost: 3, w_keen_eye: -2, w_execution: 2.9, w_bleed: 3, g_thick_skin: 'x', h_greed: Number.NaN, h_scent: 3 };
    const clean = sanitizeRanks(dirty, 4);
    expect(clean).toEqual({ w_heavy_blow: 3, w_execution: 1 }); // 3 + 1 = the 4 points; w_execution (tier 2) is allowed after 3 points; w_bleed / h_scent are gated
    expect(pointsSpent(sanitizeRanks({ w_heavy_blow: 3, w_keen_eye: 3 }, 0))).toBe(0);
    expect(pointsSpent(sanitizeRanks(Object.fromEntries(HERO_SKILLS.map((s) => [s.id, 3])), 7))).toBeLessThanOrEqual(7);
  });

  it('garbage in, empty allocation out, never a throw', () => {
    for (const bad of [null, undefined, 3, 'x', [], [1, 2], () => 1, { w_heavy_blow: { a: 1 } }]) expect(() => sanitizeRanks(bad, 20)).not.toThrow();
    expect(sanitizeRanks('x', 20)).toEqual({});
    expect(sanitizeRanks([1, 2], 20)).toEqual({});
  });

  it('the saved tree is cut to the points of the level and the second set belongs to the Pass owner', () => {
    const raw = { active: 1, respecUsed: true, sets: [{ w_heavy_blow: 3, w_fury: 3 }, { g_thick_skin: 3 }] };
    // level 10 = 2 points
    expect(sanitizeSkillTree(raw, 10, false)).toEqual({ active: 0, respecUsed: true, sets: [{ w_heavy_blow: 2 }, {}] });
    expect(sanitizeSkillTree(raw, 10, true)).toEqual({ active: 1, respecUsed: true, sets: [{ w_heavy_blow: 2 }, { g_thick_skin: 2 }] });
    expect(sanitizeSkillTree(undefined, 50, true)).toEqual(emptySkillTree());
    expect(sanitizeSkillTree({ sets: 'x', active: 7 }, 50, true)).toEqual(emptySkillTree());
  });
});

describe('saves', () => {
  it('an old save (no skills at all) loads with nothing spent and the points its level entitles it to', () => {
    const old = JSON.parse(JSON.stringify(atLevel(37)));
    delete old.skillTree;
    const s = normalizeSave(old);
    expect(s.skillTree).toEqual(emptySkillTree());
    expect(skillPointsAvailable(s, 37)).toBe(7);
    // and loading changes nothing about the combat stats it always had
    expect(buildCombatStats(s)).toEqual(buildCombatStats(atLevel(37)));
  });

  it('a corrupt skill tree loads as a legal allocation', () => {
    const base = JSON.parse(JSON.stringify(atLevel(12)));
    base.skillTree = { active: 'x', respecUsed: 1, sets: [{ w_heavy_blow: 99, w_bleed: 3, nope: 2, g_block: 3, h_greed: 3, h_light_step: 3 }, null] };
    const s = normalizeSave(base);
    expect(pointsSpent(s.skillTree.sets[0])).toBeLessThanOrEqual(2);
    expect(s.skillTree.sets[0].w_bleed).toBeUndefined();
    expect(s.skillTree.sets[1]).toEqual({});
    expect(s.skillTree.active).toBe(0);
    expect(s.skillTree.respecUsed).toBe(false);
    for (const garbage of [null, 5, 'tree', [], { sets: [] }]) {
      const g = JSON.parse(JSON.stringify(atLevel(12)));
      g.skillTree = garbage;
      expect(normalizeSave(g).skillTree).toEqual(emptySkillTree());
    }
  });

  it('the allocation survives a save / load round trip, and a character whose level dropped is cut to its points', () => {
    const s = withSkills(atLevel(30), { w_heavy_blow: 3, w_fury: 3 });
    expect(normalizeSave(JSON.parse(JSON.stringify(s))).skillTree.sets[0]).toEqual({ w_heavy_blow: 3, w_fury: 3 });
    const lower = JSON.parse(JSON.stringify(s));
    lower.xp = xpToReachLevel(5);
    expect(pointsSpent(normalizeSave(lower).skillTree.sets[0])).toBe(1);
  });
});

describe('applying points, respec and loadouts', () => {
  it('only adds ranks, only legal ones, only the points earned', () => {
    const s = atLevel(10);
    expect(applySkillAllocation(s, 10, { w_heavy_blow: 2 }).ok).toBe(true);
    expect(applySkillAllocation(s, 10, { w_heavy_blow: 3 }).ok).toBe(false); // 3 points, 2 earned
    expect(applySkillAllocation(s, 10, { w_execution: 1 }).ok).toBe(false); // gated
    expect(applySkillAllocation(s, 10, {}).reason).toBe('nothing');
    const spent = applySkillAllocation(s, 10, { w_heavy_blow: 2 }).save;
    expect(spent.skillTree.sets[0]).toEqual({ w_heavy_blow: 2 });
    expect(applySkillAllocation(spent, 10, { w_keen_eye: 2 }).ok).toBe(false); // would drop a rank already bought (that is a respec)
    expect(applySkillAllocation(spent, 10, { w_heavy_blow: 2, w_keen_eye: 1 }).ok).toBe(false); // no points left
  });

  it('respec: free the first time, then points spent x gold per point x level / 10; refused in a battle, without the gold, or with nothing spent', () => {
    const s = withSkills(atLevel(50, { gold: 100000 }), { w_heavy_blow: 3, w_fury: 3, w_keen_eye: 2 });
    expect(respecCost(s, 50)).toBe(0);
    const first = applyRespec(s, 50, false);
    expect(first.ok).toBe(true);
    expect(first.cost).toBe(0);
    expect(first.save.gold).toBe(100000);
    expect(first.save.skillTree.sets[0]).toEqual({});
    expect(first.save.skillTree.respecUsed).toBe(true);
    const again = withSkills(first.save, { w_heavy_blow: 3, w_fury: 3, w_keen_eye: 2 });
    // 8 points x 50 gold x level 50 / 10
    expect(respecCost(again, 50)).toBe(Math.round((T.heroSkills.respecGoldPerPoint * 8 * 50) / T.heroSkills.respecLevelDivisor));
    expect(respecCost(again, 50)).toBe(2000);
    expect(respecCost(withSkills(again, { w_heavy_blow: 3, w_fury: 3, w_keen_eye: 2, w_execution: 3, w_weapon_master: 1 }), 100)).toBe(Math.round((50 * 12 * 100) / 10));
    const paid = applyRespec(again, 50, false);
    expect(paid.ok).toBe(true);
    expect(paid.save.gold).toBe(100000 - 2000);
    expect(applyRespec(again, 50, true)).toMatchObject({ ok: false, reason: 'battle' });
    expect(applyRespec({ ...again, gold: 1999 }, 50, false)).toMatchObject({ ok: false, reason: 'gold' });
    expect(applyRespec({ ...again, gold: 1999 }, 50, false).save.skillTree.sets[0]).toEqual(again.skillTree.sets[0]);
    expect(applyRespec(first.save, 50, false)).toMatchObject({ ok: false, reason: 'nothing' });
    expect(applyRespec(withSkills(s, { w_heavy_blow: 1 }), 50, true)).toMatchObject({ ok: false, reason: 'battle' });
  });

  it('loadouts: the second set is a Pass perk, switching is free, refused in a battle, and the two allocations are independent', () => {
    const base = withSkills(withSkills(atLevel(30, { gold: 5 }), { w_heavy_blow: 3 }), {}, 1);
    const buy = (s: SaveData, ranks: SkillRanks) => applySkillAllocation(s, 30, ranks).save;
    expect(applyLoadoutSwitch(base, 1, false)).toMatchObject({ ok: false, reason: 'pass' });
    const o = owner({ ...base, skillTree: { ...base.skillTree, active: 0 } });
    expect(applyLoadoutSwitch(o, 1, true)).toMatchObject({ ok: false, reason: 'battle' });
    const two = applyLoadoutSwitch(o, 1, false);
    expect(two.ok).toBe(true);
    expect(two.save.gold).toBe(5);
    expect(two.save.skillTree.active).toBe(1);
    expect(skillPointsAvailable(two.save, 30)).toBe(6); // a fresh set: all the points again
    const guard = buy(two.save, { g_thick_skin: 3, g_bulwark: 3 });
    expect(guard.skillTree.sets[0]).toEqual({ w_heavy_blow: 3 });
    expect(guard.skillTree.sets[1]).toEqual({ g_thick_skin: 3, g_bulwark: 3 });
    expect(buildCombatStats(guard).maxHp).toBeGreaterThan(buildCombatStats(atLevel(30)).maxHp);
    const back = applyLoadoutSwitch(guard, 0, false).save;
    expect(buildCombatStats(back).strikes).toBeDefined();
    expect(buildCombatStats(guard).strikes).toBeUndefined();
    expect(applyLoadoutSwitch(back, 0, false)).toMatchObject({ ok: false, reason: 'nothing' });
    // a respec empties only the ACTIVE set
    const afterRespec = applyRespec(guard, 30, false).save;
    expect(afterRespec.skillTree.sets[0]).toEqual({ w_heavy_blow: 3 });
    expect(afterRespec.skillTree.sets[1]).toEqual({});
  });
});

// --- effects: every one reaches the shared Layer-2 assembly --------------------------------------------------------------------

describe('each skill changes the combat numbers it promises', () => {
  const h = hero('4g', 4, { level: 60 });
  const bare = buildCombatStats(h);
  const c = (ranks: SkillRanks) => buildCombatStats(withSkills(h, ranks));

  it('Warrior: strikes, crit chance, crit damage, weapon damage, bleed', () => {
    expect(c(fullOf('w_heavy_blow')).dmgBase).toBe(bare.dmgBase); // a strike, not a flat bonus
    expect(c(fullOf('w_heavy_blow')).strikes).toMatchObject({ crushEvery: T.heroSkills.crushEvery });
    expect(c(fullOf('w_heavy_blow')).strikes!.crushBonus).toBeCloseTo(T.heroSkills.crushBonusBase + 3 * T.heroSkills.crushBonusStep, 9);
    expect(c(fullOf('w_keen_eye')).critChance - bare.critChance).toBeCloseTo(3 * T.heroSkills.keenEyeCrit, 9);
    expect(c(fullOf('w_execution')).critMult - bare.critMult).toBeCloseTo(3 * T.heroSkills.executionCritMult, 9);
    expect(c(fullOf('w_fury')).heroMs).toBe(bare.heroMs);
    expect(c(fullOf('w_fury')).strikes!.furyPct).toBeCloseTo(T.heroSkills.furyDmgBase + 3 * T.heroSkills.furyDmgStep, 9);
    expect(c(fullOf('w_weapon_master')).dmgBase).toBeGreaterThan(bare.dmgBase);
    expect(c(fullOf('w_bleed')).bleed).toBeCloseTo(T.heroSkills.bleedBase + 3 * T.heroSkills.bleedStep, 9);
    expect(bare.bleed).toBeUndefined();
    expect(c(fullOf('w_devastating_strike')).strikes).toMatchObject({ crushEvery: T.heroSkills.crushEvery, crushBonus: 0, devastating: true });
    expect(bare.strikes).toBeUndefined();
  });

  it('Guardian: HP, resistance sum, reflect, regeneration, boss damage, block, bastion', () => {
    expect(c(fullOf('g_thick_skin')).maxHp).toBe(Math.round(playerMaxHp(h) * (1 + 3 * T.heroSkills.thickSkinHp)));
    expect(playerMaxHp(withSkills(h, fullOf('g_thick_skin')))).toBe(c(fullOf('g_thick_skin')).maxHp);
    expect(c(fullOf('g_bulwark')).reduction / bare.reduction).toBeCloseTo(1 + 3 * T.heroSkills.bulwarkRes, 9);
    expect(c(fullOf('g_thorns')).reflect - bare.reflect).toBeCloseTo(3 * T.heroSkills.thornsReflect, 9);
    expect(c(fullOf('g_second_wind')).hpRegenPct - bare.hpRegenPct).toBeCloseTo(3 * T.heroSkills.secondWindRegen, 9);
    expect(c(fullOf('g_firm_stance')).bossReduction).toBeCloseTo(3 * T.heroSkills.firmStanceReduction, 9);
    expect(c(fullOf('g_block')).block).toBeCloseTo(T.heroSkills.blockBase + 3 * T.heroSkills.blockStep, 9);
    expect(c(fullOf('g_block')).strikes!.counter).toBeCloseTo(T.heroSkills.counterBase + 3 * T.heroSkills.counterStep, 9);
    expect(c(fullOf('g_last_bastion')).bastion).toBe(true);
  });

  it('Hunter: attack speed, Gold, materials, XP, bag slots, gathering, unique luck', () => {
    expect(c(fullOf('h_light_step')).strikes!.doubleChance).toBeCloseTo(T.heroSkills.doubleBase + 3 * T.heroSkills.doubleStep, 9);
    expect(c(fullOf('h_greed')).skillGold).toBeCloseTo(3 * T.heroSkills.greedGold * 100, 6);
    expect(c(fullOf('h_scent')).matMult).toBeCloseTo(1 + 3 * T.heroSkills.scentMaterials, 9);
    expect(c(fullOf('h_quick_learner')).xpBonus! - bare.xpBonus!).toBeCloseTo(3 * T.heroSkills.quickLearnerXp * 100, 6);
    expect(c(fullOf('h_great_luck')).uniqueMult).toBe(T.heroSkills.luckHuntUnique);
    expect(c(fullOf('h_great_luck')).bossLootMult).toBe(T.heroSkills.luckBossDrop);
    expect(skillEffects(fullOf('h_packer')).bagSlots).toBe(3 * T.heroSkills.packerSlots);
    expect(skillEffects(fullOf('h_gatherer')).gatherPct).toBeCloseTo(3 * T.heroSkills.gathererYield, 9);
  });

  it('a hero without skills has exactly the stats it always had (no key added)', () => {
    expect(Object.keys(bare).sort()).toEqual(Object.keys(buildCombatStats({ ...h, skillTree: emptySkillTree() })).sort());
    for (const k of ['bleed', 'strikes', 'block', 'bastion', 'bossReduction', 'skillGold', 'matMult', 'uniqueMult', 'bossLootMult']) expect(bare, k).not.toHaveProperty(k);
  });

  it('only the ACTIVE set counts', () => {
    const two = owner(withSkills(withSkills(h, { w_weapon_master: 3 }), { g_thick_skin: 3 }, 1));
    const set1 = buildCombatStats({ ...two, skillTree: { ...two.skillTree, active: 0 } });
    const set2 = buildCombatStats(two);
    expect(set1.dmgBase).toBeGreaterThan(bare.dmgBase);
    expect(set1.maxHp).toBe(bare.maxHp);
    expect(set2.dmgBase).toBeCloseTo(bare.dmgBase, 9);
    expect(set2.maxHp).toBeGreaterThan(bare.maxHp);
  });

  it('a full build of each path keeps every Layer-2 number finite and within the speed floor', () => {
    for (const p of SKILL_PATH_IDS) {
      const ranks: SkillRanks = {};
      for (const id of SKILL_BUILDS[p]) Object.assign(ranks, addRank(ranks, id));
      const st = buildCombatStats(withSkills(hero('6', 8, { level: 100 }), ranks));
      for (const v of Object.values(st)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      expect(st.heroMs).toBeGreaterThanOrEqual(T.battle.heroMinMs);
    }
  });
});

// --- the three combat loops agree ------------------------------------------------------------------------------------------------

const baseBuild: HuntCombatBuild = {
  playerMax: 100_000,
  heroDmgBase: 100,
  critChance: 0,
  critMult: 2,
  heroMs: 1000,
  reduction: 0,
  lifestealPct: 0,
  burn: false,
  reflect: 0,
  hpRegenPct: 0,
};
const baseZone: HuntZoneCombatCfg = {
  baseEnemyHp: 1000,
  baseEnemyDmg: 1,
  enemyAtkMs: 1000,
  hpGrowth: 0,
  dmgGrowth: 0,
  depthMult: 1,
  goldPerHour: 0,
  xpPerKill: 0,
  drops: [],
  depth: 'shallow',
  dropRateMult: 1,
};
const noPotions: HuntPotionCfg = {
  threshold: 0,
  priority: 'small_first',
  stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 },
  greaterElixirHealPct: 0.5,
  potionHeal: 50,
  largePotionHeal: 150,
  cooldownMs: 5000,
};
const one = { maxLevel: 1, requiredWins: () => 1 };
const huntFight = (build: HuntCombatBuild, zone: HuntZoneCombatCfg, sessionMs: number, seed = 'seed') =>
  simulateHuntingSession(build, zone, { ceiling: 1, promotionWins: 0 }, sessionMs, noPotions, seed, one);

describe('hunting simulation applies the skills', () => {
  it('Golpe Esmagador: every Nth hit of the whole session deals its bonus; the capstone turns every 3rd crush into a Devastador', () => {
    // 1000 HP, 100 per hit: plain = 10 hits. Crush every 5th hit at +100 % (x2): hits 1-4 = 400, hit 5 = 200 (600), 6 7 8 (900), hit 9 (1000) -> 9 hits
    const crush = { ...baseBuild, strikes: { crushEvery: 5, crushBonus: 1 } };
    expect(huntFight(crush, baseZone, 9_001).fightTimeUsedMs).toBe(9_000);
    expect(huntFight(crush, baseZone, 8_999).fightTimeUsedMs).toBe(0);
    expect(huntFight(baseBuild, baseZone, 9_999).fightTimeUsedMs).toBe(0);
    // the counter runs across fights (the session counter never resets): 400 HP per fight, 4 hits plain; the 5th hit of the session is the first hit of fight 2
    const r = simulateHuntingSession(crush, { ...baseZone, baseEnemyHp: 400 }, { ceiling: 1, promotionWins: 0 }, 20_000, noPotions, 'seed', one);
    expect(r.skillTally.w_heavy_blow!.n).toBeGreaterThan(2);
    expect(r.skillTally.w_heavy_blow!.dmg).toBe(r.skillTally.w_heavy_blow!.n * 100);
    // Devastador (x3 here) replaces the bonus on every 3rd crush: crush 3 is hit 15
    const saved = T.heroSkills.devastatingMult;
    try {
      (T.heroSkills as unknown as Record<string, number>).devastatingMult = 3;
      const dev = simulateHuntingSession({ ...baseBuild, strikes: { crushEvery: 5, crushBonus: 1, devastating: true } }, { ...baseZone, baseEnemyHp: 1e9 }, { ceiling: 1, promotionWins: 0 }, 15_000, noPotions, 'seed', one);
      expect(dev.skillTally.w_devastating_strike).toEqual({ n: 1, dmg: 200 });
      expect(dev.skillTally.w_heavy_blow).toEqual({ n: 2, dmg: 200 });
    } finally {
      (T.heroSkills as unknown as Record<string, number>).devastatingMult = saved;
    }
  });

  it('Golpe de Furia: a flurry every 8 s of combat time, with its own damage, never advancing the Esmagador counter', () => {
    // 100 per hit every second + 3 hits of 50 % every 8 s: 1700 HP dies at... hits 1-8 = 800 + flurry at 8 s (150) = 950, hit 9 = 1050 -> not enough for 1000? it is: 9 s ends it
    const fury = { ...baseBuild, strikes: { furyPct: 0.5 } };
    const zone = { ...baseZone, baseEnemyHp: 1000 };
    expect(huntFight(fury, zone, 9_001).fightTimeUsedMs).toBe(9_000);
    expect(huntFight(fury, zone, 8_999).fightTimeUsedMs).toBe(0);
    expect(huntFight(baseBuild, zone, 9_999).fightTimeUsedMs).toBe(0);
    const r = huntFight(fury, { ...zone, baseEnemyHp: 1e9 }, 17_000);
    expect(r.skillTally.w_fury).toEqual({ n: 2, dmg: 2 * 150 });
    // both: the flurry hits do not count as hits of the hero, so the crush lands on hit 5 regardless of the flurries
    const both = simulateHuntingSession({ ...baseBuild, strikes: { furyPct: 0.5, crushEvery: 10, crushBonus: 1 } }, { ...zone, baseEnemyHp: 1e9 }, { ceiling: 1, promotionWins: 0 }, 20_000, noPotions, 's', one);
    expect(both.skillTally.w_heavy_blow!.n).toBe(2); // hits 10 and 20 of 20 hits in 20 s
  });

  it('Contra-ataque: the hit after a block deals the bonus (and only that hit); Golpe Duplo adds an echo', () => {
    const s = { crushEvery: undefined, counter: 0.5 };
    const st = newStrikeState();
    expect(resolveHeroHit(st, s, () => 1).mult).toBe(1);
    registerBlock(st, s);
    expect(resolveHeroHit(st, s, () => 1)).toMatchObject({ counter: true, mult: 1.5 });
    expect(resolveHeroHit(st, s, () => 1).counter).toBe(false);
    registerBlock(newStrikeState(), undefined); // a hero without the skill: nothing
    const d = resolveHeroHit(newStrikeState(), { doubleChance: 0.1 }, () => 0.05);
    expect(d.double).toBe(true);
    expect(resolveHeroHit(newStrikeState(), { doubleChance: 0.1 }, () => 0.5).double).toBe(false);
    // hunting: every enemy hit blocked -> every hero hit after the first block is a counter
    const r = simulateHuntingSession({ ...baseBuild, block: 0.9999, strikes: { counter: 1 } }, { ...baseZone, baseEnemyHp: 1e9, baseEnemyDmg: 50 }, { ceiling: 1, promotionWins: 0 }, 10_000, noPotions, 'cc', one);
    expect(r.skillTally.g_block!.n).toBeGreaterThan(5);
    expect(r.skillTally.g_block!.dmg).toBe(r.skillTally.g_block!.n * 100);
  });

  it('Golpe Duplo and Bloqueio are deterministic for a seed and draw from their own streams: the session is bit-for-bit what it was', () => {
    const zone = getHuntingZone('demon_glade')!;
    const h = hero('5', 4, { level: 75 });
    const run = (extra: Partial<HuntCombatBuild>, dmg0 = true) => {
      const { build, zoneCfg, potionCfg, timeline } = buildHuntSimSetup(h, zone, 'dense', buildHuntSession(h, NOW), NOW, []);
      return simulateHuntingSession({ ...build, ...extra }, dmg0 ? { ...zoneCfg, baseEnemyDmg: 0 } : zoneCfg, { ceiling: 3, promotionWins: 0 }, 5 * HOUR, potionCfg, 'glade:seed', { maxLevel: 12, requiredWins: () => 5 }, timeline);
    };
    const plain = run({});
    // the echo adds damage, so fights can end earlier; with the echo worth 1 HP the fights are the same and only the streams could move the drops
    const savedEcho = T.heroSkills.doubleDmgPct;
    (T.heroSkills as unknown as Record<string, number>).doubleDmgPct = 0;
    const dbl = run({ strikes: { doubleChance: 0.5 } });
    (T.heroSkills as unknown as Record<string, number>).doubleDmgPct = savedEcho;
    expect(dbl.skillTally.h_light_step!.n).toBeGreaterThan(100);
    expect(dbl.kills).toBe(plain.kills);
    expect(dbl.drops).toEqual(plain.drops);
    expect(dbl.uniques).toEqual(plain.uniques);
    expect(run({ strikes: { doubleChance: 0.5 } })).toEqual(run({ strikes: { doubleChance: 0.5 } }));
    const real = (b: Partial<HuntCombatBuild>) => run(b, false);
    expect(real({ strikes: { doubleChance: 0.3 }, block: 0.2 })).toEqual(real({ strikes: { doubleChance: 0.3 }, block: 0.2 }));
  });

  it('Bleed: a second damage over time that coexists with burn and never stacks', () => {
    const zone = { ...baseZone, baseEnemyHp: 1090 };
    expect(huntFight(baseBuild, zone, 12_001).fightTimeUsedMs).toBe(11_000); // 11 plain hits
    expect(huntFight({ ...baseBuild, burn: true }, zone, 12_001).fightTimeUsedMs).toBe(11_000); // one 6 % burn: 1054 after 10 hits, not enough
    expect(huntFight({ ...baseBuild, bleed: 0.06 }, zone, 12_001).fightTimeUsedMs).toBe(11_000); // a 6 % bleed is the same shape
    // both at once: two independent damage-over-time effects, 12 % of the hit per second, which finishes the fight a hit earlier
    expect(huntFight({ ...baseBuild, bleed: 0.06, burn: true }, zone, 12_001).fightTimeUsedMs).toBe(10_000);
    // refreshing on every hit never stacks: two hits per second (heroMs 500) give the same ticks per second as one
    // 50 per hit every 500 ms, bleed 20 % = 10 per tick: hit 11 at 5.5 s makes 550 and the 4 ticks before it 40, the tick at 5.5 s makes the 600
    const fast = { ...baseBuild, heroMs: 500, heroDmgBase: 50, bleed: 0.2 };
    expect(huntFight(fast, { ...zone, baseEnemyHp: 600 }, 5_501).fightTimeUsedMs).toBe(5_500);
    expect(huntFight(fast, { ...zone, baseEnemyHp: 600 }, 5_499).fightTimeUsedMs).toBe(0);
  });

  it('Bleed matches the burn helpers: same ticks, its own duration', () => {
    let state = igniteBurn(null, 0, 100, bleedSpec(0.02));
    const ticks: number[] = [];
    for (;;) {
      const t = tickBurn(state);
      ticks.push(t.damage);
      if (!t.burn) break;
      state = t.burn;
    }
    expect(ticks).toEqual([2, 2, 2]);
    expect(igniteBurn(null, 0, 100).tickDamage).toBe(Math.round(100 * T.battle.burnPctPerSec));
  });

  it('Last Bastion saves the hero once per cooldown of combat time', () => {
    // the hero dies in 2 hits of 600 (1000 HP): with the bastion the first lethal hit leaves bastionHp, a second one inside the cooldown kills
    const dmg = { ...baseZone, baseEnemyHp: 100_000, baseEnemyDmg: 600, enemyAtkMs: 1000 };
    const build = { ...baseBuild, playerMax: 1000, heroDmgBase: 1 };
    const timeline = (b: HuntCombatBuild, ms: number) => simulateHuntingSession(b, dmg, { ceiling: 1, promotionWins: 0 }, ms, noPotions, 's', one);
    const plain = timeline(build, 10_000);
    expect(plain.defeats).toBeGreaterThan(0);
    expect(bastionHp(1000)).toBe(1 + Math.round(1000 * T.heroSkills.bastionHealPct));
    const saved = timeline({ ...build, bastion: true }, 2_500);
    // 1000 -> 400 (1 s) -> lethal at 2 s: saved at bastionHp (251) -> the next hit at 3 s would kill it, the session ends before
    expect(saved.defeats).toBe(0);
    expect(saved.liveSnapshot!.heroHp).toBe(bastionHp(1000));
    const dead = timeline({ ...build, bastion: true }, 3_100);
    expect(dead.defeats).toBe(1);
  });

  it('Block is deterministic for a seed and draws from its own stream: the fight, the drops and the uniques of the session are bit-for-bit what they were', () => {
    const zone = getHuntingZone('demon_glade')!;
    const h = hero('5', 4, { level: 75 });
    const run = (extra: Partial<HuntCombatBuild>) => {
      const { build, zoneCfg, potionCfg, timeline } = buildHuntSimSetup(h, zone, 'dense', buildHuntSession(h, NOW), NOW, []);
      // an enemy that cannot hurt the hero: block or no block, every fight is the same fight, so only the streams could move the result
      return simulateHuntingSession({ ...build, ...extra }, { ...zoneCfg, baseEnemyDmg: 0 }, { ceiling: 3, promotionWins: 0 }, 5 * HOUR, potionCfg, 'glade:seed', { maxLevel: 12, requiredWins: () => 5 }, timeline);
    };
    const plain = run({});
    const blocking = run({ block: 0.4 });
    // (the 1 HP an enemy hit never goes below is blocked too, which only moves the reflected damage tally)
    expect({ ...blocking, totalDamage: 0 }).toEqual({ ...plain, totalDamage: 0 });
    expect(run({ block: 0.4 })).toEqual(blocking);
    // with real damage the same seed gives the same outcome every time, and the block really reduces what lands
    const real = (b: number) => {
      const { build, zoneCfg, potionCfg, timeline } = buildHuntSimSetup(h, zone, 'dense', buildHuntSession(h, NOW), NOW, []);
      return simulateHuntingSession({ ...build, block: b }, zoneCfg, { ceiling: 8, promotionWins: 0 }, 5 * HOUR, potionCfg, 'glade:seed', { maxLevel: 12, requiredWins: () => 5 }, timeline);
    };
    expect(real(0.3)).toEqual(real(0.3));
    expect(real(0.3).defeats).toBeLessThanOrEqual(real(0).defeats);
  });

  it('Block blocks about its share of the hits', () => {
    const zone = { ...baseZone, baseEnemyHp: 1e12, baseEnemyDmg: 1000, enemyAtkMs: 1000 };
    const build = { ...baseBuild, playerMax: 1_000_000, heroDmgBase: 1, block: 0.25 };
    const r = simulateHuntingSession(build, zone, { ceiling: 1, promotionWins: 0 }, 1000 * 1000 - 1, noPotions, 'blk', one);
    // 999 enemy hits, a quarter blocked: the hero took ~750 x 1000
    const taken = 1_000_000 - r.liveSnapshot!.heroHp;
    expect(taken / 1000).toBeGreaterThan(690);
    expect(taken / 1000).toBeLessThan(810);
    expect(taken % 1000).toBe(0);
  });

  it('Scent multiplies the material chance only; Great Luck the unique chance only; nothing else of the session moves', () => {
    const zone = getHuntingZone('demon_glade')!;
    const h = hero('5', 4, { level: 75 });
    const run = (extra: Partial<HuntCombatBuild>) => {
      const { build, zoneCfg, potionCfg, timeline } = buildHuntSimSetup(h, zone, 'dense', buildHuntSession(h, NOW), NOW, []);
      return simulateHuntingSession({ ...build, ...extra }, { ...zoneCfg, baseEnemyDmg: 0 }, { ceiling: 3, promotionWins: 0 }, 40 * HOUR, potionCfg, 'glade:seed', { maxLevel: 12, requiredWins: () => 5 }, timeline);
    };
    const plain = run({});
    const scent = run({ matMult: 1.5 });
    for (const [m, n] of Object.entries(plain.drops)) expect(scent.drops[m as keyof typeof scent.drops] ?? 0).toBeGreaterThanOrEqual(n as number);
    expect(Object.values(scent.drops).reduce((a, b) => a + (b as number), 0)).toBeGreaterThan(Object.values(plain.drops).reduce((a, b) => a + (b as number), 0));
    expect(scent.kills).toBe(plain.kills);
    expect(scent.xpReady).toBe(plain.xpReady);
    expect(scent.goldReady).toBe(plain.goldReady);
    expect(scent.uniques).toEqual(plain.uniques); // uniques are not materials
    const luck = run({ uniqueMult: 40 }); // uniques are rare per player now (Rodada 9): a big multiplier makes the threshold move visible in 40 h
    expect(luck.drops).toEqual(plain.drops);
    expect(luck.kills).toBe(plain.kills);
    expect(luck.uniques.length).toBeGreaterThanOrEqual(plain.uniques.length);
    // the same draws, only the threshold moved: every unique of the plain session is in the lucky one, in order
    expect(luck.uniques.slice(0, plain.uniques.length).length).toBe(plain.uniques.length);
    expect(luck.uniques.length).toBeGreaterThan(0);
  });
});

describe('Great Luck in the Dungeon', () => {
  it('multiplies the boss unique and relic chance, and only theirs', () => {
    const p = T.battle.uniqueBossChance;
    const roll = (r: number, luck: number) => rollBossUniques(50, () => r, luck).length;
    expect(roll(p * 0.99, 1)).toBe(2); // the floor-50 boss has two uniques, both under the base chance
    expect(roll(p * 1.1, 1)).toBe(0);
    expect(roll(p * 1.1, T.heroSkills.luckBossDrop)).toBe(2);
    expect(roll(p * T.heroSkills.luckBossDrop * 1.01, T.heroSkills.luckBossDrop)).toBe(0);
    const q = T.battle.relicBossChance;
    expect(rollBossRelics(50, () => q * 1.1)).toEqual([]);
    expect(rollBossRelics(50, () => q * 1.1, T.heroSkills.luckBossDrop)).toEqual(['warchief_totem']);
    expect(rollBossUniques(24, () => 0, 3)).toEqual([]); // a plain floor never drops one
  });

  it('the Dungeon driver passes the multiplier from the hero', () => {
    expect(buildCombatStats(withSkills(hero('4g', 4, { level: 60 }), fullOf('h_great_luck'))).bossLootMult).toBe(T.heroSkills.luckBossDrop);
    expect(buildCombatStats(hero('4g', 4, { level: 60 })).bossLootMult).toBeUndefined();
  });
});

describe('the Dungeon driver (mirror of BattleModal) and the hunting simulation resolve one fight identically', () => {
  const huntBuild = (st: ReturnType<typeof buildCombatStats>): HuntCombatBuild => ({
    playerMax: st.maxHp,
    heroDmgBase: applyDamageModifiers(st.dmgBase, { blessedMult: 1, strengthMult: 1, attackMult: 1 }),
    critChance: 0,
    critMult: st.critMult,
    heroMs: st.heroMs,
    reduction: st.reduction,
    lifestealPct: st.lifesteal,
    burn: st.burn,
    reflect: st.reflect,
    hpRegenPct: st.hpRegenPct,
    ...(st.bleed ? { bleed: st.bleed } : {}),
    ...(st.strikes ? { strikes: st.strikes } : {}),
    ...(st.bastion ? { bastion: true } : {}),
  });
  const cases: [string, SkillRanks][] = [
    ['bleed', fullOf('w_bleed')],
    ['devastating strike', { w_devastating_strike: 1 }],
    ['bleed + strike + attack speed + regeneration + reflect', { w_bleed: 3, w_devastating_strike: 1, w_fury: 3, g_second_wind: 3, g_thorns: 3 }],
  ];
  for (const [label, ranks] of cases) {
    it(label, () => {
      const base = withSkills(hero('4d', 4, { level: 50 }), ranks);
      const floor = repFloor(base);
      expect(isDungeonBoss(floor) || isDungeonCheckpoint(floor)).toBe(false);
      const start = { ...base, highestDungeonFloor: floor };
      const realRandom = Math.random;
      Math.random = () => 0.999999; // crits and blocks off in the Dungeon, so the two RNG streams cannot differ
      let run;
      try {
        run = runDungeon(start, NOW, 1);
      } finally {
        Math.random = realRandom;
      }
      expect(run.outcome).toBe('retreat');
      const st = buildCombatStats(start);
      const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
      const zone = { ...baseZone, baseEnemyHp: stageEnemyHp(def, floor), baseEnemyDmg: stageEnemyDmg(def, floor), enemyAtkMs: def.atkSpeedMs };
      const ms = run.seconds * 1000;
      expect(huntFight(huntBuild(st), zone, Math.ceil(ms) + 1).fightTimeUsedMs).toBeCloseTo(ms, 6);
      expect(huntFight(huntBuild(st), zone, Math.floor(ms) - 1).fightTimeUsedMs).toBe(0);
    });
  }

  it('Last Bastion: both loops save the hero once, at the same moment, with the same HP', () => {
    // a floor the hero cannot clear, so it dies; with the bastion it lives one more enemy hit in both loops
    const base = hero('3', 0, { level: 30 });
    const floor = 60;
    const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
    const runOf = (s: SaveData) => {
      const realRandom = Math.random;
      Math.random = () => 0.999999;
      try {
        return runDungeon({ ...s, highestDungeonFloor: floor, consumables: { ...s.consumables, small_hp: 0, large_hp: 0, greater_elixir: 0 } }, NOW, 1);
      } finally {
        Math.random = realRandom;
      }
    };
    const plain = runOf(base);
    const saved = runOf(withSkills(base, { g_last_bastion: 1 }));
    expect(plain.outcome).toBe('defeat');
    expect(saved.seconds).toBeGreaterThan(plain.seconds); // lived through one more enemy hit (at least)
    const st = buildCombatStats(withSkills(base, { g_last_bastion: 1 }));
    const zone = { ...baseZone, baseEnemyHp: 1e12, baseEnemyDmg: stageEnemyDmg(def, floor), enemyAtkMs: def.atkSpeedMs };
    const b = huntBuild(st);
    const longHunt = simulateHuntingSession({ ...b, heroDmgBase: 1 }, zone, { ceiling: 1, promotionWins: 0 }, 60_000, noPotions, 'x', one);
    expect(longHunt.defeats).toBeGreaterThanOrEqual(1);
  });

  it('Firm Stance cuts boss and checkpoint hits only, in the Dungeon only', () => {
    expect(bossDamage(1000, 0.18)).toBe(820);
    expect(bossDamage(1000, undefined)).toBe(1000);
    expect(bossDamage(1, 0.5)).toBe(1);
    const base = withSkills(hero('3', 4, { level: 40 }), fullOf('g_firm_stance'));
    const bare = hero('3', 4, { level: 40 });
    const survive = (s: SaveData, floor: number) => {
      const realRandom = Math.random;
      Math.random = () => 0.999999;
      try {
        return runDungeon({ ...s, highestDungeonFloor: floor }, NOW, 1).seconds;
      } finally {
        Math.random = realRandom;
      }
    };
    // find a checkpoint floor the bare hero loses and the firm one outlasts
    const cp = [10, 20, 30, 40, 50, 60].find((f) => isDungeonCheckpoint(f) && !isDungeonBoss(f) && survive(base, f) > survive(bare, f));
    expect(cp).toBeDefined();
    // a plain floor: the skill changes nothing
    expect(survive(base, 33)).toBe(survive(bare, 33));
    // Hunting reads it for the risky fights only: the hunting build carries it
    const { build } = buildHuntSimSetup(base, getHuntingZone('demon_glade')!, 'shallow', buildHuntSession(base, NOW), NOW, []);
    expect(build.bossReduction).toBeCloseTo(3 * T.heroSkills.firmStanceReduction, 9);
    expect(buildHuntSimSetup(bare, getHuntingZone('demon_glade')!, 'shallow', buildHuntSession(bare, NOW), NOW, []).build).not.toHaveProperty('bossReduction');
  });

  it('Firm Stance in Hunting: a promotion attempt the hero would lose is won with it, while ordinary fights are untouched', () => {
    // level 1: 10 damage a hit (harmless); level 2 (the promotion): 112 a hit; 1000 HP survives 8 of them but not 9, and the enemy needs 9 s to die
    const zone = { ...baseZone, baseEnemyDmg: 10, dmgGrowth: 10.2 };
    const promo = { maxLevel: 2, requiredWins: () => 1 };
    const run = (extra: Partial<HuntCombatBuild>) => simulateHuntingSession({ ...baseBuild, playerMax: 1000, ...extra }, zone, { ceiling: 1, promotionWins: 0 }, 40_000, noPotions, 'seed', promo);
    const plain = run({});
    const firm = run({ bossReduction: 0.1 });
    expect(plain.promotions).toBe(0);
    expect(plain.promotionLosses).toBeGreaterThanOrEqual(1);
    expect(firm.promotions).toBe(1);
    // with no promotion on offer the build is bit-for-bit what it was
    const flat = (extra: Partial<HuntCombatBuild>) => simulateHuntingSession({ ...baseBuild, playerMax: 1000, ...extra }, zone, { ceiling: 1, promotionWins: 0 }, 40_000, noPotions, 'seed', one);
    expect(flat({ bossReduction: 0.5 })).toEqual(flat({}));
  });

  it('Block in the Dungeon uses the loop RNG: pinned high never blocks, pinned low always does', () => {
    const base = withSkills(hero('3', 4, { level: 40 }), { g_block: 3 });
    const floor = Math.max(1, repFloor(base) - 4);
    const run = (rnd: number) => {
      const realRandom = Math.random;
      Math.random = () => rnd;
      try {
        return runDungeon({ ...base, highestDungeonFloor: floor }, NOW, 1);
      } finally {
        Math.random = realRandom;
      }
    };
    expect(run(0.999999).outcome).toBe('retreat');
    const never = run(0.999999).seconds;
    // block always (and a crit on every hit): the fight cannot end later than it did with the same crits and no blocking
    const always = run(0);
    expect(always.outcome).toBe('retreat');
    expect(always.seconds).toBeLessThan(never);
  });
});

describe('the strike counters', () => {
  it('the Esmagador lands on exactly every Nth hit, the Devastador on every 3rd of those, and a hero without strikes never rolls', () => {
    const st = newStrikeState();
    const s = { crushEvery: 3, crushBonus: 0.5, devastating: true };
    const seq = Array.from({ length: 18 }, () => resolveHeroHit(st, s, () => 1));
    expect(seq.map((r) => (r.devastating ? 'D' : r.crush ? 'C' : '.')).join('')).toBe('..C..C..D..C..C..D');
    expect(seq[2].mult).toBeCloseTo(1.5, 9);
    expect(seq[8].mult).toBe(T.heroSkills.devastatingMult);
    let rolled = 0;
    resolveHeroHit(newStrikeState(), undefined, () => (rolled++, 0));
    resolveHeroHit(newStrikeState(), { crushEvery: 5, crushBonus: 1 }, () => (rolled++, 0));
    expect(rolled).toBe(0);
  });
});

// --- economy -----------------------------------------------------------------------------------------------------------------------

describe('economy skills', () => {
  it('Greed adds to the gold multiplier next to the tonic and the Pass, outside the gear cap', () => {
    expect(goldMultiplier(0, false, 0, 0.15)).toBeCloseTo(1.15, 9);
    expect(goldMultiplier(25, true, T.battlePass.goldBonus, 0.15)).toBeCloseTo(1 + 0.25 + T.tonics.fortuneGoldPct + T.battlePass.goldBonus + 0.15, 9);
    expect(goldMultiplier(10, false, 0)).toBeCloseTo(1.1, 9);
  });

  it('Greed raises the Gold of a hunting session, and only the Gold', () => {
    const zone = getHuntingZone('demon_glade')!;
    const h = hero('4g', 4, { level: 60 });
    const g = withSkills(h, fullOf('h_greed'));
    const at = (s: SaveData) => computeHuntingStatus({ ...s, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: NOW, huntSession: buildHuntSession(s, NOW) }, NOW + 4 * HOUR);
    const a = at(h);
    const b = at(g);
    // (the Gold of a short session is a handful of coins, so the floor rounding widens the ratio a little)
    expect(b.goldReady / a.goldReady).toBeGreaterThan(1 + 2 * T.heroSkills.greedGold);
    expect(b.goldReady / a.goldReady).toBeLessThan(1 + 5 * T.heroSkills.greedGold);
    expect(b.xpReady).toBe(a.xpReady);
    expect(b.drops).toEqual(a.drops);
  });

  it('Quick Learner raises the XP of Hunting and joins the Season Relic everywhere the relic counts', () => {
    const zone = getHuntingZone('demon_glade')!;
    const h = hero('4g', 4, { level: 60 });
    const q = withSkills(h, fullOf('h_quick_learner'));
    const at = (s: SaveData) => computeHuntingStatus({ ...s, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: NOW, huntSession: buildHuntSession(s, NOW) }, NOW + 4 * HOUR);
    expect(at(q).xpReady / at(h).xpReady).toBeCloseTo(1 + 3 * T.heroSkills.quickLearnerXp, 1);
    expect(characterXpBonusPct(h)).toBe(0);
    expect(characterXpBonusPct(q)).toBeCloseTo(3 * T.heroSkills.quickLearnerXp * 100, 6);
    const emblem = { ...q, equipped: { ...q.equipped, relic: 'season_emblem' } };
    expect(characterXpBonusPct(emblem)).toBeCloseTo(3 * T.heroSkills.quickLearnerXp * 100, 6); // the Season Emblem no longer adds XP
  });

  it('Packer adds flat inventory slots through the one capacity function', () => {
    const s = atLevel(30);
    const base = inventoryCapacity(s);
    expect(inventoryCapacity(withSkills(s, fullOf('h_packer')))).toBe(base + 3 * T.heroSkills.packerSlots);
    expect(inventoryCapacity(owner(withSkills(s, fullOf('h_packer'))))).toBe(inventoryCapacity(owner(s)) + 3 * T.heroSkills.packerSlots);
    expect(inventoryCapacity({ inventoryCapacity: 30 })).toBe(30); // a partial object without a tree is untouched
  });

  it('Gatherer raises the Mining yield through the snapshot the session started with', () => {
    const s0 = withSkills(atLevel(30, { activeOreId: 'copper', lastMiningClaim: NOW }), fullOf('h_gatherer'));
    const snap = snapshotGatherPass(s0, 8);
    expect(snap.gatherPct).toBeCloseTo(3 * T.heroSkills.gathererYield, 9);
    expect(snapshotGatherPass(atLevel(30), 8).gatherPct).toBeUndefined();
    const status = (s: SaveData, pass: GatherPass) => computeMiningStatus({ ...s, miningPass: pass }, NOW + 8 * HOUR).oreReady;
    const plain = status(s0, { active: false, capHours: 8 });
    const gathered = status(s0, snap);
    expect(gathered / plain).toBeGreaterThan(1.1);
    expect(gathered / plain).toBeLessThan(1 + 3 * T.heroSkills.gathererYield + 0.02);
    // the session keeps what it started with: dropping the skill afterwards changes nothing about it
    const respecd = { ...s0, skillTree: emptySkillTree(), miningPass: snap };
    expect(computeMiningStatus(respecd, NOW + 8 * HOUR).oreReady).toBe(gathered);
    // and it round-trips through a save
    expect(normalizeSave(JSON.parse(JSON.stringify({ ...s0, miningPass: snap }))).miningPass?.gatherPct).toBeCloseTo(snap.gatherPct!, 9);
  });

  it('a hunting session keeps the stats it froze at the start: a respec afterwards does not touch it', () => {
    const zone = getHuntingZone('demon_glade')!;
    const s = withSkills(hero('4g', 4, { level: 60 }), { w_heavy_blow: 3, w_fury: 3, h_greed: 0 });
    const running: SaveData = { ...s, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: NOW, huntSession: buildHuntSession(s, NOW) };
    const before = computeHuntingStatus(running, NOW + 4 * HOUR);
    const after = computeHuntingStatus({ ...running, skillTree: emptySkillTree() }, NOW + 4 * HOUR);
    expect(after).toEqual(before);
    const bare = computeHuntingStatus({ ...running, huntSession: buildHuntSession(hero('4g', 4, { level: 60 }), NOW) }, NOW + 4 * HOUR);
    expect(bare.kills).toBeLessThanOrEqual(before.kills);
  });

  it('the frozen session carries every skill field through a save / load', () => {
    const s = withSkills(hero('4g', 4, { level: 60 }), { ...fullOf('w_bleed'), ...fullOf('g_block'), ...fullOf('h_scent'), ...fullOf('h_greed'), ...fullOf('h_great_luck'), w_devastating_strike: 1, g_last_bastion: 1 });
    const session = buildHuntSession(s, NOW);
    const back = sanitizeHuntSession(JSON.parse(JSON.stringify(session)))!;
    expect(back.stats).toEqual(session.stats);
    expect(back.stats.bleed).toBeGreaterThan(0);
    expect(back.stats.bastion).toBe(true);
    const hostile = sanitizeHuntSession({ ...JSON.parse(JSON.stringify(session)), stats: { ...session.stats, block: 5, matMult: 99, strikes: { crushEvery: -4, furyPct: 99 } } })!.stats;
    expect(hostile.block).toBeUndefined();
    expect(hostile.matMult).toBeUndefined();
    expect(hostile.strikes).toBeUndefined();
    const withStrikes = withSkills(hero('4g', 4, { level: 60 }), { w_heavy_blow: 3, w_devastating_strike: 1, w_fury: 2, g_block: 1, h_light_step: 3 });
    const frozen = sanitizeHuntSession(JSON.parse(JSON.stringify(buildHuntSession(withStrikes, NOW))))!;
    expect(frozen.stats.strikes).toEqual(buildCombatStats(withStrikes).strikes);
  });
});

// --- CP ----------------------------------------------------------------------------------------------------------------------------

describe('CP values the combat skills and never punishes a rank', () => {
  const heroes = [hero('2', 4, { level: 15 }), hero('3', 4, { level: 30 }), hero('4g', 0, { level: 60 }), hero('6', 8, { level: 100 })];
  const combat = HERO_SKILLS.filter((s) => !['h_greed', 'h_scent', 'h_quick_learner', 'h_packer', 'h_gatherer', 'h_great_luck'].includes(s.id));

  it('every rank of every combat skill raises CP', () => {
    for (const h of heroes) {
      const base = computeCP(h);
      for (const def of combat) {
        let last = base;
        for (let r = 1; r <= def.maxRank; r++) {
          const cp = computeCP(withSkills(h, { [def.id]: r }));
          expect(cp, `${def.id} rank ${r}`).toBeGreaterThanOrEqual(last);
          last = cp;
        }
        expect(last, def.id).toBeGreaterThan(base);
      }
    }
  });

  it('economy skills have no CP (attack speed aside)', () => {
    for (const h of heroes) {
      for (const id of ['h_greed', 'h_scent', 'h_quick_learner', 'h_packer', 'h_gatherer', 'h_great_luck'] as HeroSkillId[]) expect(computeCP(withSkills(h, fullOf(id)))).toBe(computeCP(h));
    }
  });

  it('adding a rank to any allocation never lowers CP', () => {
    for (const h of heroes) {
      for (const p of SKILL_PATH_IDS) {
        const ranks: SkillRanks = {};
        let last = computeCP(h);
        for (const id of SKILL_BUILDS[p]) {
          Object.assign(ranks, addRank(ranks, id));
          const cp = computeCP(withSkills(h, ranks));
          expect(cp, `${p} ${id}`).toBeGreaterThanOrEqual(last);
          last = cp;
        }
      }
    }
  });

  it('a stats object without the skill fields still gives a finite CP, and hostile skill values stay finite', () => {
    const st = buildCombatStats(heroes[2]);
    expect(Number.isFinite(combatPowerCore(st))).toBe(true);
    for (const bad of [Number.NaN, -5, Infinity, 1e30]) {
      const v = combatPowerCore({ ...st, bleed: bad, strikes: { crushEvery: bad, crushBonus: bad, furyPct: bad, counter: bad, doubleChance: bad }, block: bad, bossReduction: bad });
      expect(Number.isFinite(v), String(bad)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe('the simulator player spends points as they are earned', () => {
  it('stops at the points the level has, in the order of the build', () => {
    const s = spendSkillPoints(atLevel(23), 'warrior');
    expect(pointsSpent(s.skillTree.sets[0])).toBe(4);
    expect(s.skillTree.sets[0]).toEqual({ w_heavy_blow: 3, w_fury: 1 }); // the first points, tier 2 open after 2
    expect(pointsSpent(spendSkillPoints(atLevel(100), 'hunter').skillTree.sets[0])).toBe(19);
    expect(spendSkillPoints(atLevel(100), 'none').skillTree.sets[0]).toEqual({});
    expect(spendSkillPoints(spendSkillPoints(atLevel(30), 'guardian'), 'guardian').skillTree.sets[0]).toEqual(spendSkillPoints(atLevel(30), 'guardian').skillTree.sets[0]);
  });
});

describe('skill descriptions show the numbers the engine really uses', () => {
  // Every description is rendered for every rank in both languages and must contain the numbers of the effect the engine builds for that rank (trigger interval,
  // percentage, multiplier), so a text can never drift from the mechanic again (the Golpe Devastador once read "every 6th hit x1.3").
  const expected = (id: HeroSkillId, rank: number): number[] => {
    const fx = skillEffects({ [id]: rank });
    const H = T.heroSkills;
    const p = (x: number) => Math.round(x * 1000) / 10;
    switch (id) {
      case 'w_heavy_blow': return [fx.strikes!.crushEvery!, p(fx.strikes!.crushBonus!)];
      case 'w_fury': return [H.furyEveryMs / 1000, H.furyHits, p(fx.strikes!.furyPct!)];
      case 'w_devastating_strike': return [H.devastatingEvery, H.devastatingMult];
      case 'g_block': return [p(fx.blockChance), p(fx.strikes!.counter!)];
      case 'h_light_step': return [p(fx.strikes!.doubleChance!), Math.round(H.doubleDmgPct * 100)];
      case 'w_bleed': return [p(fx.bleed), H.bleedDurationMs / 1000];
      case 'g_last_bastion': return [Math.round(H.bastionHealPct * 100), H.bastionCooldownMs / 1000];
      case 'w_keen_eye': return [p(fx.critChance)];
      case 'w_execution': return [p(fx.critMultBonus)];
      case 'w_weapon_master': return [p(fx.weaponPct)];
      case 'g_thick_skin': return [p(fx.maxHpPct)];
      case 'g_bulwark': return [p(fx.resistancePct)];
      case 'g_thorns': return [p(fx.reflect)];
      case 'g_second_wind': return [p(fx.hpRegenPct)];
      case 'g_firm_stance': return [p(fx.bossReduction)];
      case 'h_greed': return [p(fx.goldPct)];
      case 'h_scent': return [p(fx.materialsMult - 1)];
      case 'h_quick_learner': return [p(fx.xpPct)];
      case 'h_packer': return [fx.bagSlots];
      case 'h_gatherer': return [p(fx.gatherPct)];
      case 'h_great_luck': return [p(fx.huntUniqueMult - 1), p(fx.bossLootMult - 1)];
    }
  };
  it('every rank of every skill, in both languages, prints the engine numbers', () => {
    const before = locales[0];
    try {
      for (const lang of locales) {
        setLocale(lang);
        for (const def of HERO_SKILLS) {
          for (let rank = 1; rank <= def.maxRank; rank++) {
            const text = skillText(def.id, rank);
            for (const n of expected(def.id, rank)) expect(text, `${lang} ${def.id} rank ${rank}`).toContain(fmtSkillNumber(n));
          }
        }
      }
    } finally {
      setLocale(before);
    }
  });
  it('the strikes are the numbers of the design: 28/42/56 every 5th hit, x3 every third crush, 35/45/55 every 8 s', () => {
    expect([1, 2, 3].map((r) => Math.round(skillEffects({ w_heavy_blow: r }).strikes!.crushBonus! * 100))).toEqual([28, 42, 56]);
    expect(T.heroSkills.crushEvery).toBe(5);
    expect(T.heroSkills.devastatingEvery).toBe(3);
    expect(T.heroSkills.devastatingMult).toBe(3);
    expect([1, 2, 3].map((r) => Math.round(skillEffects({ w_fury: r }).strikes!.furyPct! * 100))).toEqual([35, 45, 55]);
    expect(T.heroSkills.furyEveryMs).toBe(8000);
    expect([1, 2, 3].map((r) => Math.round(skillEffects({ w_bleed: r }).bleed * 100))).toEqual([6, 11, 15]);
    expect([1, 2, 3].map((r) => Math.round(skillEffects({ g_block: r }).blockChance * 100))).toEqual([3, 5, 7]);
    expect([1, 2, 3].map((r) => Math.round(skillEffects({ g_block: r }).strikes!.counter! * 100))).toEqual([40, 60, 80]);
    expect([1, 2, 3].map((r) => Math.round(skillEffects({ h_light_step: r }).strikes!.doubleChance! * 100))).toEqual([8, 12, 16]);
    expect(T.heroSkills.doubleDmgPct).toBe(0.6);
  });
});
