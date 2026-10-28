// A weapon of a light line against the sword of the SAME tier, piece against piece (phase 8). R8 compares a piece only with LOWER tiers; this is the missing comparison: if the bow is worse than the sword in every stat
// the player sees on the card, nobody forges it. npx vitest run --config vitest.sim.config.ts weaponCompare --silent=false --reporter=default. It measures; it writes nothing.
import { it } from 'vitest';
import { buildCombatStats } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear, SWORD_TWINS, WEAPON_LINES } from '../../src/game/gear';
import { buildHero } from './ladder';
import type { SaveData } from '../../src/game/engine';


const TIER_LEVEL = [1, 10, 25, 50, 70, 90];

function withWeapon(t: number, id: string | undefined, refine: number): SaveData {
  const h = buildHero(TIER_LEVEL[t - 1], t, refine);
  if (!id) return h;
  const inst = createGearInstance(id, { id: `gi_wpn_${id}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
  return { ...h, gearInstances: { ...h.gearInstances, [inst.id]: inst }, equipped: { ...h.equipped, weapon: inst.id } };
}
const dps = (s: SaveData): number => {
  const c = buildCombatStats(s);
  return (c.dmgBase * (1 + Math.min(1, c.critChance) * (c.critMult - 1)) * 1000) / c.heroMs;
};

it('prints the same-tier comparison', () => {
  const out: string[] = ['| tier | arma | dano | crítico | velocidade de ataque | mult. crítico | regen | queima | herói: dano base | intervalo (ms) | crítico total | dano/s (golpe básico) |', '| --- | --- | --: | --: | --: | --: | --: | --- | --: | --: | --: | --: |'];
  for (let t = 1; t <= 6; t++) {
    for (const id of [SWORD_TWINS[t - 1], ...WEAPON_LINES.filter((l) => l.line === 'bow' || l.line === 'crossbow').map((l) => l.ids[t - 1])]) {
      const g = getGear(id);
      const s = withWeapon(t, id === SWORD_TWINS[t - 1] ? undefined : id, 8);
      const c = buildCombatStats(s);
      out.push(`| T${t} | ${id} | ${g.damage ?? 0} | ${g.critChance ?? 0} | ${g.attackSpeedBonus ?? 0} | ${g.critMultBonus ?? 0} | ${g.hpRegenPct ?? 0} | ${g.burn ? 'sim' : '-'} | ${Math.round(c.dmgBase)} | ${Math.round(c.heroMs)} | ${c.critChance.toFixed(3)} | ${Math.round(dps(s))} |`);
    }
  }
  console.log(out.join(String.fromCharCode(10)));
});
