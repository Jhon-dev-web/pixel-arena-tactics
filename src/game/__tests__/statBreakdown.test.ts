import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDungeon, mulberry32, withSeededRandom } from '../../../scripts/sim/driver';
import { hero } from '../../../scripts/sim/duel';
import { BUFF_ITEM, activeTonicStats, buffRemainingMs, goldMultiplier, TIMED_BUFF_KINDS } from '../buffs';
import { applyDamageModifiers, applyDamageReduction } from '../derivedStats';
import { applyElixir, ElixirId } from '../elixirs';
import {
  buildCombatStats,
  buildHuntSession,
  buildHuntSimSetup,
  combatModifiersFromSave,
  computeCP,
  cpOfStats,
  defaultSave,
  SaveData,
  xpToReachLevel,
} from '../engine';
import { GEAR, GearSlot, INSTANCED_SLOTS } from '../gear';
import { GEMS } from '../gems';
import { createGearInstance } from '../gearInstances';
import { HERO_SKILLS, saveSkillEffects, sanitizeRanks, skillPointsEarned } from '../heroSkills';
import { getHuntingZone } from '../huntingZones';
import { ownsAdventurerPass } from '../entitlements';
import { paragonLevelXp } from '../paragon';
import { rollSubstats, RARITIES } from '../rarity';
import { compareItem, liveCombatStats, liveVector, runningTemporaries, STAT_IDS, statBreakdown, StatId, withItemEquipped } from '../statBreakdown';
import { dungeonEnemyKindForFloor } from '../dungeon';
import { getEnemyDef } from '../enemies';
import { stageEnemyDmg } from '../waves';
import T from '../tunables';

const MIN = 60 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const give = (s: SaveData, items: Partial<Record<string, number>>): SaveData => ({ ...s, consumables: { ...s.consumables, ...items } });
const drink = (s: SaveData, ...ids: ElixirId[]): SaveData => ids.reduce((acc, id) => applyElixir(give(acc, { [id]: 1 }), id, NOW - 1000) ?? acc, s);
const ALL_ELIXIRS = Object.keys(BUFF_ITEM) as ElixirId[];

// ---- random heroes: every source the panel splits, at random ---------------------------------------------------------------

function randomHero(seed: number): SaveData {
  const rnd = mulberry32(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
  const lvl = 1 + Math.floor(rnd() * 100);
  const paragon = rnd() < 0.3 ? Math.floor(rnd() * 40) * paragonLevelXp(1) : 0;
  let s: SaveData = { ...defaultSave(), xp: xpToReachLevel(lvl) + paragon, str: Math.floor(rnd() * 80), vit: Math.floor(rnd() * 80), agi: Math.floor(rnd() * 60), res: Math.floor(rnd() * 60), armorLevel: 1 + Math.floor(rnd() * 5) };
  const family = pick(['bronze_', 'iron_', 'steel_', 'gilded_', 'voidsteel_', 'abyssal_', '']);
  const instances = { ...s.gearInstances };
  const equipped = { ...s.equipped };
  for (const slot of INSTANCED_SLOTS) {
    if (rnd() < 0.15) continue;
    const pool = GEAR.filter((g) => g.slot === slot && g.tier && (family === '' || g.id.startsWith(family) || rnd() < 0.2));
    const tpl = pool.length > 0 ? pick(pool) : pick(GEAR.filter((g) => g.slot === slot && g.tier));
    const rarity = pick(RARITIES).id;
    const inst = createGearInstance(tpl.id, {
      id: `gi_${slot}`,
      origin: 'craft',
      rarity,
      substats: rollSubstats(rarity, tpl.tier ?? 1, 0, rnd),
      upgrade: Math.floor(rnd() * 9),
      sockets: Array.from({ length: Math.floor(rnd() * 3) }, () => pick(GEMS).id),
      durability: 15 + Math.floor(rnd() * 86),
    });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  const relic = pick([null, 'ring_vitality', 'amulet_swiftness', 'berserker_crest', 'goblin_lucky_coin', 'warchief_totem', 'lich_phylactery', 'overlord_sigil', 'season_emblem']);
  equipped.relic = relic;
  const raw = Object.fromEntries(HERO_SKILLS.map((d) => [d.id, Math.floor(rnd() * (d.maxRank + 1))]));
  s = { ...s, gearInstances: instances, equipped, hasBattlePass: rnd() < 0.5, blessed: rnd() < 0.4, skillTree: { active: 0, sets: [sanitizeRanks(raw, skillPointsEarned(lvl)), {}], respecUsed: false } };
  // random elixirs: some running (with random time left), some expired
  for (const id of ALL_ELIXIRS) {
    if (rnd() < 0.55) s = applyElixir(give(s, { [id]: 1 }), id, NOW - Math.floor(rnd() * 20 * MIN)) ?? s;
  }
  return s;
}

const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);

describe('the breakdown IS the engine: totals equal what the fight uses, for random heroes and buff states', () => {
  it.each(SEEDS)('seed %i: permanent totals = buildCombatStats, totals now = the modifiers the fight applies at `now`', (seed) => {
    const s = randomHero(seed);
    const bd = statBreakdown(s, NOW);
    const stats = buildCombatStats(s);
    const fx = saveSkillEffects(s);
    const pass = ownsAdventurerPass(s) ? T.battlePass.goldBonus : 0;
    const gold = (fortune: boolean) => (goldMultiplier(stats.goldBonus ?? 0, fortune, pass, fx.goldPct) - 1) * 100;
    // permanent: the Layer-2 numbers the Dungeon, Hunting and the CP read
    expect(bd.rows.maxHp.permanent).toBe(stats.maxHp);
    expect(bd.rows.damage.permanent).toBe(stats.dmgBase);
    expect(bd.rows.critChance.permanent).toBe(stats.critChance);
    expect(bd.rows.critMult.permanent).toBe(stats.critMult);
    expect(bd.rows.defense.permanent).toBe(stats.reduction);
    expect(bd.rows.attackSpeed.permanent).toBe(1000 / stats.heroMs);
    expect(bd.rows.lifesteal.permanent).toBe(stats.lifesteal);
    expect(bd.rows.regen.permanent).toBe(stats.hpRegenPct);
    expect(bd.rows.reflect.permanent).toBe(stats.reflect);
    expect(bd.rows.gold.permanent).toBe(gold(false));
    expect(bd.rows.xp.permanent).toBe(stats.xpBonus ?? 0);
    expect(bd.cpPermanent).toBe(computeCP(s));
    // now: BattleModal's calls, verbatim
    const tonic = activeTonicStats(stats, s, NOW);
    expect(bd.rows.maxHp.now).toBe(tonic.maxHp);
    expect(bd.rows.damage.now).toBe(applyDamageModifiers(stats.dmgBase, combatModifiersFromSave(s, NOW)));
    expect(bd.rows.critChance.now).toBe(tonic.critChance);
    expect(bd.rows.defense.now).toBe(tonic.reduction);
    expect(bd.rows.attackSpeed.now).toBe(1000 / tonic.heroMs);
    expect(bd.rows.gold.now).toBe(gold(!!s.buffs.fortune && s.buffs.fortune.expiresAt > NOW));
    expect(bd.cpNow).toBe(cpOfStats(liveCombatStats(s, NOW)));
    // the live vector is the same object the rows read
    const live = liveVector(s, NOW);
    for (const id of STAT_IDS) expect(bd.rows[id].now, id).toBe(live[id]);
  });

  it.each(SEEDS)('seed %i: the lines add up to the totals (permanent lines to the permanent value, temporary lines to the difference)', (seed) => {
    const s = randomHero(seed);
    const bd = statBreakdown(s, NOW);
    const running = runningTemporaries(s, NOW) as string[];
    for (const id of STAT_IDS) {
      const row = bd.rows[id];
      const perm = row.lines.filter((l) => !l.temporary).reduce((a, l) => a + l.delta, 0);
      const temp = row.lines.filter((l) => l.temporary).reduce((a, l) => a + l.delta, 0);
      expect(perm, `${id} permanent`).toBeCloseTo(row.permanent, 7);
      expect(row.permanent + temp, `${id} now`).toBeCloseTo(row.now, 7);
      expect(row.lines[0].source).toBe('character');
      for (const l of row.lines) if (l.temporary) expect(running).toContain(l.source);
    }
    expect(bd.temporaries.map((t) => t.source)).toEqual(running);
  });
});

describe('the figures the panel shows are the figures the fights use', () => {
  const probe = (): SaveData => ({ ...defaultSave(), xp: xpToReachLevel(15), str: 20, vit: 10, agi: 8, res: 6, highestDungeonFloor: 6 });

  it('Dungeon: hit, swing interval and damage taken of a real run match the "now" column', () => {
    const buffed = { ...drink(probe(), 'strength_elixir', 'atk_elixir', 'sharpening_stone', 'haste_tonic', 'stoneskin_tonic', 'armor_polish'), blessed: true };
    const bd = statBreakdown(buffed, NOW);
    const run = withSeededRandom(1, () => runDungeon(buffed, NOW, 1));
    expect(run.crits).toBe(0);
    expect(run.totalDamage / run.heroHits).toBe(Math.round(bd.rows.damage.now));
    expect(run.seconds * 1000).toBeCloseTo(run.heroHits * (1000 / bd.rows.attackSpeed.now), 6);
    const raw = stageEnemyDmg(getEnemyDef(dungeonEnemyKindForFloor(6)), 6);
    expect(run.enemyHits).toBeGreaterThan(0);
    expect(run.damageTaken / run.enemyHits).toBe(applyDamageReduction(raw, bd.rows.defense.now));
    // and the permanent column is what the same hero deals with nothing running
    const plain = withSeededRandom(1, () => runDungeon(probe(), NOW, 1));
    expect(plain.totalDamage / plain.heroHits).toBe(Math.round(statBreakdown(probe(), NOW).rows.damage.now));
    expect(bd.rows.damage.now / bd.rows.damage.permanent).toBeCloseTo(1.05 * (1 + T.battle.strengthElixirDmgPct) * (1 + T.battle.attackElixirDmgPct) * (1 + T.consumables.sharpenDmgPct), 12);
  });

  it('Hunting: a session that starts with the buffs running uses the same numbers the "now" column shows', () => {
    const base = { ...hero('3', 3, { level: 40 }), highestDungeonFloor: 60 };
    const zone = getHuntingZone('blood_marsh')!;
    for (const ids of [['strength_elixir'], ['atk_elixir'], ['strength_elixir', 'atk_elixir', 'sharpening_stone'], ['stoneskin_tonic', 'armor_polish'], ['haste_tonic'], ['precision_elixir']] as ElixirId[][]) {
      const s = { ...drink(base, ...ids), activeHuntingZone: 'blood_marsh' };
      const session = buildHuntSession(s, NOW);
      const { timeline } = buildHuntSimSetup(s, zone, 'dense', session, NOW, []);
      const bd = statBreakdown(s, NOW);
      const hasS = ids.includes('strength_elixir');
      const hasA = ids.includes('atk_elixir');
      const hit = hasS && hasA ? timeline.dmgBoth : hasS ? timeline.dmgStrength : hasA ? timeline.dmgAttack : session.stats.dmgBase;
      expect(bd.rows.damage.now, ids.join('+')).toBeCloseTo(ids.includes('sharpening_stone') ? hit * (timeline.sharpMult ?? 1) : hit, 9);
      if (ids.includes('stoneskin_tonic')) expect(bd.rows.defense.now).toBeCloseTo(timeline.reductionStone! + (timeline.reductionPolish ?? 0), 12);
      if (ids.includes('haste_tonic')) expect(1000 / bd.rows.attackSpeed.now).toBeCloseTo(timeline.heroMsHaste!, 9);
      if (ids.includes('precision_elixir')) expect(bd.rows.critChance.now).toBeCloseTo(timeline.critPrecision!, 12);
    }
  });

  it('a multiplier shows its factor as the engine applies it: x1.05 blessed, x1.2 Strength, x1.04 Stone, not an invented additive split', () => {
    const s = { ...drink(probe(), 'strength_elixir', 'sharpening_stone'), blessed: true };
    const lines = statBreakdown(s, NOW).rows.damage.lines.filter((l) => l.temporary);
    expect(lines.map((l) => l.source)).toEqual(['blessed', 'strength', 'sharpened']);
    expect(lines.map((l) => l.factor)).toEqual([1.05, 1 + T.battle.strengthElixirDmgPct, 1 + T.consumables.sharpenDmgPct].map((f) => expect.closeTo(f, 12)));
  });

  it('timers: each temporary line carries the time the engine says is left, and an expired one is gone', () => {
    const s = drink(probe(), 'haste_tonic', 'fortune_tonic');
    const bd = statBreakdown(s, NOW);
    expect(bd.temporaries.find((t) => t.source === 'haste')!.remainingMs).toBe(buffRemainingMs(s, NOW, 'haste'));
    const later = statBreakdown(s, NOW + 40 * MIN);
    expect(later.temporaries.map((t) => t.source)).toEqual(['fortune']); // haste was 30 minutes, fortune 60
    expect(later.rows.attackSpeed.now).toBe(later.rows.attackSpeed.permanent);
    expect(statBreakdown(s, NOW + 61 * MIN).temporaries).toEqual([]);
  });
});

describe('what each source contributes', () => {
  it('a hero with nothing on has only the Personagem line (base + level + attributes)', () => {
    const s = { ...defaultSave(), xp: xpToReachLevel(20), str: 10, vit: 10, agi: 5, res: 5 };
    const bd = statBreakdown(s, NOW);
    for (const id of STAT_IDS) expect(bd.rows[id].lines.map((l) => l.source), id).toEqual(['character']);
    expect(bd.rows.maxHp.lines[0].delta).toBe(buildCombatStats(s).maxHp);
  });

  it('each slot appears under its own name and is the difference it makes (weapon -> damage and crit, shield -> HP, defense and reflect)', () => {
    const s = hero('3', 3, { level: 40, extra: [['shield', 'steel_kite_shield', 'common', []], ['ring', 'gold_ring', 'common', []]] });
    const bd = statBreakdown(s, NOW);
    const src = (id: StatId) => bd.rows[id].lines.filter((l) => !l.temporary).map((l) => l.source);
    expect(src('damage')).toContain('weapon');
    expect(src('critChance')).toEqual(expect.arrayContaining(['weapon', 'ring']));
    expect(src('critMult')).toContain('ring');
    expect(src('maxHp')).toEqual(expect.arrayContaining(['armor', 'shield']));
    expect(src('reflect')).toEqual(expect.arrayContaining(['armor', 'shield']));
    expect(bd.rows.defense.lines.find((l) => l.source === 'shield')!.delta).toBeGreaterThan(0);
  });

  it('gems, the relic, skills, paragon and the Pass get their own lines', () => {
    const base = hero('3', 3, { level: 100, wSockets: ['ruby', 'sapphire'] });
    const s: SaveData = { ...base, xp: base.xp + 10 * paragonLevelXp(1), hasBattlePass: true, equipped: { ...base.equipped, relic: 'warchief_totem' } };
    const bd = statBreakdown(s, NOW);
    const src = (id: StatId) => bd.rows[id].lines.map((l) => l.source);
    expect(src('damage')).toEqual(expect.arrayContaining(['relic', 'paragon']));
    expect(bd.rows.damage.lines.find((l) => l.source === 'relic')!.factor).toBeCloseTo(1.085, 9);
    expect(src('gold')).toContain('pass');
    expect(bd.rows.gold.lines.find((l) => l.source === 'pass')!.delta).toBeCloseTo(T.battlePass.goldBonus * 100, 9);
    expect(src('maxHp').concat(src('critMult'), src('defense'), src('damage'))).toContain('gems');
  });
});

describe('"with this item": the same breakdown on the hero wearing it instead', () => {
  const owned = (tpl: string, o: Partial<Parameters<typeof createGearInstance>[1]> = {}) => createGearInstance(tpl, { id: 'cand_' + tpl, origin: 'craft', rarity: 'common', substats: [], ...o });

  it('an upgrade raises the stats it improves, by exactly the difference of the two heroes', () => {
    const s = hero('2', 2, { level: 40 });
    const inst = owned('steel_greatsword', { upgrade: 4 });
    const cmp = compareItem(s, { slot: 'weapon', templateId: inst.templateId, instance: inst }, NOW)!;
    const dmg = cmp.changes.find((c) => c.id === 'damage')!;
    expect(dmg.before).toBe(buildCombatStats(s).dmgBase);
    expect(dmg.after).toBe(buildCombatStats(withItemEquipped(s, { slot: 'weapon', templateId: inst.templateId, instance: inst })).dmgBase);
    expect(dmg.after).toBeGreaterThan(dmg.before);
  });

  it('the piece that is already worn compares to nothing; an empty slot compares against nothing worn', () => {
    const s = hero('2', 2, { level: 40 });
    const worn = s.gearInstances[s.equipped.weapon!];
    expect(compareItem(s, { slot: 'weapon', templateId: worn.templateId, instance: worn }, NOW)).toBeNull();
    const ring = compareItem(s, { slot: 'ring', templateId: 'gold_ring' }, NOW)!; // a fresh copy (the Forge preview)
    expect(ring.changes.map((c) => c.id)).toEqual(expect.arrayContaining(['critChance', 'critMult']));
    for (const c of ring.changes) expect(c.before).toBeLessThan(c.after);
  });

  it('a swap that completes a set shows the set bonus inside the change', () => {
    const base = hero('1', 0, { level: 20, extra: [['helmet', 'bronze_helm', 'common', []], ['boots', 'leather_boots', 'common', []]] });
    // weapon + armor are bronze; the first bronze bonus (gold) needs 3 pieces, so the helmet is the third
    const without: SaveData = { ...base, equipped: { ...base.equipped, helmet: null, boots: null } };
    const helm = createGearInstance('bronze_helm', { id: 'cand_helm', origin: 'craft', rarity: 'common', substats: [] });
    const cmp = compareItem(without, { slot: 'helmet', templateId: 'bronze_helm', instance: helm }, NOW)!;
    expect(cmp.changes.filter((c) => c.setDelta !== 0).map((c) => c.id)).toEqual(['gold']); // 3 bronze pieces: weapon + armor + helmet = the first bronze bonus
    const gold = cmp.changes.find((c) => c.id === 'gold');
    expect(gold?.setDelta).toBeCloseTo(5, 9);
    expect(gold!.after - gold!.before).toBeCloseTo(5, 9);
  });

  it('works for the relic slot too', () => {
    const s = hero('2', 2, { level: 40 });
    const cmp = compareItem(s, { slot: 'relic' as GearSlot, templateId: 'warchief_totem' }, NOW)!;
    expect(cmp.changes.map((c) => c.id)).toContain('damage');
    expect(compareItem({ ...s, equipped: { ...s.equipped, relic: 'warchief_totem' } }, { slot: 'relic', templateId: 'warchief_totem' }, NOW)).toBeNull();
  });
});

describe('every temporary effect the engine has is on the breakdown', () => {
  it('the kinds the breakdown can list are the ones that change a displayed stat (bait, gatherer and prospect change drops and yield, not these rows)', () => {
    const s = hero('2', 2, { level: 40 });
    const seen = new Set<string>();
    for (const id of ALL_ELIXIRS) {
      const bd = statBreakdown(drink(s, id), NOW);
      for (const t of bd.temporaries) seen.add(t.source);
    }
    expect([...seen].sort()).toEqual(['attack', 'fortune', 'haste', 'polished', 'precision', 'sharpened', 'stoneskin', 'strength']);
    expect(TIMED_BUFF_KINDS.filter((k) => !seen.has(k)).sort()).toEqual(['bait', 'gatherer', 'prospect']);
  });
});
