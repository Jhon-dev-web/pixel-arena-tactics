import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import TaticasView from '../../components/TaticasView';
import { GEAR_FIELD_KIND, PassiveId, STATS_FIELD_KIND, STRIKE_FIELD_KIND, tacticsPassives } from '../../components/tacticsPassives';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { setLocale } from '../../locales';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import { buildCombatStats, SaveData } from '../engine';
import { bastionHp, reflectedDamage, regenAmount } from '../derivedStats';
import { GEAR, LIVE_STAT_FIELDS } from '../gear';
import { createGearInstance } from '../gearInstances';
import { SkillRanks } from '../heroSkills';
import T from '../tunables';

// The passives block of the Taticas screen lists what the gear and the skills do BY THEMSELVES in a fight, read from the hero's real combat stats. The ways it can lie without any sign on a green screen: an effect the
// engine runs that has no line (the hero has it and the screen does not say so), a line for an effect the hero does not have, a number that does not move with the gear, a source that names the wrong piece. The
// classification in tacticsPassives.ts (GEAR_FIELD_KIND, STATS_FIELD_KIND, STRIKE_FIELD_KIND) is total over the engine's fields, so a new field cannot be added without choosing; these guards prove each choice.

const ALL_SKILLS: SkillRanks = {
  w_heavy_blow: 3,
  w_fury: 3,
  w_devastating_strike: 1,
  w_bleed: 3,
  h_light_step: 3,
  g_block: 3,
  g_firm_stance: 3,
  g_last_bastion: 1,
  g_thorns: 3,
  g_second_wind: 3,
};
const withSkills = (s: SaveData, ranks: SkillRanks): SaveData => ({ ...s, skillTree: { ...s.skillTree, active: 0, sets: [ranks, {}] } });
const withRelic = (s: SaveData, id: string | null): SaveData => ({ ...s, equipped: { ...s.equipped, relic: id } });
function wear(base: SaveData, slot: 'weapon' | 'armor' | 'shield', templateId: string, durability?: number): SaveData {
  const inst = createGearInstance(templateId, { id: `gi_test_${templateId}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 0, durability });
  return { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, [slot]: inst.id } };
}
const level = (pair: string, lv = 100, o: Parameters<typeof hero>[2] = {}): SaveData => automaticRotation(hero(pair, 3, { level: lv, ...o }));
const idsOf = (s: SaveData): PassiveId[] => tacticsPassives(s).map((l) => l.id);
// a leather chestpiece: plate is what reflect is FOR, leather keeps none of it (gear.ts)
const LEATHER_CHEST = GEAR.find((g) => g.slot === 'armor' && g.weight === 'leather')!.id;
const line = (s: SaveData, id: PassiveId) => tacticsPassives(s).find((l) => l.id === id);

// A hero with EVERYTHING on: the dragon blade (burn), the dragon armor (reflect) and a shield (more reflect), the Lich relic (lifesteal), and every skill that does something in a fight.
const SINK = withSkills(withRelic(level('4d', 100, { extra: [['shield', 'gilded_shield', 'common', []]] }), 'lich_phylactery'), ALL_SKILLS);

describe('every effect the engine runs by itself has a line, and every line is one the engine runs', () => {
  const classified = (...maps: Record<string, 'number' | PassiveId[]>[]): Set<PassiveId> => {
    const out = new Set<PassiveId>();
    for (const m of maps) for (const k of Object.values(m)) if (k !== 'number') for (const id of k) out.add(id);
    return out;
  };

  it('the hero with everything on gets exactly the lines the three classifications name: none missing, none invented', () => {
    const shown = new Set(idsOf(SINK));
    const named = classified(GEAR_FIELD_KIND, STATS_FIELD_KIND, STRIKE_FIELD_KIND);
    expect([...named].filter((id) => !shown.has(id)), 'the engine reads a field whose effect has no line').toEqual([]);
    expect([...shown].filter((id) => !named.has(id)), 'a line that no field of the engine explains').toEqual([]);
    expect(idsOf(SINK).length).toBe(shown.size); // one line per effect
  });

  it('every stat the engine hands to combat is classified (a field added later, and set, fails here)', () => {
    const stats = buildCombatStats(SINK);
    for (const k of Object.keys(stats)) expect(k in STATS_FIELD_KIND, `CombatStats.${k} is neither a plain number nor a passive`).toBe(true);
    for (const k of Object.keys(stats.strikes ?? {})) expect(k in STRIKE_FIELD_KIND, `StrikeStats.${k} is neither a plain number nor a passive`).toBe(true);
    expect(Object.keys(stats.strikes ?? {}).sort()).toEqual(Object.keys(STRIKE_FIELD_KIND).sort()); // the hero with everything on really sets every strike
  });

  it('every gear field the engine reads is classified, and the classification agrees with what the stats say', () => {
    expect(Object.keys(GEAR_FIELD_KIND).sort()).toEqual([...LIVE_STAT_FIELDS].sort());
    // the four gear effects: the field, the stat it feeds and the line it makes
    expect(GEAR_FIELD_KIND.burn).toEqual(STATS_FIELD_KIND.burn);
    expect(GEAR_FIELD_KIND.reflect).toEqual(STATS_FIELD_KIND.reflect);
    expect(GEAR_FIELD_KIND.hpRegenPct).toEqual(STATS_FIELD_KIND.hpRegenPct);
    expect(GEAR_FIELD_KIND.lifestealPct).toEqual(STATS_FIELD_KIND.lifesteal);
  });

  it('every passive has its four texts in both languages (name, when, what, rate)', () => {
    for (const id of classified(GEAR_FIELD_KIND, STATS_FIELD_KIND, STRIKE_FIELD_KIND)) {
      for (const [lang, table] of [['pt', pt], ['en', en]] as const) {
        const entry = (table.tactics.passive as Record<string, Record<string, string>>)[id];
        for (const k of ['name', 'when', 'what', 'rate']) expect(typeof entry?.[k], `${lang} ${id}.${k}`).toBe('string');
      }
    }
  });

  it('the texts hold no number: every figure of a line comes from the hero (a digit typed into a text goes stale)', () => {
    for (const [lang, table] of [['pt', pt], ['en', en]] as const) {
      const leaves: [string, string][] = [];
      const walk = (node: unknown, path: string) => {
        if (typeof node === 'string') leaves.push([path, node]);
        else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      };
      for (const part of ['passive', 'passives', 'basic', 'auto', 'src'] as const) walk(table.tactics[part], part);
      for (const [path, text] of leaves) expect(text.replace(/\{\w+\}/g, ''), `${lang} tactics.${path}`).not.toMatch(/\d/);
    }
  });
});

describe('the lines follow the gear: they appear, disappear and change number with what is worn', () => {
  it('reflect: a plate chest has it, leather has none; a better chest reflects more; a broken one less; a shield and Espinhos add to it, and each names itself as a source', () => {
    const steel = level('3', 100);
    expect(line(steel, 'reflect')).toBeDefined();
    expect(line(steel, 'reflect')!.from).toEqual([{ kind: 'slot', slot: 'armor' }]);
    const leather = wear(steel, 'armor', LEATHER_CHEST);
    expect(buildCombatStats(leather).reflect).toBe(0);
    expect(line(leather, 'reflect')).toBeUndefined();
    const aegis = wear(steel, 'armor', 'gilded_aegis');
    expect(line(aegis, 'reflect')!.params.pct).toBeGreaterThan(line(steel, 'reflect')!.params.pct);
    expect(line(wear(steel, 'armor', 'steel_plate', 0), 'reflect')!.params.pct).toBeLessThan(line(steel, 'reflect')!.params.pct);
    const shielded = wear(steel, 'shield', 'gilded_shield');
    expect(line(shielded, 'reflect')!.params.pct).toBeGreaterThan(line(steel, 'reflect')!.params.pct);
    expect(line(shielded, 'reflect')!.from).toEqual([{ kind: 'slot', slot: 'armor' }, { kind: 'slot', slot: 'shield' }]);
    const thorns = withSkills(shielded, { g_thorns: 3 });
    expect(line(thorns, 'reflect')!.from).toEqual([{ kind: 'slot', slot: 'armor' }, { kind: 'slot', slot: 'shield' }, { kind: 'skill', id: 'g_thorns' }]);
    // a hero whose only reflect is the skill still gets the line, from the skill alone
    expect(line(withSkills(leather, { g_thorns: 1 }), 'reflect')!.from).toEqual([{ kind: 'skill', id: 'g_thorns' }]);
  });

  it('the number on the line is the share of damage the engine hands back (reflectedDamage), not a second formula', () => {
    for (const s of [level('3', 100), level('4d', 100), withSkills(level('3', 100), { g_thorns: 3 })]) {
      const reflect = buildCombatStats(s).reflect;
      expect(line(s, 'reflect')!.params.pct).toBeCloseTo(reflectedDamage(1000, reflect) / 10, 0);
    }
  });

  it('burn: only a burning weapon (the dragon blade, the staffs) has it, and the damage of a tick moves with the hero', () => {
    expect(line(level('2', 100), 'burn')).toBeUndefined();
    const flame = level('4d', 100);
    expect(line(flame, 'burn')!.from).toEqual([{ kind: 'slot', slot: 'weapon' }]);
    expect(line(wear(flame, 'weapon', 'oak_staff'), 'burn')).toBeDefined();
    expect(line(level('4d', 100, { attrs: { str: 400, vit: 0, agi: 0, res: 0 } }), 'burn')!.params.dmg).toBeGreaterThan(line(level('4d', 100, { attrs: { str: 0, vit: 0, agi: 0, res: 0 } }), 'burn')!.params.dmg);
  });

  it('lifesteal comes from the pieces (a rolled affix), the relic or a set bonus, and names each one that really adds', () => {
    const base = level('3', 100);
    expect(line(base, 'lifesteal')).toBeUndefined();
    const relic = withRelic(base, 'lich_phylactery');
    expect(line(relic, 'lifesteal')!.from).toEqual([{ kind: 'relic' }]);
    const affix = level('3', 100, { aSubs: [{ type: 'lifesteal', value: 2 }] });
    expect(line(affix, 'lifesteal')!.from).toEqual([{ kind: 'affix' }]);
    expect(line(withRelic(affix, 'lich_phylactery'), 'lifesteal')!.params.pct).toBeGreaterThan(line(affix, 'lifesteal')!.params.pct);
    expect(line(withRelic(affix, 'lich_phylactery'), 'lifesteal')!.from).toEqual([{ kind: 'affix' }, { kind: 'relic' }]);
  });

  it('regeneration: the relic and Segundo Folego give it, the hp per tick is the one the engine heals (regenAmount), and the tick is the engine\'s', () => {
    const base = level('3', 100);
    expect(line(base, 'regen')).toBeUndefined();
    const ring = withRelic(base, 'ring_vitality');
    const stats = buildCombatStats(ring);
    expect(line(ring, 'regen')!.from).toEqual([{ kind: 'relic' }]);
    expect(line(ring, 'regen')!.params.hp).toBe(regenAmount(stats.maxHp, stats.hpRegenPct));
    expect(line(ring, 'regen')!.everyMs).toBe(T.battle.effectTickMs);
    const both = withSkills(ring, { g_second_wind: 2 });
    expect(line(both, 'regen')!.from).toEqual([{ kind: 'relic' }, { kind: 'skill', id: 'g_second_wind' }]);
    expect(line(both, 'regen')!.params.hp).toBeGreaterThan(line(ring, 'regen')!.params.hp);
  });

  it('the skill lines appear only for the skills the hero spent points in, with the numbers of its ranks', () => {
    const base = level('3', 100);
    expect(idsOf(base)).toEqual(['reflect']); // the plate chest, and no point spent
    const rank = (n: number) => withSkills(base, { w_heavy_blow: n, g_block: n, h_light_step: n, w_bleed: n });
    for (const id of ['crush', 'block', 'counter', 'double', 'bleed'] as const) expect(line(rank(3), id)!.params.pct, id).toBeGreaterThan(line(rank(1), id)!.params.pct);
    expect(idsOf(rank(1)).sort()).toEqual(['block', 'bleed', 'counter', 'crush', 'double', 'reflect'].sort());
    // the Devastador alone (the capstone) still counts the hits of the Esmagador, without a bonus of its own
    const capstone = withSkills(base, { w_devastating_strike: 1 });
    expect(idsOf(capstone)).toContain('devastating');
    expect(idsOf(capstone)).not.toContain('crush');
    expect(line(capstone, 'devastating')!.params.hits).toBe(T.heroSkills.crushEvery * T.heroSkills.devastatingEvery);
  });

  it('the recharge each line states is the engine\'s: the flurry timer, the tick, the Bastion cooldown in Hunting; the rest have none', () => {
    const lines = tacticsPassives(SINK);
    const every = Object.fromEntries(lines.map((l) => [l.id, l.everyMs]));
    expect(every.fury).toBe(T.heroSkills.furyEveryMs);
    expect(every.regen).toBe(T.battle.effectTickMs);
    expect(every.bastion).toBe(T.heroSkills.bastionCooldownMs);
    for (const id of ['burn', 'reflect', 'lifesteal', 'bleed', 'crush', 'devastating', 'double', 'block', 'counter', 'bossStance'] as const) expect(every[id], id).toBeUndefined();
    expect(line(SINK, 'bastion')!.params.hp).toBe(bastionHp(buildCombatStats(SINK).maxHp));
  });

  it('a line never has an empty source: whatever the hero has, the screen can say where it comes from', () => {
    const heroes: SaveData[] = [SINK, level('3', 100), level('4d', 100), withRelic(level('6', 100), 'ring_vitality'), wear(level('3', 100), 'weapon', 'oak_staff'), withSkills(level('3', 100), ALL_SKILLS)];
    for (const s of heroes) for (const l of tacticsPassives(s)) expect(l.from.length, l.id).toBeGreaterThan(0);
  });
});

describe('the screen prints the passives of this hero and only these', () => {
  beforeEach(() => setLocale('pt'));
  const render = (s: SaveData): string => renderToStaticMarkup(h(TaticasView, { save: s }));

  it('a hero with reflect shows the line with the number of his gear, one without shows none, and the number moves with the equipment', () => {
    const steel = level('3', 100);
    const leather = wear(steel, 'armor', LEATHER_CHEST);
    const pct = (s: SaveData) => line(s, 'reflect')!.params.pct;
    expect(render(steel)).toContain('Reflexo');
    expect(render(steel)).toContain(`${pct(steel)}%`);
    expect(render(leather)).not.toContain('Reflexo');
    expect(render(wear(steel, 'armor', 'gilded_aegis'))).toContain(`${pct(wear(steel, 'armor', 'gilded_aegis'))}%`);
    expect(render(steel)).not.toBe(render(wear(steel, 'armor', 'gilded_aegis')));
  });

  it('every line says its name, where it comes from, when it works and its recharge or what is true instead', () => {
    const html = render(SINK);
    const rows = html.split('class="tc-ps"').slice(1);
    expect(rows).toHaveLength(tacticsPassives(SINK).length);
    for (const row of rows) {
      for (const cls of ['tc-ps-name', 'tc-ps-from', 'tc-ps-when', 'tc-ps-what', 'tc-ps-rate']) expect(row, cls).toContain(cls);
      expect(row).not.toMatch(/\{\w+\}/); // no placeholder left unfilled
      expect(row).not.toContain('NaN');
    }
    expect(html).toContain('Sem recarga: a cada golpe recebido');
  });

  it('a hero with no passive says what passives are and where they come from, in both languages, instead of an empty block', () => {
    const plain = wear(level('3', 100), 'armor', LEATHER_CHEST);
    expect(tacticsPassives(plain)).toEqual([]);
    for (const lang of ['pt', 'en'] as const) {
      setLocale(lang);
      const html = render(plain);
      expect(html).toContain(lang === 'pt' ? pt.tactics.passives.none : en.tactics.passives.none);
      expect(html).not.toContain('class="tc-ps"');
    }
  });

  it('a hero with many passives gets them in a fold (closed), one with a few has them open', () => {
    expect(render(SINK)).toMatch(/<details class="ui-panel pg-fold tc-passives"(?! open)/);
    const one = level('3', 100); // reflect only
    expect(tacticsPassives(one)).toHaveLength(1);
    expect(render(one)).toMatch(/<details class="ui-panel pg-fold tc-passives" open=""/);
  });

  it('the texts of Hunting and Dungeon that differ say so: the Last Bastion and the Firm Stance', () => {
    const html = render(SINK);
    expect(html).toContain('Masmorra: uma vez por incursão. Caça: recarga de ');
    expect(html).toContain('lutas de promoção e de Alvo da Caça');
  });
});
