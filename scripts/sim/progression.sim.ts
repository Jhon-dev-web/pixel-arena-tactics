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
//   Garden   plants and harvests at every visit (what the next craft needs first, then the plants the tonic recipes need, then the longest plant that fits
//            the 12 h between visits). Rings, leather gloves and boots need Garden plants (Garden 3.0).
//   Tonics   keeps one of each combat tonic (Stoneskin, Precision, Haste, Fortune) and the Gatherer Brew in the bag, crafted only with gold beyond the next
//            craft, drinks the combat ones before a Dungeon session that starts within 6 floors of an unclaimed boss, and the brew before a gathering session.
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
//   Not driven: Battle Pass (the free-track claim lives inside App.tsx), Fertilizer, Whetstone Oil, the other potions and elixirs, reforge,
//            extra Dungeon sessions with shards, the legacy Expedition, salvage of old gear, the shop beyond HP potions.
//
// Two scenarios run on the same seeds: A (the policy above, as asked) and B (A plus one short visit of up to 15 min after
// the first visit of the day, only while the next craft / the pouch upgrade still needs common Hunting drops - see
// player.ts PlayerOptions). B is the sensitivity check for a player who learned the short-hunt trick; after the 3-slot pouch it
// should not be meaningfully faster than A (the report prints the A-B gap on every milestone). The balance targets T1-T8 of
// docs/BALANCE_CHANGES.md are measured on A and printed in the 'Metas' sections.
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { computeCP } from '../../src/game/engine';
import { dungeonEnemyKindForFloor, MAX_DUNGEON_FLOOR, recommendedCpForFloor } from '../../src/game/dungeon';
import { getEnemyDef } from '../../src/game/enemies';
import { stageEnemyDmg, stageEnemyHp } from '../../src/game/waves';
import T from '../../src/game/tunables';
import { mulberry32, runDungeon, withSeededRandom } from './driver';
import { buildHero } from './ladder';
import { DaySnapshot, FirstEvent, Player, PlayerOptions } from './player';
import { allGearGates } from './professions';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import { PLANTS } from '../../src/game/garden';

const SEEDS = Number(process.env.SIM_SEEDS ?? 20);
const DAYS = Number(process.env.SIM_DAYS ?? 21);
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
      ['firstRelic', 'Primeira relíquia forjada e equipada'],
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
    out.push('Dia em que cada seed chegou ao andar 50 (ordenado): ' + sorted(runs.map((r) => r.first.floor50 ?? Infinity)).map((d) => (Number.isFinite(d) ? String(d) : '-')).join(' '));
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

// ---- professions (docs/PROFESSIONS_AUDIT.md) ------------------------------------------------------------------------

// First day (1-based) a per-day series reaches `level`; Infinity when it never does inside the horizon.
const firstDayAt = (run: Run, pick: (d: DaySnapshot) => number, level: number): number => {
  const i = run.days.findIndex((d) => pick(d) >= level);
  return i < 0 ? Infinity : i + 1;
};
const dayCell = (xs: number[]): string => {
  const reached = xs.filter(Number.isFinite);
  if (reached.length < xs.length / 2) return `> dia ${DAYS} (${reached.length}/${xs.length})`;
  return reached.length === xs.length ? num(median(reached), 1) : `${num(median(reached), 1)} (${reached.length}/${xs.length})`;
};

function professionReport(runs: Run[]): string[] {
  const out: string[] = [];
  const dayIdx = Array.from({ length: DAYS }, (_, i) => i);
  const at = (d: number) => runs.map((r) => r.days[d]);
  out.push('#### Nível das profissões por dia (mediana entre seeds, mín–máx)');
  out.push('');
  out.push(
    ...table(
      ['Dia', 'Mineração', 'Lenhador', 'Jardinagem', 'Horas min.', 'Horas cort.'],
      dayIdx.map((d) => [
        String(d + 1),
        cell(at(d).map((x) => x.skills.mining)),
        cell(at(d).map((x) => x.skills.woodcutting)),
        cell(at(d).map((x) => x.skills.gardening)),
        cell(at(d).map((x) => x.ledger.hours.mine), 1),
        cell(at(d).map((x) => x.ledger.hours.wood), 1),
      ]),
    ),
  );
  out.push('');
  out.push('#### Unidades coletadas por dia, por tier (mediana entre seeds)');
  out.push('');
  const ids = [...ORE_TIERS.map((o) => o.id), ...WOOD_TIERS.map((o) => o.id), ...PLANTS.map((p) => p.material)];
  const used = ids.filter((id) => runs.some((r) => r.days.some((x) => (x.ledger.units[id] ?? 0) > 0)));
  out.push(...table(['Dia', ...used], dayIdx.map((d) => [String(d + 1), ...used.map((id) => cell(at(d).map((x) => x.ledger.units[id] ?? 0)))])));
  out.push('');
  out.push('#### Dia em que cada tier / planta é liberado (nível da profissão atingido no fim do dia; mediana entre seeds)');
  out.push('');
  const unlockRows: string[][] = [];
  for (const o of ORE_TIERS) unlockRows.push(['Mineração', o.id, String(o.requiredLevel), dayCell(runs.map((r) => firstDayAt(r, (x) => x.skills.mining, o.requiredLevel)))]);
  for (const w of WOOD_TIERS) unlockRows.push(['Lenhador', w.id, String(w.requiredLevel), dayCell(runs.map((r) => firstDayAt(r, (x) => x.skills.woodcutting, w.requiredLevel)))]);
  for (const pl of PLANTS) unlockRows.push(['Jardinagem', pl.id, String(pl.requiredLevel), dayCell(runs.map((r) => firstDayAt(r, (x) => x.skills.gardening, pl.requiredLevel)))]);
  out.push(...table(['Profissão', 'Tier / planta', 'Nível exigido', 'Dia'], unlockRows));
  out.push('');
  out.push('#### Porta de profissão contra porta de nível do personagem, por receita de equipamento (a cadeia inteira: peças de tier menor, Fornalha, Carpintaria, Horta)');
  out.push('');
  const gateRows: string[][] = [];
  const flags: string[] = [];
  for (const g of allGearGates().sort((a, b) => a.charLevel - b.charLevel || a.tier - b.tier || a.slot.localeCompare(b.slot))) {
    const charDay = runs.map((r) => firstDayAt(r, (x) => x.level, g.charLevel));
    const profDay = runs.map((r) =>
      Math.max(firstDayAt(r, (x) => x.skills.mining, g.mining), firstDayAt(r, (x) => x.skills.woodcutting, g.woodcutting), firstDayAt(r, (x) => x.skills.gardening, g.gardening)),
    );
    const cd = median(charDay);
    const pd = median(profDay);
    let flag = 'ok';
    if (g.mining <= 1 && g.woodcutting <= 1 && g.gardening <= 1) flag = '-';
    else if (Number.isFinite(pd) && Number.isFinite(cd) && pd - cd > 1) flag = `BLOQUEIO (+${num(pd - cd, 1)} d)`;
    else if (!Number.isFinite(pd) && Number.isFinite(cd)) flag = 'BLOQUEIO (nunca em ' + DAYS + ' d)';
    else if (Number.isFinite(pd) && Number.isFinite(cd) && cd - pd > 7) flag = `SEM SENTIDO (${num(cd - pd, 1)} d antes)`;
    if (flag.startsWith('BLOQ') || flag.startsWith('SEM')) flags.push(g.id);
    gateRows.push([
      g.id,
      `T${g.tier} ${g.slot}`,
      String(g.charLevel),
      `${g.mineTier ?? '-'} (${g.mining})`,
      `${g.woodTier ?? '-'} (${g.woodcutting})`,
      String(g.gardening || '-'),
      dayCell(charDay),
      dayCell(profDay),
      flag,
    ]);
  }
  out.push(...table(['Receita', 'Tier / slot', 'Nível do personagem', 'Minério (nv)', 'Madeira (nv)', 'Jardinagem', 'Dia: nível do personagem', 'Dia: profissões', 'Veredito'], gateRows));
  out.push('');
  out.push(`Receitas marcadas: ${flags.length === 0 ? 'nenhuma' : flags.join(', ')}.`);
  out.push('');
  return out;
}

// Day (median over seeds) on which each slot first holds a piece of tier 1, 2 and 3: the gear timeline the Garden recipes must not slip.
function slotTimeline(runs: Run[]): string[] {
  const rows = ['weapon', 'armor', 'gloves', 'boots', 'ring', 'helmet'].map((slot) => [
    slot,
    ...[1, 2, 3].map((tier) => dayCell(runs.map((r) => firstDayAt(r, (d) => d.tiers[slot] ?? 0, tier)))),
  ]);
  return table(['Slot', 'Tier 1', 'Tier 2', 'Tier 3'], rows);
}

// Garden 3.0 tonic budget: the same 20 seeds with and without the policy crafting / drinking tonics. Day of the first floor-25 boss kill and of the first arrival
// on floor 50, per seed (sorted), plus the player levels and CP at day 14.
function tonicBudget(withT: Run[], without: Run[]): string[] {
  const days = (runs: Run[], ev: FirstEvent) => sorted(runs.map((r) => r.first[ev] ?? Infinity)).map((d) => (Number.isFinite(d) ? String(d) : '-')).join(' ');
  return [
    ...table(
      ['', 'Chefe 25 vencido (dia por seed)', 'Andar 50 alcançado (dia por seed)', 'CP no dia 14 (mediana)', 'Nível no dia 14'],
      [
        ['Com tônicos (A)', days(withT, 'floor25'), days(withT, 'floor50'), num(median(withT.map((r) => r.days[Math.min(13, DAYS - 1)].cp))), num(median(withT.map((r) => r.days[Math.min(13, DAYS - 1)].level)))],
        ['Sem tônicos', days(without, 'floor25'), days(without, 'floor50'), num(median(without.map((r) => r.days[Math.min(13, DAYS - 1)].cp))), num(median(without.map((r) => r.days[Math.min(13, DAYS - 1)].level)))],
      ],
    ),
    '',
    ...table(
      ['Dia em que a porta abre (mediana)', 'Com tônicos (A)', 'Sem tônicos'],
      [
        ['iron (Mineração 10)', 'mining', 10],
        ['silver (Mineração 25)', 'mining', 25],
        ['gold_ore (Mineração 50)', 'mining', 50],
        ['oak_wood (Lenhador 10)', 'woodcutting', 10],
        ['ebony_wood (Lenhador 25)', 'woodcutting', 25],
        ['elven_wood (Lenhador 50)', 'woodcutting', 50],
      ].map(([label, skill, lvl]) => [
        String(label),
        ...[withT, without].map((runs) => dayCell(runs.map((r) => firstDayAt(r, (d) => d.skills[skill as 'mining' | 'woodcutting'], lvl as number)))),
      ]),
    ),
    '',
  ];
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

function metas(a: Run[], curveWorst: number): string[] {
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
  const t4ok = (runs: Run[]) => [inBand(lvl(runs, 0), 10, 16), inBand(lvl(runs, 2), 20, 29), inBand(lvl(runs, 13), 45, 60)];
  rows.push([
    'T2',
    'Primeira sessão da conta nova termina no andar ≥ 8; checkpoint do andar 10 no dia 1',
    `andar ${cell(firstEnd(a))}; checkpoint 10 no dia ${medianDay(a, 'floor10')}`,
    '-',
    ok(median(firstEnd(a)) >= 8 && dayMed(a, 'floor10') <= 1),
  ]);
  rows.push(['T3', 'Primeira peça forjada no dia 1 ou 2', `dia ${medianDay(a, 'firstCraft')}`, '-', ok(dayMed(a, 'firstCraft') <= 2)]);
  const t4a = t4ok(a);
  rows.push([
    'T4',
    'Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–29 / 45–60)',
    t4(a),
    '-',
    t4a.every(Boolean) ? 'ok' : `dia 1 ${ok(t4a[0])}; dia 3 ${ok(t4a[1])}; dia 14 ${ok(t4a[2])}`,
  ]);
  rows.push([
    'T5',
    'Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde',
    `dia ${medianDay(a, 'floor25')}; vitória ao chegar: ${arrivalWins(a)}`,
    '-',
    ok(dayMed(a, 'floor25') >= 4 && dayMed(a, 'floor25') <= 6),
  ]);
  rows.push([
    'T6',
    'Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16',
    t6(a),
    '-',
    `chegada ${ok(firstDay(a, 'floor50') >= 10)}; chefe ${ok(firstDay(a, 'boss50') >= 12 && firstDay(a, 'boss50') <= 16)}`,
  ]);
  rows.push([
    'T7',
    'Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75',
    `menor razão (N+1)/(N−1): ${num(curveWorst, 2)}`,
    '-',
    ok(curveWorst >= 1),
  ]);
  rows.push(['T8', 'Derrota mantém 75% do ouro da sessão', `${num(T.battle.defeatGoldKept * 100)}%`, '-', ok(T.battle.defeatGoldKept === 0.75)]);

  return ['| Meta | Critério | Cenário A (pedido) | Resultado |', '| --- | --- | --- | --- |', ...rows.map((r) => `| ${r.slice(0, 3).join(' | ')} | ${r[4]} |`), ''];
}

describe('progression simulation', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it(`plays ${DAYS} days x ${SEEDS} seeds, in several scenarios, and prints the report`, () => {
    const started = performance.now();
    const a: Run[] = [];
    const c: Run[] = [];
    const ctl: Run[] = []; // scenario A without the Garden 3.0 tonics: the control of the tonic budget
    for (let seed = 1; seed <= SEEDS; seed++) {
      a.push(playOne(seed, {}));
      c.push(playOne(seed, { garden: true, balanced: true }));
      ctl.push(playOne(seed, { tonics: false }));
    }
    const all: Section[] = ['progress', 'xp', 'dungeon', 'gold', 'materials', 'firsts', 'day1'];
    const curve = enemyCurve();
    const text = [
      '### Metas de balanceamento (T1 a T8)',
      '',
      ...metas(a, curve.worst),
      '### Cenário A (pedido): 2 visitas por dia',
      '',
      ...report(a, all),
      '### Profissões, cenário A (pedido)',
      '',
      ...professionReport(a),
      '### Profissões, cenário C (jogador que também planta e usa a segunda visita do dia para minerar ou cortar)',
      '',
      ...professionReport(c),
      '### Linha do tempo por slot: dia em que a primeira peça de cada tier aparece (cenário A, mediana)',
      '',
      ...slotTimeline(a),
      '',
      '### Controle dos tônicos: cenário A sem tônicos contra cenário A (a mesma seed)',
      '',
      ...tonicBudget(a, ctl),
      '### Diagnóstico do chefe do andar 25',
      '',
      ...bossFirstContact('Cenário A', a),
      ...bossDiagnostic(),
      '### Diagnóstico da curva de inimigos',
      '',
      ...curve.lines,
    ];
    console.log('\n' + text.join('\n') + '\n');
    console.log(`(simulação levou ${((performance.now() - started) / 1000).toFixed(1)}s)`);
  });
});
