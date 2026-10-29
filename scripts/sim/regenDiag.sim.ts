// DIAGNOSIS (measures, changes nothing in the game): is hpRegenPct worth anything, and where? The scepter's own regeneration measured as ZERO on the Hunting / boss / floor-reach axes (variantDiag.sim.ts), but 37 pieces
// pay for that stat (the whole cloth line, the grimoires, the Vitality Ring) and the floor-reach metric is a coarse step. This tool looks closer, with the Dungeon where the hero really takes damage:
//   A. a sweep of the regeneration of EVERYTHING the hero wears (the gear templates, the cloth set bonuses, the mage affinity) times k = 0 / 1 / 2 / 4 / 8, on the three classes: floors cleared in one climb
//      started a few floors under the wall (no potions; HP carries between waves and floors), the win rate of the wall floor and the one below it, damage taken, and the Hunting kills an hour;
//   B. the Vitality Ring (0.9 %/s, its only stat) against no relic, on the three axes and on the climb;
//   C. the mage's cloth line: what its regeneration is worth, and what the same Combat Power spent on crit damage would give.
// In-memory what-ifs only, restored after each. Run:  npx vitest run --config vitest.sim.config.ts regenDiag --silent=false --reporter=default
import { it } from 'vitest';
import { buildCombatStats, buildHuntSession, computeCP, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import { CLOTH_LINES, GEAR, getGear } from '../../src/game/gear';
import { SET_DEFS } from '../../src/game/setBonuses';
import T from '../../src/game/tunables';
import { bossKill } from './duel';
import { runDungeon, withSeededRandom } from './driver';
import { CLASS_MAIN, classHero } from './classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const NL = String.fromCharCode(10);
const BOSSES = [25, 50, 75, 100];

interface Cfg {
  label: string;
  tier: number;
  level: number;
  refine: number;
  zone: string;
  pin: number;
  climbFrom: number; // a floor a few under the wall of the weakest class, where a climb starts
}
const CFGS: Cfg[] = [
  { label: 'T4 +8', tier: 4, level: 62, refine: 8, zone: 'blood_abyss', pin: 5, climbFrom: 45 },
  { label: 'T6 +8', tier: 6, level: 100, refine: 8, zone: 'blood_abyss', pin: 7, climbFrom: 70 },
];

function kph(h: SaveData, c: Cfg): number {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = c.pin;
  try {
    let kills = 0;
    let hours = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = NOW + i * 7_919_000;
      let s: SaveData = { ...h, activeHuntingZone: c.zone, activeHuntingDepth: 'shallow', huntingOfflineStart: t0 };
      s = { ...s, huntProgress: { ...s.huntProgress, [huntProgressKey(c.zone, 'shallow')]: { ceiling: c.pin, promotionWins: 0 } } };
      s = { ...s, huntSession: buildHuntSession(s, t0) };
      const st = computeHuntingStatus(s, t0 + 4 * 3600 * 1000);
      kills += st.kills;
      hours += st.pendingMs / 3600_000;
    }
    return kills / hours;
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}
const bossSpeed = (h: SaveData): number => BOSSES.reduce((a, f) => a + 1 / bossKill(h, f, NOW, 12).ms, 0) / BOSSES.length;

// floors cleared by ONE climb from `from` (no potions; the run object carries HP between waves and floors), averaged over `n` seeds, and the HP the enemies took off per run
function climb(h: SaveData, from: number, n = 16): { floors: number; taken: number } {
  let floors = 0;
  let taken = 0;
  for (let i = 0; i < n; i++) {
    const run = withSeededRandom(900 + i, () => runDungeon({ ...h, highestDungeonFloor: from }, NOW, 60));
    floors += run.stages;
    taken += run.damageTaken;
  }
  return { floors: floors / n, taken: taken / n };
}
function winRate(h: SaveData, floor: number, n = 24): number {
  let w = 0;
  for (let i = 0; i < n; i++) if (withSeededRandom(900 + i, () => runDungeon({ ...h, highestDungeonFloor: floor }, NOW, 1)).stages >= 1) w++;
  return w / n;
}
function reach(h: SaveData): number {
  let r = 0;
  for (let f = 1; f <= 100; f++) {
    if (winRate(h, f, 3) < 2 / 3) break;
    r = f;
  }
  return r;
}

// regeneration of everything the hero wears, times k (gear templates, set bonuses, mage affinity); returns the undo
function scaleRegen(k: number): () => void {
  const undo: (() => void)[] = [];
  for (const g of GEAR) {
    const t = g as unknown as { hpRegenPct?: number };
    if (t.hpRegenPct) {
      const old = t.hpRegenPct;
      t.hpRegenPct = old * k;
      undo.push(() => (t.hpRegenPct = old));
    }
  }
  for (const def of Object.values(SET_DEFS)) {
    for (const e of def.effects) {
      if (e.hpRegenPct) {
        const old = e.hpRegenPct;
        e.hpRegenPct = old * k;
        undo.push(() => (e.hpRegenPct = old));
      }
    }
  }
  const aff = T.affinity as unknown as Record<string, number>;
  for (const key of ['mageRegen5', 'mageRegenClass']) {
    const old = aff[key];
    aff[key] = old * k;
    undo.push(() => (aff[key] = old));
  }
  return () => undo.forEach((u) => u());
}

it('measures what regeneration is worth', () => {
  const out: string[] = [];

  // ---- A. the sweep
  out.push('## A. Regeneração de TUDO o que o herói veste vezes k (0, 1 = hoje, 2, 4, 8)', '');
  out.push('| equipamento | classe | k | regen total/s | andares numa subida | dano sofrido/subida | vitória no andar-parede | vitória no andar abaixo | alcance | kills/h |', '| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: |');
  for (const c of CFGS) {
    // the wall of each class at k = 1
    const walls = CLASS_MAIN.map((b) => reach(classHero(b, c.level, c.tier, c.refine, 'real')));
    CLASS_MAIN.forEach((b, i) => {
      for (const k of [0, 1, 2, 4, 8]) {
        const undo = scaleRegen(k);
        try {
          const h = classHero(b, c.level, c.tier, c.refine, 'real');
          const cl = climb(h, c.climbFrom);
          const wall = walls[i] + 1;
          const regenTotal = (buildCombatStats(h).hpRegenPct ?? 0) * (1000 / T.battle.effectTickMs);
          out.push(`| ${c.label} | ${b.cls} | ${k} | ${(regenTotal * 100).toFixed(2)}% | ${cl.floors.toFixed(1)} | ${cl.taken.toFixed(0)} | ${(winRate(h, wall) * 100).toFixed(0)}% | ${(winRate(h, walls[i]) * 100).toFixed(0)}% | ${reach(h)} | ${kph(h, c).toFixed(0)} |`);
        } finally {
          undo();
        }
      }
    });
  }

  // ---- B. the Vitality Ring
  out.push('', '## B. Anel de Vitalidade (única propriedade: 0,9%/s de regeneração) contra nenhuma relíquia', '');
  out.push('| equipamento | classe | relíquia | kills/h | chefe (velocidade) | andares numa subida | alcance |', '| --- | --- | --- | --: | --: | --: | --: |');
  for (const c of CFGS) {
    for (const b of CLASS_MAIN) {
      for (const relic of [null, 'ring_vitality', 'amulet_swiftness']) {
        const base = classHero(b, c.level, c.tier, c.refine, 'real');
        const h = { ...base, equipped: { ...base.equipped, relic } } as unknown as SaveData;
        out.push(`| ${c.label} | ${b.cls} | ${relic ?? 'nenhuma'} | ${kph(h, c).toFixed(0)} | ${(bossSpeed(h) * 1e6).toFixed(3)} | ${climb(h, c.climbFrom).floors.toFixed(1)} | ${reach(h)} |`);
      }
    }
  }

  // ---- C. the cloth line
  out.push('', '## C. A linha de tecido do mago: o que a regeneração dela custa e o que a mesma conta em dano crítico daria', '');
  out.push('| equipamento | variante | CP | regen total/s | kills/h | chefe (velocidade) | andares numa subida | alcance |', '| --- | --- | --: | --: | --: | --: | --: | --: |');
  const mage = CLASS_MAIN[2];
  for (const c of CFGS) {
    const heroNow = (): SaveData => classHero(mage, c.level, c.tier, c.refine, 'real');
    const clothIds = CLOTH_LINES.map((l) => l.ids[c.tier - 1]);
    const cm = (id: string): number => (getGear(id) as unknown as { critMultBonus?: number }).critMultBonus ?? 0;
    const rg = (id: string): number => (getGear(id) as unknown as { hpRegenPct?: number }).hpRegenPct ?? 0;
    const regenSum = clothIds.reduce((a, id) => a + rg(id), 0);
    const critSum = clothIds.reduce((a, id) => a + cm(id), 0);
    const row = (label: string, h: SaveData, cp: number): void => {
      out.push(`| ${c.label} | ${label} | ${cp} | ${((buildCombatStats(h).hpRegenPct ?? 0) * (1000 / T.battle.effectTickMs) * 100).toFixed(2)}% | ${kph(h, c).toFixed(0)} | ${(bossSpeed(h) * 1e6).toFixed(3)} | ${climb(h, c.climbFrom).floors.toFixed(1)} | ${reach(h)} |`);
    };
    out.push(`| ${c.label} | (as 5 peças de tecido do tier: regeneração ${(regenSum * 100).toFixed(2)}%/s somada, dano crítico ${(critSum * 100).toFixed(1)}% somado) | | | | | | |`);
    const cpFull = computeCP(heroNow());
    row('hoje', heroNow(), cpFull);
    const undo = scaleRegen(0);
    try {
      row('sem NENHUMA regeneração', heroNow(), computeCP(heroNow()));
    } finally {
      undo();
    }
    // the same CP put on crit damage: scale the five cloth crit multipliers until the CP without regeneration is back at the CP with it
    const undo2 = scaleRegen(0);
    const saved = clothIds.map((id) => cm(id));
    try {
      let lo = 1;
      let hi = 4;
      for (let it2 = 0; it2 < 14; it2++) {
        const mid = (lo + hi) / 2;
        clothIds.forEach((id, i) => ((getGear(id) as unknown as { critMultBonus: number }).critMultBonus = saved[i] * mid));
        if (computeCP(heroNow()) < cpFull) lo = mid;
        else hi = mid;
      }
      const f = (lo + hi) / 2;
      clothIds.forEach((id, i) => ((getGear(id) as unknown as { critMultBonus: number }).critMultBonus = saved[i] * f));
      row(`sem regeneração, o mesmo CP em dano crítico (x${f.toFixed(2)})`, heroNow(), computeCP(heroNow()));
    } finally {
      clothIds.forEach((id, i) => ((getGear(id) as unknown as { critMultBonus: number }).critMultBonus = saved[i]));
      undo2();
    }
  }

  console.log(out.join(NL));
}, 3_000_000);
