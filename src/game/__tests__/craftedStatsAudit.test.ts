import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCombatStats, buildHuntSession, buildHuntSimSetup, computeCP, defaultSave, SaveData, xpToReachLevel } from '../engine';
import { applyDamageReduction, CombatStats, heroAttackIntervalMs } from '../derivedStats';
import { GEMS, socketsForTier } from '../gems';
import { GEAR, GearItem, GearSlot, INSTANCED_SLOTS, SET_FAMILIES, getGear, setFamiliesOf } from '../gear';
import { createGearInstance, equippedSubstatTotals } from '../gearInstances';
import { GOLD_BONUS_CAP, medianSubstatValue, RARITIES, Rarity, SUBSTATS, Substat, rollSubstats } from '../rarity';
import { SET_DEFS } from '../setBonuses';
import { compareItem, permanentTotals, StatId, STAT_IDS, statBreakdown } from '../statBreakdown';
import { getHuntingZone } from '../huntingZones';
import { sanitizeHuntSession } from '../huntSession';
import { goldMultiplier } from '../buffs';
import { gearStatLines, GearStatKind } from '../../components/gearStats';
import { duelVs, repFloor } from '../../../scripts/sim/duel';
import { gearLevelGate } from '../../../scripts/sim/seasonTablesBuild';
import { runDungeon } from '../../../scripts/sim/driver';
import { dungeonEnemyKindForFloor } from '../dungeon';
import { getEnemyDef } from '../enemies';
import { stageEnemyDmg, stageEnemyHp } from '../waves';
import T from '../tunables';

// Every stat a CRAFTED piece declares reaches the fight, by the amount the game says (docs/BALANCE_CHANGES.md, Rodada 24).
//
// The generator walks EVERY craftable recipe (every line, tier and slot, the relics included) at every rarity and at refine 0 / +4 / +8 / +12 and, for each one:
//   - re-derives from the piece's own data what it must add to the hero (base stat x refine x durability x rarity, flat crit / resistance of refine, the substats), written here
//     from the rules in docs/ITEM_BALANCE_AUDIT.md ("Como os status somam") and NOT by calling the engine's helpers;
//   - equips it on a bare hero and compares with buildCombatStats: the stat the piece declares moves by exactly that, and no other stat moves;
//   - checks that the hero panel's staircase (statBreakdown) puts the same number on the slot's line and that its lines add up to the permanent total;
//   - checks the closed-form duel and the real Dungeon loop move in the right direction for each stat.
// A second block checks what the cards SHOW (forge preview, inventory, equipment panel) against the engine, and a third the progression of the lines (tier N+1 >= tier N).

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const CRAFTABLE: GearItem[] = GEAR.filter((g) => g.recipe && !g.unique);
const REFINES = [0, 4, 8, 12];
const DURABILITIES = [100, 50, 29, 0];

// A bare hero (no points in any attribute, so STR does not scale the hit), level 50 (below the paragon), the zero-stat starters worn.
const bare = (): SaveData => ({ ...defaultSave(), xp: xpToReachLevel(50), str: 0, vit: 0, agi: 0, res: 0 });

interface Wear {
  rarity?: Rarity;
  upgrade?: number;
  durability?: number;
  substats?: Substat[];
}

function wear(save: SaveData, tpl: string, o: Wear = {}): SaveData {
  const item = getGear(tpl);
  if (item.slot === 'relic') return { ...save, equipped: { ...save.equipped, relic: tpl } };
  const inst = createGearInstance(tpl, { id: 'audit_' + tpl, origin: 'craft', rarity: o.rarity ?? 'common', substats: o.substats ?? [], upgrade: o.upgrade ?? 0, durability: o.durability });
  return { ...save, gearInstances: { ...save.gearInstances, [inst.id]: inst }, equipped: { ...save.equipped, [item.slot]: inst.id } };
}

// ---- the rules, re-derived (not imported) ------------------------------------------------------------------------------------

const refineCeiling = (item: GearItem): number => ((item.tier ?? 0) >= T.lateSinks.deepMinTier ? 12 : 8);
const refinePct = (l: number): number => 0.1 * Math.min(l, 8) + T.lateSinks.deepBonus * Math.max(0, l - 8);
const refineFlat = (l: number): number => 0.005 * Math.min(l, 8) + 0.005 * (T.lateSinks.deepBonus / 0.1) * Math.max(0, l - 8);
const durability = (d: number): number => (d <= 0 ? 0.4 : d < 30 ? 0.75 : 1);
const rarityMult = (r: Rarity): number => RARITIES.find((x) => x.id === r)!.statMult;

// What the piece must add to the hero, in CombatStats units.
interface Add {
  hit: number; // the flat term that joins the base hit before STR (weapon, gloves)
  critChance: number;
  critMult: number;
  reduction: number;
  maxHp: number;
  reflect: number;
  burn: boolean;
  hpRegenPct: number;
  speedBonus: number;
  lifesteal: number;
  goldBonus: number;
  xpBonus: number;
  damagePct: number;
}
const none = (): Add => ({ hit: 0, critChance: 0, critMult: 0, reduction: 0, maxHp: 0, reflect: 0, burn: false, hpRegenPct: 0, speedBonus: 0, lifesteal: 0, goldBonus: 0, xpBonus: 0, damagePct: 0 });

// The fields each slot's code reads. A piece that declares a field outside its slot's list is data the engine ignores.
const READS: Record<GearSlot, (keyof GearItem)[]> = {
  weapon: ['damage', 'critChance', 'burn'],
  // Classes reform, phase 2a: attack speed and regeneration reach the combat from every instanced armor slot (gearInstances.equippedExtraStats), and the armor reads the crit fields too.
  armor: ['maxHp', 'resistance', 'reflect', 'critChance', 'critMultBonus', 'attackSpeedBonus', 'hpRegenPct'],
  helmet: ['maxHp', 'damage', 'critChance', 'resistance', 'critMultBonus', 'reflect', 'attackSpeedBonus', 'hpRegenPct'],
  gloves: ['maxHp', 'damage', 'critChance', 'resistance', 'critMultBonus', 'reflect', 'attackSpeedBonus', 'hpRegenPct'],
  boots: ['maxHp', 'damage', 'critChance', 'resistance', 'critMultBonus', 'reflect', 'attackSpeedBonus', 'hpRegenPct'],
  ring: ['maxHp', 'damage', 'critChance', 'resistance', 'critMultBonus', 'reflect', 'attackSpeedBonus', 'hpRegenPct'],
  shield: ['maxHp', 'damage', 'critChance', 'resistance', 'critMultBonus', 'reflect', 'attackSpeedBonus', 'hpRegenPct'],
  relic: ['hpRegenPct', 'attackSpeedBonus', 'damagePct', 'lifestealPct', 'goldBonusPct', 'critChance', 'critMultBonus', 'xpBonusPct'],
};
const DECLARED_FIELDS: (keyof GearItem)[] = ['damage', 'critChance', 'burn', 'maxHp', 'resistance', 'reflect', 'critMultBonus', 'hpRegenPct', 'attackSpeedBonus', 'damagePct', 'lifestealPct', 'goldBonusPct', 'xpBonusPct'];

function pieceAdds(item: GearItem, level: number, dur: number, rarity: Rarity): Add {
  const a = none();
  const lvl = Math.min(level, refineCeiling(item));
  const f = durability(dur);
  const r = rarityMult(rarity);
  const pct = 1 + refinePct(lvl);
  if (item.slot === 'relic') {
    a.hpRegenPct = item.hpRegenPct ?? 0;
    a.speedBonus = item.attackSpeedBonus ?? 0;
    a.damagePct = item.damagePct ?? 0;
    a.lifesteal = item.lifestealPct ?? 0;
    a.goldBonus = item.goldBonusPct ?? 0;
    a.critChance = item.critChance ?? 0;
    a.critMult = item.critMultBonus ?? 0;
    a.xpBonus = item.xpBonusPct ?? 0;
    return a;
  }
  if (item.slot === 'weapon') {
    a.hit = Math.round((item.damage ?? 0) * pct) * f * r;
    a.critChance = ((item.critChance ?? 0) + refineFlat(lvl)) * f;
    a.burn = !!item.burn;
    return a;
  }
  if (item.slot === 'armor') {
    a.maxHp = Math.round((item.maxHp ?? 0) * pct) * f * r;
    a.reduction = ((item.resistance ?? 0) + refineFlat(lvl)) * f * r;
    a.reflect = (item.reflect ?? 0) * f;
    // the fields the armor path never read before the leather line: crit chance (with the refine flat, only when declared), crit multiplier, attack speed and regeneration
    if (item.critChance) a.critChance = (item.critChance + refineFlat(lvl)) * f;
    a.critMult = (item.critMultBonus ?? 0) * f * r;
    a.speedBonus = (item.attackSpeedBonus ?? 0) * f;
    a.hpRegenPct = (item.hpRegenPct ?? 0) * f;
    return a;
  }
  // helmet, gloves, boots, ring, shield: only the fields the template declares count (a helmet without a crit chance gets no refine crit)
  if (item.maxHp) a.maxHp = Math.round(item.maxHp * pct) * f * r;
  if (item.damage) a.hit = Math.round(item.damage * pct) * f * r;
  if (item.critChance) a.critChance = (item.critChance + refineFlat(lvl)) * f;
  if (item.resistance) a.reduction = (item.resistance + refineFlat(lvl)) * f * r;
  a.critMult = (item.critMultBonus ?? 0) * f * r;
  a.reflect = (item.reflect ?? 0) * f;
  a.speedBonus = (item.attackSpeedBonus ?? 0) * f;
  a.hpRegenPct = (item.hpRegenPct ?? 0) * f;
  return a;
}

const BASE_HIT = (T.combat.attackMin + T.combat.attackMax) / 2;
const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

// Compare a built hero with the bare hero against what the piece must add; returns the first mismatch or null.
function mismatch(with_: CombatStats, base: CombatStats, a: Add): string | null {
  const checks: [string, number, number, number][] = [
    ['dmgBase', with_.dmgBase - base.dmgBase, (BASE_HIT + a.hit) * (1 + a.damagePct) - BASE_HIT, 1e-6],
    ['critChance', with_.critChance - base.critChance, a.critChance, 1e-9],
    ['critMult', with_.critMult - base.critMult, a.critMult, 1e-9],
    ['reduction', with_.reduction - base.reduction, a.reduction, 1e-9],
    ['maxHp', with_.maxHp - base.maxHp, a.maxHp, 0.51],
    ['reflect', with_.reflect - base.reflect, a.reflect, 1e-9],
    ['hpRegenPct', with_.hpRegenPct - base.hpRegenPct, a.hpRegenPct, 1e-12],
    ['lifesteal', with_.lifesteal - base.lifesteal, a.lifesteal, 1e-9],
    ['goldBonus', (with_.goldBonus ?? 0) - (base.goldBonus ?? 0), a.goldBonus, 1e-9],
    ['xpBonus', (with_.xpBonus ?? 0) - (base.xpBonus ?? 0), a.xpBonus, 1e-9],
    ['heroMs', with_.heroMs, heroAttackIntervalMs(0, a.speedBonus), 1e-9],
  ];
  for (const [name, got, want, eps] of checks) if (!near(got, want, eps)) return `${name}: engine ${got} vs rule ${want}`;
  if (with_.burn !== a.burn) return `burn: engine ${with_.burn} vs rule ${a.burn}`;
  return null;
}

// The hero panel's raw unit of each row, from the Add (what the slot's line of the staircase must read).
function panelDelta(id: StatId, a: Add, base: CombatStats): number {
  switch (id) {
    case 'damage':
      return (BASE_HIT + a.hit) * (1 + a.damagePct) - BASE_HIT;
    case 'critChance':
      return a.critChance;
    case 'critMult':
      return a.critMult;
    case 'defense':
      return a.reduction;
    case 'maxHp':
      return a.maxHp;
    case 'reflect':
      return a.reflect;
    case 'regen':
      return a.hpRegenPct;
    case 'lifesteal':
      return a.lifesteal;
    case 'attackSpeed':
      return 1000 / heroAttackIntervalMs(0, a.speedBonus) - 1000 / base.heroMs;
    case 'gold':
      return (goldMultiplier(Math.min(GOLD_BONUS_CAP, a.goldBonus), false) - 1) * 100;
    case 'xp':
      return a.xpBonus;
  }
}

// ---- 1. the data: every declared field is read by the slot ------------------------------------------------------------------------

describe('every craftable recipe: the data the engine reads', () => {
  it('covers every line, tier and slot (a guard against an empty generator)', () => {
    expect(CRAFTABLE.length).toBeGreaterThanOrEqual(50);
    for (const slot of [...INSTANCED_SLOTS, 'relic'] as GearSlot[]) expect(CRAFTABLE.some((g) => g.slot === slot), slot).toBe(true);
    for (const tier of [1, 2, 3, 4, 5, 6]) for (const slot of INSTANCED_SLOTS) expect(CRAFTABLE.some((g) => g.slot === slot && g.tier === tier), `${slot} tier ${tier}`).toBe(true);
    expect(CRAFTABLE.some((g) => g.line === 'axe')).toBe(true);
  });

  it('a piece never declares a stat its slot does not read (it would show on the card and do nothing)', () => {
    for (const g of CRAFTABLE) {
      const allowed = new Set<string>(READS[g.slot]);
      for (const f of DECLARED_FIELDS) if ((g as unknown as Record<string, unknown>)[f]) expect(allowed.has(f), `${g.id} (${g.slot}) declares ${f}`).toBe(true);
    }
  });

  it('a piece declares at least one stat', () => {
    for (const g of CRAFTABLE) expect(DECLARED_FIELDS.some((f) => (g as unknown as Record<string, unknown>)[f]), g.id).toBe(true);
  });
});

// ---- 2. the generator: piece x rarity x refine -> engine, panel and fight ----------------------------------------------------------

describe('every craftable recipe at every rarity and refine: the engine adds exactly what the rules say', () => {
  const base = bare();
  const baseStats = buildCombatStats(base);
  for (const item of CRAFTABLE) {
    it(`${item.id} (${item.slot}, tier ${item.tier}): ${RARITIES.length} rarities x refine ${REFINES.join('/')}`, () => {
      for (const r of RARITIES) {
        for (const refine of REFINES) {
          const s = wear(base, item.id, { rarity: r.id, upgrade: refine });
          const add = pieceAdds(item, refine, 100, r.id);
          const bad = mismatch(buildCombatStats(s), baseStats, add);
          expect(bad, `${item.id} ${r.id} +${refine}: ${bad}`).toBeNull();
        }
      }
    });
  }

  it('the piece with a refine ceiling of +8 is clamped there (+12 on a tier 1-4 piece is +8)', () => {
    for (const item of CRAFTABLE.filter((g) => g.slot !== 'relic' && (g.tier ?? 0) < T.lateSinks.deepMinTier)) {
      const a = buildCombatStats(wear(base, item.id, { upgrade: 12 }));
      const b = buildCombatStats(wear(base, item.id, { upgrade: 8 }));
      expect(a, item.id).toEqual(b);
    }
  });

  it('a better rarity never lowers any stat, and raises each stat the rarity multiplies (damage / HP / defense / crit damage)', () => {
    for (const item of CRAFTABLE.filter((g) => g.slot !== 'relic')) {
      const order = RARITIES.map((r) => buildCombatStats(wear(base, item.id, { rarity: r.id, upgrade: 4 })));
      for (let i = 1; i < order.length; i++) {
        const [lo, hi] = [order[i - 1], order[i]];
        expect(hi.dmgBase, `${item.id} damage`).toBeGreaterThanOrEqual(lo.dmgBase);
        expect(hi.maxHp, `${item.id} maxHp`).toBeGreaterThanOrEqual(lo.maxHp);
        expect(hi.reduction, `${item.id} defense`).toBeGreaterThanOrEqual(lo.reduction);
        expect(hi.critMult, `${item.id} critMult`).toBeGreaterThanOrEqual(lo.critMult);
        expect(hi.critChance, `${item.id} critChance`).toBeGreaterThanOrEqual(lo.critChance);
        expect(hi.reflect, `${item.id} reflect`).toBeGreaterThanOrEqual(lo.reflect);
        // strictly better wherever the rule says the stat moves by a whole point (a 17-HP boot at 1.02 is 17.3: the total HP rounds back to the same integer; see the doc, Rodada 24)
        const [ra, rb] = [pieceAdds(item, 4, 100, RARITIES[i - 1].id), pieceAdds(item, 4, 100, RARITIES[i].id)];
        if (item.damage && rb.hit - ra.hit >= 1) expect(hi.dmgBase, `${item.id} damage (strict)`).toBeGreaterThan(lo.dmgBase);
        if (item.maxHp && rb.maxHp - ra.maxHp >= 1) expect(hi.maxHp, `${item.id} maxHp (strict)`).toBeGreaterThan(lo.maxHp);
        if (item.resistance) expect(hi.reduction, `${item.id} defense (strict)`).toBeGreaterThan(lo.reduction);
        if (item.critMultBonus) expect(hi.critMult, `${item.id} critMult (strict)`).toBeGreaterThan(lo.critMult);
      }
    }
  });

  it('each refine level never lowers a stat and raises each stat refine scales', () => {
    for (const item of CRAFTABLE.filter((g) => g.slot !== 'relic')) {
      let prev = buildCombatStats(wear(base, item.id, { upgrade: 0 }));
      for (let l = 1; l <= refineCeiling(item); l++) {
        const cur = buildCombatStats(wear(base, item.id, { upgrade: l }));
        for (const k of ['dmgBase', 'maxHp', 'critChance', 'reduction'] as const) expect(cur[k], `${item.id} +${l} ${k}`).toBeGreaterThanOrEqual(prev[k]);
        // a base of 4 damage x 1.1 rounds back to 4 (leather gloves +1): every other piece and level moves by a whole point
        if (item.damage && Math.round(item.damage * (1 + refinePct(l))) > Math.round(item.damage * (1 + refinePct(l - 1)))) expect(cur.dmgBase, `${item.id} +${l} damage`).toBeGreaterThan(prev.dmgBase);
        // the same rounding case for a tiny max HP (the 7-HP leather shoes: +1 and +2 both round to 8)
        if (item.maxHp && Math.round(item.maxHp * (1 + refinePct(l))) > Math.round(item.maxHp * (1 + refinePct(l - 1)))) expect(cur.maxHp, `${item.id} +${l} maxHp`).toBeGreaterThan(prev.maxHp);
        if (item.resistance || item.slot === 'weapon' || item.slot === 'armor') expect(cur.reduction + cur.critChance, `${item.id} +${l} flat`).toBeGreaterThan(prev.reduction + prev.critChance);
        prev = cur;
      }
    }
  });
});

describe('the hero panel (statBreakdown) shows the engine: the slot line is what the piece adds and the lines add up', () => {
  const base = bare();
  const baseStats = buildCombatStats(base);
  for (const item of CRAFTABLE) {
    it(`${item.id}`, () => {
      for (const r of RARITIES) {
        for (const refine of [0, 8, 12]) {
          const s = wear(base, item.id, { rarity: r.id, upgrade: refine });
          const add = pieceAdds(item, refine, 100, r.id);
          const bd = statBreakdown(s, NOW);
          const source = item.slot;
          for (const id of STAT_IDS) {
            const row = bd.rows[id];
            const sum = row.lines.filter((l) => !l.temporary).reduce((acc, l) => acc + l.delta, 0);
            expect(near(sum, row.permanent, 1e-6), `${item.id} ${r.id} +${refine} ${id}: lines ${sum} vs total ${row.permanent}`).toBe(true);
            const line = row.lines.find((l) => l.source === source);
            const want = panelDelta(id, add, baseStats);
            const got = line?.delta ?? 0;
            const eps = id === 'maxHp' ? 0.51 : 1e-6;
            expect(near(got, want, eps), `${item.id} ${r.id} +${refine} ${id}: panel line ${got} vs rule ${want}`).toBe(true);
          }
        }
      }
    });
  }
});

// ---- 3. substats, set bonus, durability ------------------------------------------------------------------------------------------

describe('substats: every roll the forge can make reaches the fight by its value', () => {
  const base = bare();
  const baseStats = buildCombatStats(base);
  const armorOfTier = (t: number): string => CRAFTABLE.find((g) => g.slot === 'armor' && g.tier === t)!.id;

  it('each substat type, at every rarity and tier, adds its value to the stat it names', () => {
    for (let tier = 1; tier <= 6; tier++) {
      for (const r of RARITIES) {
        const subs: Substat[] = SUBSTATS.map((d) => ({ type: d.type, value: medianSubstatValue(d, tier, r.substatMult) }));
        const s = wear(base, armorOfTier(tier), { rarity: r.id, substats: subs });
        const got = buildCombatStats(s);
        const armor = pieceAdds(getGear(armorOfTier(tier)), 0, 100, r.id);
        const v = (t: string) => subs.find((x) => x.type === t)!.value;
        expect(got.critChance - baseStats.critChance, `tier ${tier} ${r.id} critRate`).toBeCloseTo(v('critRate') / 100, 9);
        expect(got.critMult - baseStats.critMult, `tier ${tier} ${r.id} critDamage`).toBeCloseTo(v('critDamage') / 100, 9);
        expect(got.lifesteal - baseStats.lifesteal, `tier ${tier} ${r.id} lifesteal`).toBeCloseTo(v('lifesteal'), 9);
        expect(got.reduction - baseStats.reduction, `tier ${tier} ${r.id} defense`).toBeCloseTo(armor.reduction + v('defense') / 100, 9);
        expect(Math.abs(got.maxHp - baseStats.maxHp - (armor.maxHp + v('maxHp'))), `tier ${tier} ${r.id} maxHp`).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(got.goldBonus ?? 0, `tier ${tier} ${r.id} goldBonus`).toBeCloseTo(Math.min(GOLD_BONUS_CAP, v('goldBonus')), 9);
      }
    }
  });

  it('a forged piece carries exactly its rarity count of different substats, each inside the tier range scaled by the rarity', () => {
    for (let tier = 1; tier <= 6; tier++) {
      for (const r of RARITIES) {
        for (let seed = 1; seed <= 40; seed++) {
          let x = seed * 2654435761;
          const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
          const subs = rollSubstats(r.id, tier, 0, rnd);
          expect(subs.length, `${r.id}`).toBe(r.substatCount);
          expect(new Set(subs.map((x) => x.type)).size).toBe(subs.length);
          for (const sub of subs) {
            const d = SUBSTATS.find((q) => q.type === sub.type)!;
            const lo = d.ranges ? d.ranges[tier - 1][0] : d.min + Math.round(d.perTier * tier);
            const hi = d.ranges ? d.ranges[tier - 1][1] : d.max + Math.round(d.perTier * tier);
            expect(sub.value, `${sub.type} tier ${tier} ${r.id}`).toBeGreaterThanOrEqual(Math.round(lo * r.substatMult * 10) / 10 - 1e-9);
            expect(sub.value, `${sub.type} tier ${tier} ${r.id}`).toBeLessThanOrEqual(Math.round(hi * r.substatMult * 10) / 10 + 1e-9);
          }
        }
      }
    }
  });

  it('the gold bonus of everything worn never passes the cap, whatever is rolled', () => {
    const s = wear(wear(base, 'abyssal_greatblade', { substats: [{ type: 'goldBonus', value: 40 }] }), 'abyssal_bulwark', { substats: [{ type: 'goldBonus', value: 40 }] });
    expect(equippedSubstatTotals(s).goldBonus).toBe(GOLD_BONUS_CAP);
  });
});

describe('durability: it scales the base stats of the piece (not the substats, the sets or the gems) by the same factor everywhere', () => {
  const base = bare();
  const baseStats = buildCombatStats(base);
  for (const item of CRAFTABLE.filter((g) => g.slot !== 'relic')) {
    it(`${item.id}`, () => {
      let prev: CombatStats | null = null;
      for (const d of DURABILITIES) {
        const s = wear(base, item.id, { rarity: 'epic', upgrade: 4, durability: d });
        const got = buildCombatStats(s);
        const bad = mismatch(got, baseStats, pieceAdds(item, 4, d, 'epic'));
        expect(bad, `${item.id} durability ${d}: ${bad}`).toBeNull();
        if (prev) {
          for (const k of ['dmgBase', 'maxHp', 'critChance', 'reduction', 'critMult', 'reflect'] as const) expect(got[k], `${item.id} ${k} at ${d}`).toBeLessThanOrEqual(prev[k] + 1e-9);
        }
        prev = got;
      }
      // a broken piece (0) still gives 40 % of its stats: it never turns into a penalty
      const broken = buildCombatStats(wear(base, item.id, { durability: 0 }));
      const full = buildCombatStats(wear(base, item.id, { durability: 100 }));
      expect(broken.maxHp).toBeGreaterThanOrEqual(baseStats.maxHp);
      expect(broken.dmgBase).toBeGreaterThanOrEqual(baseStats.dmgBase);
      expect(full.dmgBase).toBeGreaterThanOrEqual(broken.dmgBase);
    });
  }

  it('substats do not lose value with durability (the card says so: only the base stats age)', () => {
    const subs: Substat[] = [{ type: 'critRate', value: 4 }, { type: 'lifesteal', value: 2 }];
    const a = buildCombatStats(wear(base, 'steel_plate', { rarity: 'rare', substats: subs, durability: 100 }));
    const b = buildCombatStats(wear(base, 'steel_plate', { rarity: 'rare', substats: subs, durability: 0 }));
    expect(b.critChance).toBe(a.critChance);
    expect(b.lifesteal).toBe(a.lifesteal);
  });
});

describe('set bonuses: every threshold of every family adds what SET_DEFS says, through the fight stats', () => {
  const base = bare();
  // worn pieces of a family, in slot order: the weapon, armor, helmet, gloves, boots, ring, shield of that tier
  const piecesOf = (family: string): GearItem[] =>
    INSTANCED_SLOTS.flatMap((slot) => {
      const options = CRAFTABLE.filter((g) => g.slot === slot && setFamiliesOf(g).includes(family as never) && g.line !== 'axe');
      return options.length > 0 ? [options[options.length - 1]] : [];
    });

  for (const family of SET_FAMILIES) {
    it(family, () => {
      const pieces = piecesOf(family);
      const def = SET_DEFS[family];
      expect(pieces.length).toBeGreaterThanOrEqual(def.thresholds[def.thresholds.length - 1]);
      let s = base;
      const worn: GearItem[] = [];
      for (const p of pieces) {
        s = wear(s, p.id, { rarity: 'common' });
        worn.push(p);
        const withSet = buildCombatStats(s);
        const without = buildCombatStats(s, { sets: false });
        const counts = SET_FAMILIES.map((f) => worn.filter((w) => setFamiliesOf(w).includes(f)).length);
        // the expected sum of every reached bonus of every family, from SET_DEFS and the worn pieces alone
        let speed = worn.reduce((a, w) => a + (w.attackSpeedBonus ?? 0), 0), critMult = 0, resistance = 0, regen = 0, dmgPct = 0, lifesteal = 0, gold = 0;
        SET_FAMILIES.forEach((f, i) => SET_DEFS[f].thresholds.forEach((need, k) => {
          if (counts[i] < need) return;
          const e = SET_DEFS[f].effects[k];
          speed += e.attackSpeedBonus ?? 0; critMult += e.critMultBonus ?? 0; resistance += e.resistance ?? 0; regen += e.hpRegenPct ?? 0; dmgPct += e.damagePct ?? 0; lifesteal += e.lifestealPct ?? 0; gold += e.goldBonusPct ?? 0;
        }));
        expect(withSet.critMult - without.critMult, `${family} x${worn.length} critMult`).toBeCloseTo(critMult, 9);
        expect(withSet.reduction - without.reduction, `${family} x${worn.length} defense`).toBeCloseTo(resistance, 9);
        expect(withSet.hpRegenPct - without.hpRegenPct, `${family} x${worn.length} regen`).toBeCloseTo(regen, 12);
        expect(withSet.lifesteal - without.lifesteal, `${family} x${worn.length} lifesteal`).toBeCloseTo(lifesteal, 9);
        expect(withSet.dmgBase, `${family} x${worn.length} damage`).toBeCloseTo(without.dmgBase * (1 + dmgPct), 6);
        expect(withSet.heroMs, `${family} x${worn.length} speed`).toBeCloseTo(heroAttackIntervalMs(0, speed), 9);
        expect(Math.min(GOLD_BONUS_CAP, (without.goldBonus ?? 0) + gold), `${family} x${worn.length} gold`).toBeCloseTo(withSet.goldBonus ?? 0, 9);
        // and the panel puts it on the set line
        const bd = statBreakdown(s, NOW);
        const line = (id: StatId) => bd.rows[id].lines.find((l) => l.source === 'set')?.delta ?? 0;
        expect(line('critMult'), `${family} x${worn.length} panel critMult`).toBeCloseTo(critMult, 9);
        expect(line('defense'), `${family} x${worn.length} panel defense`).toBeCloseTo(resistance, 9);
        expect(line('lifesteal'), `${family} x${worn.length} panel lifesteal`).toBeCloseTo(lifesteal, 9);
        expect(line('damage'), `${family} x${worn.length} panel damage`).toBeCloseTo(withSet.dmgBase - without.dmgBase, 6);
      }
    });
  }
});

// ---- 4. the same numbers reach the Hunting build and the fight -----------------------------------------------------------------------

describe('Hunting sees what the Dungeon sees', () => {
  it('the build of a Hunting session is the hero panel for a hero wearing a full legendary +8 line of every tier', () => {
    const zone = getHuntingZone('demon_glade')!;
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      let s = bare();
      for (const slot of INSTANCED_SLOTS) {
        const p = CRAFTABLE.filter((g) => g.slot === slot && g.tier === tier && g.line !== 'axe').pop();
        if (p) s = wear(s, p.id, { rarity: 'legendary', upgrade: 8, substats: rollSubstats('legendary', tier) });
      }
      const stats = buildCombatStats(s);
      const { build } = buildHuntSimSetup(s, zone, 'shallow', buildHuntSession(s, NOW), NOW, []);
      expect(build.playerMax).toBe(stats.maxHp);
      expect(build.heroDmgBase).toBe(stats.dmgBase); // no blessed, no elixir
      expect(build.critChance).toBe(stats.critChance);
      expect(build.critMult).toBe(stats.critMult);
      expect(build.heroMs).toBe(stats.heroMs);
      expect(build.reduction).toBe(stats.reduction);
      expect(build.lifestealPct).toBe(stats.lifesteal);
      expect(build.burn).toBe(stats.burn);
      expect(build.reflect).toBe(stats.reflect);
      expect(build.hpRegenPct).toBe(stats.hpRegenPct);
      expect(build.goldBonusPct).toBe(stats.goldBonus ?? 0);
    }
  });
});

describe('each stat helps in the fight: the closed-form duel and the real Dungeon loop move the right way', () => {
  // A hero who wins comfortably: a tier-3 weapon and armor plus whatever is under test.
  const fighter = (): SaveData => wear(wear({ ...bare(), xp: xpToReachLevel(40), highestDungeonFloor: 20 }, 'steel_greatsword'), 'steel_plate');
  const FLOOR = 20;
  const enemy = (floor = FLOOR) => {
    const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
    return { hp: stageEnemyHp(def, floor), dmg: stageEnemyDmg(def, floor), ms: def.atkSpeedMs };
  };
  const margin = (stats: CombatStats, floor: number): number => {
    const e = enemy(floor);
    return duelVs(bare(), e.hp, e.dmg, e.ms, stats).P;
  };

  // The CombatStats key each declared field feeds (the stat that must be what makes the piece worth wearing).
  const KEYS: Partial<Record<keyof GearItem, (keyof CombatStats)[]>> = {
    damage: ['dmgBase'],
    critChance: ['critChance'],
    burn: ['burn'],
    maxHp: ['maxHp'],
    resistance: ['reduction'],
    reflect: ['reflect'],
    critMultBonus: ['critMult'],
    hpRegenPct: ['hpRegenPct'],
    attackSpeedBonus: ['heroMs'],
    damagePct: ['dmgBase'],
    lifestealPct: ['lifesteal'],
  };

  for (const item of CRAFTABLE) {
    it(`${item.id}: wearing it never lowers the duel margin, and every stat it declares is worth something on its own`, () => {
      for (const [rarity, upgrade] of [['common', 0], ['legendary', 8]] as [Rarity, number][]) {
        const hero = fighter();
        const before = buildCombatStats(hero);
        // the piece under test replaces what is in its slot (the tier-3 weapon / armor are the baseline, so a tier-1 piece may be a downgrade: compare against the EMPTY slot instead)
        const empty = item.slot === 'relic' ? hero : { ...hero, equipped: { ...hero.equipped, [item.slot]: null } };
        const worn = wear(empty, item.id, { rarity, upgrade });
        const stats = buildCombatStats(worn);
        const baseline = buildCombatStats(empty);
        // a fight the worn hero wins but not by a mile (the plain floor whose margin is closest to 1.5)
        const floor = repFloor(worn);
        expect(margin(stats, floor), `${item.id} ${rarity} +${upgrade}`).toBeGreaterThan(margin(baseline, floor));
        for (const field of DECLARED_FIELDS) {
          if (!(item as unknown as Record<string, unknown>)[field]) continue;
          for (const key of KEYS[field] ?? []) {
            // the stat put back where the empty slot had it: the fight must get worse
            const reset = { ...stats, [key]: baseline[key] } as CombatStats;
            expect(margin(stats, floor), `${item.id}.${field} -> ${key} (${rarity} +${upgrade})`).toBeGreaterThan(margin(reset, floor));
          }
        }
        void before;
      }
    });
  }

  // Real loop: one floor of the Dungeon, the dice pinned (no crit) so the two runs differ only by the piece.
  const oneFloor = (s: SaveData, crit: boolean) => {
    const real = Math.random;
    Math.random = () => (crit ? 0 : 0.999999);
    try {
      return runDungeon({ ...s, highestDungeonFloor: FLOOR }, NOW, 1);
    } finally {
      Math.random = real;
    }
  };
  for (const item of CRAFTABLE.filter((g) => g.slot !== 'relic' || g.hpRegenPct === undefined)) {
    it(`${item.id}: in the real Dungeon loop it never makes the one-floor fight longer or costlier`, () => {
      const hero = fighter();
      const empty = item.slot === 'relic' ? hero : { ...hero, equipped: { ...hero.equipped, [item.slot]: null } };
      const worn = wear(empty, item.id, { rarity: 'legendary', upgrade: 8 });
      for (const crit of [false, true]) {
        const a = oneFloor(empty, crit);
        const b = oneFloor(worn, crit);
        expect(a.outcome).toBe('retreat');
        expect(b.outcome, `${item.id} crit=${crit}`).toBe('retreat');
        expect(b.seconds, `${item.id} crit=${crit} seconds`).toBeLessThanOrEqual(a.seconds + 1e-9);
        // the hits the hero takes can only go down when the fight is shorter or the defense is higher
        expect(b.damageTaken, `${item.id} crit=${crit} damage taken`).toBeLessThanOrEqual(a.damageTaken + 1e-9);
      }
    });
  }

  it('the real loop and the rules agree on the size of the defense: the enemy hit is the rule applied once', () => {
    const e = enemy();
    const s = wear(fighter(), 'gilded_aegis', { rarity: 'legendary', upgrade: 8 });
    const stats = buildCombatStats(s);
    const real = Math.random;
    Math.random = () => 0.999999;
    let run;
    try {
      run = runDungeon({ ...s, highestDungeonFloor: FLOOR }, NOW, 1);
    } finally {
      Math.random = real;
    }
    expect(run.damageTaken).toBe(run.enemyHits * applyDamageReduction(e.dmg, stats.reduction));
  });
});

// ---- 5. what the cards show --------------------------------------------------------------------------------------------------------

const KIND_TO_STATS: Record<GearStatKind, StatId[]> = {
  damage: ['damage'],
  damagePct: ['damage'],
  maxHp: ['maxHp'],
  critChance: ['critChance'],
  critMult: ['critMult'],
  resistance: ['defense'],
  lifesteal: ['lifesteal'],
  gold: ['gold'],
  xp: ['xp'],
  burn: [],
  reflect: ['reflect'],
  regen: ['regen'],
  attackSpeed: ['attackSpeed'],
};
const number = (text: string): number => Number(text.replace(/[^0-9,.-]/g, '').replace(',', '.'));

describe('what the forge preview and the cards show is what the engine does', () => {
  const base = bare();
  for (const item of CRAFTABLE) {
    it(`${item.id}: the forge preview lists a line for every stat that moves, and a stat for every line`, () => {
      const lines = gearStatLines(item, 0);
      const cmp = compareItem(base, { slot: item.slot, templateId: item.id });
      expect(cmp, item.id).not.toBeNull();
      const moved = new Set(cmp!.changes.map((c) => c.id));
      const covered = new Set<StatId>(lines.flatMap((l) => KIND_TO_STATS[l.kind]));
      for (const id of moved) expect(covered.has(id), `${item.id}: ${id} changes the hero but no line shows it`).toBe(true);
      for (const l of lines) {
        if (l.kind === 'burn') {
          expect(buildCombatStats(wear(base, item.id)).burn, `${item.id}: burn line`).toBe(true);
          continue;
        }
        expect(KIND_TO_STATS[l.kind].some((id) => moved.has(id)), `${item.id}: the "${l.text}" line changes nothing in the engine`).toBe(true);
      }
    });

    it(`${item.id}: a card of a piece in the bag shows the number the engine adds, at every rarity and refine`, () => {
      for (const r of RARITIES) {
        for (const refine of [0, 4, 8]) {
          const lines = gearStatLines(item, refine, r.id);
          const add = pieceAdds(item, refine, 100, r.id);
          const stat = (kind: GearStatKind): number | undefined => {
            const l = lines.find((x) => x.kind === kind);
            return l ? number(l.value) : undefined;
          };
          const where = `${item.id} ${r.id} +${refine}`;
          if (item.damage) expect(Math.abs(stat('damage')! - add.hit), where + ' damage').toBeLessThanOrEqual(0.5 + 1e-9);
          if (item.slot !== 'relic' && item.maxHp) expect(Math.abs(stat('maxHp')! - add.maxHp), where + ' maxHp').toBeLessThanOrEqual(0.5 + 1e-9);
          if (item.slot !== 'relic' && item.critChance) expect(Math.abs(stat('critChance')! - add.critChance * 100), where + ' critChance').toBeLessThanOrEqual(0.05 + 1e-9); // the card rounds to 0.1: a tie is a half step
          if (item.slot !== 'relic' && item.resistance) expect(Math.abs(stat('resistance')! - add.reduction * 100), where + ' resistance').toBeLessThanOrEqual(0.05 + 1e-9);
          if (item.slot !== 'relic' && item.critMultBonus) expect(Math.abs(stat('critMult')! - add.critMult * 100), where + ' critMult').toBeLessThanOrEqual(0.05 + 1e-9);
        }
      }
    });
  }
});

// ---- 6. progression of the lines --------------------------------------------------------------------------------------------------------

describe('tier N+1 is never worse than tier N on its line', () => {
  const lines = new Map<string, GearItem[]>();
  for (const g of CRAFTABLE.filter((x) => x.slot !== 'relic')) {
    const key = `${g.slot}${g.line ? ':' + g.line : ''}${g.weight ? ':' + g.weight : ''}`;
    lines.set(key, [...(lines.get(key) ?? []), g]);
  }
  const FIELDS: (keyof GearItem)[] = ['damage', 'critChance', 'maxHp', 'resistance', 'reflect', 'critMultBonus', 'attackSpeedBonus', 'cost'];

  for (const [key, pieces] of lines) {
    it(`${key}: every declared stat, the required level, the price and the CP only go up`, () => {
      const sorted = [...pieces].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (a.materialKey === 'material_dragon' ? 1 : 0) - (b.materialKey === 'material_dragon' ? 1 : 0));
      expect(sorted.length, key).toBeGreaterThanOrEqual(key === 'weapon' || key === 'armor' ? 5 : 5);
      for (let i = 1; i < sorted.length; i++) {
        const lo = sorted[i - 1];
        const hi = sorted[i];
        for (const f of FIELDS) {
          const a = (lo[f] as number | undefined) ?? 0;
          const b = (hi[f] as number | undefined) ?? 0;
          expect(b, `${key}: ${hi.id}.${f} (${b}) must not be below ${lo.id}.${f} (${a})`).toBeGreaterThanOrEqual(a);
        }
        expect(gearLevelGate(hi), `${hi.id} level gate`).toBeGreaterThanOrEqual(gearLevelGate(lo));
        for (const refine of [0, 8]) {
          const cpLo = computeCP(wear(bare(), lo.id, { upgrade: refine }));
          const cpHi = computeCP(wear(bare(), hi.id, { upgrade: refine }));
          expect(cpHi, `${hi.id} +${refine} CP vs ${lo.id} +${refine}`).toBeGreaterThanOrEqual(cpLo);
        }
        // a piece that is not at least as good in EVERY stat it shares would be a downgrade for someone: the burn / reflect of the line may only appear, never go away
        if (lo.burn) expect(hi.burn, `${hi.id} keeps the burn of ${lo.id}`).toBe(true);
        if (lo.reflect) expect(hi.reflect ?? 0, `${hi.id} keeps the reflect of ${lo.id}`).toBeGreaterThan(0);
      }
    });
  }

  it('relics: the three craftable ones are tier-less and every one adds something', () => {
    for (const r of CRAFTABLE.filter((g) => g.slot === 'relic')) {
      const got = buildCombatStats(wear(bare(), r.id));
      const base = buildCombatStats(bare());
      const moved = got.hpRegenPct !== base.hpRegenPct || got.heroMs !== base.heroMs || got.critMult !== base.critMult || got.dmgBase !== base.dmgBase || got.lifesteal !== base.lifesteal;
      expect(moved, r.id).toBe(true);
    }
  });

  it('permanentTotals (the panel column) agrees with buildCombatStats for every craftable piece', () => {
    for (const item of CRAFTABLE) {
      const s = wear(bare(), item.id, { rarity: 'epic', upgrade: 8 });
      const stats = buildCombatStats(s);
      const v = permanentTotals(s);
      expect(v.maxHp, item.id).toBe(stats.maxHp);
      expect(v.damage, item.id).toBe(stats.dmgBase);
      expect(v.critChance, item.id).toBe(stats.critChance);
      expect(v.critMult, item.id).toBe(stats.critMult);
      expect(v.defense, item.id).toBe(stats.reduction);
    }
  });
});

// ---- 7. gems and the drop-only twins ----------------------------------------------------------------------------------------------------------

describe('gems: every socket of every piece adds its bonus, and nothing else', () => {
  const base = bare();
  const baseStats = buildCombatStats(base);
  for (const item of CRAFTABLE.filter((g) => g.slot !== 'relic')) {
    it(`${item.id}: ${socketsForTier(item.tier ?? 0)} sockets of ruby / sapphire / emerald`, () => {
      const n = socketsForTier(item.tier ?? 0);
      expect(n).toBeGreaterThan(0);
      for (const gem of GEMS) {
        const inst = createGearInstance(item.id, { id: 'g_' + item.id, origin: 'craft', rarity: 'epic', substats: [], sockets: Array(n).fill(gem.id) });
        const s = { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, [item.slot]: inst.id } };
        const plain = buildCombatStats(wear(base, item.id, { rarity: 'epic' }));
        const got = buildCombatStats(s);
        expect(got.critMult - plain.critMult, `${item.id} ${gem.id} critMult`).toBeCloseTo(n * (gem.critDamageBonus ?? 0), 9);
        expect(got.reduction - plain.reduction, `${item.id} ${gem.id} defense`).toBeCloseTo(n * (gem.resistance ?? 0), 9);
        expect(Math.abs(got.maxHp - plain.maxHp - n * (gem.maxHp ?? 0)), `${item.id} ${gem.id} maxHp`).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(got.dmgBase, `${item.id} ${gem.id} damage`).toBe(plain.dmgBase);
        // the panel has a line of its own for them
        const line = statBreakdown(s, NOW).rows;
        expect(line.critMult.lines.find((l) => l.source === 'gems')?.delta ?? 0, `${item.id} ${gem.id} panel critMult`).toBeCloseTo(n * (gem.critDamageBonus ?? 0), 9);
        expect(line.defense.lines.find((l) => l.source === 'gems')?.delta ?? 0, `${item.id} ${gem.id} panel defense`).toBeCloseTo(n * (gem.resistance ?? 0), 9);
        expect(baseStats.maxHp).toBeLessThanOrEqual(got.maxHp);
      }
    });
  }
});

describe('the drop-only twins (uniques) obey the same rules as the forged ones', () => {
  const base = bare();
  const baseStats = buildCombatStats(base);
  for (const item of GEAR.filter((g) => g.unique)) {
    it(`${item.id}`, () => {
      const allowed = new Set<string>(READS[item.slot]);
      for (const f of DECLARED_FIELDS) if ((item as unknown as Record<string, unknown>)[f]) expect(allowed.has(f), `${item.id} declares ${f}`).toBe(true);
      for (const r of RARITIES) {
        for (const refine of [0, 8]) {
          const bad = mismatch(buildCombatStats(wear(base, item.id, { rarity: r.id, upgrade: refine })), baseStats, pieceAdds(item, refine, 100, r.id));
          expect(bad, `${item.id} ${r.id} +${refine}: ${bad}`).toBeNull();
        }
      }
      // it beats its forged twin on the stat it is made for
      const twin = getGear(item.salvageLike!);
      const a = pieceAdds(item, 0, 100, 'common');
      const b = pieceAdds(twin, 0, 100, 'common');
      expect(a.hit + a.maxHp + a.reduction + a.critChance, item.id).toBeGreaterThan(b.hit + b.maxHp + b.reduction + b.critChance);
    });
  }
});

// ---- 8. the extreme hero ------------------------------------------------------------------------------------------------------------------

describe('a hero who stacks every crit rate there is', () => {
  it('is capped at 100 % crit, and his Hunting session still loads (an unclamped total once dropped the session and its Pass cap)', () => {
    let s = bare();
    for (const slot of INSTANCED_SLOTS) {
      const p = CRAFTABLE.filter((g) => g.slot === slot && g.tier === 6 && g.line !== 'axe').pop()!;
      const crit = SUBSTATS.find((d) => d.type === 'critRate')!;
      s = wear(s, p.id, { rarity: 'legendary', upgrade: 12, substats: [{ type: 'critRate', value: medianSubstatValue(crit, 6, RARITIES[3].substatMult) * 3 }] });
    }
    s = { ...s, equipped: { ...s.equipped, relic: 'overlord_sigil' }, hasBattlePass: true };
    const stats = buildCombatStats(s);
    expect(stats.critChance).toBe(1);
    const session = buildHuntSession(s, NOW);
    const back = sanitizeHuntSession(JSON.parse(JSON.stringify(session)));
    expect(back, 'the session survives a save / load').not.toBeNull();
    expect(back!.passCapHours).toBe(T.battlePass.capHours);
    // the panel still adds up
    const row = statBreakdown(s, NOW).rows.critChance;
    expect(row.lines.filter((l) => !l.temporary).reduce((a, l) => a + l.delta, 0)).toBeCloseTo(1, 9);
  });
});
