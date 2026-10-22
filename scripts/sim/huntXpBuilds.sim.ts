// Hunting XP per hour of the full builds (Rodada 31: XP is paid PER KILL). Run it with `npm run sim:xpbuilds`; it prints Markdown tables and asserts nothing.
// Same hero, same zone, same 4 h: only the build changes (skills and where the attribute points go), through the REAL game code (computeHuntingStatus).
// XP_ONLY_ZONE='demon_rift' restricts the run to one zone.
import { describe, it } from 'vitest';
import { buildHuntSession, computeHuntingStatus, SaveData } from '../../src/game/engine';
import { HUNTING_ZONES, HuntingDepth, getHuntingZone } from '../../src/game/huntingZones';
import { buildHero } from './ladder';
import { spendSkillPoints, SkillBuild } from './driver';
import { playerLevel } from '../../src/game/engine';
import T from '../../src/game/tunables';

// SIM_T='{"hunting":{"xpPaceCap":1.3}}' overrides tunables for the run (what-ifs without editing the file).
if (process.env.SIM_T) {
  for (const [group, vals] of Object.entries(JSON.parse(process.env.SIM_T) as Record<string, Record<string, number>>)) Object.assign((T as unknown as Record<string, Record<string, number>>)[group], vals);
}

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOURS = 4;

// [hero label, level, tier, refine, zone id, depth]
// The first of each zone is a hero about at the zone's recommended CP (the pace the zone's xpRefKph describes), the others are stronger than that (the pace cap acts).
const CASES: [string, number, number, number, string, HuntingDepth][] = [
  ['nível 5, sem tier (CP ~ 1,6x)', 5, 0, 0, 'demon_glade', 'shallow'],
  ['nível 12, tier 2 +2 (CP ~ 3x)', 12, 2, 2, 'demon_glade', 'shallow'],
  ['nível 20, tier 2 +4 (CP ~ 1,1x)', 20, 2, 4, 'blood_marsh', 'shallow'],
  ['nível 30, tier 3 +4 (CP ~ 2x)', 30, 3, 4, 'blood_marsh', 'shallow'],
  ['nível 40, tier 3 +0 (CP ~ 0,85x)', 40, 3, 0, 'demon_rift', 'shallow'],
  ['nível 40, tier 3 +4 (CP ~ 1,1x)', 40, 3, 4, 'demon_rift', 'shallow'],
  ['nível 45, tier 3 +8 (CP ~ 1,35x)', 45, 3, 8, 'demon_rift', 'shallow'],
  ['nível 60, tier 4 +6 (CP ~ 1,5x)', 60, 4, 6, 'demon_rift', 'shallow'],
  ['nível 50, tier 3 +8 (CP ~ 1x)', 50, 3, 8, 'blood_abyss', 'shallow'],
  ['nível 60, tier 4 +4 (CP ~ 1,16x)', 60, 4, 4, 'blood_abyss', 'shallow'],
  ['nível 75, tier 5 +8 (CP ~ 1,9x)', 75, 5, 8, 'blood_abyss', 'shallow'],
  ['nível 100, tier 6 +8 (fundo)', 100, 6, 8, 'blood_abyss', 'deep'],
];
const BUILDS: SkillBuild[] = ['none', 'warrior', 'guardian', 'hunter'];

function run(s: SaveData, zoneId: string, depth: HuntingDepth) {
  const save: SaveData = { ...s, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: NOW };
  const withSession: SaveData = { ...save, huntSession: buildHuntSession(save, NOW) };
  const st = computeHuntingStatus(withSession, NOW + HOURS * 3600 * 1000);
  return { kph: st.kills / HOURS, xph: st.xpReady / HOURS, ceiling: st.ceilingSubLevel };
}

describe('hunting xp per build', () => {
  it('prints the tables', () => {
    const out: string[] = ['', '### XP/h e kills/h por build (Caça de 4 h, mesma zona e herói; só muda a build)', ''];
    out.push('| Herói / zona | build | kills/h | XP/h | XP/h vs. sem habilidades | sub-nível |', '| --- | --- | --: | --: | --: | --: |');
    for (const [label, level, tier, refine, zoneId, depth] of CASES) {
      if (process.env.XP_ONLY_ZONE && process.env.XP_ONLY_ZONE !== zoneId) continue;
      if (!getHuntingZone(zoneId) || !HUNTING_ZONES.length) continue;
      const base = buildHero(level, tier, refine, 100);
      let ref = 0;
      for (const b of BUILDS) {
        const hero = spendSkillPoints(base, b);
        const r = run(hero, zoneId, depth);
        if (b === 'none') ref = r.xph;
        out.push(`| ${label} / ${zoneId} (${depth}) | ${b} | ${r.kph.toFixed(0)} | ${Math.round(r.xph)} | ${ref > 0 ? `${((r.xph / ref - 1) * 100).toFixed(1)}%` : '-'} | ${r.ceiling} |`);
      }
    }
    // The extremes: every skill path x where the attribute points go (all in one attribute, the AGI capped at 300 as the game does) at the same gear and zone: the slowest and the fastest full build.
    out.push('', '### Extremos: build mais lenta e mais rápida (caminho de habilidades x onde vão os pontos de atributo), mesmo equipamento e zona', '');
    out.push('| Herói / zona | mais lenta (XP/h) | mais rápida (XP/h) | razão rápida/lenta | balanceada sem habilidades (XP/h) |', '| --- | --- | --- | --: | --: |');
    for (const [label, level, tier, refine, zoneId, depth] of CASES) {
      if (process.env.XP_ONLY_ZONE && process.env.XP_ONLY_ZONE !== zoneId) continue;
      const base = buildHero(level, tier, refine, 100);
      const pts = playerLevel(base.xp) * 3;
      const spreads: [string, Partial<Record<'str' | 'vit' | 'agi' | 'res', number>> | null][] = [['equilibrado', null], ['tudo STR', { str: pts }], ['tudo VIT', { vit: pts }], ['tudo AGI', { agi: Math.min(300, pts) }], ['tudo RES', { res: pts }]];
      const rows: { name: string; xph: number }[] = [];
      for (const [aname, attrs] of spreads) {
        for (const b of BUILDS) {
          const h0 = attrs ? { ...base, str: 0, vit: 0, agi: 0, res: 0, ...attrs } : base;
          rows.push({ name: `${b} + ${aname}`, xph: run(spendSkillPoints(h0, b), zoneId, depth).xph });
        }
      }
      rows.sort((a, b) => a.xph - b.xph);
      const lo = rows[0];
      const hi = rows[rows.length - 1];
      const plain = rows.find((r) => r.name === 'none + equilibrado')!;
      out.push(`| ${label} / ${zoneId} (${depth}) | ${lo.name}: ${Math.round(lo.xph)} | ${hi.name}: ${Math.round(hi.xph)} | x${(hi.xph / Math.max(1, lo.xph)).toFixed(2)} | ${Math.round(plain.xph)} |`);
    }
    console.log(out.join('\n'));
  });
});
