// Rodada 25: a market with 1 000 players and REAL supply. `npm run sim:market` (scripts/sim/market.mjs spreads the stages over processes and prints the report). It asserts nothing and is NOT
// part of `npm test`.
//
// THE QUESTION (the owner, 2026-10-16): the buyer tables of Rodada 22 / 24 gave a buyer a Legendary set from day 1 (the recipes of tier 4+ cost nothing and roll Legendary). Nobody can buy a
// Legendary on day 10 if nobody has forged or dropped one yet. So: 1 000 players start on League day 0, some of them list what they get, some of them buy, and a buyer only gets a piece that
// is actually in the market on that day.
//
// WHAT IS MEASURED (the real game) AND WHAT IS A MODEL
//   measured   the Player of `npm run sim:long` / `sim:econ` (scripts/sim/player.ts, the game's own functions) plays every ARCHETYPE below for 75 days and several seeds. We keep, per day: the pieces
//              it forged (tier and slot; the sim's own rarity roll is ignored and re-rolled below), the unique pieces it found, the units of each tradeable material it gathered or dropped, its Gold
//              in / out / in hand, the hours it played (Pass XP) and its level. Nothing is invented: every rate is something the real Player did.
//   model      (a) the population: how many of each archetype, the churn, how fast each player is (a time scale 0.75-1.25 on the profile of the seed he draws), who lists what share, who buys;
//              (b) the rarity of each forge (63 / 25 / 10 / 2, drawn per forge), the Blacksmith's Seal (a bound Epic-or-better piece at Pass levels 10 / 20 / 27), the tradeable-material dice
//              (Binomial per unit, rates.ts), the Gold Pouches (surplus Gold turned into pouches, up to 3 a day); (c) the buyers: the order they arrive in, the piece they accept, the one-tier-
//              below fallback of the Legendary buyer; (d) the price index (supply and demand; a MODEL, it prices nothing the game charges).
//   measured again  the buyer's HERO: the buyer's actual acquisition timeline (what the market model let him buy and when) is fed to the same Player (PlayerOptions.schedule) and he plays 60 days:
//              level, Gold in / out, worn tiers. The piece is delivered on the first visit on or after its day at which the hero can wear it (the recipe's level: scheduleGate), because the
//              engine itself has NO level gate on wearing a piece (applyEquipInstance), only on forging it: see docs/BALANCE_CHANGES.md Rodada 25.
//
// STAGES (MARKET_STAGE; scripts/sim/market.mjs runs them in this order, MARKET_SHARD=i/n splits the jobs of a stage over n processes)
//   profiles   plays ARCHETYPES x PROFILE_SEEDS     -> OUT/prof-<arch>-<seed>.json
//   oracle     hero runs where every piece of tier 4-6 of the buyer's rarity is free the moment the hero can wear it (the old "buyer" of Rodada 22 / 24, with the level gate) -> OUT/hero-<tag>.json;
//              their level paths say WHEN a buyer wants a piece (demand timing: the fastest a buyer can ever ask)
//   market     the population and the market, REPS repetitions                              -> OUT/market.json, OUT/hero-jobs.json
//   heroes     the hero runs of the real acquisition timelines (best / median / worst buyer) -> OUT/hero-<tag>.json
//   report     markdown tables on stdout
//
// PARAMETERS (all of them; override with MARKET_PARAMS='{"listOwner":0.5,...}', the JSON is merged over this table)
export const PARAMS = {
  players: 1000,
  days: 60,
  // The population. Shares of the whole population (they add up to 1). The Pass owners are 30%.
  mix: { A: 0.4, AS: 0.12, AG: 0.06, M: 0.04, W: 0.04, G: 0.04, P: 0.11, PS: 0.07, PG: 0.05, PX: 0.02, PM: 0.015, PW: 0.015, PGa: 0.015, XPM: 0.005 } as Record<string, number>,
  // Churn: share still playing at day 0 / 7 / 30 / 60 (linear between; a player who stops produces and buys nothing from then on, what he already listed stays listed).
  survivalFree: { 0: 1, 7: 0.6, 30: 0.4, 60: 0.3 } as Record<number, number>,
  survivalOwner: { 0: 1, 7: 0.9, 30: 0.75, 60: 0.6 } as Record<number, number>,
  // How fast a player is relative to the profile he draws (log-normal, sigma, clamped): 1.1 = he is at profile day 11 on his day 10.
  speedSigma: 0.15,
  speedMin: 0.75,
  speedMax: 1.25,
  // Listing: the share of each UNBOUND tradeable thing a player puts on the market (the rest is worn, kept or used). Epic / Legendary gear and uniques, tradeable materials.
  listOwner: 0.3,
  listFree: 0.6,
  listLegendaryFactor: 1, // x listOwner / listFree for the Legendary (1 = the same as an Epic; a forger may keep his Legendary: 0.5)
  listMatOwner: 0.8,
  listMatFree: 0.8,
  // Gold Pouches: a player with Gold in hand beyond `pouchKeep` makes pouches (at most 3 a day, the biggest face that fits), with probability `pouchShare` of being a seller of Gold at all.
  // The server lets an account turn 3 000 Gold a day into pouches (bucket = the biggest face, items/bounds.ts), so a seller makes about one small pouch a day, or a big one every week.
  pouchKeep: 10000,
  pouchShare: 0.3,
  pouchGoldPerDay: 3000,
  // The buyers: a share of the owners (hunting archetypes only, who will play at least 30 days) and of the free players (hunting archetypes). Each wants the best tier he can wear.
  sealMinTier: 4, // the owner spends a Seal on his first forge of this tier or above (5 = he saves it for tier 5+)
  buyerShareOwner: 0.25,
  buyerShareFree: 0.06,
  legendaryBuyerShare: 0.5, // of the buyers, the share that wants Legendary (the rest wants Epic)
  buyerMinTier: 4,
  pity: true, // Rodada 26: the Legendary pity (rarity.ts FORGE_PITY) applies to every forge of tier 4+ of a market player (a Seal forge does not count); false = the dice alone
  legendaryDowngrade: 1, // a Legendary buyer takes a Legendary one tier below the best he can wear when there is none of the best (T4 Legendary > T5 Common in CP)
  repeats: 5, // repetitions of the market with other dice (the report gives the median and the range)
  profileSeeds: 6,
  profileDays: 75,
  heroSeeds: 3,
  // Rodada 26: true skips the hypothetical heroes (the dragon-piece oracle, the +8 oracle and the +8 real buyers) and the worst-10% buyer, so a tuning run plays about half as many heroes
  light: false,
};

import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RARITIES, Rarity, rollForgeRarity } from '../../src/game/rarity';
import { MAX_LEVEL, playerLevel, xpForNextLevel, xpToReachLevel } from '../../src/game/engine';
import { paragonLevel } from '../../src/game/paragon';
import { getGear } from '../../src/game/gear';
import T from '../../src/game/tunables';
import { setLeagueEpoch } from '../../src/game/leagueClock';
import { TRADEABLE_CHANCE } from '../../supabase/functions/_shared/materials/rates';
import { mulberry32, withSeededRandom } from './driver';
import { Player, PlayerOptions } from './player';
import { SET_SLOTS } from './setCost';

// ---- archetypes: PlayerOptions of the real sims (scripts/sim/longHaul.sim.ts and leagueEcon.sim.ts) ------------------------------------------------------------------------------------------------
const CHECK6 = [3, 9, 15, 21]; // the 6-hour checker
export const ARCHETYPES: Record<string, { opts: PlayerOptions; pass: boolean; hunter: boolean; label: string }> = {
  A: { opts: { long: true }, pass: false, hunter: true, label: 'comum, sem Passe (2 visitas por dia)' },
  AS: { opts: { long: true, smart: true }, pass: false, hunter: true, label: 'esperto, sem Passe' },
  AG: { opts: { long: true, greedy: true }, pass: false, hunter: true, label: 'guloso (so caca onde esta o XP), sem Passe' },
  M: { opts: { long: true, specialist: 'mining' }, pass: false, hunter: false, label: 'especialista em mineracao, sem Passe' },
  W: { opts: { long: true, specialist: 'woodcutting' }, pass: false, hunter: false, label: 'especialista em lenhador, sem Passe' },
  G: { opts: { long: true, specialist: 'gardening' }, pass: false, hunter: false, label: 'especialista em Horta, sem Passe' },
  P: { opts: { long: true, pass: true }, pass: true, hunter: true, label: 'dono do Passe, comum' },
  PS: { opts: { long: true, pass: true, smart: true }, pass: true, hunter: true, label: 'dono do Passe, esperto' },
  PG: { opts: { long: true, pass: true, greedy: true }, pass: true, hunter: true, label: 'dono do Passe, guloso' },
  PX: { opts: { long: true, pass: true, smart: true, checkInHours: CHECK6 }, pass: true, hunter: true, label: 'dono do Passe, esperto, visita a cada 6 h' },
  PM: { opts: { long: true, pass: true, specialist: 'mining' }, pass: true, hunter: false, label: 'dono do Passe, especialista em mineracao' },
  PW: { opts: { long: true, pass: true, specialist: 'woodcutting' }, pass: true, hunter: false, label: 'dono do Passe, especialista em lenhador' },
  PGa: { opts: { long: true, pass: true, specialist: 'gardening' }, pass: true, hunter: false, label: 'dono do Passe, especialista em Horta' },
  XPM: { opts: { long: true, pass: true, specialist: 'mining', checkInHours: CHECK6 }, pass: true, hunter: false, label: 'dono do Passe, minerador que visita a cada 6 h' },
};

// The buyer heroes (Pass owners): smart (S) or greedy (G, PBG of Rodada 24: noStash).
const HERO_POLICY: Record<'S' | 'G', PlayerOptions> = {
  S: { long: true, pass: true, smart: true },
  G: { long: true, pass: true, greedy: true, noStash: true },
};
const REF_ARCH: Record<'S' | 'G', string> = { S: 'PS', G: 'PG' }; // the non-buyer reference of each policy (the profile runs)

// What is in the market. The sim's heroes play the AXE line of the weapon slot (player.ts makes the line already being made, the axe from the first hatchet) and the gilded tier-4 weapon / armor: they
// never forge the DRAGON pieces (dragon_flameblade, dragon_scale_armor: a second tier-4 forge, 5 Aether + dragon scales, whose product is eaten the same day by the tier-5 recipe, so no piece of it
// is ever left in the bag to list). So the weapon a buyer can buy is the axe of the tier and the tier-4 armor is the gilded one. The old free-set buyer of Rodada 22 / 24 forged the dragon pieces too
// (free): the oracle `oracleLD` below keeps them, to show how much of the gap to the old numbers is that.
const AXE_LINE = ['bronze_hatchet', 'iron_battleaxe', 'steel_greataxe', 'gilded_waraxe', 'voidsteel_cleaver', 'abyssal_reaver'];
const tplFor = (slot: string, tier: number): string => (slot === 'weapon' ? AXE_LINE[tier - 1] : SET_SLOTS[slot][tier - 1]);
const SLOTS = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'ring', 'shield'] as const;
const TIERS = [1, 2, 3, 4, 5, 6];
const GATE: Record<string, number> = {}; // `${tier}:${slot}` -> level of the recipe
for (const s of SLOTS) for (const t of TIERS) GATE[`${t}:${s}`] = getGear(SET_SLOTS[s][t - 1])?.recipe?.requiredLevel ?? 0;

const MAT_GROUP: Record<string, 'horta' | 'mineracao' | 'lenhador' | 'caca'> = {};
for (const m of Object.keys(TRADEABLE_CHANCE)) MAT_GROUP[m] = ['copper', 'iron', 'silver', 'gold_ore', 'obsidian'].includes(m) ? 'mineracao' : ['common_wood', 'oak_wood', 'ebony_wood', 'elven_wood', 'ancient_wood'].includes(m) ? 'lenhador' : ['common_herb', 'energy_herb', 'iron_thistle', 'swift_grass', 'uncommon_root', 'gold_blossom', 'crimson_mushroom', 'silver_sage', 'rare_flower', 'moon_lily', 'dusk_orchid', 'elder_root'].includes(m) ? 'horta' : 'caca';

const OUT = process.env.MARKET_OUT ?? path.join(os.tmpdir(), 'arena-market');
const STAGE = process.env.MARKET_STAGE ?? 'report';
const [SHARD_I, SHARD_N] = (process.env.MARKET_SHARD ?? '0/1').split('/').map(Number);
if (process.env.MARKET_PARAMS) Object.assign(PARAMS, JSON.parse(process.env.MARKET_PARAMS));
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();
const DAYS = PARAMS.days;
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const med = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Hero level plus the share of the next level (leagueEcon.sim.ts levelPosition). */
function levelPosition(xp: number): number {
  const level = playerLevel(xp);
  if (level >= MAX_LEVEL) return MAX_LEVEL + paragonLevel(xp);
  return level + (xp - xpToReachLevel(level)) / xpForNextLevel(level);
}

// ---- stage 1 and 2: what the real Player does -------------------------------------------------------------------------------------------------------------------------------------------------------
interface ProfDay {
  lvl: number;
  gold: number;
  goldIn: Record<string, number>;
  goldOut: Record<string, number>;
  passXp: number;
  forge: Record<string, number>; // `${tier}:${slot}` -> pieces forged today
  uniq: { slot: string; tier: number; rarity: string }[];
  mats: Record<string, number>; // tradeable-capable material -> units produced today
  tiers: Record<string, number>; // best tier owned per slot
  worn: number[];
  gearBlock: string;
}
interface HeroDay {
  lvl: number;
  gold: number;
  goldIn: Record<string, number>;
  goldOut: Record<string, number>;
  worn: number[];
  gearBlock: string;
  cp: number;
  floor: number;
  hunt: Record<string, number>; // hours hunted today by zone:depth
}

function playDays(opts: PlayerOptions, seed: number, days: number, withProfile: boolean): { prof: ProfDay[]; hero: HeroDay[]; player: Player } {
  return withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const p = new Player((t) => vi.setSystemTime(t), START, opts);
    const seen = new Set<string>();
    const prof: ProfDay[] = [];
    const hero: HeroDay[] = [];
    for (let d = 0; d < days; d++) {
      p.playDay(d, jitter);
      const snap = p.snapshots[d];
      const L = snap.ledger;
      if (withProfile) {
        const forge: Record<string, number> = {};
        const uniq: ProfDay['uniq'] = [];
        for (const i of Object.values(p.S.gearInstances)) {
          if (seen.has(i.id)) continue;
          seen.add(i.id);
          const g = getGear(i.templateId) as { tier?: number; slot?: string; unique?: boolean } | undefined;
          if (!g?.slot) continue;
          if (g.unique) uniq.push({ slot: g.slot, tier: g.tier ?? 0, rarity: i.rarity });
          else if (i.origin === 'craft') {
            forge[`${g.tier ?? 0}:${g.slot}`] = (forge[`${g.tier ?? 0}:${g.slot}`] ?? 0) + 1;
          }
        }
        const mats: Record<string, number> = {};
        for (const m of Object.keys(TRADEABLE_CHANCE)) {
          const q = L.flow[m]?.produced ?? 0;
          if (q > 0) mats[m] = q;
        }
        const stages = snap.sessions.reduce((a, s) => a + s.stages, 0);
        const passXp = T.battlePass.xpPerHuntHour * L.hours.hunt + T.battlePass.xpPerMiningHour * (L.hours.mine + L.hours.wood) + T.battlePass.xpPerFloor * stages;
        prof.push({ lvl: levelPosition(p.S.xp), gold: snap.gold, goldIn: { ...L.goldIn }, goldOut: { ...L.goldOut }, passXp, forge, uniq, mats, tiers: { ...snap.tiers }, worn: snap.wornTiers, gearBlock: snap.blockers.gear });
      }
      hero.push({ lvl: levelPosition(p.S.xp), gold: snap.gold, goldIn: { ...L.goldIn }, goldOut: { ...L.goldOut }, worn: snap.wornTiers, gearBlock: snap.blockers.gear, cp: snap.cp, floor: snap.floor, hunt: Object.fromEntries(Object.entries(L.hunt).map(([k, v]) => [k, v.hours])) });
      snap.ledger = null as never;
    }
    return { prof, hero, player: p };
  });
}

interface HeroJob {
  tag: string;
  policy: 'S' | 'G';
  seed: number;
  kind: 'none' | 'oracleE' | 'oracleL' | 'oracleL8' | 'oracleLD' | 'real';
  schedule?: { day: number; tpl: string; rarity: Rarity; refine?: number; minLevel?: number }[];
  refine?: number;
  note?: string;
}

const oracleSchedule = (rarity: Rarity, refine: number): HeroJob['schedule'] => {
  const out: NonNullable<HeroJob['schedule']> = [];
  for (const s of SLOTS) for (const t of [4, 5, 6]) out.push({ day: 0, tpl: tplFor(s, t), rarity, refine });
  return out;
};

const oracleJobs = (): HeroJob[] => {
  const jobs: HeroJob[] = [];
  for (const policy of ['S', 'G'] as const) {
    for (let seed = 1; seed <= PARAMS.heroSeeds; seed++) {
      jobs.push({ tag: `${policy}-oracleE-s${seed}`, policy, seed, kind: 'oracleE', schedule: oracleSchedule('epic', 0) });
      jobs.push({ tag: `${policy}-oracleL-s${seed}`, policy, seed, kind: 'oracleL', schedule: oracleSchedule('legendary', 0) });
      if (!PARAMS.light) jobs.push({ tag: `${policy}-oracleLD-s${seed}`, policy, seed, kind: 'oracleLD', schedule: [...oracleSchedule('legendary', 0)!.filter((e) => !AXE_LINE.includes(e.tpl)), ...['gilded_warblade', 'dragon_flameblade', 'voidsteel_blade', 'abyssal_greatblade'].map((tpl) => ({ day: 0, tpl, rarity: 'legendary' as const, minLevel: 50 })), { day: 0, tpl: 'dragon_scale_armor', rarity: 'legendary', minLevel: 50 }] });
      if (!PARAMS.light) jobs.push({ tag: `${policy}-oracleL8-s${seed}`, policy, seed, kind: 'oracleL8', schedule: oracleSchedule('legendary', 8) });
    }
  }
  return jobs;
};

function runHeroJobs(jobs: HeroJob[]) {
  fs.mkdirSync(OUT, { recursive: true });
  setLeagueEpoch(START);
  jobs.forEach((job, idx) => {
    if (idx % SHARD_N !== SHARD_I) return;
    const opts: PlayerOptions = { ...HERO_POLICY[job.policy], ...(job.schedule ? { schedule: job.schedule } : {}) };
    const r = playDays(opts, job.seed, DAYS, false);
    fs.writeFileSync(path.join(OUT, `hero-${job.tag}.json`), JSON.stringify({ job: { ...job, schedule: undefined, scheduleLen: job.schedule?.length ?? 0 }, days: r.hero, bought: r.player.boughtOn }));
    console.log(`hero ${job.tag}: level ${r.hero[DAYS - 1].lvl.toFixed(1)}, bought ${r.player.boughtOn.length}`);
  });
}

// ---- stage 3: the population and the market --------------------------------------------------------------------------------------------------------------------------------------------------------
function loadProfiles(): Record<string, ProfDay[][]> {
  const out: Record<string, ProfDay[][]> = {};
  for (const arch of Object.keys(ARCHETYPES)) {
    out[arch] = [];
    for (let s = 1; s <= PARAMS.profileSeeds; s++) {
      const f = path.join(OUT, `prof-${arch}-${s}.json`);
      if (fs.existsSync(f)) out[arch].push(JSON.parse(fs.readFileSync(f, 'utf8')) as ProfDay[]);
    }
    if (!out[arch].length) throw new Error(`no profile for ${arch} in ${OUT}: run the profiles stage first`);
  }
  return out;
}

/** Median level position by day of the hero runs with this tag prefix (e.g. `S-oracleL`). */
function loadPath(prefix: string): number[] {
  const runs: HeroDay[][] = [];
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`hero-${prefix}-s`) && f.endsWith('.json')) runs.push((JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')) as { days: HeroDay[] }).days);
  if (!runs.length) throw new Error(`no hero runs ${prefix}`);
  return Array.from({ length: DAYS }, (_, d) => med(runs.map((r) => r[d].lvl)));
}

const interp = (pts: Record<number, number>, d: number): number => {
  const xs = Object.keys(pts).map(Number).sort((a, b) => a - b);
  if (d <= xs[0]) return pts[xs[0]];
  for (let i = 1; i < xs.length; i++) if (d <= xs[i]) return pts[xs[i - 1]] + ((pts[xs[i]] - pts[xs[i - 1]]) * (d - xs[i - 1])) / (xs[i] - xs[i - 1]);
  return pts[xs[xs.length - 1]];
};
/** First day the survival curve falls to u or below (the day the player stops); Infinity when it never does inside the curve. */
function stopDay(pts: Record<number, number>, u: number): number {
  const last = Math.max(...Object.keys(pts).map(Number));
  if (u < pts[last]) return Infinity;
  for (let d = 0; d <= last; d++) if (interp(pts, d) <= u) return d;
  return Infinity;
}

const gauss = (rng: () => number): number => {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};
/** Binomial(n, p): exact for small n, Poisson / normal otherwise (enough for a supply count). */
function binomial(n: number, p: number, rng: () => number): number {
  if (n <= 0 || p <= 0) return 0;
  n = Math.floor(n);
  if (n <= 40) {
    let k = 0;
    for (let i = 0; i < n; i++) if (rng() < p) k++;
    return k;
  }
  const mean = n * p;
  if (mean < 30) {
    const L = Math.exp(-mean);
    let k = 0;
    let prod = rng();
    while (prod > L) {
      k++;
      prod *= rng();
    }
    return Math.min(k, n);
  }
  return Math.max(0, Math.min(n, Math.round(mean + Math.sqrt(mean * (1 - p)) * gauss(rng))));
}
function rollRarityWith(rng: () => number): Rarity {
  const r = rng();
  let acc = 0;
  for (const def of RARITIES) {
    acc += def.chance;
    if (r < acc) return def.id;
  }
  return 'common';
}
function rollEpicPlus(rng: () => number): Rarity {
  const pool = RARITIES.filter((r) => r.id === 'epic' || r.id === 'legendary');
  const total = pool.reduce((a, r) => a + r.chance, 0);
  const x = rng() * total;
  return x < pool[0].chance ? 'epic' : 'legendary';
}
// Pass XP to reach level L (T.battlePass.xpBase * xpGrowth^(L-1) per level)
const passXpToReach = (level: number): number => {
  let x = 0;
  for (let l = 1; l < level; l++) x += Math.round(T.battlePass.xpBase * Math.pow(T.battlePass.xpGrowth, l - 1));
  return x;
};
const SEAL_LEVELS = [10, 20, 27];
const POUCH_FACES = [T.goldPouch.denomLarge, T.goldPouch.denomMedium, T.goldPouch.denomSmall];

interface Listing {
  day: number; // 0-based day it appears
  tier: number;
  slot: string;
  rarity: Rarity;
  kind: 'gear' | 'unique';
}
interface PlayerM {
  id: number;
  arch: string;
  owner: boolean;
  profile: ProfDay[];
  speed: number;
  stop: number; // first day he no longer plays
  rng: () => number;
  seller: boolean; // sells Gold (makes pouches) at all
  seals: { day: number; tier: number; slot: string; rarity: Rarity }[]; // Seal pieces he wears (born bound)
  pity: number; // the Legendary pity counter (Rodada 26): normal forges of tier 4+ since his last Legendary
  buyer?: { kind: 'E' | 'L'; pathPolicy: 'S' | 'G' | 'A' };
}
interface BuyerLog {
  id: number;
  arch: string;
  owner: boolean;
  kind: 'E' | 'L';
  policy: 'S' | 'G' | 'A';
  start: number; // first day he wants a piece of tier >= buyerMinTier
  buys: { day: number; tier: number; slot: string; rarity: Rarity; listedDay: number; paid: number }[];
}
interface MarketRep {
  supply: {
    active: number[];
    forges: number[][]; // [tier-1][day] pieces forged by everybody
    epicPlus: number[][]; // [tier-1][day] Epic or better forged (rolled), unbound
    listedEpic: number[][]; // [tier-1][day] Epic put on the market
    listedLeg: number[][];
    listedUniq: number[];
    listedUniq4: number[]; // of tier 4 or above
    sealBound: number[][]; // [0 epic, 1 legendary][day] pieces born bound by the Seal
    matsMade: Record<string, number[]>; // group -> tradeable units created per day
    matsListed: Record<string, number[]>;
    pouchN: number[];
    pouchGold: number[];
  };
  // cumulative listings: cum[`${tier}:${slot}:${rarity}`][day]
  cum: Record<string, number[]>;
  buyers: BuyerLog[];
  priceIndex: Record<string, number[]>; // `${tier}:${rarity}` -> index by day
}

function simulateMarket(profiles: Record<string, ProfDay[][]>, paths: Record<string, number[]>, rep: number): MarketRep {
  const rng = mulberry32(777 + rep * 1013);
  const names = Object.keys(PARAMS.mix);
  // ---- the population (exact quotas, shuffled)
  const arches: string[] = [];
  for (const n of names) for (let i = 0; i < Math.round(PARAMS.mix[n] * PARAMS.players); i++) arches.push(n);
  while (arches.length < PARAMS.players) arches.push('A');
  arches.length = PARAMS.players;
  for (let i = arches.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arches[i], arches[j]] = [arches[j], arches[i]];
  }
  const players: PlayerM[] = arches.map((arch, id) => {
    const meta = ARCHETYPES[arch];
    const prng = mulberry32(100003 * (id + 1) + rep * 7919);
    const prof = profiles[arch][Math.floor(prng() * profiles[arch].length)];
    const speed = Math.max(PARAMS.speedMin, Math.min(PARAMS.speedMax, Math.exp(PARAMS.speedSigma * gauss(prng))));
    return { id, arch, owner: meta.pass, profile: prof, speed, stop: stopDay(meta.pass ? PARAMS.survivalOwner : PARAMS.survivalFree, prng()), rng: prng, seller: prng() < PARAMS.pouchShare, seals: [], pity: 0 };
  });
  // ---- who buys: owners and free hunters who will play at least 30 days
  const pick = (pool: PlayerM[], n: number): PlayerM[] => {
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, Math.min(n, a.length));
  };
  const nOwners = players.filter((p) => p.owner).length;
  const nFree = players.length - nOwners;
  const ownerPool = players.filter((p) => p.owner && ARCHETYPES[p.arch].hunter && p.stop >= 30);
  const freePool = players.filter((p) => !p.owner && ARCHETYPES[p.arch].hunter && p.stop >= 30);
  for (const p of pick(ownerPool, Math.round(PARAMS.buyerShareOwner * nOwners))) p.buyer = { kind: rng() < PARAMS.legendaryBuyerShare ? 'L' : 'E', pathPolicy: p.arch === 'PG' ? 'G' : 'S' };
  for (const p of pick(freePool, Math.round(PARAMS.buyerShareFree * nFree))) p.buyer = { kind: rng() < PARAMS.legendaryBuyerShare ? 'L' : 'E', pathPolicy: 'A' };

  // ---- production and listings, player by player
  const zero = () => Array.from({ length: DAYS }, () => 0);
  const s: MarketRep['supply'] = {
    active: zero(),
    forges: TIERS.map(zero),
    epicPlus: TIERS.map(zero),
    listedEpic: TIERS.map(zero),
    listedLeg: TIERS.map(zero),
    listedUniq: zero(),
    listedUniq4: zero(),
    sealBound: [zero(), zero()],
    matsMade: { horta: zero(), mineracao: zero(), lenhador: zero(), caca: zero() },
    matsListed: { horta: zero(), mineracao: zero(), lenhador: zero(), caca: zero() },
    pouchN: zero(),
    pouchGold: zero(),
  };
  const listings: Listing[][] = Array.from({ length: DAYS }, () => []);
  for (const p of players) {
    const listP = p.owner ? PARAMS.listOwner : PARAMS.listFree;
    const listMat = p.owner ? PARAMS.listMatOwner : PARAMS.listMatFree;
    let passXp = 0;
    let sealsOwned = 0;
    let sealsGranted = 0;
    let virtualHand = 0;
    let bucket = 0;
    let lastK = -1;
    for (let d = 0; d < DAYS && d < p.stop; d++) {
      s.active[d]++;
      // profile days [k0, k1) fall on player day d
      const k0 = Math.ceil(d * p.speed - 1e-9);
      const k1 = Math.min(p.profile.length, Math.ceil((d + 1) * p.speed - 1e-9));
      for (let k = Math.max(k0, lastK + 1); k < k1; k++) {
        lastK = k;
        const pd = p.profile[k];
        // Pass level and the Seals
        if (p.owner) {
          passXp += pd.passXp;
          while (sealsGranted < SEAL_LEVELS.length && passXp >= passXpToReach(SEAL_LEVELS[sealsGranted])) {
            sealsGranted++;
            sealsOwned++;
          }
        }
        // forges
        for (const [key, n] of Object.entries(pd.forge)) {
          const [tierS, slot] = key.split(':');
          const tier = Number(tierS);
          for (let i = 0; i < n; i++) {
            s.forges[tier - 1][d]++;
            if (sealsOwned > 0 && tier >= PARAMS.sealMinTier) {
              // the Seal replaces the dice: an Epic (5 in 6) or Legendary piece, born bound (never on the market)
              sealsOwned--;
              const r = rollEpicPlus(p.rng);
              s.sealBound[r === 'epic' ? 0 : 1][d]++;
              p.seals.push({ day: d, tier, slot, rarity: r });
              continue;
            }
            // Rodada 26: the same function the game and the server roll with (rarity.ts rollForgeRarity); the pity only exists when `pity` is on
            const rolled = PARAMS.pity ? rollForgeRarity(tier, p.pity, p.rng) : { rarity: rollRarityWith(p.rng), pity: p.pity };
            p.pity = rolled.pity;
            const rar = rolled.rarity;
            if (rar !== 'epic' && rar !== 'legendary') continue;
            s.epicPlus[tier - 1][d]++;
            const share = listP * (rar === 'legendary' ? PARAMS.listLegendaryFactor : 1);
            if (p.rng() < Math.min(1, share)) {
              listings[d].push({ day: d, tier, slot, rarity: rar, kind: 'gear' });
              (rar === 'epic' ? s.listedEpic : s.listedLeg)[tier - 1][d]++;
            }
          }
        }
        // uniques
        for (const u of pd.uniq) if (p.rng() < Math.min(1, listP)) {
          listings[d].push({ day: d, tier: u.tier, slot: u.slot, rarity: u.rarity as Rarity, kind: 'unique' });
          s.listedUniq[d]++;
          if (u.tier >= 4) s.listedUniq4[d]++;
        }
        // tradeable materials
        for (const [m, q] of Object.entries(pd.mats)) {
          const n = binomial(q, TRADEABLE_CHANCE[m], p.rng);
          if (n <= 0) continue;
          const g = MAT_GROUP[m];
          s.matsMade[g][d] += n;
          s.matsListed[g][d] += binomial(n, listMat, p.rng);
        }
      }
      // Gold Pouches (a model on top of the profile's Gold in hand at the end of the day)
      const kEnd = Math.min(p.profile.length - 1, Math.max(0, Math.ceil((d + 1) * p.speed - 1e-9) - 1));
      const hand = p.profile[kEnd].gold - virtualHand;
      bucket = Math.min(POUCH_FACES[0], bucket + PARAMS.pouchGoldPerDay);
      if (p.seller && hand > PARAMS.pouchKeep) {
        let left = hand - PARAMS.pouchKeep;
        let made = 0;
        while (made < T.goldPouch.perDay) {
          const face = POUCH_FACES.find((f) => f <= bucket && f * (1 + (p.owner ? T.goldPouch.feePct : T.goldPouch.feePctFree)) <= left);
          if (!face) break;
          bucket -= face;
          left -= face * (1 + (p.owner ? T.goldPouch.feePct : T.goldPouch.feePctFree));
          virtualHand += face * (1 + (p.owner ? T.goldPouch.feePct : T.goldPouch.feePctFree));
          s.pouchN[d]++;
          s.pouchGold[d] += face;
          made++;
        }
      }
    }
  }

  // ---- cumulative listings per (tier, slot, rarity)
  const cum: Record<string, number[]> = {};
  for (const t of TIERS) for (const sl of SLOTS) for (const r of ['epic', 'legendary']) cum[`${t}:${sl}:${r}`] = zero();
  for (let d = 0; d < DAYS; d++) for (const l of listings[d]) if (l.kind === 'gear') cum[`${l.tier}:${l.slot}:${l.rarity}`][d]++;
  for (const k of Object.keys(cum)) for (let d = 1; d < DAYS; d++) cum[k][d] += cum[k][d - 1];

  // ---- the buyers
  const buyerLogs: BuyerLog[] = [];
  const stock: Record<string, Listing[]> = {};
  const priceIndex: Record<string, number[]> = {};
  const levelAt = (b: PlayerM, d: number): number => {
    const pol = b.buyer!.pathPolicy;
    const path = pol === 'A' ? paths['A'] : paths[`${pol}-oracle${b.buyer!.kind}`];
    const x = Math.min(path.length - 1, Math.max(0, d * b.speed));
    const lo = Math.floor(x);
    const hi = Math.min(path.length - 1, lo + 1);
    return path[lo] + (path[hi] - path[lo]) * (x - lo);
  };
  const selfTier = (b: PlayerM, d: number, slot: string): number => {
    const k = Math.min(b.profile.length - 1, Math.max(0, Math.floor(d * b.speed)));
    return b.profile[k].tiers[slot] ?? 0;
  };
  const buyers = players.filter((p) => p.buyer);
  // arrival order: the first day each wants a piece of tier >= buyerMinTier
  const startOf = (b: PlayerM): number => {
    for (let d = 0; d < DAYS; d++) if (levelAt(b, d) >= GATE[`${PARAMS.buyerMinTier}:weapon`]) return d;
    return Infinity;
  };
  const logs = new Map<number, BuyerLog>();
  for (const b of buyers) {
    const log: BuyerLog = { id: b.id, arch: b.arch, owner: b.owner, kind: b.buyer!.kind, policy: b.buyer!.pathPolicy, start: startOf(b), buys: [] };
    logs.set(b.id, log);
    buyerLogs.push(log);
  }
  buyerLogs.sort((a, b) => a.start - b.start || a.id - b.id);
  const held = new Map<number, Record<string, number>>();
  for (const b of buyers) held.set(b.id, {});
  const byId = new Map(players.map((p) => [p.id, p]));
  for (let d = 0; d < DAYS; d++) {
    for (const l of listings[d]) if (l.kind === 'gear') (stock[`${l.tier}:${l.slot}:${l.rarity}`] ??= []).push(l);
    const unmet: Record<string, number> = {};
    for (const log of buyerLogs) {
      const b = byId.get(log.id)!;
      if (d >= b.stop) continue;
      const lvl = levelAt(b, d);
      const h = held.get(b.id)!;
      for (const sl of b.seals) if (sl.day <= d && (log.kind === 'E' || sl.rarity === 'legendary') && sl.tier > (h[sl.slot] ?? 0)) h[sl.slot] = sl.tier; // the Seal piece he already wears
      for (const slot of SLOTS) {
        const gate = (t: number) => GATE[`${t}:${slot}`];
        let best = 0;
        for (const t of TIERS) if (gate(t) <= lvl) best = t;
        if (best < PARAMS.buyerMinTier) continue;
        const floorT = Math.max(PARAMS.buyerMinTier, best - (log.kind === 'L' ? PARAMS.legendaryDowngrade : 0));
        for (let t = best; t >= floorT; t--) {
          if (t <= (h[slot] ?? 0)) break; // already holds that tier or better
          if (t < selfTier(b, d, slot)) break;
          const key = `${t}:${slot}:${log.kind === 'L' ? 'legendary' : 'epic'}`;
          const q = stock[key];
          if (q && q.length) {
            const l = q.shift()!;
            log.buys.push({ day: d, tier: t, slot, rarity: l.rarity, listedDay: l.day, paid: 0 });
            h[slot] = t;
            break;
          }
        }
        if ((h[slot] ?? 0) < best && !(log.kind === 'L' && (h[slot] ?? 0) >= best - PARAMS.legendaryDowngrade)) {
          const uk = `${best}:${log.kind === 'L' ? 'legendary' : 'epic'}`;
          unmet[uk] = (unmet[uk] ?? 0) + 1; // still without a piece of the best tier he can wear
        }
      }
    }
    // price index (a model): scarcity of the stock against the buyers waiting, per tier and rarity
    for (const t of TIERS) for (const r of ['epic', 'legendary'] as const) {
      const avail = SLOTS.reduce((a, sl) => a + (stock[`${t}:${sl}:${r}`]?.length ?? 0), 0);
      const arr = (priceIndex[`${t}:${r}`] ??= zero());
      arr[d] = Math.max(0.5, Math.min(3, Math.pow(((unmet[`${t}:${r}`] ?? 0) + 3) / (avail + 3), 0.5)));
    }
  }
  return { supply: s, cum, buyers: buyerLogs, priceIndex };
}

// ---- sensitivity: the same market with other stated assumptions (cheap: no hero is played) ------------------------------------------------------------------------------------------------
const scaleOwners = (owners: number): Record<string, number> => {
  const mix = PARAMS.mix;
  const own = Object.keys(mix).filter((a) => ARCHETYPES[a].pass).reduce((x, a) => x + mix[a], 0);
  return Object.fromEntries(Object.keys(mix).map((a) => [a, ARCHETYPES[a].pass ? (mix[a] * owners) / own : (mix[a] * (1 - owners)) / (1 - own)]));
};
export const VARIANTS: { name: string; patch: () => Partial<typeof PARAMS> }[] = [
  { name: 'base', patch: () => ({}) },
  { name: 'anuncia metade (30% dono / 60% sem Passe -> 15% / 30%)', patch: () => ({ listOwner: PARAMS.listOwner / 2, listFree: PARAMS.listFree / 2 }) },
  { name: 'anuncia o dobro (60% / 100%)', patch: () => ({ listOwner: Math.min(1, PARAMS.listOwner * 2), listFree: 1 }) },
  { name: 'guarda a Lendaria para si (anuncia metade das Lendarias)', patch: () => ({ listLegendaryFactor: 0.5 }) },
  { name: 'menos desistencia (45% jogam ainda no dia 30 / 35% no 60 sem Passe; 80% / 70% dono)', patch: () => ({ survivalFree: { 0: 1, 7: 0.75, 30: 0.45, 60: 0.35 }, survivalOwner: { 0: 1, 7: 0.95, 30: 0.8, 60: 0.7 } }) },
  { name: 'metade dos compradores', patch: () => ({ buyerShareOwner: PARAMS.buyerShareOwner / 2, buyerShareFree: PARAMS.buyerShareFree / 2 }) },
  { name: 'o dobro de compradores', patch: () => ({ buyerShareOwner: Math.min(1, PARAMS.buyerShareOwner * 2), buyerShareFree: PARAMS.buyerShareFree * 2 }) },
  { name: '50% donos do Passe (em vez de 30%)', patch: () => ({ mix: scaleOwners(0.5) }) },
  { name: 'Selo guardado para tier 5+', patch: () => ({ sealMinTier: 5 }) },
  { name: 'todos anunciam tudo (teto da oferta: 100%)', patch: () => ({ listOwner: 1, listFree: 1, listLegendaryFactor: 1 }) },
];
interface Metrics {
  epicSetT4: number[]; // day of the 1st / 10th / 100th buyer (Infinity = never)
  legSetT4: number[];
  legWA4: number[];
  epicSetT5: number[];
  legWA5: number[];
  pctSet: number[]; // owners: % with 7 T4+ pieces at day 60: [Epic buyer, Legendary buyer]
  legT4Up: number; // Legendary pieces of tier 4+ listed by day 60
}
function metrics(r: MarketRep): Metrics {
  const KS = [1, 10, 100];
  const firstDay = (keys: string[], k: number, rars: string[]): number => {
    for (let d = 0; d < DAYS; d++) if (keys.every((key) => rars.reduce((a, rr) => a + r.cum[key.replace('#', rr)][d], 0) >= k)) return d + 1;
    return Infinity;
  };
  const set = (t: number, rars: string[]) => KS.map((k) => firstDay(SLOTS.map((sl) => `${t}:${sl}:#`), k, rars));
  const wa = (t: number) => KS.map((k) => firstDay([`${t}:weapon:#`, `${t}:armor:#`], k, ['legendary']));
  const pct = (kind: 'E' | 'L') => {
    const g = r.buyers.filter((b) => b.owner && b.kind === kind);
    return (100 * g.filter((b) => new Set(b.buys.filter((x) => x.tier >= 4).map((x) => x.slot)).size >= 7).length) / Math.max(1, g.length);
  };
  return { epicSetT4: set(4, ['epic']), legSetT4: set(4, ['legendary']), legWA4: wa(4), epicSetT5: set(5, ['epic']), legWA5: wa(5), pctSet: [pct('E'), pct('L')], legT4Up: [4, 5, 6].reduce((a, t) => a + SLOTS.reduce((x, sl) => x + r.cum[`${t}:${sl}:legendary`][DAYS - 1], 0), 0) };
}
function withParams<R>(patch: Partial<typeof PARAMS>, fn: () => R): R {
  const saved = { ...PARAMS };
  Object.assign(PARAMS, patch);
  try {
    return fn();
  } finally {
    Object.assign(PARAMS, saved);
  }
}

// ---- the stages -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
describe('market with real supply', () => {
  beforeAll(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterAll(() => vi.useRealTimers());

  it('plays', () => {
    fs.mkdirSync(OUT, { recursive: true });
    if (STAGE === 'profiles') {
      setLeagueEpoch(START);
      const jobs: [string, number][] = [];
      for (const a of Object.keys(ARCHETYPES)) for (let s = 1; s <= PARAMS.profileSeeds; s++) jobs.push([a, s]);
      jobs.forEach(([arch, seed], idx) => {
        if (idx % SHARD_N !== SHARD_I) return;
        const r = playDays(ARCHETYPES[arch].opts, seed, PARAMS.profileDays, true);
        fs.writeFileSync(path.join(OUT, `prof-${arch}-${seed}.json`), JSON.stringify(r.prof));
        console.log(`profile ${arch}${seed}: level ${r.prof[r.prof.length - 1].lvl.toFixed(1)} at day ${PARAMS.profileDays}`);
      });
    } else if (STAGE === 'oracle') {
      runHeroJobs(oracleJobs());
    } else if (STAGE === 'market') {
      const profiles = loadProfiles();
      const paths: Record<string, number[]> = { A: Array.from({ length: DAYS }, (_, d) => med(profiles.A.map((r) => r[d].lvl))) };
      for (const pol of ['S', 'G']) for (const k of ['E', 'L']) paths[`${pol}-oracle${k}`] = loadPath(`${pol}-oracle${k}`);
      const reps: MarketRep[] = [];
      for (let r = 0; r < PARAMS.repeats; r++) reps.push(simulateMarket(profiles, paths, r));
      const sens = VARIANTS.map((v) => ({ name: v.name, metrics: withParams(v.patch(), () => Array.from({ length: PARAMS.repeats }, (_, r) => metrics(simulateMarket(profiles, paths, r)))) }));
      fs.writeFileSync(path.join(OUT, 'market.json'), JSON.stringify({ params: PARAMS, reps, sens }));
      // the heroes of the real timelines: from repetition 0, the best / median / worst buyer of each kind and policy (ranked by the tiers held at day 60, then by how early)
      const jobs: HeroJob[] = [];
      const rep0 = reps[0];
      for (const policy of ['S', 'G'] as const) {
        for (const kind of ['E', 'L'] as const) {
          // Rodada 26: the buyers that ACTUALLY obtained something (a buyer the queue never served is the share reported as "sem nenhuma peca", not a point of the ranking)
          const group = rep0.buyers.filter((b) => b.owner && b.kind === kind && (policy === 'G' ? b.policy === 'G' : b.policy === 'S') && b.buys.length > 0);
          const score = (b: BuyerLog) => b.buys.reduce((a, x) => a + x.tier * 100 - x.day, 0);
          const ranked = [...group].sort((a, b) => score(b) - score(a));
          if (!ranked.length) continue;
          const at = (q: number) => ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * q))];
          const picks: [string, BuyerLog][] = [['q00', ranked[0]], ['q10', at(0.1)], ['q50', at(0.5)], ...(PARAMS.light ? [] : [['q90', at(0.9)] as [string, BuyerLog]])];
          for (const [label, b] of picks) {
            const schedule = b.buys.map((x) => ({ day: x.day, tpl: tplFor(x.slot, x.tier), rarity: x.rarity }));
            for (let seed = 1; seed <= PARAMS.heroSeeds; seed++) {
              jobs.push({ tag: `${policy}-real${kind}-${label}-s${seed}`, policy, seed, kind: 'real', schedule, note: `${label} of ${group.length} buyers (id ${b.id}, ${b.buys.length} pieces)` });
              if (!PARAMS.light && kind === 'L' && (label === 'q00' || label === 'q50')) jobs.push({ tag: `${policy}-real${kind}8-${label}-s${seed}`, policy, seed, kind: 'real', schedule: schedule.map((x) => ({ ...x, refine: 8 })), refine: 8, note: `${label} refinado a +8 (hipotetico)` });
            }
          }
        }
      }
      fs.writeFileSync(path.join(OUT, 'hero-jobs.json'), JSON.stringify(jobs));
      console.log(`market: ${reps.length} repetitions, ${jobs.length} hero jobs`);
    } else if (STAGE === 'heroes') {
      runHeroJobs(JSON.parse(fs.readFileSync(path.join(OUT, 'hero-jobs.json'), 'utf8')) as HeroJob[]);
    } else {
      report();
    }
  }, 3_600_000);
});

// ---- the report -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/,/g, ' ') : '-');
/** median (min-max) of a list */
const rng3 = (xs: number[], d = 0) => {
  const v = xs.filter(Number.isFinite);
  if (!v.length) return '-';
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return lo === hi ? fmt(med(v), d) : `${fmt(med(v), d)} (${fmt(lo, d)}-${fmt(hi, d)})`;
};
const dayCell = (xs: number[]): string => {
  // first-day values (1-based) from several repetitions; Infinity = never inside the horizon
  const reached = xs.filter(Number.isFinite);
  if (!reached.length) return `> ${DAYS}`;
  const m = med(xs);
  const base = Number.isFinite(m) ? `${fmt(m)}` : `> ${DAYS}`;
  return reached.length === xs.length ? (Math.min(...reached) === Math.max(...reached) ? base : `${base} (${Math.min(...reached) + 0}-${Math.max(...reached)})`) : `${base} (${reached.length}/${xs.length})`;
};

const QS = ['q00', 'q10', 'q50', 'q90'];
const QLAB: Record<string, string> = { q00: 'o melhor de todos', q10: 'melhor 10%', q25: 'melhor 25%', q50: 'mediano', q90: 'pior 10%' };

function report() {
  const market = JSON.parse(fs.readFileSync(path.join(OUT, 'market.json'), 'utf8')) as { params: typeof PARAMS; reps: MarketRep[]; sens: { name: string; metrics: Metrics[] }[] };
  const reps = market.reps;
  const profiles = loadProfiles();
  const out: string[] = [];
  const DAY_COLS = [1, 3, 7, 14, 21, 30, 45, 60].filter((d) => d <= DAYS);
  const at = (arr: number[], d: number) => arr[d - 1];
  const win = (arr: number[], d: number) => arr.slice(Math.max(0, d - 7), d).reduce((a, b) => a + b, 0) / Math.min(7, d); // average of the 7 days up to d (smooths the dice)

  // ---- 0a. parameters and the archetypes (what the real Player did, per player, days 1-60)
  out.push('#### Parametros desta execucao', '', '```', JSON.stringify(market.params), '```', '');
  const archRows: string[][] = Object.keys(ARCHETYPES).map((a) => {
    const rs = profiles[a].map((p) => p.slice(0, DAYS));
    const tot = (f: (d: ProfDay) => number) => med(rs.map((r) => r.reduce((x, d) => x + f(d), 0)));
    const forgesT = (t: number) => tot((d) => Object.entries(d.forge).filter(([k]) => k.startsWith(`${t}:`)).reduce((x, [, n]) => x + n, 0));
    const tr = (grp: string) => tot((d) => Object.entries(d.mats).filter(([m]) => MAT_GROUP[m] === grp).reduce((x, [m, q]) => x + q * TRADEABLE_CHANCE[m], 0));
    return [`${a} (${fmt(PARAMS.mix[a] * 100, 1)}%) ${ARCHETYPES[a].label}`, fmt(med(rs.map((r) => r[29].lvl)), 1), fmt(med(rs.map((r) => r[DAYS - 1].lvl)), 1), fmt(forgesT(4)), fmt(forgesT(5)), fmt(forgesT(6)), fmt(tot((d) => d.uniq.length), 1), fmt(tr('horta')), fmt(tr('mineracao')), fmt(tr('lenhador')), fmt(tr('caca')), fmt(tot((d) => sum(d.goldIn))), fmt(tot((d) => sum(d.goldOut)))];
  });
  out.push('#### 0. Os arquétipos: o que o Player de verdade fez em 60 dias (por jogador; mediana de ' + PARAMS.profileSeeds + ' seeds; tradeaveis = unidades coletadas x a chance de rates.ts, esperanca)', '');
  out.push(table(['arquetipo (parcela da populacao)', 'nivel d30', 'nivel d60', 'forjas T4', 'T5', 'T6', 'unicos', 'trad. Horta', 'Mineracao', 'Lenhador', 'Cacada', 'Ouro ganho', 'Ouro gasto'], archRows), '');

  // ---- 0. population
  out.push(`#### Populacao (${PARAMS.players} jogadores, mediana de ${reps.length} repeticoes)`, '');
  out.push(table(['dia', ...DAY_COLS.map(String)], [['jogadores ativos (churn)', ...DAY_COLS.map((d) => rng3(reps.map((r) => at(r.supply.active, d))))]]), '');

  // ---- 1. supply per day by source (average of the 7 days up to the column day, per whole population)
  out.push(`#### 1. Oferta por dia e por fonte (media dos 7 dias ate o dia da coluna; populacao inteira; mediana das repeticoes)`, '');
  const row = (label: string, pick: (r: MarketRep) => number[], d = 1) => [label, ...DAY_COLS.map((dc) => fmt(med(reps.map((r) => win(pick(r), dc))), d))];
  const rows: string[][] = [];
  rows.push(row('Pecas forjadas T1-T3 (todas as raridades)', (r) => r.supply.forges[0].map((_, d) => [0, 1, 2].reduce((a, t) => a + r.supply.forges[t][d], 0))));
  for (const t of [4, 5, 6]) rows.push(row(`Pecas forjadas T${t}`, (r) => r.supply.forges[t - 1]));
  rows.push(row('Epicas+Lendarias sorteadas, T1-T3 (nao ligadas)', (r) => r.supply.epicPlus[0].map((_, d) => [0, 1, 2].reduce((a, t) => a + r.supply.epicPlus[t][d], 0)), 2));
  for (const t of [4, 5, 6]) rows.push(row(`Epicas+Lendarias sorteadas, T${t}`, (r) => r.supply.epicPlus[t - 1], 2));
  for (const [lab, arr] of [['Epicas', 'listedEpic'], ['Lendarias', 'listedLeg']] as const) {
    rows.push(row(`${lab} ANUNCIADAS, T1-T3`, (r) => r.supply[arr][0].map((_, d) => [1, 2, 3].reduce((a, t) => a + r.supply[arr][t - 1][d], 0)), 2));
    for (const t of [4, 5, 6]) rows.push(row(`${lab} ANUNCIADAS, T${t}`, (r) => r.supply[arr][t - 1], 2));
  }
  rows.push(row('Unicos anunciados (Cacada + chefes)', (r) => r.supply.listedUniq, 2));
  rows.push(row('  dos quais de tier 4 ou mais', (r) => r.supply.listedUniq4, 2));
  rows.push(row('Pecas nascidas ligadas pelo Selo (Epica+Lendaria, fora do mercado)', (r) => r.supply.sealBound[0].map((_, d) => r.supply.sealBound[0][d] + r.supply.sealBound[1][d]), 2));
  for (const [g, name] of [['horta', 'Horta'], ['mineracao', 'Mineracao'], ['lenhador', 'Lenhador'], ['caca', 'Cacada (drops)']] as const) rows.push(row(`Materiais negociaveis criados, ${name} (unidades)`, (r) => r.supply.matsMade[g]));
  rows.push(row('Materiais negociaveis criados, TOTAL', (r) => r.supply.matsMade.horta.map((_, d) => (['horta', 'mineracao', 'lenhador', 'caca'] as const).reduce((a, g) => a + r.supply.matsMade[g][d], 0))));
  rows.push(row('Materiais negociaveis ANUNCIADOS, TOTAL', (r) => r.supply.matsListed.horta.map((_, d) => (['horta', 'mineracao', 'lenhador', 'caca'] as const).reduce((a, g) => a + r.supply.matsListed[g][d], 0))));
  rows.push(row('Bolsas de Ouro criadas (unidades)', (r) => r.supply.pouchN, 1));
  rows.push(row('Bolsas de Ouro: Ouro de face (mil)', (r) => r.supply.pouchGold.map((x) => x / 1000), 1));
  out.push(table(['fonte \\ dia', ...DAY_COLS.map((d) => `d${d}`)], rows), '');

  // ---- cumulative stock
  out.push(`#### 2. Estoque acumulado anunciado (o que ja foi posto no mercado ate o fim do dia; nao desconta o que foi comprado)`, '');
  const cumRow = (label: string, pick: (r: MarketRep, d: number) => number) => [label, ...DAY_COLS.map((dc) => rng3(reps.map((r) => pick(r, dc - 1))))];
  const crows: string[][] = [];
  for (const t of [3, 4, 5, 6]) {
    crows.push(cumRow(`Epicas T${t}`, (r, d) => SLOTS.reduce((a, s) => a + r.cum[`${t}:${s}:epic`][d], 0)));
    crows.push(cumRow(`Lendarias T${t}`, (r, d) => SLOTS.reduce((a, s) => a + r.cum[`${t}:${s}:legendary`][d], 0)));
  }
  crows.push(cumRow('Pecas Epicas+Lendarias nascidas LIGADAS pelo Selo (T4+)', (r, d) => r.supply.sealBound[0].slice(0, d + 1).reduce((a, b) => a + b, 0) + r.supply.sealBound[1].slice(0, d + 1).reduce((a, b) => a + b, 0)));
  crows.push(cumRow('Unicos', (r, d) => r.supply.listedUniq.slice(0, d + 1).reduce((a, b) => a + b, 0)));
  crows.push(cumRow('Materiais negociaveis anunciados (mil)', (r, d) => (['horta', 'mineracao', 'lenhador', 'caca'] as const).reduce((a, g) => a + r.supply.matsListed[g].slice(0, d + 1).reduce((x, y) => x + y, 0), 0) / 1000));
  crows.push(cumRow('Ouro em Bolsas criadas (mil)', (r, d) => r.supply.pouchGold.slice(0, d + 1).reduce((a, b) => a + b, 0) / 1000));
  out.push(table(['estoque \\ dia', ...DAY_COLS.map((d) => `d${d}`)], crows), '');

  // ---- 3. when can the k-th buyer get a piece / a set (pure supply: the k-th buyer needs the k-th unit of every slot)
  out.push(`#### 3. Quando o k-esimo comprador consegue uma peca / um conjunto (so oferta: k-esima peca anunciada de cada encaixe, sem olhar o nivel exigido)`, '');
  out.push('Primeiro dia (1-based) em que o estoque acumulado de pecas anunciadas chega a k. Entre parenteses, a variacao entre as repeticoes; `>60` = nao chega em 60 dias.', '');
  const KS = [1, 10, 100];
  const firstCum = (r: MarketRep, keys: string[], k: number, combine: 'min' | 'max'): number => {
    for (let d = 0; d < DAYS; d++) {
      const vals = keys.map((key) => r.cum[key][d]);
      if ((combine === 'min' ? Math.min(...vals) : Math.max(...vals)) >= k) return d + 1;
    }
    return Infinity;
  };
  const pieceRows: string[][] = [];
  for (const rar of ['legendary', 'epic']) {
    for (const t of [4, 5, 6]) {
      for (const s of SLOTS) pieceRows.push([`${rar === 'legendary' ? 'Lendaria' : 'Epica'} T${t} ${s}`, ...KS.map((k) => dayCell(reps.map((r) => firstCum(r, [`${t}:${s}:${rar}`], k, 'min'))))]);
    }
  }
  for (const rar of ['legendary', 'epic']) for (const t of [4, 5, 6]) pieceRows.unshift([`${rar === 'legendary' ? 'Lendaria' : 'Epica'} T${t} (qualquer encaixe)`, ...KS.map((k) => dayCell(reps.map((r) => { for (let d = 0; d < DAYS; d++) if (SLOTS.reduce((a, sl) => a + r.cum[`${t}:${sl}:${rar}`][d], 0) >= k) return d + 1; return Infinity; })))]);
  out.push('##### 3a. Uma peca (encaixe a encaixe)', '');
  out.push(table(['peca', ...KS.map((k) => `${k}o comprador`)], pieceRows), '');
  const setRows: string[][] = [];
  for (const t of [4, 5, 6]) {
    for (const [lab, rars] of [['Lendario', ['legendary']], ['Epico', ['epic']]] as const) {
      setRows.push([`Conjunto ${lab} T${t} (7 pecas)`, ...KS.map((k) => dayCell(reps.map((r) => {
        for (let d = 0; d < DAYS; d++) if (SLOTS.every((s) => rars.reduce((a, rr) => a + r.cum[`${t}:${s}:${rr}`][d], 0) >= k)) return d + 1;
        return Infinity;
      })))]);
    }
    setRows.push([`Conjunto Epico-ou-melhor T${t} (7 pecas)`, ...KS.map((k) => dayCell(reps.map((r) => {
      for (let d = 0; d < DAYS; d++) if (SLOTS.every((s) => r.cum[`${t}:${s}:epic`][d] + r.cum[`${t}:${s}:legendary`][d] >= k)) return d + 1;
      return Infinity;
    })))]);
    setRows.push([`Arma + armadura Lendarias T${t} (2 pecas)`, ...KS.map((k) => dayCell(reps.map((r) => firstCum(r, [`${t}:weapon:legendary`, `${t}:armor:legendary`], k, 'min'))))]);
  }
  out.push('##### 3b. Um conjunto (as 7 pecas)', '');
  out.push(table(['conjunto', ...KS.map((k) => `${k}o comprador`)], setRows), '');

  // ---- 4. what the buyers actually got
  out.push(`#### 4. O que os compradores da populacao realmente conseguiram (${reps[0].buyers.length} compradores na repeticao 0; dono do Passe ${reps[0].buyers.filter((b) => b.owner).length}, sem Passe ${reps[0].buyers.filter((b) => !b.owner).length})`, '');
  const bq = (kind: 'E' | 'L', owner: boolean) => reps.map((r) => r.buyers.filter((b) => b.kind === kind && b.owner === owner));
  const brow: string[][] = [];
  for (const [kind, lab] of [['E', 'Epico'], ['L', 'Lendario']] as const) {
    for (const owner of [true, false]) {
      const groups = bq(kind, owner);
      const n = med(groups.map((g) => g.length));
      const pieces = (b: BuyerLog) => b.buys.length;
      const slotsAt = (b: BuyerLog, d: number, minTier: number) => new Set(b.buys.filter((x) => x.day < d && x.tier >= minTier).map((x) => x.slot)).size;
      brow.push([
        `${lab}, ${owner ? 'dono do Passe' : 'sem Passe'}`,
        fmt(n),
        rng3(groups.map((g) => g.reduce((a, b) => a + pieces(b), 0) / Math.max(1, g.length)), 1),
        ...[30, 45, 60].map((d) => rng3(groups.map((g) => (100 * g.filter((b) => slotsAt(b, d, 4) >= 7).length) / Math.max(1, g.length)), 0)),
        ...[45, 60].map((d) => rng3(groups.map((g) => (100 * g.filter((b) => slotsAt(b, d, 5) >= 7).length) / Math.max(1, g.length)), 0)),
        rng3(groups.map((g) => (100 * g.filter((b) => b.buys.length === 0).length) / Math.max(1, g.length)), 0),
      ]);
    }
  }
  out.push(table(['comprador', 'n', 'pecas compradas ate o dia 60 (media)', '% com 7 pecas T4+ no dia 30', 'dia 45', 'dia 60', '% com 7 pecas T5+ no dia 45', 'dia 60', '% sem nenhuma peca'], brow), '');
  // by tier: how many pieces per tier were bought
  const tierRows: string[][] = [];
  for (const [kind, lab] of [['E', 'Epico'], ['L', 'Lendario']] as const) for (const t of [4, 5, 6]) {
    tierRows.push([`${lab} T${t}`, ...[30, 45, 60].map((d) => rng3(reps.map((r) => r.buyers.filter((b) => b.kind === kind).reduce((a, b) => a + b.buys.filter((x) => x.day < d && x.tier === t).length, 0))))]);
  }
  out.push('Pecas compradas por tier (total de todos os compradores do tipo, ate o dia):', '');
  out.push(table(['tipo / tier', 'dia 30', 'dia 45', 'dia 60'], tierRows), '');
  // days to first piece
  const firstPiece = [true, false].map((owner) => {
    const rowsX: string[] = [];
    for (const kind of ['E', 'L'] as const) {
      const ds = reps.map((r) => med(r.buyers.filter((b) => b.kind === kind && b.owner === owner && b.buys.length).map((b) => b.buys[0].day + 1)));
      rowsX.push(rng3(ds, 0));
    }
    return rowsX;
  });
  out.push(`Dia da primeira compra (mediana dos compradores): Epico dono ${firstPiece[0][0]}, Lendario dono ${firstPiece[0][1]}; Epico sem Passe ${firstPiece[1][0]}, Lendario sem Passe ${firstPiece[1][1]}.`, '');

  // ---- price index
  out.push(`#### 5. Indice de preco (MODELO: (compradores esperando + 7) / (estoque + 7) elevado a 0,5, entre 0,5 e 3; 1 = equilibrio)`, '');
  const pidx = [4, 5, 6].flatMap((t) => (['epic', 'legendary'] as const).map((r) => [`T${t} ${r === 'epic' ? 'Epica' : 'Lendaria'}`, ...DAY_COLS.map((dc) => fmt(med(reps.map((rp) => rp.priceIndex[`${t}:${r}`][dc - 1])), 2))]));
  out.push(table(['indice \\ dia', ...DAY_COLS.map((d) => `d${d}`)], pidx), '');

  // ---- 5b. sensitivity
  out.push(`#### 5b. Sensibilidade: as mesmas medicoes com outras hipoteses (so mercado; mediana de ${PARAMS.repeats} repeticoes)`, '');
  const sd = (xs: number[]) => (xs.every((x) => !Number.isFinite(x)) ? `> ${DAYS}` : dayCell(xs));
  const srows = market.sens.map((v) => {
    const pick = (f: (m: Metrics) => number) => v.metrics.map(f);
    return [v.name, sd(pick((m) => m.epicSetT4[0])), sd(pick((m) => m.epicSetT4[1])), sd(pick((m) => m.epicSetT4[2])), sd(pick((m) => m.legSetT4[0])), sd(pick((m) => m.legWA4[1])), sd(pick((m) => m.epicSetT5[0])), sd(pick((m) => m.legWA5[0])), fmt(med(pick((m) => m.legT4Up))), `${fmt(med(pick((m) => m.pctSet[0])))} / ${fmt(med(pick((m) => m.pctSet[1])))}`];
  });
  out.push(table(['hipotese', 'conj. Epico T4: 1o', '10o', '100o', 'conj. Lendario T4: 1o', 'arma+armadura Lendarias T4: 10o', 'conj. Epico T5: 1o', 'arma Lendaria T5: 1o', 'Lendarias T4+ anunciadas ate d60', '% donos com 7 pecas T4+ (Epico / Lendario)'], srows), '');

  // ---- 6. heroes: gold and league
  const heroFiles = fs.readdirSync(OUT).filter((f) => f.startsWith('hero-') && f.endsWith('.json') && f !== 'hero-jobs.json');
  const heroes = heroFiles.map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')) as { job: HeroJob; days: HeroDay[]; bought: { day: number; tpl: string; rarity: string; level: number }[] });
  const groupBy = (pred: (h: (typeof heroes)[number]) => boolean) => heroes.filter(pred);
  const lvlAt = (hs: { days: HeroDay[] }[], d: number) => rng3(hs.map((h) => h.days[d - 1].lvl), 1);
  const HD = [14, 30, 45, 60];
  const refRuns = (policy: 'S' | 'G') => {
    const arch = REF_ARCH[policy];
    return profiles[arch].slice(0, PARAMS.heroSeeds).map((p) => ({ days: p.map((x) => ({ lvl: x.lvl, gold: x.gold, goldIn: x.goldIn, goldOut: x.goldOut, worn: x.worn, gearBlock: x.gearBlock, cp: 0, floor: 0, hunt: {} })) as HeroDay[] }));
  };
  out.push(`#### 6. A Liga com a oferta real (dono do Passe; nivel + fracao no dia, mediana (min-max) de ${PARAMS.heroSeeds} seeds)`, '');
  for (const policy of ['G', 'S'] as const) {
    const rows6: string[][] = [];
    const add = (label: string, hs: { days: HeroDay[] }[]) => {
      if (hs.length) rows6.push([label, fmt(hs.length), ...HD.map((d) => lvlAt(hs, d))]);
    };
    add(`Nao comprador (${REF_ARCH[policy]})`, refRuns(policy));
    add('Comprador Epico, conjunto gratis (ORACULO: o modelo antigo, so o nivel limita)', groupBy((h) => h.job.policy === policy && h.job.kind === 'oracleE'));
    add('Comprador Lendario, conjunto gratis (ORACULO)', groupBy((h) => h.job.policy === policy && h.job.kind === 'oracleL'));
    add('Comprador Lendario, conjunto gratis COM os T4 dragao (ORACULO: o equivalente ao PBG da Rodada 24)', groupBy((h) => h.job.policy === policy && h.job.kind === 'oracleLD'));
    add('Comprador Lendario +8, conjunto gratis (ORACULO, hipotetico)', groupBy((h) => h.job.policy === policy && h.job.kind === 'oracleL8'));
    for (const kind of ['E', 'L'] as const) {
      for (const q of QS) {
        const lab = QLAB[q];
        add(`Comprador ${kind === 'E' ? 'Epico' : 'Lendario'} REAL, ${lab} (so o que existia)`, groupBy((h) => h.job.policy === policy && h.job.tag.includes(`-real${kind}-${q}-`)));
      }
    }
    for (const q of QS) {
      const lab = QLAB[q];
      add(`Comprador Lendario +8 REAL (hipotetico), ${lab}`, groupBy((h) => h.job.policy === policy && h.job.tag.includes(`-real${'L'}8-${q}-`)));
    }
    out.push(`Politica ${policy === 'G' ? 'GULOSA (so caca onde esta o XP; a de referencia da Rodada 24)' : 'ESPERTA (minera e forja o que falta)'}:`, '');
    out.push(table(['quem', 'seeds', ...HD.map((d) => `dia ${d}`)], rows6), '');
    // gaps
    const base = refRuns(policy);
    const gaps: string[][] = [];
    for (const [lab, filt] of [['Epico oraculo', (h: (typeof heroes)[number]) => h.job.kind === 'oracleE'], ['Lendario oraculo', (h: (typeof heroes)[number]) => h.job.kind === 'oracleL'], ['Lendario real (mediano)', (h: (typeof heroes)[number]) => h.job.tag.includes('-realL-q50-')], ['Epico real (mediano)', (h: (typeof heroes)[number]) => h.job.tag.includes('-realE-q50-')], ['Lendario real (o melhor de todos)', (h: (typeof heroes)[number]) => h.job.tag.includes('-realL-q00-')], ['Epico real (o melhor de todos)', (h: (typeof heroes)[number]) => h.job.tag.includes('-realE-q00-')], ['Lendario real (melhor 10%)', (h: (typeof heroes)[number]) => h.job.tag.includes('-realL-q10-')], ['Lendario +8 real (mediano, hipotetico)', (h: (typeof heroes)[number]) => h.job.tag.includes('-realL8-q50-')]] as const) {
      const hs = groupBy((h) => h.job.policy === policy && filt(h));
      if (!hs.length) continue;
      gaps.push([`${lab} − nao comprador`, ...HD.map((d) => fmt(med(hs.map((h) => h.days[d - 1].lvl - (base[h.job.seed - 1]?.days[d - 1].lvl ?? NaN))), 1))]);
    }
    out.push('Diferenca de nivel contra o nao comprador da mesma seed (mediana):', '');
    out.push(table(['par', ...HD.map((d) => `dia ${d}`)], gaps), '');
  }

  // ---- 7. when did the real buyer heroes get their pieces (the hero's own log)
  out.push(`#### 7. Quando o heroi comprador recebeu cada peca (o que o simulador entregou; dia 1-based; peca vestivel so apos o nivel da receita)`, '');
  const bt: string[][] = [];
  for (const policy of ['G', 'S'] as const) for (const kind of ['E', 'L'] as const) for (const q of QS) {
    const hs = groupBy((h) => h.job.policy === policy && h.job.tag.includes(`-real${kind}-${q}-`));
    if (!hs.length) continue;
    const cnt = (tier: number) => rng3(hs.map((h) => h.bought.filter((b) => (getGear(b.tpl)?.tier ?? 0) === tier).length), 0);
    const firstT = (tier: number) => rng3(hs.map((h) => med(h.bought.filter((b) => (getGear(b.tpl)?.tier ?? 0) === tier).map((b) => b.day + 1))), 0);
    bt.push([`${policy} ${kind === 'E' ? 'Epico' : 'Lendario'} ${q}`, cnt(4), firstT(4), cnt(5), firstT(5), cnt(6), firstT(6)]);
  }
  out.push(table(['heroi', 'pecas T4', 'dia mediano T4', 'pecas T5', 'dia mediano T5', 'pecas T6', 'dia mediano T6'], bt), '');

  // ---- 8. gold
  out.push(`#### 8. Ouro: o que o comprador ainda gasta e ganha (media por dia na janela de 7 dias ate o dia; mediana das seeds)`, '');
  const sumTags = (o: Record<string, number>, tags?: string[]) => (tags ? tags.reduce((a, t) => a + (o[t] ?? 0), 0) : sum(o));
  const winMean = (h: { days: HeroDay[] }, d: number, key: 'goldIn' | 'goldOut', tags?: string[]) => h.days.slice(d - 7, d).reduce((a, x) => a + sumTags(x[key], tags), 0) / 7;
  const goldRows: string[][] = [];
  const pushGold = (label: string, hs: { days: HeroDay[] }[]) => {
    if (!hs.length) return;
    goldRows.push([
      label,
      ...[30, 60].flatMap((d) => [fmt(med(hs.map((h) => winMean(h, d, 'goldIn')))), fmt(med(hs.map((h) => winMean(h, d, 'goldOut'))))]),
      ...[14, 30, 45, 60].map((d) => fmt(med(hs.map((h) => h.days[d - 1].gold)))),
      fmt(med(hs.map((h) => h.days.reduce((a, x) => a + sum(x.goldIn), 0)))),
      fmt(med(hs.map((h) => h.days.reduce((a, x) => a + sum(x.goldOut), 0)))),
      fmt(med(hs.map((h) => h.days.filter((x) => x.gearBlock.startsWith('ouro')).length))),
    ]);
  };
  for (const policy of ['G', 'S'] as const) {
    pushGold(`${policy}: nao comprador (${REF_ARCH[policy]})`, refRuns(policy));
    pushGold(`${policy}: Lendario oraculo`, groupBy((h) => h.job.policy === policy && h.job.kind === 'oracleL'));
    pushGold(`${policy}: Lendario oraculo com dragao (como a Rodada 24)`, groupBy((h) => h.job.policy === policy && h.job.kind === 'oracleLD'));
    for (const q of ['q00', 'q10', 'q50']) pushGold(`${policy}: Lendario real ${q}`, groupBy((h) => h.job.policy === policy && h.job.tag.includes(`-realL-${q}-`)));
    pushGold(`${policy}: Epico real q50`, groupBy((h) => h.job.policy === policy && h.job.tag.includes('-realE-q50-')));
    pushGold(`${policy}: Lendario +8 real q50 (hipotetico)`, groupBy((h) => h.job.policy === policy && h.job.tag.includes('-realL8-q50-')));
  }
  out.push(table(['heroi', 'ganha/dia d30', 'gasta/dia d30', 'ganha/dia d60', 'gasta/dia d60', 'na mao d14', 'd30', 'd45', 'd60', 'ganho total 60 dias', 'gasto total 60 dias', 'dias travado por Ouro'], goldRows), '');
  // spend by tag
  const tagSet = new Set<string>();
  const comp = [
    ['G: nao comprador', refRuns('G')],
    ['G: Lendario oraculo (conjunto cheio)', groupBy((h) => h.job.policy === 'G' && h.job.kind === 'oracleL')],
    ['G: Lendario real q00', groupBy((h) => h.job.policy === 'G' && h.job.tag.includes('-realL-q00-'))],
    ['G: Lendario real q50', groupBy((h) => h.job.policy === 'G' && h.job.tag.includes('-realL-q50-'))],
    ['S: nao comprador', refRuns('S')],
    ['S: Lendario oraculo (conjunto cheio)', groupBy((h) => h.job.policy === 'S' && h.job.kind === 'oracleL')],
    ['S: Lendario real q00', groupBy((h) => h.job.policy === 'S' && h.job.tag.includes('-realL-q00-'))],
  ] as const;
  for (const [, hs] of comp) for (const h of hs) for (const x of (h as { days: HeroDay[] }).days) for (const k of Object.keys(x.goldOut)) tagSet.add(k);
  const tags = [...tagSet];
  const spendRows = tags.map((tg) => [tg, ...comp.map(([, hs]) => fmt(med((hs as { days: HeroDay[] }[]).map((h) => h.days.reduce((a, x) => a + (x.goldOut[tg] ?? 0), 0)))))]);
  const incTags = new Set<string>();
  for (const [, hs] of comp) for (const h of hs) for (const x of (h as { days: HeroDay[] }).days) for (const k of Object.keys(x.goldIn)) incTags.add(k);
  const incRows = [...incTags].map((tg) => [tg, ...comp.map(([, hs]) => fmt(med((hs as { days: HeroDay[] }[]).map((h) => h.days.reduce((a, x) => a + (x.goldIn[tg] ?? 0), 0)))))]);
  out.push('Ouro gasto em 60 dias, por destino (mediana das seeds):', '');
  out.push(table(['destino', ...comp.map(([n]) => n)], spendRows), '');
  out.push('Ouro ganho em 60 dias, por origem:', '');
  out.push(table(['origem', ...comp.map(([n]) => n)], incRows), '');
  console.log(out.join('\n'));
}
