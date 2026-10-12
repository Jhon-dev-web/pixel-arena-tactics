// Material flow ledger (Rodada 9, docs/MATERIAL_FLOW.md). Run it with `npm run sim:flow`; it prints Markdown (Portuguese) and asserts nothing.
//
// It plays the progression simulation's scenario A (Guerreiro, 2 check-ins a day, non-owner) and the same player owning the Adventurer Pass for 21 days x
// 20 seeds (SIM_SEEDS / SIM_DAYS override) and reads the per-material ledger the Player keeps (player.ts DayLedger.flow): what entered the inventory (hunting,
// mining, woodcutting, garden), what the stations made, what each sink consumed (forge incl. the tanning / smelting chain, refine+, alchemy, stash upgrades,
// delivery orders, refining dust, merchant, discard), what a claim left behind, and the stock (bag + stash) at the end of the day. Medians over the seeds.
// Also prints: the same ledger by hunting place, Runas and gems earned vs spent, the set-cost tables (static) and the brand-new-hero case.
//
// "Real use" = forge, refine+, alchemy, stash, delivery orders, workshop; "disposal" = dust, merchant, discard, left behind, unexplained.
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { computeHuntingStatus, defaultSave, playerLevel } from '../../src/game/engine';
import { requestHuntStart } from '../../src/game/huntLifecycle';
import { slotsForQty } from '../../src/game/inventory';
import { GEAR } from '../../src/game/gear';
import { GEMS } from '../../src/game/gems';
import { HUNTING_ZONES, HUNTING_DEPTHS } from '../../src/game/huntingZones';
import { RARITIES } from '../../src/game/rarity';
import { MATERIALS, MaterialId } from '../../src/game/materials';
import { REFINING_RECIPES } from '../../src/game/refining';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import T from '../../src/game/tunables';
import { STAGE_FARM, huntRate, setHours, setNeed } from './setCost';
import { mulberry32, withSeededRandom } from './driver';
import { DISPOSAL_SINKS, DaySnapshot, FlowSink, Player, PlayerOptions, REAL_USE_SINKS } from './player';

const SEEDS = Number(process.env.SIM_SEEDS ?? 20);
const DAYS = Number(process.env.SIM_DAYS ?? 21);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();
const STAGES = [1, 3, 7, 14, 21].filter((d) => d <= DAYS);

type Run = DaySnapshot[];
function playOne(seed: number, opts: PlayerOptions): Run {
  return withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const player = new Player((t) => vi.setSystemTime(t), START, opts);
    for (let d = 0; d < DAYS; d++) player.playDay(d, jitter);
    return player.snapshots;
  });
}

// ---- stats ---------------------------------------------------------------------------------------------------------------------------------------------
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const num = (n: number, d = 0): string => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/,/g, ' ') : '-');
const pct = (x: number): string => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '-');
const table = (header: string[], rows: string[][]): string[] => [`| ${header.join(' | ')} |`, `| ${header.map((_, i) => (i === 0 ? '---' : '--:')).join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''];
const nameOf = (m: string): string => m;


// a per-day quantity of one material, over the seeds
type Pick = (d: DaySnapshot) => number;
const inflow = (m: string): Pick => (d) => d.ledger.flow[m].produced + d.ledger.flow[m].refined;
const sink = (m: string, s: FlowSink): Pick => (d) => d.ledger.flow[m].consumed[s];
const real = (m: string): Pick => (d) => REAL_USE_SINKS.reduce((a, s) => a + d.ledger.flow[m].consumed[s], 0);
const disposal = (m: string): Pick => (d) => DISPOSAL_SINKS.reduce((a, s) => a + d.ledger.flow[m].consumed[s], 0) + d.ledger.flow[m].left;

// medians over seeds of the value on day `day` (1-based) and of the sum of days 1..day
const onDay = (runs: Run[], p: Pick, day: number): number => median(runs.map((r) => p(r[day - 1])));
const cum = (runs: Run[], p: Pick, day: number): number => median(runs.map((r) => r.slice(0, day).reduce((a, d) => a + p(d), 0)));

export type Verdict = 'escassa' | 'certa' | 'abundante' | 'inundada' | '-';
// by the share of everything that came in (cumulative to the day) that went to a real use: >= 90% scarce (a bottleneck), 65-90% right, 40-65% plentiful, under 40% flooded
export function verdictOf(realShare: number, inflowUnits: number): Verdict {
  if (!(inflowUnits >= 1)) return '-';
  if (realShare >= 0.9) return 'escassa';
  if (realShare >= 0.65) return 'certa';
  if (realShare >= 0.4) return 'abundante';
  return 'inundada';
}
const share = (runs: Run[], m: string, day: number): number => {
  const i = cum(runs, inflow(m), day);
  return i > 0 ? Math.min(1, cum(runs, real(m), day) / i) : NaN;
};

const HUNT_IDS: MaterialId[] = ['leather_scrap', 'demon_claw', 'demon_core', 'bone_fragment', 'concentrated_blood', 'corrupted_crystal', 'rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart'];
const kindOf = (m: string): string => {
  if (HUNT_IDS.includes(m as MaterialId)) return 'caça';
  if (ORE_TIERS.some((o) => o.id === m)) return 'minério';
  if (WOOD_TIERS.some((w) => w.id === m)) return 'madeira';
  if (REFINING_RECIPES.some((r) => r.output === m)) return 'estação';
  return 'horta';
};
const rarityNote = (m: string): string => {
  for (const z of HUNTING_ZONES) for (const d of z.drops) if (d.material === m) return d.rarity;
  return '';
};

// Window totals (days after the previous stage up to this one) so a median is not a lottery over which day the hunt happened to be claimed.
const winSum = (runs: Run[], p: Pick, from: number, to: number): number => median(runs.map((r) => r.slice(from - 1, to).reduce((a, d) => a + p(d), 0)));
function detailTable(runs: Run[], ids: string[], extra: boolean): string[] {
  const rows: string[][] = [];
  for (const m of ids) {
    for (const [i, day] of STAGES.entries()) {
      const from = i === 0 ? 1 : STAGES[i - 1] + 1;
      const f = (p: Pick) => num(winSum(runs, p, from, day), 0);
      const r = share(runs, m, day);
      const d = cum(runs, disposal(m), day) / Math.max(1, cum(runs, inflow(m), day));
      rows.push([
        day === STAGES[0] ? m : '',
        from === day ? String(day) : `${from}–${day}`,
        f((x) => x.ledger.flow[m].produced),
        ...(extra ? [f((x) => x.ledger.flow[m].refined)] : []),
        f((x) => x.ledger.flow[m].left),
        f(sink(m, 'forge')),
        f(sink(m, 'upgrade')),
        f(sink(m, 'alchemy')),
        f(sink(m, 'stash')),
        f(sink(m, 'delivery')),
        f(sink(m, 'dust')),
        f(sink(m, 'merchant')),
        f(sink(m, 'discard')),
        num(onDay(runs, (x) => x.ledger.flow[m].stockEnd, day), 0),
        pct(r),
        pct(d),
        verdictOf(r, cum(runs, inflow(m), day)),
      ]);
    }
  }
  return table(['material', 'dias (soma)', 'produzido', ...(extra ? ['refinado'] : []), 'perdido', 'forja', 'refino+', 'alquimia', 'baú', 'pedidos', 'pó', 'mercador', 'descarte', 'estoque fim', 'uso real (acum.)', 'descarte+perda (acum.)', 'veredito'], rows);
}

function verdictMatrix(runs: Run[], ids: string[]): string[] {
  const rows = ids.map((m) => [m, kindOf(m), rarityNote(m), ...STAGES.map((d) => `${verdictOf(share(runs, m, d), cum(runs, inflow(m), d))} ${pct(share(runs, m, d))}`)]);
  return table(['material', 'fonte', 'raridade', ...STAGES.map((d) => `dia ${d}`)], rows);
}

function activeIds(runs: Run[]): string[] {
  return MATERIALS.map((d) => d.id as string).filter((m) => runs.some((r) => r.some((d) => d.ledger.flow[m].produced + d.ledger.flow[m].refined > 0)));
}

function zoneTable(runs: Run[]): string[] {
  const keys = new Set<string>();
  for (const r of runs) for (const d of r) for (const k of Object.keys(d.ledger.hunt)) keys.add(k);
  const rows: string[][] = [];
  for (const k of [...keys].sort()) {
    const hours = runs.map((r) => r.reduce((a, d) => a + (d.ledger.hunt[k]?.hours ?? 0), 0)).filter((h) => h > 0);
    if (!hours.length) continue;
    const per = (m: string) => median(runs.map((r) => r.reduce((a, d) => a + (d.ledger.hunt[k]?.units[m] ?? 0), 0) / Math.max(1e-9, r.reduce((a, d) => a + (d.ledger.hunt[k]?.hours ?? 0), 0))).filter((x, i) => runs[i].some((d) => d.ledger.hunt[k])));
    const zone = HUNTING_ZONES.find((z) => z.id === k.split(':')[0]);
    const mats = zone ? zone.drops.map((d) => d.material) : [];
    rows.push([k, `${hours.length}/${runs.length}`, num(median(hours), 1), mats.map((m) => `${m} ${num(per(m), 1)}/h`).join(' · ')]);
  }
  return table(['zona:profundidade', 'seeds que caçaram', 'horas (mediana, 21 dias)', 'unidades por hora (mediana)'], rows);
}

// Uniques delivered by the hunts, per zone: per 100 simulated days, per hunting hour and the expected days of a normal 6 h a day for ANY unique of the zone, for one specific
// unique, and for a specific unique at Epic and at Legendary rarity (rarity is rolled with the forge table, rarity.ts).
function uniqueTable(runs: Run[]): string[] {
  const rows: string[][] = [];
  const days = runs[0].length;
  for (const z of HUNTING_ZONES) {
    const entries = z.uniques ?? [];
    const hours = runs.reduce((a, r) => a + r.reduce((x, d) => x + Object.entries(d.ledger.hunt).filter(([k]) => k.startsWith(z.id + ':')).reduce((y, [, v]) => y + v.hours, 0), 0), 0);
    const found = runs.reduce((a, r) => a + r.reduce((x, d) => x + Object.entries(d.ledger.uniques).filter(([k]) => k.startsWith(z.id + ':')).reduce((y, [, v]) => y + v, 0), 0), 0);
    if (hours <= 0 || entries.length === 0) continue;
    const perHour = found / hours;
    const sum = entries.reduce((a, e) => a + e.chance, 0);
    const rollsPerHour = perHour / sum; // implied economic rolls per hour (chance x rolls = uniques)
    const expectedAny = perHour > 0 ? 1 / (perHour * 6) : Infinity; // days of 6 h of hunting for ANY unique of the zone, from the measured rate
    const rarityShare = (r: string) => RARITIES.find((x) => x.id === r)!.chance;
    rows.push([
      z.id,
      num(hours / runs.length, 0),
      String(found),
      num((found / (runs.length * days)) * 100, 1),
      num(rollsPerHour, 0),
      Number.isFinite(expectedAny) ? num(expectedAny, 0) : '-',
      Number.isFinite(expectedAny) ? num(expectedAny * entries.length, 0) : '-',
      Number.isFinite(expectedAny) ? num((expectedAny * entries.length) / rarityShare('epic'), 0) : '-',
      Number.isFinite(expectedAny) ? num((expectedAny * entries.length) / rarityShare('legendary'), 0) : '-',
    ]);
  }
  return table(['zona', 'horas de caça por jogador', 'únicos achados (todas as seeds)', 'únicos por 100 dias de jogo', 'rolagens/h implícitas', 'dias (6 h/dia) para QUALQUER único', 'dias para um único ESPECÍFICO', '... específico Épico', '... específico Lendário'], rows);
}

function currencyTable(runs: Run[]): string[] {
  const windows: [number, number][] = [[1, 3], [4, 7], [8, 14], [15, 21]].filter(([a]) => a <= DAYS) as [number, number][];
  const out: string[][] = [];
  const tags = (pick: (d: DaySnapshot) => Record<string, number>) => {
    const s = new Set<string>();
    for (const r of runs) for (const d of r) for (const k of Object.keys(pick(d))) s.add(k);
    return [...s].sort();
  };
  const block = (title: string, pick: (d: DaySnapshot) => Record<string, number>) => {
    for (const t of tags(pick)) out.push([title, t, ...windows.map(([a, b]) => num(median(runs.map((r) => r.slice(a - 1, b).reduce((x, d) => x + (pick(d)[t] ?? 0), 0))), 0))]);
  };
  block('Runas ganhas', (d) => d.ledger.currency.shardsIn);
  block('Runas gastas', (d) => d.ledger.currency.shardsOut);
  block('gemas ganhas', (d) => d.ledger.currency.gemsIn);
  block('gemas gastas', (d) => d.ledger.currency.gemsOut);
  const tot = (pick: (d: DaySnapshot) => Record<string, number>) => ([a, b]: [number, number]) => num(median(runs.map((r) => r.slice(a - 1, b).reduce((x, d) => x + Object.values(pick(d)).reduce((y, z) => y + z, 0), 0))), 0);
  out.push(['**Runas ganhas**', 'total', ...windows.map(tot((d) => d.ledger.currency.shardsIn))]);
  out.push(['**Runas gastas**', 'total', ...windows.map(tot((d) => d.ledger.currency.shardsOut))]);
  out.push(['**gemas ganhas**', 'total', ...windows.map(tot((d) => d.ledger.currency.gemsIn))]);
  out.push(['**gemas gastas**', 'total', ...windows.map(tot((d) => d.ledger.currency.gemsOut))]);
  return table(['fluxo', 'origem / uso', ...windows.map(([a, b]) => `dias ${a}–${b}`)], out);
}

// ---- static: what a full 7-slot set costs (setCost.ts) -------------------------------------------------------------------------------------------------
function setTables(): string[] {
  const out: string[] = [];
  const hm = HUNT_IDS as string[];
  const rows: string[][] = [];
  for (let t = 1; t <= 6; t++) {
    const need = setNeed(t);
    rows.push([`T${t}`, ...hm.map((m) => num(need[m] ?? 0, 0))]);
  }
  out.push(...table(['set completo (7 peças)', ...hm], rows));
  const rows2: string[][] = [];
  for (let t = 1; t <= 6; t++) {
    const h = setHours(t);
    const hp = setHours(t, T.battlePass.dropRateMultiplier);
    rows2.push([`T${t}`, `${STAGE_FARM[t - 1].depth} N${STAGE_FARM[t - 1].sub}`, num(h.hunt, 1), num(h.mine, 1), num(h.wood, 1), num(hp.hunt, 1), num(hp.mine, 1), num(hp.wood, 1)]);
  }
  out.push(...table(['tier', 'onde se caça', 'caça (h)', 'mineração (h)', 'lenha (h)', 'caça c/ Passe (h)', 'mineração c/ Passe (h)', 'lenha c/ Passe (h)'], rows2));
  const rows3: string[][] = [];
  for (let t = 1; t <= 6; t++) {
    const h = setHours(t);
    rows3.push([`T${t}`, ...hm.map((m) => (h.huntByMat[m] !== undefined ? num(h.huntByMat[m], 1) : '-'))]);
  }
  out.push(...table(['horas de caça por material', ...hm], rows3));
  const other = ['gem:ruby', 'gem:sapphire', 'gem:emerald', 'runas', 'common_herb', 'iron_thistle', 'gold_blossom', 'crimson_mushroom', 'moon_lily'];
  const rows4: string[][] = [];
  for (let t = 1; t <= 6; t++) rows4.push([`T${t}`, ...other.map((m) => num(setNeed(t)[m] ?? 0, 0))]);
  out.push(...table(['set completo: outros', ...other], rows4));
  const oreIds = [...ORE_TIERS.map((o) => o.id), ...WOOD_TIERS.map((w) => w.id)] as string[];
  const rows5: string[][] = [];
  for (let t = 1; t <= 6; t++) rows5.push([`T${t}`, ...oreIds.map((m) => num(setNeed(t)[m] ?? 0, 0))]);
  out.push(...table(['set completo: minérios e lenhas (cru)', ...oreIds], rows5));
  return out;
}

// Production per hour of every hunting material at the stage where it is farmed, next to what one full set needs: the analytic view for tiers the 21-day sim barely reaches.
function analyticTable(): string[] {
  const rows: string[][] = [];
  for (const m of HUNT_IDS as string[]) {
    const stages = STAGE_FARM.filter((s) => s.tier >= 1);
    const cells = [3, 4, 5, 6].map((t) => {
      const st = STAGE_FARM[t - 1];
      const r = huntRate(m, st);
      const need = setNeed(t)[m] ?? 0;
      return `${num(r.perHour, 1)}/h (${r.zone.replace('demon_', 'd.').replace('blood_', 'b.')}) · set ${num(need, 0)} = ${num(need / Math.max(1e-9, r.perHour), 1)} h`;
    });
    void stages;
    rows.push([m, ...cells]);
  }
  return table(['material', 'T3 (denso N5)', 'T4 (denso N8)', 'T5 (profundo N8)', 'T6 (profundo N10)'], rows);
}

// ---- the brand-new hero --------------------------------------------------------------------------------------------------------------------------------
export interface FreshHunt {
  kills: number;
  drops: Record<string, number>;
  slots: number;
  level: number;
}
export function freshHunt(seed: number, hours = 4): FreshHunt {
  return withSeededRandom(seed * 31 + 5, () => {
    const now = START;
    vi.setSystemTime(now);
    const s0 = { ...defaultSave(), huntingOfflineStart: now };
    const s1 = requestHuntStart(s0, 'demon_glade', 'shallow', now);
    if (!s1) throw new Error('fresh hero cannot start the hunt');
    const end = now + hours * 3600 * 1000;
    vi.setSystemTime(end);
    const st = computeHuntingStatus(s1, end);
    const drops = st.drops as Record<string, number>;
    return { kills: st.kills, drops, slots: Object.values(drops).reduce((a, q) => a + slotsForQty(q), 0), level: playerLevel(s0.xp) };
  });
}

function freshReport(): string[] {
  const runs = Array.from({ length: SEEDS }, (_, i) => freshHunt(i + 1));
  const out: string[] = [];
  const mat = ['leather_scrap', 'demon_claw', 'demon_core'];
  const rows = mat.map((m) => [m, num(median(runs.map((r) => (r.drops[m] ?? 0) / 4)), 1), num(median(runs.map((r) => r.drops[m] ?? 0)), 0)]);
  out.push(`Herói novo (nível ${runs[0].level}, camponês), Clareira dos Pequenos Demônios, Raso, ${SEEDS} seeds. Abates em 4 h: mediana ${num(median(runs.map((r) => r.kills)), 0)} (${num(median(runs.map((r) => r.kills / 4)), 0)}/h); espaços do inventário que as 4 h ocupam: ${num(median(runs.map((r) => r.slots)), 0)} de 26.`, '');
  out.push(...table(['material', 'por hora', 'em 4 h'], rows));
  const s1 = setNeed(1);
  out.push(`O conjunto completo do tier 1 pede ${num(s1.leather_scrap ?? 0, 0)} Farrapos de Couro (já contando as peças tecidas em couro) e ${num(s1.demon_claw ?? 0, 0)} Garras: a primeira sessão de 4 h traz ${num(median(runs.map((r) => r.drops.leather_scrap ?? 0)), 0)} Farrapos.`, '');
  return out;
}

// ---- the report ----------------------------------------------------------------------------------------------------------------------------------------
describe('material flow', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it.runIf(process.env.FLOW_ANALYTIC === '1')('prints only the static set-cost tables', () => {
    console.log(['', ...setTables(), ...analyticTable(), ''].join(String.fromCharCode(10)));
  });

  it.skipIf(process.env.FLOW_ANALYTIC === '1')('prints the material flow ledger', () => {
    const started = performance.now();
    const a: Run[] = [];
    const p: Run[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      a.push(playOne(seed, {}));
      p.push(playOne(seed, { pass: true }));
    }
    const out: string[] = [];
    const residual = Math.max(...a.flatMap((r) => r.flatMap((d) => Object.values(d.ledger.flow).map((f) => Math.abs(f.residual)))));
    const resid: Record<string, number> = {};
    for (const r of a) for (const d of r) for (const [m, f] of Object.entries(d.ledger.flow)) resid[m] = Math.max(resid[m] ?? 0, Math.abs(f.residual));
    console.log('RESID', JSON.stringify(Object.fromEntries(Object.entries(resid).filter(([, v]) => v > 0))));
    out.push(`Seeds: ${SEEDS} · dias: ${DAYS} · medianas entre seeds · resíduo máximo do livro-razão (estoque que o livro não explica): ${num(residual, 1)} unidades.`, '');
    const hunt = HUNT_IDS as string[];
    const others = (runs: Run[]) => activeIds(runs).filter((m) => !hunt.includes(m));
    out.push('## Herói novo', '', ...freshReport());
    out.push('## Veredito por material, cenário A (não-dono)', '', ...verdictMatrix(a, activeIds(a)));
    out.push('## Veredito por material, dono do Passe', '', ...verdictMatrix(p, activeIds(p)));
    out.push('## Caça, cenário A: fluxo por material', '', ...detailTable(a, hunt.filter((m) => activeIds(a).includes(m)), false));
    out.push('## Caça, dono do Passe: fluxo por material', '', ...detailTable(p, hunt.filter((m) => activeIds(p).includes(m)), false));
    out.push('## Caça por lugar, cenário A', '', ...zoneTable(a));
    out.push('## Caça por lugar, dono do Passe', '', ...zoneTable(p));
    out.push('## Mineração, lenha, horta e estações, cenário A: fluxo por material', '', ...detailTable(a, others(a), true));
    out.push('## Mineração, lenha, horta e estações, dono do Passe: fluxo por material', '', ...detailTable(p, others(p), true));
    out.push('## Únicos por zona (cenário A, horas de caça reais do jogador simulado)', '', ...uniqueTable(a));
    out.push('## Runas e gemas, cenário A', '', ...currencyTable(a));
    out.push('## Runas e gemas, dono do Passe', '', ...currencyTable(p));
    out.push('## Custo de um conjunto completo (7 peças, cadeia inteira), por tier', '', ...setTables());
    out.push('## Produção por hora no estágio em que cada material é caçado, contra o conjunto do tier', '', ...analyticTable());
    const text = out.join('\n');
    console.log('\n' + text + '\n');
    if (process.env.FLOW_OUT) writeFileSync(process.env.FLOW_OUT, text);
    console.log(`(simulação levou ${((performance.now() - started) / 1000).toFixed(1)}s)`);
    void GEAR;
    void GEMS;
    void HUNTING_DEPTHS;
    void nameOf;
  });
});
