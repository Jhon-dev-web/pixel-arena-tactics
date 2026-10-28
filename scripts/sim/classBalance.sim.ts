// The three classes measured on their three axes (classes reform, phase 8; docs/CLASSES_E_EQUIPAMENTOS.md 2.5). It MEASURES, it calibrates nothing: it prints tables and asserts nothing.
//   npx vitest run --config vitest.sim.config.ts classBalance --silent=false --reporter=default
//
// One hero per class (classHero.ts), the full set of one tier at one refine level, common rarity, the attribute split of the sim player, the AUTOMATIC rotation and the class affinity on (a real player). Three axes:
//   hunting    kills per hour of a 4 h Hunting session through the REAL engine (computeHuntingStatus), averaged over CLASS_STARTS session seeds. Mage expected first (the carry).
//   boss       time to kill the boss of a biome (floors 25 / 50 / 75 / 100) through the REAL Dungeon loop (driver.ts runDungeon), hero immortal, arriving after four floors of the biome. Archer expected first.
//   depth      deepest floor of an unbroken run of floors the hero clears from full HP with no potions (2 of 3 seeded runs), the sim:depths probe. Warrior expected first.
// Each class is then read against the MEAN OF THE OTHER TWO on every axis (speed for the first two, the other way round for the time): own axis target +15 to +20 %, the other two no worse than -10 %.
// The same table is printed with the parts of the real player switched on one at a time ('gear' = no rotation and no affinity, 'rotation', 'real') so the source of every gap is visible.
import { describe, it } from 'vitest';
import { buildCombatStats, buildHuntSession, computeHuntingStatus, computeCP, huntProgressKey, SaveData } from '../../src/game/engine';
import { affinityBonuses } from '../../src/game/affinity';
import { getGear } from '../../src/game/gear';
import { runDungeon, withSeededRandom } from './driver';
import { dungeonEnemyKindForFloor, recommendedCpForFloor } from '../../src/game/dungeon';
import { getEnemyDef } from '../../src/game/enemies';
import { stageEnemyDmg, stageEnemyHp } from '../../src/game/waves';
import type { HuntingDepth } from '../../src/game/huntingZones';
import T from '../../src/game/tunables';
import { bossKill, HeroMode } from './duel';
import { clearRate } from './ladder';
import { CLASS_MAIN, CLASS_VARIANTS, classHero, ClassBuild } from './classHero';
import { CLOTH_LINES, LEATHER_LINES, WEAPON_LINES } from '../../src/game/gear';

// SIM_T='{"abilities":{"arcaneBurstPct":3}}' overrides tunables for the run IN MEMORY (what-ifs for the owner's decision; nothing is written to tunables.ts).
if (process.env.SIM_T) {
  for (const [group, vals] of Object.entries(JSON.parse(process.env.SIM_T) as Record<string, Record<string, number>>)) Object.assign((T as unknown as Record<string, Record<string, number>>)[group], vals);
}

// SIM_GEAR='{"leather":0.5,"bow":0.5}' scales, IN MEMORY, the stats a light line RETURNS for the defense it gave up (leather armor: crit chance + attack speed; bow: attack speed; cloth armor and staff: crit
// multiplier + regeneration; crossbow: crit multiplier; scepter: regeneration), to find the dial before the generator (weightBudget.gen.ts) is taught the new target. Nothing is written.
if (process.env.SIM_GEAR) {
  const k = JSON.parse(process.env.SIM_GEAR) as Record<string, number>;
  const scale = (id: string, fields: string[], f: number | undefined): void => {
    if (f === undefined) return;
    const g = getGear(id) as unknown as Record<string, number | undefined>;
    for (const fld of fields) if (g[fld]) g[fld] = g[fld]! * f;
  };
  for (const l of LEATHER_LINES) for (const id of l.ids) scale(id, ['critChance', 'attackSpeedBonus'], k.leather);
  for (const l of CLOTH_LINES) for (const id of l.ids) scale(id, ['critMultBonus', 'hpRegenPct'], k.cloth);
  const fieldsOf: Record<string, string[]> = { bow: ['attackSpeedBonus'], crossbow: ['critMultBonus'], staff: ['critMultBonus'], scepter: ['hpRegenPct'] };
  for (const l of WEAPON_LINES) for (const id of l.ids) scale(id, fieldsOf[l.line], k[l.line]);
}
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HUNT_HOURS = 4;
const HUNT_STARTS = Number(process.env.CLASS_STARTS ?? 6);
const BOSSES = [25, 50, 75, 100];

interface Tier {
  label: string;
  tier: number;
  level: number;
  refine: number;
  hunts: [string, HuntingDepth][];
}
const TIERS: Tier[] = [
  { label: 'T2 +4 (nível 20)', tier: 2, level: 20, refine: 4, hunts: [['blood_marsh', 'shallow']] },
  { label: 'T3 +8 (nível 45)', tier: 3, level: 45, refine: 8, hunts: [['demon_rift', 'shallow']] },
  { label: 'T6 +8 (nível 100)', tier: 6, level: 100, refine: 8, hunts: [['blood_abyss', 'shallow'], ['blood_abyss', 'deep']] },
];
const ONLY_TIER = process.env.CLASS_TIER ? Number(process.env.CLASS_TIER) : 0;

// SIM_MIX='{"archer":{"off":0.6,"weapon":0.3},"mage":{"off":0.7}}': a change of COMPOSITION at constant CP, in memory. "off" multiplies the offense the armor of the class returns (leather: crit chance + attack speed; cloth:
// crit multiplier + regeneration), "weapon" the one its weapon returns (bow: attack speed; staff: crit multiplier). The class hero's CP is then brought back to what it was before (the CP the Hunting sub-level gate reads) by
// adding max HP to the armor and the helmet of each tier, found by bisection: less damage per second, more effective HP, the same CP. Nothing is written.
const MIX = process.env.SIM_MIX ? (JSON.parse(process.env.SIM_MIX) as Record<string, { off?: number; weapon?: number }>) : {};
const MIX_REF: Record<string, number> = {}; // class:tier -> CP before the mix
function applyMix(): void {
  const classes = CLASS_MAIN.filter((b) => MIX[b.cls]);
  if (classes.length === 0) return;
  for (const t of TIERS) for (const b of classes) MIX_REF[`${b.cls}:${t.tier}`] = computeCP(classHero(b, t.level, t.tier, t.refine, 'real'));
  // SIM_T_LATE: tunables changed AFTER the reference CP was taken, so the CP the mix restores is the one BEFORE the change (a stronger ability raises the CP; the offense has to give that back)
  if (process.env.SIM_T_LATE) {
    for (const [group, vals] of Object.entries(JSON.parse(process.env.SIM_T_LATE) as Record<string, Record<string, number>>)) Object.assign((T as unknown as Record<string, Record<string, number>>)[group], vals);
  }
  const scaleItem = (id: string, fields: string[], f: number): void => {
    const g = getGear(id) as unknown as Record<string, number | undefined>;
    for (const fld of fields) if (g[fld]) g[fld] = g[fld]! * f;
  };
  for (const b of classes) {
    const m = MIX[b.cls];
    const lines = b.cls === 'archer' ? LEATHER_LINES : CLOTH_LINES;
    for (const l of lines) for (const id of l.ids) scaleItem(id, b.cls === 'archer' ? ['critChance', 'attackSpeedBonus'] : ['critMultBonus', 'hpRegenPct'], m.off ?? 1);
    const wl = WEAPON_LINES.find((x) => x.line === b.weapon)!;
    for (const id of wl.ids) scaleItem(id, b.cls === 'archer' ? ['attackSpeedBonus'] : ['critMultBonus'], m.weapon ?? 1);
  }
  for (const t of TIERS) {
    for (const b of classes) {
      // the defense the five pieces keep of their plate twin (maxHp and resistance) goes up by the same factor on all of them; bisection on that factor finds the one that gives the reference CP back
      const lines = b.cls === 'archer' ? LEATHER_LINES : CLOTH_LINES;
      const items = lines.map((l) => getGear(l.ids[t.tier - 1]) as unknown as { maxHp?: number; resistance?: number });
      const base = items.map((g) => ({ hp: g.maxHp, res: g.resistance }));
      const cpAt = (x: number): number => {
        items.forEach((g, i) => {
          if (base[i].hp) g.maxHp = base[i].hp! * (1 + x);
          if (base[i].res) g.resistance = base[i].res! * (1 + x);
        });
        return computeCP(classHero(b, t.level, t.tier, t.refine, 'real'));
      };
      const ref = MIX_REF[`${b.cls}:${t.tier}`];
      if (cpAt(0) > ref * 1.005) console.log(`MIX: ${b.cls} T${t.tier} is ${((cpAt(0) / ref - 1) * 100).toFixed(1)}% above its reference CP with no extra defense: cut more offense`);
      let lo = 0;
      let hi = process.env.SIM_MIX_CAP ? Number(process.env.SIM_MIX_CAP) : 3;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (cpAt(mid) < ref) lo = mid;
        else hi = mid;
      }
      const x = (lo + hi) / 2;
      console.log(`MIX: ${b.cls} T${t.tier}: the defense kept goes from 60 % to ${(60 * (1 + x)).toFixed(0)} % of the plate twin's (CP ${Math.round(cpAt(x))} vs ${Math.round(ref)} before)`);
    }
  }
}
applyMix();

interface Hunt {
  kph: number;
  xph: number;
  ceiling: number;
  defeats: number;
}
// `pin`: hunt at that sub-level only (no promotion), so two classes are compared on the same monster.
function hunt(h: SaveData, zoneId: string, depth: HuntingDepth, pin?: number): Hunt {
  const savedSubLevels = T.hunting.subLevels;
  if (pin) (T.hunting as { subLevels: number }).subLevels = pin;
  try {
    let kills = 0;
    let xp = 0;
    let hours = 0;
    let ceiling = 0;
    let defeats = 0;
    for (let i = 0; i < HUNT_STARTS; i++) {
      const t0 = NOW + i * 7_919_000;
      let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: t0 };
      if (pin) save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, depth)]: { ceiling: pin, promotionWins: 0 } } };
      save = { ...save, huntSession: buildHuntSession(save, t0) };
      const st = computeHuntingStatus(save, t0 + HUNT_HOURS * 3600 * 1000);
      const hrs = st.pendingMs / 3600_000;
      kills += st.kills;
      xp += st.xpReady;
      hours += hrs;
      ceiling += st.ceilingSubLevel;
      defeats += st.defeats;
    }
    return { kph: kills / hours, xph: xp / hours, ceiling: ceiling / HUNT_STARTS, defeats: defeats / HUNT_STARTS };
  } finally {
    (T.hunting as { subLevels: number }).subLevels = savedSubLevels;
  }
}

const stagePower = (floor: number): number => {
  const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
  return stageEnemyHp(def, floor) * stageEnemyDmg(def, floor);
};
// Deepest floor of an unbroken run of cleared floors (the probe of depthHero.depthReach, on the floors of the Dungeon).
function floorReach(h: SaveData, max = 100): number {
  let reach = 0;
  for (let f = 1; f <= max; f++) {
    if (clearRate(h, f, NOW, 3) < 2 / 3) break;
    reach = f;
  }
  return reach;
}

// One Dungeon expedition from floor 1: the floors cleared in a single continuous run (no potions, the hero retreats under 20 % HP like the sim player, the bosses are already banked so the run goes on), averaged over
// seeded runs. It adds what the single-floor probe above cannot see: the attrition between floors (waveHeal, regeneration, the heals of the rotation).
function runReach(h: SaveData, n = 12): number {
  const save: SaveData = { ...h, highestDungeonFloor: 1, dungeonCheckpoints: [25, 50, 75, 100] };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += withSeededRandom(7000 + i, () => runDungeon(save, NOW).stages);
  return sum / n;
}

// How much better class `i` is than the mean of the other two, for a "bigger is better" series.
const lead = (v: number[], i: number): number => v[i] / ((v.reduce((a, b) => a + b, 0) - v[i]) / (v.length - 1)) - 1;
const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

interface Row {
  hunt: Hunt[];
  huntPinned: Hunt[];
  pin: number;
  bossMs: number[][]; // [boss][class]
  bossTaken: number[][];
  reach: number[];
  run: number[];
  cp: number[];
}

function measure(t: Tier, builds: ClassBuild[], mode: HeroMode, zone: [string, HuntingDepth]): Row {
  // CLASS_ROT='{"archer":["arrow_rain","true_shot","dodge"]}': a rotation chosen by hand for a class (ablations: what one ability is worth)
  const rotOf = process.env.CLASS_ROT ? (JSON.parse(process.env.CLASS_ROT) as Record<string, string[]>) : {};
  const heroes = builds.map((b) => {
    const h = classHero(b, t.level, t.tier, t.refine, mode);
    return rotOf[b.cls] ? ({ ...h, rotation: rotOf[b.cls] } as unknown as SaveData) : h;
  });
  const hunts = heroes.map((h) => hunt(h, zone[0], zone[1]));
  const pin = Math.max(1, Math.floor(Math.min(...hunts.map((x) => x.ceiling))));
  const huntPinned = heroes.map((h) => hunt(h, zone[0], zone[1], pin));
  const bossMs: number[][] = [];
  const bossTaken: number[][] = [];
  for (const f of BOSSES) {
    const ks = heroes.map((h) => bossKill(h, f, NOW));
    bossMs.push(ks.map((k) => k.ms));
    bossTaken.push(ks.map((k) => k.taken));
  }
  const reach = heroes.map((h) => floorReach(h));
  const run = heroes.map((h) => runReach(h));
  return { hunt: hunts, huntPinned, pin, bossMs, bossTaken, reach, run, cp: heroes.map((h) => computeCP(h)) };
}

// Class i against the others on the three axes, as the doc states the target.
function axes(r: Row, i: number) {
  const kph = lead(r.huntPinned.map((x) => x.kph), i);
  const xph = lead(r.huntPinned.map((x) => x.xph), i);
  const kphNat = lead(r.hunt.map((x) => x.kph), i);
  // boss: speed = 1 / time, averaged over the four biome bosses
  const bossLead = r.bossMs.map((ms) => lead(ms.map((m) => 1 / m), i)).reduce((a, b) => a + b, 0) / r.bossMs.length;
  const reach = lead(r.reach, i);
  const power = lead(r.reach.map((f) => stagePower(Math.max(1, f))), i);
  const run = lead(r.run, i);
  const runPower = lead(r.run.map((f) => stagePower(Math.max(1, Math.round(f)))), i);
  return { kph, xph, kphNat, bossLead, reach, power, run, runPower };
}

describe('class balance', () => {
  it('prints the three axes', () => {
    const out: string[] = [];
    for (const t of TIERS) {
      if (ONLY_TIER && t.tier !== ONLY_TIER) continue;
      out.push('', `## ${t.label}`, '');
      out.push('### Os heróis', '', '| classe | arma | peças | CP | vida | dano base | intervalo (ms) | crítico | mult. crítico | regen/tick | redução | dano/s (golpe básico, com crítico) | vida efetiva | afinidade | rotação | disparos em 12 andares |', '| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |');
      for (const b of CLASS_MAIN) {
        const h = classHero(b, t.level, t.tier, t.refine, 'real');
        const c = buildCombatStats(h);
        const ids = Object.values(h.equipped).filter(Boolean) as string[];
        const aff = affinityBonuses(ids.map((id) => getGear(h.gearInstances[id].templateId)));
        const fired = withSeededRandom(1, () => runDungeon({ ...h, highestDungeonFloor: 1 }, NOW, 12).abilityFired);
        out.push(`| ${b.id} | ${getGear(h.gearInstances[h.equipped.weapon!].templateId).id} | ${ids.length} | ${Math.round(computeCP(h))} | ${Math.round(c.maxHp)} | ${Math.round(c.dmgBase)} | ${c.heroMs} | ${c.critChance.toFixed(3)} | ${c.critMult.toFixed(2)} | ${(c.hpRegenPct * 100).toFixed(2)}% | ${c.reduction.toFixed(2)} | ${Math.round((c.dmgBase * (1 + c.critChance * (c.critMult - 1)) * 1000) / c.heroMs)} | ${Math.round(c.maxHp * (1 + c.reduction))} | ${aff.weight}${aff.classActive ? ' (classe ativa)' : ''} | ${(c.rotation ?? []).join(', ')} | ${JSON.stringify(fired)} |`);
      }
      out.push('');
      for (const zone of t.hunts) {
        const r = measure(t, CLASS_MAIN, 'real', zone);
        out.push(`### ${t.label}: caça em ${zone[0]} (${zone[1]}), ${HUNT_HOURS} h x ${HUNT_STARTS} sementes`, '');
        out.push('| classe | CP | kills/h (livre) | sub-nível médio | kills/h (fixo no sub-nível ' + r.pin + ') | XP/h (fixo) | derrotas (fixo) |', '| --- | --: | --: | --: | --: | --: | --: |');
        CLASS_MAIN.forEach((b, i) => out.push(`| ${b.id} | ${Math.round(r.cp[i])} | ${r.hunt[i].kph.toFixed(0)} | ${r.hunt[i].ceiling.toFixed(1)} | ${r.huntPinned[i].kph.toFixed(0)} | ${r.huntPinned[i].xph.toFixed(0)} | ${r.huntPinned[i].defeats.toFixed(1)} |`));
        out.push('');
        out.push(`### ${t.label}: chefes de bioma (tempo de morte em s, herói imortal) e andar mais fundo`, '');
        out.push('| classe | ' + BOSSES.map((f) => `chefe ${f} (s)`).join(' | ') + ' | dano que o chefe daria (vidas de herói) no 25 / 100 | andar mais fundo (andar a andar) | andares numa expedição contínua | CP recomendado do andar seguinte / CP do herói |', '| --- | ' + BOSSES.map(() => '--:').join(' | ') + ' | --: | --: | --: | --: |');
        CLASS_MAIN.forEach((b, i) =>
          out.push(
            `| ${b.id} | ${r.bossMs.map((ms) => (ms[i] / 1000).toFixed(1)).join(' | ')} | ${r.bossTaken[0][i].toFixed(2)} / ${r.bossTaken[3][i].toFixed(2)} | ${r.reach[i]} | ${r.run[i].toFixed(1)} | ${(recommendedCpForFloor(r.reach[i] + 1) / r.cp[i]).toFixed(2)} |`,
          ),
        );
        out.push('');
        out.push(`### ${t.label} / ${zone[0]} (${zone[1]}): cada classe contra a média das outras duas (alvo: o eixo próprio +15 a +20 %, os outros dois no máximo -10 %)`, '');
        out.push('| classe | caça kills/h (fixo) | caça XP/h (fixo) | caça kills/h (livre) | chefe (velocidade) | masmorra (andares, andar a andar) | masmorra (poder do inimigo no alvo) | masmorra (expedição contínua, andares) | masmorra (expedição, poder do inimigo) |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: |');
        CLASS_MAIN.forEach((b, i) => {
          const a = axes(r, i);
          out.push(`| ${b.id} | ${pct(a.kph)} | ${pct(a.xph)} | ${pct(a.kphNat)} | ${pct(a.bossLead)} | ${pct(a.reach)} | ${pct(a.power)} | ${pct(a.run)} | ${pct(a.runPower)} |`);
        });
        out.push('');
      }
    }
    console.log(out.join('\n'));
  });

  it('prints the same table with the parts of the real player switched on one at a time, and the other weapon of each family', () => {
    const out: string[] = [];
    for (const t of TIERS) {
      if (ONLY_TIER && t.tier !== ONLY_TIER) continue;
      const zone = t.hunts[0];
      out.push('', `## Decomposição, ${t.label}, ${zone[0]} (${zone[1]})`, '');
      out.push('| conjunto | classe | kills/h fixo vs. as outras | chefe (velocidade) vs. as outras | andares vs. as outras | expedição vs. as outras | kills/h | chefe 50 (s) | andar | expedição |', '| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: |');
      const sets: [string, ClassBuild[], HeroMode][] = [
        ['só equipamento', CLASS_MAIN, 'gear'],
        ['+ rotação', CLASS_MAIN, 'rotation'],
        ['+ afinidade (real)', CLASS_MAIN, 'real'],
        ['real, outra arma', CLASS_VARIANTS, 'real'],
      ];
      for (const [name, builds, mode] of sets) {
        const r = measure(t, builds, mode, zone);
        builds.forEach((b, i) => {
          const a = axes(r, i);
          out.push(`| ${name} | ${b.id} | ${pct(a.kph)} | ${pct(a.bossLead)} | ${pct(a.reach)} | ${pct(a.run)} | ${r.huntPinned[i].kph.toFixed(0)} | ${(r.bossMs[1][i] / 1000).toFixed(1)} | ${r.reach[i]} | ${r.run[i].toFixed(1)} |`);
        });
      }
      out.push('');
    }
    console.log(out.join('\n'));
  });
});
