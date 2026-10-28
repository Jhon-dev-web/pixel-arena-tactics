// The equipment index each Hunting DEPTH of each zone should ask, read off the CP the depth asks today for the plate / sword hero (phase 8; the depth gate moves from CP to the equipment index like the sub-level gate).
//   npx vitest run --config vitest.sim.config.ts depthGate --silent=false --reporter=default
// For a target CP it takes the plate ladder builds (ladder.ts, the rotation on) whose CP is within +-20 % and reports the median of their equipment index; and, for the three classes at several full sets, whether the
// old CP gate and the new index gate would let them into each depth. It measures; it writes nothing.
import { it } from 'vitest';
import { computeCP } from '../../src/game/engine';
import { equipmentIndex } from '../../src/game/gearIndex';
import { HUNTING_DEPTHS, HUNTING_ZONES, isDepthUnlocked, recommendedCpForDepth } from '../../src/game/huntingZones';
import { ladder } from './ladder';
import { CLASS_MAIN, classHero } from './classHero';
import { spendSkillPoints } from './driver';

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

it('prints the depth gate in index', () => {
  const builds = ladder().map((b) => ({ cp: b.cp, e: equipmentIndex(b.hero) }));
  const out: string[] = ['| zona | fundo | CP que o fundo pede hoje | índice dos heróis de placa com CP a +-20 % | n |', '| --- | --- | --: | --: | --: |'];
  for (const z of HUNTING_ZONES)
    for (const d of HUNTING_DEPTHS) {
      const cp = recommendedCpForDepth(z, d.id);
      const near = builds.filter((b) => b.cp >= cp * 0.8 && b.cp <= cp * 1.25).map((b) => b.e);
      out.push(`| ${z.id} | ${d.id} | ${cp} | ${near.length ? median(near).toFixed(2) : '-'} | ${near.length} |`);
    }
  out.push('', '### Quem entra em cada fundo (rift, abyss, throne; raso/médio/fundo; S = aberto): pelo CP de hoje / pelo índice novo', '');
  out.push('| equipamento | classe | CP | índice | CP (portão antigo) | índice (portão novo) |', '| --- | --- | --: | --: | --- | --- |');
  for (const [tier, level, refine, rarity] of [[3, 45, 8, 'common'], [4, 62, 0, 'common'], [4, 62, 8, 'common'], [5, 75, 0, 'common'], [5, 75, 8, 'common'], [5, 75, 8, 'epic'], [6, 90, 8, 'common'], [6, 90, 12, 'legendary']] as [number, number, number, 'common' | 'epic' | 'legendary'][]) {
    for (const b of CLASS_MAIN) {
      const h = spendSkillPoints(classHero(b, level, tier, refine, 'real', 100, rarity), 'warrior');
      const cp = computeCP(h);
      const gear = equipmentIndex(h);
      const cells = (ok: (z: (typeof HUNTING_ZONES)[number], d: (typeof HUNTING_DEPTHS)[number]) => boolean): string => HUNTING_ZONES.slice(2).map((z) => HUNTING_DEPTHS.map((d) => (ok(z, d) ? 'S' : '-')).join('')).join(' ');
      out.push(`| T${tier}+${refine} ${rarity} | ${b.id} | ${Math.round(cp)} | ${gear.toFixed(2)} | ${cells((z, d) => cp >= recommendedCpForDepth(z, d.id))} | ${cells((z, d) => isDepthUnlocked(z, d.id, gear))} |`);
    }
  }
  console.log(out.join(String.fromCharCode(10)));
});
