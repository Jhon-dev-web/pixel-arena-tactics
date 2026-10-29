// DIAGNOSIS (not a calibration, it changes nothing in the game): why the crossbow, the scepter and the axe are not a viable second weapon of their class (classes reform, phase 8 follow-up, 29/10).
// classAxes.ts measures only CLASS_MAIN (sword, bow, staff); the variants (axe, crossbow, scepter) were never in the locked test. This tool measures them on the same three axes and takes them apart:
//   1. each variant against the mean of the OTHER TWO mains (the class swaps its weapon, the others keep theirs), in three layers: equipment only ('gear'), + the weapon's and the chest's abilities
//      ('rotation', affinity off), + the class affinity ('real');
//   2. the value of EACH ability alone (a rotation of just that one) against the same hero with no rotation;
//   3. the weapon tables (damage, crit chance, the returned stat);
//   4. what-ifs IN MEMORY (the returned stat of a weapon zeroed, the scepter's carry ability given the staff's numbers), restored after each.
//   npx vitest run --config vitest.sim.config.ts variantDiag --silent=false --reporter=default
import { it } from 'vitest';
import { buildHuntSession, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import type { HuntingDepth } from '../../src/game/huntingZones';
import { getGear } from '../../src/game/gear';
import T from '../../src/game/tunables';
import { ABILITY_IDS, AbilityId, abilityDef } from '../../src/game/abilities';
import { bossKill, HeroMode } from './duel';
import { clearRate } from './ladder';
import { CLASS_MAIN, CLASS_VARIANTS, ClassBuild, classHero, weaponId } from './classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const BOSSES = [25, 50, 75, 100];
const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

interface Cfg {
  label: string;
  tier: number;
  level: number;
  refine: number;
  zone: string;
  pin: number;
}
const CFGS: Cfg[] = [
  { label: 'T3 +8', tier: 3, level: 45, refine: 8, zone: 'demon_rift', pin: 5 },
  { label: 'T4 +8', tier: 4, level: 62, refine: 8, zone: 'blood_abyss', pin: 5 },
  { label: 'T6 +8', tier: 6, level: 100, refine: 8, zone: 'blood_abyss', pin: 7 },
];

function killsPerHour(h: SaveData, zoneId: string, depth: HuntingDepth, pin: number, starts: number): number {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = pin;
  try {
    let kills = 0;
    let hours = 0;
    for (let i = 0; i < starts; i++) {
      const t0 = NOW + i * 7_919_000;
      let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: t0 };
      save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, depth)]: { ceiling: pin, promotionWins: 0 } } };
      save = { ...save, huntSession: buildHuntSession(save, t0) };
      const st = computeHuntingStatus(save, t0 + 4 * 3600 * 1000);
      kills += st.kills;
      hours += st.pendingMs / 3600_000;
    }
    return kills / hours;
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}
function floorReach(h: SaveData): number {
  let reach = 0;
  for (let f = 1; f <= 100; f++) {
    if (clearRate(h, f, NOW, 3) < 2 / 3) break;
    reach = f;
  }
  return reach;
}

interface M {
  kph: number;
  boss: number[]; // speed (1 / ms) of the four bosses
  reach?: number;
}
function measure(h: SaveData, c: Cfg, withReach: boolean): M {
  return { kph: killsPerHour(h, c.zone, 'shallow', c.pin, 3), boss: BOSSES.map((f) => 1 / bossKill(h, f, NOW, 24).ms), reach: withReach ? floorReach(h) : undefined };
}
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
// the lead of `m` against the mean of the two other mains `others`
function lead(m: M, others: M[]): { hunting: number; boss: number; depth?: number } {
  return {
    hunting: m.kph / mean(others.map((o) => o.kph)) - 1,
    boss: mean(BOSSES.map((_, i) => m.boss[i] / mean(others.map((o) => o.boss[i])) - 1)),
    depth: m.reach !== undefined && others.every((o) => o.reach !== undefined) ? m.reach / mean(others.map((o) => o.reach!)) - 1 : undefined,
  };
}
const NL = String.fromCharCode(10);
const CLS = ['warrior', 'archer', 'mage'] as const;
const classIndex = (b: ClassBuild): number => CLS.indexOf(b.cls);

it('diagnoses the variants', () => {
  const out: string[] = [];

  // ---- 1. the three layers
  out.push('## 1. Cada arma contra a média das outras duas classes (a classe troca a arma, as outras ficam com a principal)', '');
  out.push('| equipamento | arma | camada | Caça | Chefe | Andares | kills/h | alcance |', '| --- | --- | --- | --: | --: | --: | --: | --: |');
  for (const c of CFGS) {
    for (const mode of ['gear', 'rotation', 'real'] as HeroMode[]) {
      const withReach = mode === 'real';
      const mains = CLASS_MAIN.map((b) => measure(classHero(b, c.level, c.tier, c.refine, mode), c, withReach));
      for (const b of [...CLASS_MAIN, ...CLASS_VARIANTS]) {
        const isMain = CLASS_MAIN.includes(b);
        const m = isMain ? mains[classIndex(b)] : measure(classHero(b, c.level, c.tier, c.refine, mode), c, withReach);
        const others = mains.filter((_, i) => i !== classIndex(b));
        const l = lead(m, others);
        out.push(`| ${c.label} | ${b.weapon} | ${mode} | ${pct(l.hunting)} | ${pct(l.boss)} | ${l.depth === undefined ? '-' : pct(l.depth)} | ${m.kph.toFixed(0)} | ${m.reach ?? '-'} |`);
      }
    }
  }

  // ---- 2. each ability alone
  out.push('', '## 2. O valor de cada habilidade sozinha (rotação de uma só, afinidade desligada) contra o mesmo herói sem rotação', '');
  out.push('| equipamento | arma | habilidade | Caça (kills/h) | Chefe (velocidade) |', '| --- | --- | --- | --: | --: |');
  for (const c of CFGS.slice(1)) {
    for (const b of [...CLASS_MAIN, ...CLASS_VARIANTS]) {
      const base = classHero(b, c.level, c.tier, c.refine, 'gear');
      const m0 = measure(base, c, false);
      const hero = classHero(b, c.level, c.tier, c.refine, 'rotation');
      const granted = ABILITY_IDS.filter((id) => {
        const s = abilityDef(id)!.source;
        return ('line' in s && s.line === b.weapon) || ('weight' in s && s.weight === (b.cls === 'warrior' ? 'plate' : b.cls === 'archer' ? 'leather' : 'cloth'));
      });
      for (const id of granted) {
        const m = measure({ ...hero, rotation: [id] as AbilityId[] }, c, false);
        out.push(`| ${c.label} | ${b.weapon} | ${id} | ${pct(m.kph / m0.kph - 1)} | ${pct(mean(BOSSES.map((_, i) => m.boss[i] / m0.boss[i])) - 1)} |`);
      }
      const all = measure(hero, c, false);
      out.push(`| ${c.label} | ${b.weapon} | TODAS (rotação automática) | ${pct(all.kph / m0.kph - 1)} | ${pct(mean(BOSSES.map((_, i) => all.boss[i] / m0.boss[i])) - 1)} |`);
    }
  }

  // ---- 3. the weapon tables
  out.push('', '## 3. As armas (valores base da peça, sem refino)', '');
  out.push('| tier | arma | dano | crítico | vel. ataque | dano crítico | regen/s |', '| --: | --- | --: | --: | --: | --: | --: |');
  for (const tier of [3, 4, 6]) {
    for (const b of [...CLASS_MAIN, ...CLASS_VARIANTS]) {
      const g = getGear(weaponId(b.weapon, tier)) as unknown as Record<string, number | undefined>;
      out.push(`| ${tier} | ${b.weapon} | ${g.damage ?? 0} | ${((g.critChance ?? 0) * 100).toFixed(1)}% | ${((g.attackSpeedBonus ?? 0) * 100).toFixed(1)}% | ${((g.critMultBonus ?? 0) * 100).toFixed(1)}% | ${((g.hpRegenPct ?? 0) * 100).toFixed(2)}% |`);
    }
  }

  // ---- 4. what-ifs in memory
  out.push('', '## 4. E se (em memória; a base é o herói completo, camada real)', '');
  out.push('| equipamento | experimento | Caça | Chefe | Andares |', '| --- | --- | --: | --: | --: |');
  const gearOf = (id: string) => getGear(id) as unknown as Record<string, number | undefined>;
  for (const c of CFGS.slice(1)) {
    const mains = CLASS_MAIN.map((b) => measure(classHero(b, c.level, c.tier, c.refine, 'real'), c, true));
    const run = (label: string, b: ClassBuild, tweak: () => () => void) => {
      const undo = tweak();
      try {
        const m = measure(classHero(b, c.level, c.tier, c.refine, 'real'), c, true);
        const l = lead(m, mains.filter((_, i) => i !== classIndex(b)));
        out.push(`| ${c.label} | ${label} | ${pct(l.hunting)} | ${pct(l.boss)} | ${l.depth === undefined ? '-' : pct(l.depth)} |`);
      } finally {
        undo();
      }
    };
    const zero = (id: string, field: string) => () => {
      const g = gearOf(id);
      const old = g[field];
      g[field] = 0;
      return () => {
        g[field] = old;
      };
    };
    const tunable = (changes: Record<string, number>) => () => {
      const a = T.abilities as unknown as Record<string, number>;
      const old: Record<string, number> = {};
      for (const [k, v] of Object.entries(changes)) {
        old[k] = a[k];
        a[k] = v;
      }
      return () => Object.assign(a, old);
    };
    const bow = CLASS_MAIN[1];
    const xbow = CLASS_VARIANTS[1];
    const staff = CLASS_MAIN[2];
    const scepter = CLASS_VARIANTS[2];
    const axe = CLASS_VARIANTS[0];
    run('arco (hoje)', bow, () => () => undefined);
    run('arco sem a velocidade devolvida', bow, zero(weaponId('bow', c.tier), 'attackSpeedBonus'));
    run('besta (hoje)', xbow, () => () => undefined);
    run('besta sem o multiplicador de crítico devolvido', xbow, zero(weaponId('crossbow', c.tier), 'critMultBonus'));
    run('besta sem crítico (chance) algum na arma', xbow, zero(weaponId('crossbow', c.tier), 'critChance'));
    run('besta com as habilidades da linha zeradas (golpes de 1,0x)', xbow, tunable({ piercingBoltPct: 1, fatalShotPct: 1, doubleShotPct: 0.5 }));
    const like = (to: string, from: string, fields: string[]) => () => {
      const g = gearOf(to);
      const src = gearOf(from);
      const old: Record<string, number | undefined> = {};
      for (const k of fields) {
        old[k] = g[k];
        g[k] = src[k];
      }
      return () => Object.assign(g, old);
    };
    run('besta com o dano do arco', xbow, like(weaponId('crossbow', c.tier), weaponId('bow', c.tier), ['damage']));
    run('besta com o dano e a chance de crítico do arco', xbow, like(weaponId('crossbow', c.tier), weaponId('bow', c.tier), ['damage', 'critChance']));
    run('besta com dano, crítico do arco e habilidades da besta com os números do arco (golpes 1,4x / 0,4x)', xbow, () => {
      const u1 = like(weaponId('crossbow', c.tier), weaponId('bow', c.tier), ['damage', 'critChance'])();
      const u2 = tunable({ piercingBoltPct: T.abilities.trueShotPct, fatalShotPct: T.abilities.trueShotPct, doubleShotPct: T.abilities.arrowRainPct, piercingBoltCdMs: T.abilities.trueShotCdMs, fatalShotCdMs: T.abilities.trueShotCdMs, doubleShotCdMs: T.abilities.arrowRainCdMs })();
      return () => {
        u2();
        u1();
      };
    });
    run('machado com a tabela de habilidades da espada (Rachadura = Golpe Firme, Giro = Estocada)', axe, tunable({ riftPct: T.abilities.firmStrikePct, riftCdMs: T.abilities.firmStrikeCdMs, brutalSpinPct: 2.0, brutalSpinCdMs: T.abilities.doubleThrustCdMs }));
    run('cajado (hoje)', staff, () => () => undefined);
    run('cajado sem o multiplicador de crítico devolvido', staff, zero(weaponId('staff', c.tier), 'critMultBonus'));
    run('cetro (hoje)', scepter, () => () => undefined);
    run('cetro com o Pulso Sombrio do tamanho da Explosão Arcana', scepter, tunable({ darkPulsePct: T.abilities.arcaneBurstPct, darkPulseCdMs: T.abilities.arcaneBurstCdMs }));
    run('cetro com a regeneração devolvida zerada', scepter, zero(weaponId('scepter', c.tier), 'hpRegenPct'));
    run('machado (hoje)', axe, () => () => undefined);
  }

  console.log(out.join(NL));
}, 3_000_000);
