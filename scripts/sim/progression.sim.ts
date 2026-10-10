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
//   Dungeon  uses ALL free sessions every day: 2 at the first visit, 1 at the second. Each session starts from
//            highestDungeonFloor, fights until death, and only retreats (a) at an unclaimed biome-boss floor (25/50/75/100)
//            to bank the milestone, (b) when HP is <= 20% after a floor (a player sees the bar), (c) at floor 100. Extra
//            sessions (shards) are never bought. Worn gear (durability < 40) is repaired before a session.
//            Auto-potion works as in the game; the player keeps up to 5 small potions (30 gold each) when gold allows, but
//            not while the last two sessions died without clearing a floor.
//   Hunting  the default background activity: the highest-XP zone unlocked by Dungeon floor, at the deepest depth the
//            hero's CP allows (the UI's recommended-CP rule). Capped by the zone's offline cap (4-8 h), the 2-slot pouch
//            and the bag, all exactly as coded.
//   Mining / Woodcutting
//            only when the next gear craft (or the next refine) is missing ore / wood. Activities that still have
//            something to cover take turns (the one done longest ago goes first). A locked ore tier is reached by mining
//            the best unlocked one.
//   Garden   not used: no gear recipe needs a garden plant.
//   Gear     the next craft is the lowest-tier weapon / armor slot (weapon on a tie); missing intermediate materials go
//            through the Furnace / Tannery / Carpentry / Alchemy recipes; crafting consumes lower-tier pieces exactly as the
//            forge does; a craft blocked on gems buys them with shards. It equips whatever has the best computeCP, refines
//            the equipped pieces with gold that is not earmarked for the next craft, and sockets spare gems. The Hunting
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
// player.ts PlayerOptions). B exists because A is stuck from day 2: see the pouch diagnostic at the end of the report.
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { computeCP, defaultSave, SaveData, xpToReachLevel } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { applyHuntStart, applyHuntStop } from '../../src/game/huntLifecycle';
import { mulberry32, runDungeon, spendAttributePoints, withSeededRandom } from './driver';
import { DaySnapshot, FirstEvent, Player, PlayerOptions } from './player';

const SEEDS = 20;
const DAYS = 14;
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();

interface Run {
  days: DaySnapshot[];
  first: Partial<Record<FirstEvent, number>>;
}

function playOne(seed: number, opts: PlayerOptions): Run {
  return withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const player = new Player((t) => vi.setSystemTime(t), START, opts);
    for (let d = 0; d < DAYS; d++) player.playDay(d, jitter);
    return { days: player.snapshots, first: player.first };
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

// ---- report -------------------------------------------------------------------------------------------------------

type Section = 'progress' | 'dungeon' | 'gold' | 'materials' | 'firsts' | 'day1';

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
    out.push('Ouro gasto nos 14 dias, por destino (mediana entre seeds): ' + (sinkKeys.map((k) => `${k} ${num(total(k))}`).join(' · ') || 'nada'));
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
      ['floor25', 'Marco do andar 25 recebido (chefe do bioma 1)'],
      ['zone2', 'Segunda zona de caça liberada'],
    ];
    out.push(
      ...table(
        ['Evento', 'Dia (mediana)', 'Mín–máx', 'Seeds que chegam lá em 14 dias'],
        labels.map(([ev, label]) => {
          const days = runs.map((r) => r.first[ev]).filter((x): x is number => x !== undefined);
          return [label, days.length ? num(median(days), 1) : 'nunca', days.length ? `${Math.min(...days)}–${Math.max(...days)}` : '-', `${days.length}/${runs.length}`];
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

// A fresh hero (no policy involved) hunts demon_glade / shallow for different lengths of time. The first Hunting Pouch has 2
// slots and a zone drops 3 materials; when all 3 drop, the rarest two win the slots and the common one is lost.
function pouchDiagnostic(): string[] {
  const rows: string[][] = [];
  for (const mins of [15, 30, 60, 120, 240]) {
    let drop = 0;
    let claw = 0;
    let core = 0;
    let keptScrap = 0;
    let survived = 0;
    const n = 20;
    for (let i = 0; i < n; i++) {
      const start = new Date(2026, 5, 1, 9, i * 7, 0).getTime();
      vi.setSystemTime(start);
      const base = { ...defaultSave(), huntingOfflineStart: start };
      const stopped = applyHuntStop(applyHuntStart(base, 'demon_glade', 'shallow', start)!, start + mins * 60000)!;
      const p = stopped.pendingHuntReward!;
      const lost = p.lost.find((l) => l.itemId === 'leather_scrap')?.count ?? 0;
      drop += p.drops.leather_scrap ?? 0;
      claw += p.drops.demon_claw ?? 0;
      core += p.drops.demon_core ?? 0;
      keptScrap += (p.drops.leather_scrap ?? 0) - lost;
      if ((p.drops.leather_scrap ?? 0) - lost > 0) survived++;
    }
    rows.push([`${mins} min${mins >= 60 ? ` (${mins / 60} h)` : ''}`, num(drop / n, 1), num(claw / n, 1), num(core / n, 1), num(keptScrap / n, 1), `${survived}/${n}`]);
  }
  return [
    '#### Diagnóstico: o que a bolsa de caça de 2 espaços deixa passar (herói novo, demon_glade raso, 20 horários de início)',
    '',
    ...table(['Duração da caça', 'Farrapos sorteados', 'Garras sorteadas', 'Núcleos sorteados', 'Farrapos que entram na bolsa', 'Sessões em que algum farrapo sobrevive'], rows),
    '',
  ];
}

// ---- floor 25 boss diagnostic -------------------------------------------------------------------------------------

// Hand-built heroes (attributes spread by the policy weights, common gear at a fixed refine level, no potions) start a Dungeon
// session directly on floor 25 at full HP; "clears" = the session beats the floor-25 boss before dying.
function bossDiagnostic(): string[] {
  const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
  const rows: string[][] = [];
  const builds: [string, number, string | null, string | null, number][] = [
    ['Roupa de trapos + Clava', 30, null, null, 0],
    ['Roupa de trapos + Clava', 60, null, null, 0],
    ['Roupa de trapos + Clava', 100, null, null, 0],
    ['Tier 1 (adaga + couro) +0', 60, 'bronze_dagger', 'bronze_leather', 0],
    ['Tier 1 +8', 60, 'bronze_dagger', 'bronze_leather', 8],
    ['Tier 2 (espada + cota) +0', 60, 'iron_short_sword', 'iron_chainmail', 0],
    ['Tier 2 +8', 60, 'iron_short_sword', 'iron_chainmail', 8],
    ['Tier 2 +8', 100, 'iron_short_sword', 'iron_chainmail', 8],
    ['Tier 3 (montante + placas) +0', 60, 'steel_greatsword', 'steel_plate', 0],
    ['Tier 3 +8', 60, 'steel_greatsword', 'steel_plate', 8],
    ['Tier 3 +8', 100, 'steel_greatsword', 'steel_plate', 8],
    ['Tier 4 (lâmina dourada + égide) +8', 100, 'gilded_warblade', 'gilded_aegis', 8],
  ];
  for (const [label, level, weapon, armor, refine] of builds) {
    vi.setSystemTime(NOW);
    let hero: SaveData = { ...defaultSave(), xp: xpToReachLevel(level), highestDungeonFloor: 25 };
    const instances = { ...hero.gearInstances };
    const equipped = { ...hero.equipped };
    if (weapon && armor) {
      for (const [slot, tpl] of [['weapon', weapon], ['armor', armor]] as const) {
        const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
        instances[inst.id] = inst;
        equipped[slot] = inst.id;
      }
    }
    hero = spendAttributePoints({ ...hero, gearInstances: instances, equipped });
    let wins = 0;
    const n = 30;
    for (let i = 0; i < n; i++) {
      const run = withSeededRandom(1000 + i, () => runDungeon(hero, NOW));
      if (run.stages >= 1) wins++;
    }
    rows.push([label, String(level), num(computeCP(hero)), `${wins}/${n}`]);
  }
  return [
    '#### Diagnóstico: chefe do andar 25 (recomendado pelo jogo: CP 916) contra heróis montados à mão, sem poções, de HP cheio',
    '',
    ...table(['Equipamento', 'Nível', 'CP', 'Vitórias contra o chefe (30 sorteios)'], rows),
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
    const all: Section[] = ['progress', 'dungeon', 'gold', 'materials', 'firsts', 'day1'];
    const text = [
      '### Cenário A (pedido): 2 visitas por dia',
      '',
      ...report(a, all),
      '### Cenário B (sensibilidade): igual ao A, mais uma visita curta (até 15 min, parando a caça quando a prévia da bolsa ainda guarda os farrapos) logo depois da primeira, enquanto faltarem itens comuns de caça',
      '',
      ...report(b, all),
      '### Diagnóstico da bolsa de caça',
      '',
      ...pouchDiagnostic(),
      '### Diagnóstico do chefe do andar 25',
      '',
      ...bossDiagnostic(),
    ];
    console.log('\n' + text.join('\n') + '\n');
    console.log(`(simulação levou ${((performance.now() - started) / 1000).toFixed(1)}s)`);
  });
});
