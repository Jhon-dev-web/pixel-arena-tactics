// Rodada 27: buyers who buy MATERIALS (and Gold Pouches), not only finished pieces. The pure model behind `npm run sim:market -- buy` (scripts/sim/marketPopulation.sim.ts calls it from inside the
// market's day loop; nothing here plays the game: the hero runs of the Player measure what the bought things are worth).
//
// WHAT IS A MODEL HERE (everything else of the stage is the real Player)
//   needs     what a buyer ASKS for is not guessed from a non-buyer: it is what a real Player asked for when the market gave him everything for free (Player.opts.freeNeeds, the "need" stage): at every
//             visit he asks for the raw units his next craft is missing (the plan's deficit, only the materials that can be tradeable at all) and, when the craft lacks only Gold, for the Gold. The
//             asks of several such heroes per path policy are the DEMAND CURVES; a market buyer follows one of them, at his own speed, and asks for what the curve will have asked in the next
//             `lookahead` days and he has not bought yet. (The curve is that of a buyer with no limit, who runs ahead of a budgeted one: the demand of a poor buyer is a little early.)
//   stock     the tradeable units that the 1 000 players list (tradeable dice x `listMat...` share of the market model), per material, cumulative, minus what the buyers took. No expiry (30 days in
//             MARKET_SOLANA.md; the stock is bought long before that), no minimum lot, partial lots allowed.
//   queue     a day's stock of a material is shared pro rata to what the buyers ask for (a fair queue), not first come first served.
//   price     reference Gold of the material (economy.ts baseGoldValue) x `usdPerGold` x a scarcity index per material and day: sqrt((units asked yesterday + K) / (units on offer today + K)) between
//             0.5 and 3 (the same shape as the index of the gear in marketPopulation.sim.ts). `usdPerGold` anchors the budget in money; it is an ASSUMPTION (1 000 reference Gold ~ one hour of the last
//             zones ~ US$ 1) and the budget is linear in it: US$ 30 at 0.001 is US$ 15 at 0.0005.
//   gear      the price of a piece is the middle of its band in docs/ECONOMY_AUDIT.md (npm run sim:prices) x usdPerGold x the gear's index of yesterday.
//   pouch     a Gold Pouch costs its face value x usdPerGold x an index (1 to 3, same shape); a buyer opens up to 2 a day, only on the days his twin was blocked by Gold.
import { baseGoldValue } from '../../src/game/economy';
import { MaterialId } from '../../src/game/materials';
import { TRADEABLE_CHANCE } from '../../supabase/functions/_shared/materials/rates';
import T from '../../src/game/tunables';

export type BuyPolicy = 'M' | 'MG' | 'MGP';
export interface BuyMode {
  id: string; // e.g. "MG-30"
  policy: BuyPolicy;
  budget: number; // US$ over the 60 days (>= 1e9 = unlimited)
}
export const UNLIMITED = 1e9;
export const POLICY_LABEL: Record<BuyPolicy, string> = { M: 'so materiais', MG: 'materiais + pecas', MGP: 'materiais + pecas + Bolsas de Ouro' };

export type MatGroup = 'horta' | 'mineracao' | 'lenhador' | 'caca';
export const GROUPS: MatGroup[] = ['mineracao', 'lenhador', 'horta', 'caca']; // the order a short wallet is spent in: the sources that cost gathering time first
export const MAT_GROUP: Record<string, MatGroup> = {};
for (const m of Object.keys(TRADEABLE_CHANCE)) {
  MAT_GROUP[m] = ['copper', 'iron', 'silver', 'gold_ore', 'obsidian'].includes(m)
    ? 'mineracao'
    : ['common_wood', 'oak_wood', 'ebony_wood', 'elven_wood', 'ancient_wood'].includes(m)
      ? 'lenhador'
      : ['common_herb', 'energy_herb', 'iron_thistle', 'swift_grass', 'uncommon_root', 'gold_blossom', 'crimson_mushroom', 'silver_sage', 'rare_flower', 'moon_lily', 'dusk_orchid', 'elder_root'].includes(m)
        ? 'horta'
        : 'caca';
}
export const TRADEABLE_MATS = Object.keys(TRADEABLE_CHANCE);
export const MAT_REF: Record<string, number> = Object.fromEntries(TRADEABLE_MATS.map((m) => [m, baseGoldValue(m as MaterialId)]));

/** Middle of the plausible price band of a piece, in reference Gold (docs/ECONOMY_AUDIT.md section 24, `npm run sim:prices`). */
export const GEAR_REF_GOLD: Record<string, number> = {
  '4:epic': 3874,
  '4:legendary': 10852,
  '5:epic': 12810,
  '5:legendary': 29786,
  '6:epic': 9269,
  '6:legendary': 23093,
};

export interface BuyParams {
  usdPerGold: number;
  lookahead: number; // days of the twin's burn a buyer keeps in the bag
  gearShare: number; // MG: share of the budget kept for pieces (the rest is materials)
  mixShare: [number, number, number]; // MGP: materials / pieces / pouches
  releaseDay: number; // the wallet of the pieces and of the pouches that is still unspent goes to the materials from this (0-based) day on
  priceK: number; // the K of the material index (units)
}

export interface Order {
  day: number;
  mat?: string;
  qty?: number;
  gold?: number;
  usd: number;
}

/** What a hero with no limit asked for (Player.askedMats / askedGold), by day of that hero. */
export interface Asks {
  mats: { day: number; mat: string; qty: number }[];
  gold: { day: number; gold: number }[];
}

/** One buyer of the model: the demand curve he follows (cumulative asks by day of the curve), his wallets and what he bought. */
export interface MatBuyer {
  id: number;
  stop: number;
  speed: number;
  profileLen: number;
  cum: Record<string, Float64Array>; // material -> cumulative units asked through day k of the curve
  goldCum: Float64Array; // cumulative Gold asked through day k of the curve
  goldBought: number; // face value of the pouches opened so far
  wallet: { mat: number; gear: number; pouch: number };
  bought: Record<string, number>;
  orders: Order[];
  spent: { mat: number; gear: number; pouch: number };
  refValue: number; // reference Gold of everything bought (materials, pieces, pouches): the rank of the buyer
  twinTotal: number; // units the curve asks for in the 60 days (the denominator of the coverage)
  demand: Record<string, number>; // the same by material
}

export interface DayStat {
  listed: Record<MatGroup, number>;
  wished: Record<MatGroup, number>;
  bought: Record<MatGroup, number>;
  onOffer: Record<MatGroup, number>; // stock at the start of the day, after the day's listings
  idx: Record<MatGroup, number>; // units-weighted mean of the material indices
  pouchBought: number;
}
const zeroG = (): Record<MatGroup, number> => ({ mineracao: 0, lenhador: 0, horta: 0, caca: 0 });

export function makeBuyer(args: { id: number; stop: number; speed: number; asks: Asks; curveDays: number; days: number; mode: BuyMode; bp: BuyParams }): MatBuyer {
  const { id, stop, speed, asks, curveDays: n, days, mode, bp } = args;
  const cum: Record<string, Float64Array> = {};
  let twinTotal = 0;
  const demand: Record<string, number> = {};
  const lastK = Math.min(n - 1, Math.ceil(days * speed - 1e-9) - 1);
  const daily: Record<string, Float64Array> = {};
  for (const m of TRADEABLE_MATS) daily[m] = new Float64Array(n);
  for (const a of asks.mats) if (a.day < n && daily[a.mat]) daily[a.mat][a.day] += a.qty;
  for (const m of TRADEABLE_MATS) {
    const a = new Float64Array(n);
    let x = 0;
    for (let k = 0; k < n; k++) {
      x += daily[m][k];
      a[k] = x;
    }
    cum[m] = a;
    demand[m] = a[Math.max(0, lastK)];
    twinTotal += demand[m];
  }
  const goldCum = new Float64Array(n);
  {
    const g = new Float64Array(n);
    for (const a of asks.gold) if (a.day < n) g[a.day] += a.gold;
    let x = 0;
    for (let k = 0; k < n; k++) {
      x += g[k];
      goldCum[k] = x;
    }
  }
  const shares = mode.policy === 'M' ? [1, 0, 0] : mode.policy === 'MG' ? [1 - bp.gearShare, bp.gearShare, 0] : bp.mixShare;
  const B = mode.budget;
  return {
    id,
    stop,
    speed,
    profileLen: n,
    cum,
    goldCum,
    goldBought: 0,
    wallet: { mat: B >= UNLIMITED ? Infinity : B * shares[0], gear: B >= UNLIMITED ? Infinity : B * shares[1], pouch: B >= UNLIMITED ? Infinity : B * shares[2] },
    bought: {},
    orders: [],
    spent: { mat: 0, gear: 0, pouch: 0 },
    refValue: 0,
    twinTotal,
    demand,
  };
}

export class MatMarket {
  stock: Record<string, number> = {};
  private wishPrev: Record<string, number> = {};
  private pouchStock: Record<number, number> = {};
  private pouchWishPrev = 0;
  daily: DayStat[] = [];
  listedUnits: Record<string, number> = {};
  boughtUnits: Record<string, number> = {};
  wishedUnits: Record<string, number> = {};
  idxByMat: Record<string, number[]> = {};
  constructor(
    private bp: BuyParams,
    private mode: BuyMode,
    private rng: () => number,
    private days: number,
  ) {
    for (const m of TRADEABLE_MATS) {
      this.stock[m] = 0;
      this.listedUnits[m] = 0;
      this.boughtUnits[m] = 0;
      this.wishedUnits[m] = 0;
      this.idxByMat[m] = [];
    }
  }

  /** The scarcity index of the material today. */
  idx(m: string): number {
    return Math.max(0.5, Math.min(3, Math.sqrt(((this.wishPrev[m] ?? 0) + this.bp.priceK) / ((this.stock[m] ?? 0) + this.bp.priceK))));
  }
  priceUsd(m: string): number {
    return MAT_REF[m] * this.bp.usdPerGold * this.idx(m);
  }

  /** One market day: the day's listings come in, the buyers ask, the stock is shared, the buyers pay. `listed`: units listed today by material; `pouches`: pouches listed today by face. */
  day(d: number, buyers: MatBuyer[], listed: Record<string, number>, pouches: Record<number, number>): DayStat {
    const st: DayStat = { listed: zeroG(), wished: zeroG(), bought: zeroG(), onOffer: zeroG(), idx: zeroG(), pouchBought: 0 };
    for (const m of TRADEABLE_MATS) {
      const u = listed[m] ?? 0;
      this.stock[m] += u;
      this.listedUnits[m] += u;
      st.listed[MAT_GROUP[m]] += u;
    }
    for (const [f, n] of Object.entries(pouches)) this.pouchStock[Number(f)] = (this.pouchStock[Number(f)] ?? 0) + n;
    for (const m of TRADEABLE_MATS) st.onOffer[MAT_GROUP[m]] += this.stock[m];
    const price: Record<string, number> = {};
    for (const m of TRADEABLE_MATS) {
      price[m] = this.priceUsd(m);
      this.idxByMat[m].push(this.idx(m));
    }
    const active = buyers.filter((b) => d < b.stop);
    // the wallet of the pieces and of the pouches that is still unspent goes to the materials from `releaseDay`
    if (d === this.bp.releaseDay) for (const b of active) if (Number.isFinite(b.wallet.mat)) { b.wallet.mat += b.wallet.gear + b.wallet.pouch; b.wallet.gear = 0; b.wallet.pouch = 0; }
    // ---- what each buyer asks for
    const wish = new Map<number, Record<string, number>>();
    const dayWish: Record<string, number> = {};
    for (const b of active) {
      const kLook = Math.min(b.profileLen - 1, Math.ceil((d + 1 + this.bp.lookahead) * b.speed - 1e-9) - 1);
      if (kLook < 0) continue;
      const w: Record<string, number> = {};
      for (const m of TRADEABLE_MATS) {
        const x = Math.floor(b.cum[m][kLook] - (b.bought[m] ?? 0));
        if (x > 0) w[m] = x;
      }
      // a short wallet is spent group by group (the gathering sources first), pro rata inside a group
      let left = b.wallet.mat;
      for (const g of GROUPS) {
        const ms = Object.keys(w).filter((m) => MAT_GROUP[m] === g);
        const cost = ms.reduce((a, m) => a + w[m] * price[m], 0);
        if (cost <= left) {
          left -= cost;
          continue;
        }
        const f = left <= 0 ? 0 : left / cost;
        for (const m of ms) {
          w[m] = Math.floor(w[m] * f);
          if (w[m] <= 0) delete w[m];
        }
        left = 0;
      }
      wish.set(b.id, w);
      for (const [m, x] of Object.entries(w)) dayWish[m] = (dayWish[m] ?? 0) + x;
    }
    // ---- the queue: every material is shared pro rata to what is asked
    const remaining: Record<string, number> = { ...this.stock };
    const idxW = zeroG();
    const idxN = zeroG();
    for (const b of active) {
      const w = wish.get(b.id);
      if (!w) continue;
      const got: Record<string, number> = {};
      let usd = 0;
      for (const [m, x] of Object.entries(w)) {
        const fill = Math.min(1, this.stock[m] / Math.max(1, dayWish[m]));
        const e = x * fill;
        let u = Math.floor(e) + (this.rng() < e - Math.floor(e) ? 1 : 0);
        u = Math.max(0, Math.min(u, remaining[m], x));
        if (u <= 0) continue;
        remaining[m] -= u;
        got[m] = u;
        usd += u * price[m];
      }
      // the rounding can leave the wallet a hair short: drop the dearest line until it fits
      while (usd > b.wallet.mat + 1e-9 && Object.keys(got).length) {
        const worst = Object.keys(got).sort((a, c) => price[c] * got[c] - price[a] * got[a])[0];
        remaining[worst] += got[worst];
        usd -= got[worst] * price[worst];
        delete got[worst];
      }
      for (const [m, u] of Object.entries(got)) {
        b.bought[m] = (b.bought[m] ?? 0) + u;
        b.refValue += u * MAT_REF[m];
        b.orders.push({ day: d, mat: m, qty: u, usd: u * price[m] });
        this.boughtUnits[m] += u;
        st.bought[MAT_GROUP[m]] += u;
        idxW[MAT_GROUP[m]] += u * this.idx(m);
        idxN[MAT_GROUP[m]] += u;
      }
      b.spent.mat += usd;
      b.wallet.mat -= usd;
    }
    for (const m of TRADEABLE_MATS) {
      this.stock[m] = remaining[m];
      this.wishedUnits[m] += dayWish[m] ?? 0;
      this.wishPrev[m] = dayWish[m] ?? 0;
      st.wished[MAT_GROUP[m]] += dayWish[m] ?? 0;
    }
    for (const g of GROUPS) st.idx[g] = idxN[g] > 0 ? idxW[g] / idxN[g] : NaN;
    // ---- the Gold Pouches, only for MGP: he opens pouches until the Gold his curve asked for (within the lookahead) is covered, at most perDay a day
    if (this.mode.policy === 'MGP') {
      const faces = Object.keys(this.pouchStock).map(Number).sort((a, b) => b - a);
      const pouchIdx = Math.max(1, Math.min(3, Math.sqrt((this.pouchWishPrev + 3) / (faces.reduce((a, f) => a + this.pouchStock[f], 0) + 3))));
      let wished = 0;
      for (const b of active) {
        const kLook = Math.min(b.profileLen - 1, Math.ceil((d + 1 + this.bp.lookahead) * b.speed - 1e-9) - 1);
        if (kLook < 0) continue;
        for (let i = 0; i < T.goldPouch.perDay; i++) {
          const unmet = b.goldCum[kLook] - b.goldBought;
          if (unmet <= 0) break;
          wished++;
          // the biggest face that fits in the unmet Gold; the smallest one when none does
          const fit = faces.filter((f) => this.pouchStock[f] > 0 && f <= unmet);
          const face = fit.length ? fit[0] : faces.filter((f) => this.pouchStock[f] > 0).slice(-1)[0];
          if (face === undefined) break;
          const usd = face * this.bp.usdPerGold * pouchIdx;
          if (usd > b.wallet.pouch) break;
          this.pouchStock[face]--;
          b.wallet.pouch -= usd;
          b.spent.pouch += usd;
          b.goldBought += face;
          b.refValue += face;
          b.orders.push({ day: d, gold: face, usd });
          st.pouchBought++;
        }
      }
      this.pouchWishPrev = wished;
    }
    this.daily.push(st);
    return st;
  }
}

/** The pouch faces of the game, biggest first (tunables.goldPouch). */
export const POUCH_FACE_LIST = [T.goldPouch.denomLarge, T.goldPouch.denomMedium, T.goldPouch.denomSmall] as const;

export const gearUsd = (tier: number, rarity: string, idx: number, bp: BuyParams): number => (GEAR_REF_GOLD[`${tier}:${rarity}`] ?? 0) * bp.usdPerGold * idx;
