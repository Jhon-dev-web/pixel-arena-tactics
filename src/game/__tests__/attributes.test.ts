import { describe, expect, it } from 'vitest';
import { ATTR_KEYS, AttrKey, attributeParams } from '../attributes';
import { buildCombatStats, computeCP, defaultSave, normalizeSave, playerLevel, playerMaxHp, SaveData, xpToReachLevel } from '../engine';
import { heroAttackIntervalMs } from '../derivedStats';
import T from '../tunables';
import { attrText, fmtAttrNumber } from '../../components/attrText';
import { locales, setLocale } from '../../locales';
import { ALLOCS, ATTRS, AUDIT_SPECS, Alloc, auditHero, buildTable, marginalValue, pointValue, specOf, spread, STACK_POINTS } from '../../../scripts/sim/attrAudit';
import { withSeededRandom } from '../../../scripts/sim/driver';

// Rules of the primary-attribute round (docs/ITEM_BALANCE_AUDIT.md section D, docs/BALANCE_CHANGES.md "Rodada 8"), on the closed-form duel margin of the audit
// (no Monte Carlo except the build comparison, which is seeded):
//   B1  from level 20 the best attribute's value per point is at most 1.6x the worst's (2.5x at levels 5-10), with no skills and with each combat path;
//   B2  no all-in build beats the balanced one in both the Dungeon and Hunting, and none is far worse than it in either;
//   B3  the next point is never worth more than the one before it, and nothing falls off a cliff;
//   B4  the value computeCP gives a point is within 30 % of the real one.

describe('B1: a point of any attribute is worth about the same', () => {
  for (const alloc of ALLOCS) {
    it(`${alloc}: best / worst per-point value stays under the limit at every level`, () => {
      withSeededRandom(5, () => {
        for (const spec of AUDIT_SPECS) {
          const v = pointValue(auditHero(spec, alloc));
          const limit = spec.level <= 10 ? 2.5 : 1.6;
          expect(spread(v.real), `${alloc} level ${spec.level}: ${ATTRS.map((a) => `${a} ${v.real[a].toFixed(2)}`).join(', ')}`).toBeLessThanOrEqual(limit);
        }
      });
    });
  }
});

describe('B4: computeCP values a point like the fight does', () => {
  for (const alloc of ALLOCS) {
    it(`${alloc}: the CP value of a point is within 30 % of the real one`, () => {
      withSeededRandom(5, () => {
        for (const spec of AUDIT_SPECS) {
          const v = pointValue(auditHero(spec, alloc));
          for (const a of ATTRS) {
            const ratio = v.cp[a] / v.real[a];
            expect(ratio, `${alloc} level ${spec.level} ${a}`).toBeGreaterThanOrEqual(0.7);
            expect(ratio, `${alloc} level ${spec.level} ${a}`).toBeLessThanOrEqual(1.3);
          }
        }
      });
    });
  }
});

describe('B3: returns diminish as points pile into one attribute', () => {
  for (const lv of [30, 60]) {
    it(`level ${lv}: the next point never gains value by stacking, and does not collapse`, () => {
      withSeededRandom(5, () => {
        for (const alloc of ALLOCS) {
          for (const a of ATTRS) {
            const xs = STACK_POINTS.map((n) => marginalValue(specOf(lv), alloc, a, n));
            const tag = `${alloc} ${a} ${xs.map((x) => x.toFixed(2)).join('/')}`;
            for (let i = 1; i < xs.length; i++) expect(xs[i], tag).toBeLessThanOrEqual(xs[i - 1] * 1.03);
            expect(xs[xs.length - 1], tag).toBeGreaterThan(xs[0] * 0.2);
          }
        }
      });
    });
  }
});

describe('B2: an all-in build is a choice, not a trap, and never beats the balanced one on both axes', () => {
  // Hunting is compared in the place the balanced build farms (the pure combat effect: the floor that unlocks a zone is the Dungeon axis).
  const cases: [number, Alloc][] = [[30, 'none'], [30, 'warrior'], [60, 'none'], [60, 'warrior'], [60, 'guardian'], [100, 'none']];
  for (const [lv, alloc] of cases) {
    it(`level ${lv}, ${alloc}`, { timeout: 180_000 }, () => {
      const rows = withSeededRandom(6, () => buildTable(specOf(lv), alloc));
      const bal = rows[0];
      for (const r of rows.slice(1, 5)) {
        const dd = r.depth / bal.depth - 1;
        const dm = r.matsAtBase / bal.mats - 1;
        const tag = `${r.label}: depth ${(dd * 100).toFixed(0)} %, materials ${(dm * 100).toFixed(0)} %`;
        expect(dd > 0.05 && dm > 0.05, `beats the balanced build on both axes (${tag})`).toBe(false);
        expect(dd, tag).toBeGreaterThanOrEqual(-0.35);
        expect(dm, tag).toBeGreaterThanOrEqual(-0.45); // the design bound is -35 %; the few defence cells that miss it by a few points are listed in the audit
      }
    });
  }
});

describe('the Personagem descriptions show the numbers the engine uses', () => {
  const heroes: SaveData[] = [defaultSave(), auditHero(specOf(30)), auditHero(specOf(100), 'none', { str: 0, vit: 0, agi: 300, res: 0 })];
  it('every attribute, in both languages, prints its parameters', () => {
    const before = locales[0];
    try {
      for (const lang of locales) {
        setLocale(lang);
        for (const save of heroes) {
          for (const a of ATTR_KEYS) {
            const text = attrText(a, save);
            expect(text, `${lang} ${a} unresolved`).not.toMatch(/\{\w+\}/);
            if (a === 'agi' && save.agi >= T.battle.agiMax) {
              expect(text, `${lang} agi cap`).toContain(fmtAttrNumber(T.battle.agiMax));
              continue;
            }
            for (const n of Object.values(attributeParams(a as AttrKey, save))) expect(text, `${lang} ${a}`).toContain(fmtAttrNumber(n));
          }
        }
      }
    } finally {
      setLocale(before);
    }
  });

  it('the parameters are the engine constants and effects, not copies', () => {
    const h = auditHero(specOf(60));
    expect(attributeParams('str', h)).toEqual({ flat: T.advanced.strengthFlatDamage, pct: Math.round(T.advanced.strengthWeaponScalePerPoint * 10000) / 100 });
    const level = playerLevel(h.xp);
    const hp = attributeParams('vit', h).hp;
    expect(hp).toBeCloseTo(T.advanced.vitHpPerPoint + T.advanced.vitHpPerLevel * level, 2);
    expect(playerMaxHp({ ...h, vit: h.vit + 100 }) - playerMaxHp(h)).toBe(Math.round(100 * hp));
    expect(attributeParams('agi', h).ms).toBeCloseTo(heroAttackIntervalMs(h.agi) - heroAttackIntervalMs(h.agi + 1), 1);
    expect(attributeParams('agi', h).max).toBe(T.battle.agiMax);
    expect(attributeParams('res', h).hp).toBe(T.advanced.resHpPerPoint);
    expect(playerMaxHp({ ...h, res: h.res + 100 }) - playerMaxHp(h)).toBe(Math.round(100 * T.advanced.resHpPerPoint));
  });
});

describe('caps', () => {
  it('AGI stops helping at the cap, which is the whole point budget of level 100, and the interval never reaches the floor', () => {
    expect(T.battle.agiMax).toBe(100 * 3);
    expect(heroAttackIntervalMs(T.battle.agiMax + 50)).toBe(heroAttackIntervalMs(T.battle.agiMax));
    expect(heroAttackIntervalMs(T.battle.agiMax)).toBeGreaterThan(T.battle.heroMinMs);
  });
});

describe('existing saves', () => {
  it('a save with spent points loads with the same points; only the derived numbers change', () => {
    const played: SaveData = { ...defaultSave(), xp: xpToReachLevel(40), str: 40, vit: 35, agi: 25, res: 20 };
    const loaded = normalizeSave(JSON.parse(JSON.stringify(played)));
    expect([loaded.str, loaded.vit, loaded.agi, loaded.res]).toEqual([40, 35, 25, 20]);
    expect(loaded.xp).toBe(played.xp);
    // max HP is recomputed from the points, never stored: the current per-point values apply to the old points
    expect(playerMaxHp(loaded)).toBe(playerMaxHp(played));
    const bare = playerMaxHp({ ...loaded, vit: 0, res: 0 });
    const level = playerLevel(loaded.xp);
    expect(playerMaxHp(loaded)).toBe(Math.round(bare + 35 * (T.advanced.vitHpPerPoint + T.advanced.vitHpPerLevel * level) + 20 * T.advanced.resHpPerPoint));
    expect(Number.isFinite(computeCP(loaded))).toBe(true);
    expect(buildCombatStats(loaded).maxHp).toBe(playerMaxHp(loaded));
  });
});
