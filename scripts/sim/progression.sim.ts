// Headless progression simulation of a brand-new free-to-play player. Run it with `npm run sim`; it prints a report
// (Markdown, in Portuguese) and asserts nothing. It is NOT part of `npm test`.
//
// What it does: plays 14 simulated days for several seeds by calling the REAL game functions in src/game (combat stats,
// enemy scaling, wave rewards, the hunting session simulation, forge / upgrade reducers, deliveries, quests, loading and
// migrating the save...). Math.random is replaced by a seeded generator for the duration of a run. The only code that is
// mirrored instead of imported is orchestration that lives inside React components (see driver.ts).
//
// THE POLICY (a sensible but not optimal new player)
//   Visits   2 per day (~09:00 and ~21:00, each jittered by up to +-90 min per seed). Each visit "reloads" the game
//            (normalizeSave, which also resets the daily quests and Dungeon sessions), collects whatever was running,
//            claims quests, spends, plays Dungeon sessions, takes a delivery order and starts one background activity.
//   Dungeon  uses ALL free sessions every day (T.dungeon.freeSessionsPerDay, half at each visit). Each session starts from
//            highestDungeonFloor, fights until death, and only retreats (a) at an unclaimed biome-boss floor (25/50/75/100)
//            to bank the milestone, (b) when HP is <= 20% after a floor (a player sees the bar), (c) at floor 100. Extra
//            sessions (shards) are never bought. Worn gear (durability < 40) is repaired before a session.
//            Auto-potion works as in the game; the player keeps up to 5 small potions (30 gold each) bought ONLY with gold beyond
//            what the next gear craft needs, and not while the last two sessions died without clearing a floor.
//   Hunting  the default background activity: the highest-XP zone unlocked by Dungeon floor, at the deepest depth the
//            hero's CP allows (the UI's recommended-CP rule). Capped by the zone's offline cap (4-8 h), the Hunting Pouch
//            (3 slots at tier 1, 4 at tier 2 ...) and the bag, all exactly as coded.
//   Mining / Woodcutting
//            only when the next gear craft (or the next refine) is missing ore / wood. Activities that still have
//            something to cover take turns (the one done longest ago goes first). A locked ore tier is reached by mining
//            the best unlocked one.
//   Garden   not used: no gear recipe needs a garden plant.
//   Gear     the next craft is the lowest-tier piece still missing in any of the six slots, ties broken weapon > armor > gloves >
//            helmet > boots > ring (player.ts CRAFT_PRIORITY); missing intermediate materials go through the Furnace / Tannery /
//            Carpentry / Alchemy recipes; crafting consumes lower-tier pieces exactly as the forge does; a craft blocked on gems buys
//            them with shards. It equips whatever has the best computeCP in each slot, refines the equipped WEAPON and ARMOR with gold
//            that is not earmarked for the next craft (the four extra slots stay +0), and sockets spare gems into those two. The Hunting
//            Pouch upgrade (300 gold + 20 scrap) is bought as soon as it is affordable, before anything else.
//   Points   3 per level, spread 35% STR / 30% VIT / 20% AGI / 15% RES.
//   Orders   one delivery at a time: the best-paying affordable offer that fits in 12 h and does not take materials the
//            next craft needs. No rerolls, no tickets.
//   Quests   every completed daily / achievement quest is claimed.
//   Not driven: Battle Pass (the free-track claim lives inside App.tsx), Garden, potion crafting, elixirs, reforge,
//            extra Dungeon sessions with shards, the legacy Expedition, salvage of old gear, the shop beyond HP potions.
//
// Two scenarios run on the same seeds: A (the policy above, as asked) and B (A plus one short visit of up to 15 min after
// the first visit of the day, only while the next craft / the pouch upgrade still needs common Hunting drops - see
// player.ts PlayerOptions). B is the sensitivity check for a player who learned the short-hunt trick; after the 3-slot pouch it
// should not be meaningfully faster than A (the report prints the A-B gap on every milestone). The balance targets T1-T8 of
// docs/BALANCE_CHANGES.md are measured on A and printed in the 'Metas' sections.
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { computeCP, defaultSave } from '../../src/game/engine';
import { applyHuntStart, applyHuntStop } from '../../src/game/huntLifecycle';
import { HUNT_POUCH_TIERS } from '../../src/game/huntPouch';
import { dungeonEnemyKindForFloor, MAX_DUNGEON_FLOOR, recommendedCpForFloor } from '../../src/game/dungeon';
import { getEnemyDef } from '../../src/game/enemies';
import { stageEnemyDmg, stageEnemyHp } from '../../src/game/waves';
import T from '../../src/game/tunables';
import { mulberry32, runDungeon, withSeededRandom } from './driver';
import { buildHero } from './ladder';
import { DaySnapshot, FirstEvent, Player, PlayerOptions } from './player';

const SEEDS = 20;
const DAYS = 21;
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();

interface Run {
  days: DaySnapshot[];
  first: Partial<Record<FirstEvent, number>>;
  atFloor25: Player['atFloor25'];
  atBoss25: Player['atBoss25'];
}

function playOne(seed: number, opts: PlayerOptions): Run {
  return withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const player = new Player((t) => vi.setSystemTime(t), START, opts);
    for (let d = 0; d < DAYS; d++) player.playDay(d, jitter);
    return { days: player.snapshots, first: player.first, atFloor25: player.atFloor25, atBoss25: player.atBoss25 };
  });
}

// ---- stats --------------------------------------------------------------------------------------------------------

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
function median(xs: number[]): number {
  const s = sorted(xs);
  if (s.length === 0) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const num = (n: number, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/,/g, ' ') : '-';
function cell(xs: number[], digits = 0): string {
  if (xs.length === 0) return '-';
  const s = sorted(xs);
  const lo = num(s[0], digits);
  const hi = num(s[s.length - 1], digits);
  const mid = num(median(xs), digits);
  return lo === hi ? mid : `${mid} (${lo}–${hi})`;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sum = (o: Record<string, number>, keys?: string[]) => Object.entries(o).reduce((a, [k, v]) => a + (!keys || keys.includes(k) ? v : 0), 0);

function table(header: string[], rows: string[][]): string[] {
  return [`| ${header.join(' | ')} |`, `| ${header.map((_, i) => (i === 0 ? '--:' : '---')).join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
}

// Median over ALL seeds, a seed that never got there counting as "later than the horizon".
function medianDay(runs: Run[], ev: FirstEvent): string {
  const m = median(runs.map((r) => r.first[ev] ?? Infinity));
  return Number.isFinite(m) ? num(m, 1) : `depois do dia ${DAYS}`;
}

// ---- report -------------------------------------------------------------------------------------------------------

type Section = 'progress' | 'xp' | 'dungeon' | 'gold' | 'materials' | 'firsts' | 'day1';

function report(runs: Run[], sections: Section[]): string[] {
  const out: string[] = [];
  const dayIdx = Array.from({ length: DAYS }, (_, i) => i);
  const at = (d: number) => runs.map((r) => r.days[d]);
  const has = (x: Section) => sections.includes(x);

  out.push(`Seeds: ${runs.length} · dias simulados: ${DAYS} · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).`);
  out.push('');

  if (has('progress')) {
    out.push('#### Progressão');
    out.push('');
    out.push(
      ...table(
        ['Dia', 'Nível', 'CP', 'Andar (a próxima sessão começa nele)', 'Tier arma', 'Tier armadura'],
        dayIdx.map((d) => [
          String(d + 1),
          cell(at(d).map((x) => x.level)),
          cell(at(d).map((x) => x.cp)),
          cell(at(d).map((x) => x.floor)),
          cell(at(d).map((x) => x.weaponTier)),
          cell(at(d).map((x) => x.armorTier)),
        ]),
      ),
    );
    out.push('');
  }

  if (has('xp')) {
    out.push('#### XP do personagem por dia e por fonte (mediana entre seeds)');
    out.push('');
    out.push(
      ...table(
        ['Dia', 'XP total', 'Masmorra', 'Caça', 'Pedidos'],
        dayIdx.map((d) => {
          const x = (keys?: string[]) => at(d).map((v) => sum(v.ledger.xpIn, keys));
          return [String(d + 1), cell(x()), cell(x(['masmorra'])), cell(x(['caça'])), cell(x(['pedido']))];
        }),
      ),
    );
    out.push('');
  }

  if (has('dungeon')) {
    out.push('#### Sessões de Masmorra (velocidade 1x)');
    out.push('');
    out.push(
      ...table(
        ['Dia', 'Andares limpos / sessão', 'Segundos / sessão', 'Sessões que terminam em derrota'],
        dayIdx.map((d) => {
          const perSeed = (f: (x: DaySnapshot) => number[]) => at(d).map((x) => mean(f(x))).filter(Number.isFinite);
          const deaths = at(d)
            .map((x) => (x.sessions.length ? (x.sessions.filter((q) => q.outcome === 'defeat').length / x.sessions.length) * 100 : NaN))
            .filter(Number.isFinite);
          return [
            String(d + 1),
            cell(perSeed((x) => x.sessions.map((q) => q.stages)), 1),
            cell(perSeed((x) => x.sessions.map((q) => q.seconds)), 0),
            `${num(mean(deaths))}%`,
          ];
        }),
      ),
    );
    out.push('');
  }

  if (has('gold')) {
    out.push('#### Ouro por dia (por fonte), gasto e saldo');
    out.push('');
    out.push(
      ...table(
        ['Dia', 'Ganho total', 'Masmorra', 'Marcos 25/50/..', 'Caça', 'Pedidos', 'Missões', 'Gasto', 'Saldo final'],
        dayIdx.map((d) => {
          const g = (keys: string[]) => at(d).map((x) => sum(x.ledger.goldIn, keys));
          return [
            String(d + 1),
            cell(at(d).map((x) => sum(x.ledger.goldIn))),
            cell(g(['masmorra'])),
            cell(g(['marcos'])),
            cell(g(['caça'])),
            cell(g(['pedido'])),
            cell(g(['missões'])),
            cell(at(d).map((x) => sum(x.ledger.goldOut))),
            cell(at(d).map((x) => x.gold)),
          ];
        }),
      ),
    );
    out.push('');
    const sinkKeys = Array.from(new Set(runs.flatMap((r) => r.days.flatMap((x) => Object.keys(x.ledger.goldOut)))));
    const total = (k: string) => median(runs.map((r) => r.days.reduce((a, x) => a + (x.ledger.goldOut[k] ?? 0), 0)));
    out.push(`Ouro gasto nos ${DAYS} dias, por destino (mediana entre seeds): ` + (sinkKeys.map((k) => `${k} ${num(total(k))}`).join(' · ') || 'nada'));
    out.push('');
  }

  if (has('materials')) {
    out.push('#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade');
    out.push('');
    out.push(
      ...table(
        ['Dia', 'Comum', 'Incomum', 'Raro', 'Perdido na bolsa de caça', 'Horas caçando', 'Horas minerando', 'Horas cortando'],
        dayIdx.map((d) => [
          String(d + 1),
          cell(at(d).map((x) => x.ledger.mats.common)),
          cell(at(d).map((x) => x.ledger.mats.uncommon)),
          cell(at(d).map((x) => x.ledger.mats.rare)),
          cell(at(d).map((x) => x.ledger.lost)),
          cell(at(d).map((x) => x.ledger.hours.hunt), 1),
          cell(at(d).map((x) => x.ledger.hours.mine), 1),
          cell(at(d).map((x) => x.ledger.hours.wood), 1),
        ]),
      ),
    );
    out.push('');
    out.push(
      'Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.',
    );
    out.push('');
  }

  if (has('firsts')) {
    out.push('#### Primeira vez que acontece (dia; 1 = primeiro dia)');
    out.push('');
    const labels: [FirstEvent, string][] = [
      ['firstCraft', 'Primeira peça forjada'],
      ['firstRefine', 'Primeiro refino bem-sucedido'],
      ['floor10', 'Checkpoint do andar 10 vencido'],
      ['floor25', 'Marco do andar 25 recebido (chefe do bioma 1 vencido)'],
      ['zone2', 'Segunda zona de caça liberada'],
      ['floor50', 'Chegou ao andar 50 (a próxima sessão começa nele)'],
      ['boss50', 'Marco do andar 50 recebido (chefe do bioma 2 vencido)'],
    ];
    out.push(
      ...table(
        ['Evento', 'Dia (mediana de todas as seeds)', 'Mín–máx (só quem chegou)', `Seeds que chegam lá em ${DAYS} dias`],
        labels.map(([ev, label]) => {
          const days = runs.map((r) => r.first[ev]).filter((x): x is number => x !== undefined);
          return [label, medianDay(runs, ev), days.length ? `${Math.min(...days)}–${Math.max(...days)}` : '-', `${days.length}/${runs.length}`];
        }),
      ),
    );
    out.push('');
  }

  if (has('day1')) {
    out.push('#### Dia 1: em que andar terminam as três primeiras sessões');
    out.push('');
    const day1 = runs.map((r) => r.days[0].sessions);
    const rows: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const ends = day1.map((x) => x[i]?.endFloor).filter((v): v is number => v !== undefined);
      const cps = day1.map((x) => x[i]?.cpAtStart).filter((v): v is number => v !== undefined);
      const secs = day1.map((x) => x[i]?.seconds).filter((v): v is number => v !== undefined);
      const hist = new Map<number, number>();
      for (const e of ends) hist.set(e, (hist.get(e) ?? 0) + 1);
      const histText = [...hist.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([f, n]) => `${f}×${n}`)
        .join(' ');
      const so = sorted(ends);
      const q = (pc: number) => so[Math.min(so.length - 1, Math.floor(pc * so.length))];
      rows.push([String(i + 1), cell(cps), cell(secs), `${so[0]} / ${q(0.25)} / ${num(median(ends), 1)} / ${q(0.75)} / ${so[so.length - 1]}`, histText]);
    }
    out.push(...table(['Sessão', 'CP ao começar', 'Segundos', 'Andar final: mín / p25 / mediana / p75 / máx', 'Histograma (andar×seeds)'], rows));
    out.push('');
    out.push('"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).');
    out.push('');
  }
  return out;
}

// ---- hunting pouch diagnostic -------------------------------------------------------------------------------------

interface PouchStats {
  sessions: number;
  noTypeLost: number; // sessions in which no dropped material type was lost to the pouch
  allThree: number; // sessions in which all three material types dropped
  lostUnits: number; // units lost to the pouch, summed over the sessions
}

// A fresh hero (no policy involved) hunts demon_glade / shallow for different lengths of time with the starter pouch (tier 1).
// A zone drops 3 material types; every type that drops must fit a slot.
function pouchDiagnostic(): { lines: string[]; t1: PouchStats } {
  const slots = HUNT_POUCH_TIERS[0].slots;
  const rows: string[][] = [];
  let t1: PouchStats = { sessions: 0, noTypeLost: 0, allThree: 0, lostUnits: 0 };
  for (const mins of [15, 30, 60, 120, 240]) {
    let drop = 0;
    let claw = 0;
    let core = 0;
    const stats: PouchStats = { sessions: 20, noTypeLost: 0, allThree: 0, lostUnits: 0 };
    for (let i = 0; i < stats.sessions; i++) {
      const start = new Date(2026, 5, 1, 9, i * 7, 0).getTime();
      vi.setSystemTime(start);
      const base = { ...defaultSave(), huntingOfflineStart: start };
      const stopped = applyHuntStop(applyHuntStart(base, 'demon_glade', 'shallow', start)!, start + mins * 60000)!;
      const p = stopped.pendingHuntReward!;
      drop += p.drops.leather_scrap ?? 0;
      claw += p.drops.demon_claw ?? 0;
      core += p.drops.demon_core ?? 0;
      const lostUnits = p.lost.reduce((a, l) => a + l.count, 0);
      stats.lostUnits += lostUnits;
      if (p.lost.length === 0) stats.noTypeLost++;
      if (['leather_scrap', 'demon_claw', 'demon_core'].every((m) => (p.drops[m as keyof typeof p.drops] ?? 0) > 0)) stats.allThree++;
    }
    if (mins === 240) t1 = stats;
    const n = stats.sessions;
    rows.push([
      `${mins} min${mins >= 60 ? ` (${mins / 60} h)` : ''}`,
      num(drop / n, 1),
      num(claw / n, 1),
      num(core / n, 1),
      num(stats.lostUnits / n, 1),
      `${stats.noTypeLost}/${n}`,
      `${stats.allThree}/${n}`,
    ]);
  }
  return {
    t1,
    lines: [
      `#### Diagnóstico: Bolsa de Caça do tier 1 (${slots} espaços) numa caça em demon_glade raso (herói novo, 20 horários de início)`,
      '',
      ...table(
        ['Duração da caça', 'Farrapos sorteados', 'Garras sorteadas', 'Núcleos sorteados', 'Unidades perdidas por falta de espaço', 'Sessões sem nenhum tipo perdido', 'Sessões em que os 3 tipos caem'],
        rows,
      ),
      '',
    ],
  };
}

// ---- floor 25 boss diagnostics ------------------------------------------------------------------------------------

const BOSS_NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

// What the sim players did: the save the first time the hero was about to face the floor-25 boss is replayed against it.
function bossFirstContact(label: string, runs: Run[]): string[] {
  const rows: string[][] = [];
  const replay = runs.map((r) => {
    if (!r.atFloor25) return NaN;
    let w = 0;
    const n = 8;
    for (let i = 0; i < n; i++) {
      vi.setSystemTime(r.atFloor25.now);
      if (withSeededRandom(500 + i, () => runDungeon(r.atFloor25!.save, r.atFloor25!.now, 1)).stages >= 1) w++;
    }
    return (w / n) * 100;
  });
  const arrived = runs.filter((r) => r.atFloor25);
  const beaten = runs.filter((r) => r.atBoss25);
  rows.push([
    'Acaba de limpar o andar 24 (primeira chance contra o chefe)',
    cell(arrived.map((r) => r.atFloor25!.day)),
    cell(arrived.map((r) => computeCP(r.atFloor25!.save))),
    '-',
    `${num(median(replay.filter(Number.isFinite)))}% de vitória`,
  ]);
  rows.push([
    'Vence o chefe pela primeira vez',
    cell(beaten.map((r) => r.atBoss25!.day)),
    cell(beaten.map((r) => r.atBoss25!.cp)),
    beaten.length ? `arma T${num(median(beaten.map((r) => r.atBoss25!.weaponTier)))} / armadura T${num(median(beaten.map((r) => r.atBoss25!.armorTier)))}, nível ${cell(beaten.map((r) => r.atBoss25!.level))}` : '-',
    `${beaten.length}/${runs.length} seeds`,
  ]);
  return [`#### Chefe do andar 25 visto pelos jogadores simulados (${label})`, '', ...table(['Momento', 'Dia', 'CP', 'Equipamento', 'Resultado'], rows), ''];
}

// Hand-built heroes (attributes spread by the policy weights, common gear at a fixed refine level, no potions, full HP).
function bossDiagnostic(): string[] {
  const rows: string[][] = [];
  const builds: [string, number, number, number][] = [
    ['Roupa de trapos + Clava', 30, 0, 0],
    ['Roupa de trapos + Clava', 60, 0, 0],
    ['Roupa de trapos + Clava', 100, 0, 0],
    ['Tier 1 (adaga + couro) +0', 40, 1, 0],
    ['Tier 1 +8', 40, 1, 8],
    ['Tier 1 +8', 60, 1, 8],
    ['Tier 2 (espada + cota) +0', 40, 2, 0],
    ['Tier 2 +4', 40, 2, 4],
    ['Tier 2 +8', 40, 2, 8],
    ['Tier 2 +8', 60, 2, 8],
    ['Tier 3 (montante + placas) +0', 40, 3, 0],
    ['Tier 3 +8', 40, 3, 8],
    ['Tier 3 +8', 60, 3, 8],
    ['Tier 4 (lâmina dourada + égide) +8', 100, 4, 8],
  ];
  const wins = (hero: ReturnType<typeof buildHero>, floor: number, maxStages: number, need: number) => {
    let w = 0;
    const n = 20;
    for (let i = 0; i < n; i++) {
      vi.setSystemTime(BOSS_NOW);
      if (withSeededRandom(1000 + i, () => runDungeon({ ...hero, highestDungeonFloor: floor }, BOSS_NOW, maxStages)).stages >= need) w++;
    }
    return `${w}/${n}`;
  };
  for (const [label, level, tier, refine] of builds) {
    const hero = buildHero(level, tier, refine);
    rows.push([label, String(level), num(computeCP(hero)), wins(hero, 1, 24, 24), wins(hero, 24, 1, 1), wins(hero, 25, 1, 1)]);
  }
  return [
    `#### Diagnóstico: chefe do andar 25 (CP recomendado pelo jogo: ${recommendedCpForFloor(25)}; andar 24: ${recommendedCpForFloor(24)}) contra heróis montados à mão, sem poções, de HP cheio`,
    '',
    ...table(['Equipamento', 'Nível', 'CP', 'Sobe do andar 1 ao 24 de uma vez', 'Limpa o andar 24', 'Vence o chefe do 25'], rows),
    '',
  ];
}

// ---- enemy curve (T7) ---------------------------------------------------------------------------------------------

const stagePower = (floor: number) => {
  const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
  return { hp: stageEnemyHp(def, floor), dmg: stageEnemyDmg(def, floor) };
};

function enemyCurve(): { lines: string[]; worst: number } {
  const rows: string[][] = [];
  let worst = Infinity;
  for (const boss of [25, 50, 75, 100]) {
    const prev = stagePower(boss - 1);
    const cur = stagePower(boss);
    const next = boss < MAX_DUNGEON_FLOOR ? stagePower(boss + 1) : null;
    const f = (p: { hp: number; dmg: number } | null) => (p ? `${num(p.hp)} × ${num(p.dmg)} = ${num(p.hp * p.dmg)}` : '-');
    const ratio = next ? (next.hp * next.dmg) / (prev.hp * prev.dmg) : NaN;
    if (next) worst = Math.min(worst, ratio);
    rows.push([String(boss), f(prev), f(cur), f(next), next ? num(ratio, 2) : '-', num((cur.hp * cur.dmg) / (prev.hp * prev.dmg), 1)]);
  }
  return {
    worst,
    lines: [
      '#### Curva de inimigos em volta dos chefes: HP × dano por golpe',
      '',
      ...table(['Chefe (andar)', 'Andar anterior (N−1)', 'Chefe (N)', 'Andar seguinte (N+1)', '(N+1) / (N−1)', 'Chefe / (N−1)'], rows),
      '',
    ],
  };
}

// ---- targets ------------------------------------------------------------------------------------------------------

const ok = (b: boolean) => (b ? 'ok' : 'FORA DA META');

function metas(a: Run[], b: Run[], pouch: PouchStats, curveWorst: number): string[] {
  const lvl = (runs: Run[], d: number) => runs.map((r) => r.days[d].level);
  const inBand = (xs: number[], lo: number, hi: number) => median(xs) >= lo && median(xs) <= hi;
  const dayMed = (runs: Run[], ev: FirstEvent) => median(runs.map((r) => r.first[ev] ?? Infinity));
  const firstEnd = (runs: Run[]) => runs.map((r) => r.days[0].sessions[0]?.endFloor ?? 0);
  const arrivalWins = (runs: Run[]): string => {
    const xs = runs.filter((r) => r.atFloor25).map((r) => {
      let w = 0;
      for (let i = 0; i < 8; i++) {
        vi.setSystemTime(r.atFloor25!.now);
        if (withSeededRandom(500 + i, () => runDungeon(r.atFloor25!.save, r.atFloor25!.now, 1)).stages >= 1) w++;
      }
      return (w / 8) * 100;
    });
    return `${num(median(xs))}%`;
  };
  const firstDay = (runs: Run[], ev: FirstEvent) => Math.min(...runs.map((r) => r.first[ev] ?? Infinity));
  const nReach = (runs: Run[], ev: FirstEvent) => runs.filter((r) => r.first[ev] !== undefined).length;
  const t6 = (runs: Run[]) =>
    `chegada: primeira seed no dia ${firstDay(runs, 'floor50')}, mediana ${medianDay(runs, 'floor50')}; chefe 50: primeira seed no dia ${firstDay(runs, 'boss50')}, mediana ${medianDay(runs, 'boss50')}, ${nReach(runs, 'boss50')}/${runs.length} em ${DAYS} dias`;
  const rows: string[][] = [];
  const t4 = (runs: Run[]) => `${cell(lvl(runs, 0))} / ${cell(lvl(runs, 2))} / ${cell(lvl(runs, 13))}`;
  const t4ok = (runs: Run[]) => [inBand(lvl(runs, 0), 10, 16), inBand(lvl(runs, 2), 20, 28), inBand(lvl(runs, 13), 45, 60)];
  rows.push([
    'T1',
    'Caça de 4 h com a Bolsa do tier 1 não perde nenhum tipo de material',
    `${pouch.noTypeLost}/${pouch.sessions} sessões sem perda (${pouch.allThree}/${pouch.sessions} com os 3 tipos), ${pouch.lostUnits} unidades perdidas`,
    '(mesma Bolsa)',
    ok(pouch.noTypeLost === pouch.sessions && pouch.lostUnits === 0),
  ]);
  rows.push([
    'T2',
    'Primeira sessão da conta nova termina no andar ≥ 8; checkpoint do andar 10 no dia 1',
    `andar ${cell(firstEnd(a))}; checkpoint 10 no dia ${medianDay(a, 'floor10')}`,
    `andar ${cell(firstEnd(b))}; dia ${medianDay(b, 'floor10')}`,
    ok(median(firstEnd(a)) >= 8 && dayMed(a, 'floor10') <= 1),
  ]);
  rows.push(['T3', 'Primeira peça forjada no dia 1 ou 2', `dia ${medianDay(a, 'firstCraft')}`, `dia ${medianDay(b, 'firstCraft')}`, ok(dayMed(a, 'firstCraft') <= 2)]);
  const t4a = t4ok(a);
  rows.push([
    'T4',
    'Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–28 / 45–60)',
    t4(a),
    t4(b),
    t4a.every(Boolean) ? 'ok' : `dia 1 ${ok(t4a[0])}; dia 3 ${ok(t4a[1])}; dia 14 ${ok(t4a[2])}`,
  ]);
  rows.push([
    'T5',
    'Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde',
    `dia ${medianDay(a, 'floor25')}; vitória ao chegar: ${arrivalWins(a)}`,
    `dia ${medianDay(b, 'floor25')}; vitória ao chegar: ${arrivalWins(b)}`,
    ok(dayMed(a, 'floor25') >= 4 && dayMed(a, 'floor25') <= 6),
  ]);
  rows.push([
    'T6',
    'Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16',
    t6(a),
    t6(b),
    `chegada ${ok(firstDay(a, 'floor50') >= 10 && firstDay(b, 'floor50') >= 10)}; chefe ${ok(firstDay(a, 'boss50') >= 12 && firstDay(a, 'boss50') <= 16 && firstDay(b, 'boss50') >= 12 && firstDay(b, 'boss50') <= 16)}`,
  ]);
  rows.push([
    'T7',
    'Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75',
    `menor razão (N+1)/(N−1): ${num(curveWorst, 2)}`,
    '-',
    ok(curveWorst >= 1),
  ]);
  rows.push(['T8', 'Derrota mantém 75% do ouro da sessão', `${num(T.battle.defeatGoldKept * 100)}%`, '-', ok(T.battle.defeatGoldKept === 0.75)]);

  // B must not be meaningfully faster than A on any milestone (~1.5 days)
  const gap: string[][] = [];
  const evs: [FirstEvent, string][] = [
    ['firstCraft', 'Primeira peça forjada'],
    ['firstRefine', 'Primeiro refino'],
    ['floor10', 'Checkpoint do andar 10'],
    ['floor25', 'Chefe do andar 25'],
    ['zone2', 'Zona de caça 2'],
    ['boss50', 'Chefe do andar 50'],
  ];
  // Median over the seeds that got there (a milestone only part of the seeds reach would otherwise flip on a coin toss).
  const reached = (runs: Run[], ev: FirstEvent) => runs.map((r) => r.first[ev]).filter((x): x is number => x !== undefined);
  for (const [ev, label] of evs) {
    const ra = reached(a, ev);
    const rb = reached(b, ev);
    const d = median(ra) - median(rb);
    gap.push([label, `${num(median(ra), 1)} (${ra.length}/${a.length})`, `${num(median(rb), 1)} (${rb.length}/${b.length})`, Number.isNaN(d) ? '-' : num(d, 1), ok(!(d > 1.5))]);
  }
  return [
    '| Meta | Critério | Cenário A (pedido) | Cenário B (sensibilidade) | Resultado |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    '#### B contra A: o Cenário B não pode ser mais de ~1,5 dia mais rápido que o A em nenhum marco',
    '',
    ...table(['Marco', 'Dia no A (mediana de quem chegou; seeds que chegaram)', 'Dia no B', 'A − B (dias)', 'Resultado'], gap),
    '',
  ];
}

describe('progression simulation', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it(`plays ${DAYS} days x ${SEEDS} seeds, in two scenarios, and prints the report`, () => {
    const started = performance.now();
    const a: Run[] = [];
    const b: Run[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      a.push(playOne(seed, {}));
      b.push(playOne(seed, { shortHunt: true }));
    }
    const all: Section[] = ['progress', 'xp', 'dungeon', 'gold', 'materials', 'firsts', 'day1'];
    const pouch = pouchDiagnostic();
    const curve = enemyCurve();
    const text = [
      '### Metas de balanceamento (T1 a T8)',
      '',
      ...metas(a, b, pouch.t1, curve.worst),
      '### Cenário A (pedido): 2 visitas por dia',
      '',
      ...report(a, all),
      '### Cenário B (sensibilidade): igual ao A, mais uma visita curta (até 15 min, parando a caça quando a prévia da bolsa ainda guarda os farrapos) logo depois da primeira, enquanto faltarem itens comuns de caça',
      '',
      ...report(b, all),
      '### Diagnóstico da bolsa de caça',
      '',
      ...pouch.lines,
      '### Diagnóstico do chefe do andar 25',
      '',
      ...bossFirstContact('Cenário A', a),
      ...bossFirstContact('Cenário B', b),
      ...bossDiagnostic(),
      '### Diagnóstico da curva de inimigos',
      '',
      ...curve.lines,
    ];
    console.log('\n' + text.join('\n') + '\n');
    console.log(`(simulação levou ${((performance.now() - started) / 1000).toFixed(1)}s)`);
  });
});
