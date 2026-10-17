// A fake backend with INVENTED data, used only by a build made with VITE_ADMIN_DEMO=1 (screenshots, layout work). It follows the same contract as the database
// functions (search, sort, filters, paging, masked e-mails), so every control on every page works against it. It never touches the network.
import type { AdminApi } from './api';
import type { AuthPort } from './auth';
import type { Backend } from './backend';
import { maskEmail } from './format';
import type {
  Economy,
  FlagRow,
  FlagsPage,
  GoldDaily,
  League,
  LeagueRow,
  LegendaryPage,
  LegendaryRow,
  ListingRow,
  MarketPage,
  Overview,
  Page,
  PlayerDetail,
  PlayerRow,
  SaleRow,
  SeriesDay,
  Waitlist,
} from './types';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Aldric', 'Brienne', 'Caelum', 'Dorothea', 'Elric', 'Fenwick', 'Gwendal', 'Hestia', 'Iolanthe', 'Jareth', 'Kaelen', 'Lyra', 'Magnus', 'Nyx', 'Orsino', 'Perrin', 'Quill', 'Rowena', 'Soren', 'Talia', 'Ulric', 'Vesper', 'Wren', 'Xanthe', 'Ysolde', 'Zephyr'];
const TEMPLATES: { id: string; tier: number; slot: string; kind: 'gear' | 'unique' }[] = [
  { id: 'steel_greatsword', tier: 3, slot: 'weapon', kind: 'gear' },
  { id: 'dragonbone_blade', tier: 5, slot: 'weapon', kind: 'gear' },
  { id: 'mythril_plate', tier: 5, slot: 'armor', kind: 'gear' },
  { id: 'obsidian_helm', tier: 4, slot: 'helmet', kind: 'gear' },
  { id: 'runed_boots', tier: 4, slot: 'boots', kind: 'gear' },
  { id: 'stormcaller_ring', tier: 6, slot: 'ring', kind: 'gear' },
  { id: 'demon_fang_dagger', tier: 2, slot: 'weapon', kind: 'unique' },
  { id: 'bloodvein_plate', tier: 2, slot: 'armor', kind: 'unique' },
  { id: 'abyss_heart_ring', tier: 4, slot: 'ring', kind: 'unique' },
];
const MATERIALS = ['iron_ore', 'oak_log', 'coal', 'herb_bundle', 'mythril_ore', 'dragon_scale', 'moon_flower'];
const REASONS = ['PACE_TOO_FAST', 'GOLD_JUMP', 'BASELINE_AHEAD_OF_ACCOUNT_AGE', 'KILLS_TOO_HIGH', 'ITEM_COUNT_JUMP'];
const ITEM_CODES = ['HUNT_TIME_EXCESS', 'BOSS_KILLS_EXCESS'];

const NOW = Date.now();
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const dayKey = (msAgo: number): string => new Date(NOW - msAgo).toISOString().slice(0, 10);
const sig = (r: () => number): string => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 88; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
};
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const addr = (r: () => number): string => sig(r).slice(0, 44);

interface World {
  players: (PlayerRow & { email: string })[];
  legendaries: LegendaryRow[];
  sales: SaleRow[];
  listings: ListingRow[];
  flags: FlagRow[];
  series: SeriesDay[];
  overview: Overview;
  economy: Economy;
  league: League;
  waitlist: Waitlist;
}

function build(): World {
  const r = rng(20261017);
  const players: (PlayerRow & { email: string })[] = [];
  for (let i = 0; i < 148; i++) {
    const base = NAMES[i % NAMES.length];
    const username = i < NAMES.length ? base : `${base}${Math.floor(r() * 900) + 10}`;
    const level = Math.min(100, 1 + Math.floor(Math.pow(r(), 0.55) * 100));
    const paragon = level === 100 ? Math.floor(r() * 40) : 0;
    const lastSeenAgo = i < 9 ? Math.floor(r() * 4 * MIN) : r() < 0.35 ? Math.floor(r() * 20 * HOUR) : Math.floor(r() * 30 * DAY);
    const hasPass = r() < 0.34;
    const sourceRoll = r();
    const source = !hasPass ? null : sourceRoll < 0.55 ? 'stripe' : sourceRoll < 0.8 ? 'crypto_sol' : sourceRoll < 0.9 ? 'referral' : 'grant';
    const flags = r() < 0.06 ? 1 + Math.floor(r() * 3) : 0;
    const email = `${username.toLowerCase()}@${['gmail.com', 'outlook.com', 'proton.me', 'uol.com.br'][Math.floor(r() * 4)]}`;
    players.push({
      user_id: uid(100 + i),
      username,
      hero_name: base,
      email,
      email_masked: maskEmail(email),
      created_at: iso(Math.floor(r() * 40 * DAY) + lastSeenAgo / 4),
      last_seen: iso(lastSeenAgo),
      online: lastSeenAgo <= 5 * MIN,
      hero_level: level,
      paragon_level: paragon,
      highest_floor: Math.min(100, Math.floor(level * (0.6 + r() * 0.4))),
      deepest_depth: level === 100 ? Math.floor(r() * 30) : 0,
      gold: Math.floor(Math.pow(r(), 3) * 4_500_000 + level * 900),
      stats_at: iso(Math.floor(r() * 5 * HOUR)),
      pass_source: source,
      pass_livemode: source ? source !== 'grant' : null,
      wallet: source === 'crypto_sol' || r() < 0.18 ? addr(r) : null,
      open_flags: flags,
      item_flags: r() < 0.03 ? 1 : 0,
      items_held: Math.floor(r() * 9),
      items_listed: Math.floor(r() * 3),
      sales: Math.floor(Math.pow(r(), 3) * 12),
      purchases: Math.floor(Math.pow(r(), 3) * 9),
    });
  }

  const legendaries: LegendaryRow[] = [];
  const sources: LegendaryRow['source'][] = ['forge', 'pity', 'seal', 'drop', 'boss'];
  for (let i = 0; i < 64; i++) {
    const tpl = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
    const owner = players[Math.floor(r() * players.length)];
    const source: LegendaryRow['source'] = tpl.kind === 'unique' ? (r() < 0.5 ? 'drop' : 'boss') : sources[Math.floor(r() * 3)];
    const statusRoll = r();
    const status: LegendaryRow['status'] = source === 'seal' ? 'bound' : statusRoll < 0.45 ? 'held' : statusRoll < 0.6 ? 'listed' : statusRoll < 0.8 ? 'sold' : statusRoll < 0.92 ? 'bound' : 'burned';
    const buyer = players[Math.floor(r() * players.length)];
    legendaries.push({
      item_id: uid(5000 + i),
      issued_at: iso(Math.floor(r() * 28 * DAY)),
      user_id: owner.user_id,
      username: owner.username,
      kind: tpl.kind,
      template_id: tpl.id,
      tier: tpl.tier,
      slot: tpl.slot,
      rarity: tpl.kind === 'unique' ? 'epic' : 'legendary',
      source,
      status,
      current_owner_id: status === 'sold' ? buyer.user_id : owner.user_id,
      current_owner_username: status === 'sold' ? buyer.username : owner.username,
      current_status: status === 'sold' ? 'held' : status,
    });
  }
  legendaries.sort((a, b) => b.issued_at.localeCompare(a.issued_at));

  const sales: SaleRow[] = [];
  for (let i = 0; i < 96; i++) {
    const seller = players[Math.floor(r() * players.length)];
    const buyer = players[Math.floor(r() * players.length)];
    const isMat = r() < 0.4;
    const tpl = TEMPLATES[Math.floor(r() * 6)];
    const priceSol = isMat ? Math.round((0.01 + r() * 0.4) * 1000) / 1000 : Math.round((0.05 + Math.pow(r(), 2) * 6) * 1000) / 1000;
    const price = Math.round(priceSol * 1e9);
    const fee = Math.ceil(price * 0.05);
    sales.push({
      id: uid(9000 + i),
      sold_at: iso(Math.floor(r() * 21 * DAY)),
      seller_id: seller.user_id,
      seller_username: seller.username,
      buyer_id: buyer.user_id,
      buyer_username: buyer.username,
      item_kind: isMat ? 'material' : 'gear',
      item_template: isMat ? null : tpl.id,
      material_id: isMat ? MATERIALS[Math.floor(r() * MATERIALS.length)] : null,
      material_qty: isMat ? 50 + Math.floor(r() * 2000) : null,
      price_lamports: price,
      fee_lamports: fee,
      seller_lamports: price - fee,
      tx_signature: sig(r),
      livemode: i % 9 !== 0,
    });
  }
  sales.sort((a, b) => b.sold_at.localeCompare(a.sold_at));

  const listings: ListingRow[] = [];
  const statuses = ['open', 'open', 'open', 'reserved', 'sold', 'cancelled', 'expired'];
  for (let i = 0; i < 38; i++) {
    const seller = players[Math.floor(r() * players.length)];
    const isMat = r() < 0.4;
    const tpl = TEMPLATES[Math.floor(r() * 6)];
    listings.push({
      id: uid(7000 + i),
      created_at: iso(Math.floor(r() * 9 * DAY)),
      seller_id: seller.user_id,
      seller_username: seller.username,
      status: statuses[Math.floor(r() * statuses.length)],
      item_kind: isMat ? null : 'gear',
      item_template: isMat ? null : tpl.id,
      rarity: isMat ? null : r() < 0.6 ? 'epic' : 'legendary',
      tier: isMat ? null : tpl.tier,
      material_id: isMat ? MATERIALS[Math.floor(r() * MATERIALS.length)] : null,
      material_qty: isMat ? 100 + Math.floor(r() * 900) : null,
      price_lamports: Math.round((0.05 + r() * 4) * 1000) * 1_000_000,
      expires_at: iso(-Math.floor(r() * 6 * DAY)),
      closed_at: null,
    });
  }
  listings.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const flagged = players.filter((p) => p.open_flags > 0 || p.item_flags > 0);
  const flags: FlagRow[] = flagged.map((p, i) => ({
    user_id: p.user_id,
    username: p.username,
    flagged_snapshots: p.open_flags,
    rejected_snapshots: i % 4 === 0 ? 1 : 0,
    reasons: REASONS.slice(0, 1 + (i % 3)),
    item_flags: p.item_flags,
    item_codes: p.item_flags ? ITEM_CODES.slice(0, 1) : [],
    disqualified: i === 1,
    last_flag_at: iso(Math.floor(r() * 6 * DAY)),
    hero_level: p.hero_level,
    paragon_level: p.paragon_level,
    highest_floor: p.highest_floor,
    pass_source: p.pass_source,
    last_seen: p.last_seen,
  }));

  const series: SeriesDay[] = [];
  for (let d = 29; d >= 0; d--) {
    const growth = 1 + (29 - d) * 0.045;
    const stripe = Math.floor(r() * 5 * growth);
    const usdc = Math.floor(r() * 3 * growth);
    series.push({
      day: dayKey(d * DAY),
      signups: Math.floor((18 + r() * 24) * growth),
      active_players: Math.floor((60 + r() * 50) * growth),
      sales: Math.floor((2 + r() * 9) * growth),
      volume_lamports: Math.round((1 + r() * 14) * growth * 1e9),
      fee_lamports: Math.round((0.05 + r() * 0.7) * growth * 1e9),
      pass_stripe: stripe,
      pass_usdc: usdc,
      pass_test: r() < 0.2 ? 1 : 0,
      pass_grant: r() < 0.15 ? 1 : 0,
      pass_referral: r() < 0.25 ? 1 : 0,
      pass_other: 0,
      pass_revenue_usd: stripe * 10 + usdc * 10,
      legendaries: Math.floor(r() * 3 * growth),
      uniques: Math.floor(r() * 2),
      pouches_minted: Math.floor(r() * 14),
      pouches_minted_gold: Math.floor(r() * 14) * 5000,
      pouches_opened: Math.floor(r() * 12),
    });
  }

  const sum = (f: (d: SeriesDay) => number) => series.reduce((a, d) => a + f(d), 0);
  const liveSales = sales.filter((s) => s.livemode);
  const testSales = sales.filter((s) => !s.livemode);
  const side = (list: SaleRow[]) => ({
    sales: list.length,
    sales_items: list.filter((s) => !s.material_id).length,
    sales_materials: list.filter((s) => s.material_id).length,
    volume_lamports: list.reduce((a, s) => a + s.price_lamports, 0),
    fee_lamports: list.reduce((a, s) => a + s.fee_lamports, 0),
    buyers: new Set(list.map((s) => s.buyer_id)).size,
    sellers: new Set(list.map((s) => s.seller_id)).size,
  });
  const itemGroups: Overview['items'] = [];
  for (const [kind, rarity, status, count] of [
    ['gear', 'epic', 'held', 410],
    ['gear', 'epic', 'listed', 36],
    ['gear', 'epic', 'transferred', 52],
    ['gear', 'epic', 'burned', 118],
    ['gear', 'legendary', 'held', 41],
    ['gear', 'legendary', 'listed', 9],
    ['gear', 'legendary', 'transferred', 12],
    ['gear', 'legendary', 'burned', 6],
    ['unique', 'epic', 'held', 23],
    ['unique', 'epic', 'listed', 4],
    ['gold_pouch', null, 'held', 188],
    ['gold_pouch', null, 'burned', 904],
  ] as [string, string | null, string, number][]) {
    itemGroups.push({ kind, rarity, status, bound: false, bought: false, count });
  }
  itemGroups.push({ kind: 'gear', rarity: 'epic', status: 'held', bound: false, bought: true, count: 52 }, { kind: 'gear', rarity: 'legendary', status: 'held', bound: false, bought: true, count: 12 });

  const materials = MATERIALS.map((m, i) => ({ material_id: m, qty: Math.floor(9000 / (i + 1) + 400), pending: Math.floor(r() * 60), listed: Math.floor(r() * 3000), holders: Math.floor(120 / (i + 1) + 8) }));
  const goldTotal = players.reduce((a, p) => a + (p.gold ?? 0), 0);
  const cachedAt = iso(2 * HOUR);

  const overview: Overview = {
    generated_at: new Date(NOW).toISOString(),
    timezone: 'America/Sao_Paulo',
    players: {
      registered: 4186,
      confirmed: 3954,
      with_username: 3711,
      signups_today: series[29].signups,
      signups_7d: series.slice(23).reduce((a, d) => a + d.signups, 0),
      signups_30d: sum((d) => d.signups),
      characters: 3702,
      online_now: players.filter((p) => p.online).length + 31,
      active_today: series[29].active_players,
      active_7d: 1288,
      active_30d: 2410,
      online_window_minutes: 5,
    },
    pass: {
      by_source: [
        { source: 'stripe', livemode: true, active: 846, refunded: 12, revoked: 0 },
        { source: 'stripe', livemode: false, active: 6, refunded: 0, revoked: 0 },
        { source: 'crypto_sol', livemode: true, active: 311, refunded: 0, revoked: 0 },
        { source: 'crypto_sol', livemode: false, active: 4, refunded: 0, revoked: 0 },
        { source: 'referral', livemode: true, active: 22, refunded: 0, revoked: 0 },
        { source: 'grant', livemode: false, active: 15, refunded: 0, revoked: 1 },
      ],
      owners_active: 1204,
      card_price_usd: 10,
      card_sold_live: 846,
      card_refunded_live: 12,
      card_sold_test: 6,
      usdc_live: 3110,
      usdc_test: 40,
      usdc_to_refund: 10,
      usdc_payments_live: 311,
      goal_target: 15000,
      goal_paid: 1157,
    },
    market: {
      live: side(liveSales),
      test: side(testSales),
      listings_open: listings.filter((l) => l.status === 'open' || l.status === 'reserved').length,
      listings_open_items: listings.filter((l) => (l.status === 'open' || l.status === 'reserved') && !l.material_id).length,
      listings_open_materials: listings.filter((l) => (l.status === 'open' || l.status === 'reserved') && l.material_id).length,
      listings_total: 412,
      refund_due_count: 1,
      refund_due_lamports: 1_050_000_000,
    },
    collected: { fees_lamports: side(liveSales).fee_lamports, volume_lamports: side(liveSales).volume_lamports, usdc: 3110 },
    items: itemGroups,
    pouches: { outstanding: 188, outstanding_gold: 1_240_000, listed: 14, minted: 1092, opened: 904 },
    materials,
    league: {
      season: { number: 1, kind: 'ranked', status: 'open', starts_at: iso(12 * DAY), ends_at: iso(-48 * DAY), freeze_at: iso(-46 * DAY) },
      goal_target: 15000,
      goal_paid: 1157,
      goal_opened_at: iso(12 * DAY),
      reset_at: iso(12 * DAY),
      entries: 1021,
      entries_flagged: 37,
      entries_disqualified: 4,
      players_with_open_flags: flagged.length,
      players_with_item_flags: players.filter((p) => p.item_flags).length,
    },
    waitlist: { total: 9340, unsubscribed: 212, today: 63, last_7d: 512, referred: 2480, qualified: 611 },
    freshness: { player_cache_rows: 3702, player_cache_refreshed_at: cachedAt, gold_total: goldTotal * 25, gold_day: dayKey(0), gold_captured_at: cachedAt, daily_captured_at: iso(7 * MIN) },
  };

  const goldSeries: GoldDaily[] = [];
  for (let d = 44; d >= 0; d--) {
    const total = Math.round((38_000_000 + (44 - d) * 1_650_000 + r() * 2_500_000) * 1);
    goldSeries.push({
      day: dayKey(d * DAY),
      accounts: 3200 + (44 - d) * 11,
      gold_total: total,
      gold_avg: Math.round(total / 3500),
      gold_median: Math.round(total / 3500 / 4),
      gold_p90: Math.round((total / 3500) * 2.4),
      gold_max: 4_500_000 + (44 - d) * 40_000,
      top10_share: 0.16 + r() * 0.02,
      pouch_count: 180 + Math.floor(r() * 20),
      pouch_gold: 1_150_000 + Math.floor(r() * 120_000),
      materials_qty: 180_000 + (44 - d) * 2_500,
      captured_at: iso(d * DAY),
    });
  }
  const economy: Economy = {
    generated_at: new Date(NOW).toISOString(),
    gold_latest: goldSeries[goldSeries.length - 1],
    gold_series: goldSeries,
    gold_top: [...players]
      .sort((a, b) => (b.gold ?? 0) - (a.gold ?? 0))
      .slice(0, 10)
      .map((p) => ({ user_id: p.user_id, username: p.username, gold: p.gold ?? 0, hero_level: p.hero_level })),
    saves_items: { accounts: 3702, common: 41_200, rare: 18_300, epic: 6_410, legendary: 212, refreshed_at: cachedAt },
    pouches: { outstanding: 188, outstanding_gold: 1_240_000, listed: 14, minted: 1092, opened: 904, minted_gold: 6_900_000, opened_gold: 5_660_000 },
    pouches_by_id: [
      { pouch_id: 'gold_pouch_l', count: 31, gold: 620_000 },
      { pouch_id: 'gold_pouch_m', count: 74, gold: 370_000 },
      { pouch_id: 'gold_pouch_s', count: 83, gold: 166_000 },
    ],
    materials,
    items: itemGroups,
    sol: {
      volume_7d_lamports: series.slice(23).reduce((a, d) => a + d.volume_lamports, 0),
      volume_30d_lamports: sum((d) => d.volume_lamports),
      fees_7d_lamports: series.slice(23).reduce((a, d) => a + d.fee_lamports, 0),
      fees_30d_lamports: sum((d) => d.fee_lamports),
      volume_total_lamports: sum((d) => d.volume_lamports),
      fees_total_lamports: sum((d) => d.fee_lamports),
      sales_total: sum((d) => d.sales),
    },
  };

  const top: LeagueRow[] = [...players]
    .filter((p) => p.pass_source)
    .sort((a, b) => (b.hero_level ?? 0) + (b.paragon_level ?? 0) - ((a.hero_level ?? 0) + (a.paragon_level ?? 0)) || (b.highest_floor ?? 0) - (a.highest_floor ?? 0))
    .slice(0, 50)
    .map((p, i) => {
      const lt = (p.hero_level ?? 0) + (p.paragon_level ?? 0);
      return {
        audit_rank: i + 1,
        user_id: p.user_id,
        username: p.username,
        score: lt * 1_000_000 + (p.highest_floor ?? 0) + (p.deepest_depth ?? 0),
        level_total: lt,
        hero_level: p.hero_level ?? 0,
        paragon_level: p.paragon_level ?? 0,
        highest_floor: p.highest_floor ?? 0,
        deepest_depth: p.deepest_depth ?? 0,
        tiebreak_at: iso(Math.floor(r() * 10 * DAY)),
        entry_flags: p.open_flags ? REASONS.slice(0, 1) : [],
        open_flags: p.open_flags > 0,
        item_flags: p.item_flags > 0,
        disqualified: false,
        has_pass: true,
        eligible: p.open_flags === 0 && p.item_flags === 0 && p.pass_livemode !== false,
      };
    });
  const league: League = {
    season: overview.league.season,
    goal: { target: 15000, paid: 1157, season_number: 1, opened_at: overview.league.goal_opened_at, reset_at: overview.league.reset_at },
    counts: { entries: 1021, with_score: 1004, flagged: 37, disqualified: 4 },
    seasons: [{ number: 0, kind: 'pre', status: 'closed' }, ...Array.from({ length: 8 }, (_, i) => ({ number: i + 1, kind: 'ranked', status: i === 0 ? 'open' : 'upcoming' }))],
    top,
  };

  const waitlist: Waitlist = {
    days: 30,
    totals: { total: 9340, active: 9128, unsubscribed: 212, confirmed: 0, locale_pt: 8710, locale_en: 630, referred: 2480, qualified: 611, registered_in_game: 1432 },
    by_day: Array.from({ length: 30 }, (_, i) => ({ day: dayKey((29 - i) * DAY), count: Math.floor(40 + r() * 140 + i * 3) })),
    by_source: [
      { source: 'tiktok', count: 3120 },
      { source: '(direto)', count: 2210 },
      { source: 'youtube', count: 1480 },
      { source: 'discord', count: 960 },
      { source: 'instagram', count: 740 },
      { source: 'x.com', count: 410 },
      { source: 'reddit', count: 220 },
    ],
    referral_ignored: [
      { referral_ignored: 'self_ip', count: 41 },
      { referral_ignored: 'unknown_code', count: 17 },
      { referral_ignored: 'self_email', count: 6 },
    ],
    top_referrers: Array.from({ length: 12 }, (_, i) => ({
      ref_code: sig(r).slice(0, 10).toUpperCase().replace(/[01OIL]/g, '7'),
      email_masked: maskEmail(`${NAMES[i].toLowerCase()}${i}@gmail.com`),
      invited: 96 - i * 7,
      qualified: Math.floor((96 - i * 7) * 0.31),
      since: iso((30 - i) * DAY),
    })),
  };

  return { players, legendaries, sales, listings, flags, series, overview, economy, league, waitlist };
}

function paginate<T>(rows: T[], page: number, size: number): Page<T> {
  const start = page * size;
  return { total: rows.length, page, page_size: size, rows: rows.slice(start, start + size) };
}

const delay = <T>(v: T, ms = 120): Promise<T> => new Promise((res) => setTimeout(() => res(v), ms));

export function createDemoApi(): AdminApi {
  const w = build();
  return {
    overview: () => delay({ ...w.overview, generated_at: new Date().toISOString() }),
    async players(q) {
      const s = q.search.trim().toLowerCase();
      let rows = w.players.filter((p) => !s || p.user_id === s || p.username?.toLowerCase().includes(s) || p.hero_name?.toLowerCase().includes(s) || p.email.toLowerCase().includes(s));
      if (q.filters.online) rows = rows.filter((p) => p.online);
      if (q.filters.pass) rows = rows.filter((p) => Boolean(p.pass_source) === (q.filters.pass === 'yes'));
      if (q.filters.flagged) rows = rows.filter((p) => p.open_flags > 0 || p.item_flags > 0);
      if (q.filters.wallet) rows = rows.filter((p) => p.wallet);
      const key = (p: PlayerRow): number | string => {
        switch (q.sort) {
          case 'last_seen':
            return p.last_seen ? new Date(p.last_seen).getTime() : 0;
          case 'created':
            return new Date(p.created_at).getTime();
          case 'level':
            return (p.hero_level ?? 0) + (p.paragon_level ?? 0);
          case 'floor':
            return p.highest_floor ?? 0;
          case 'depth':
            return p.deepest_depth ?? 0;
          case 'gold':
            return p.gold ?? 0;
          default:
            return (p.username ?? '').toLowerCase();
        }
      };
      rows = [...rows].sort((a, b) => {
        const x = key(a);
        const y = key(b);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return q.dir === 'asc' ? c : -c;
      });
      const page = paginate(rows, q.page, q.pageSize);
      return delay({ ...page, rows: page.rows.map(({ email: _email, ...row }) => row) });
    },
    async playerDetail(userId) {
      const p = w.players.find((x) => x.user_id === userId);
      if (!p) return delay(null);
      const detail: PlayerDetail = {
        account: { user_id: p.user_id, email: p.email, email_confirmed_at: p.created_at, created_at: p.created_at, last_sign_in_at: p.last_seen, username: p.username, username_set_at: p.created_at },
        character: { hero_name: p.hero_name ?? '', revision: 412, schema_version: 14, imported_from_legacy: false, created_at: p.created_at, updated_at: p.last_seen ?? p.created_at },
        stats: { hero_level: p.hero_level, paragon_level: p.paragon_level, highest_floor: p.highest_floor, deepest_depth: p.deepest_depth, gold: p.gold, items_common: 31, items_rare: 12, items_epic: 4, items_legendary: p.items_held > 6 ? 1 : 0, refreshed_at: p.stats_at ?? p.created_at },
        entitlements: p.pass_source ? [{ kind: 'adventurer_pass', source: p.pass_source, provider_ref: 'pi_3Demo' + p.user_id.slice(-6), status: 'active', livemode: p.pass_livemode ?? false, granted_at: p.created_at }] : [],
        wallet: p.wallet ? { address: p.wallet, chain_id: 101, linked_at: p.created_at } : null,
        snapshots: [0, 1, 2].map((i) => ({ created_at: iso(i * 3 * HOUR + 600_000), verdict: i === 1 && p.open_flags ? 'flagged' : 'ok', reasons: i === 1 && p.open_flags ? ['PACE_TOO_FAST'] : [], app_version: '0.9.4', hero_level: p.hero_level, paragon_level: p.paragon_level, highest_floor: p.highest_floor, deepest_depth: p.deepest_depth, seconds_played: 80_000 - i * 900 })),
        open_flags: p.open_flags ? [{ created_at: iso(3 * HOUR), verdict: 'flagged', reasons: ['PACE_TOO_FAST', 'GOLD_JUMP'] }] : [],
        item_flags: p.item_flags ? [{ code: 'HUNT_TIME_EXCESS', detail: {}, created_at: iso(DAY) }] : [],
        certificates: [
          { kind: 'gear', rarity: 'epic', status: 'held', bound: false, count: Math.max(0, p.items_held - 1) },
          { kind: 'gold_pouch', rarity: null, status: 'held', bound: false, count: 2 },
        ],
        recent_certificates: w.legendaries.slice(0, 3).map((l) => ({ id: l.item_id, kind: l.kind, template_id: l.template_id, rarity: l.rarity, tier: l.tier, status: l.status, bound: l.status === 'bound', source: l.source, created_at: l.issued_at })),
        sales: w.sales.filter((s) => s.seller_id === p.user_id || s.buyer_id === p.user_id).slice(0, 5).map((s) => ({ id: s.id, sold_at: s.sold_at, role: s.seller_id === p.user_id ? 'seller' : 'buyer', item_kind: s.item_kind, item_template: s.item_template, material_id: s.material_id, material_qty: s.material_qty, price_lamports: s.price_lamports, fee_lamports: s.fee_lamports, tx_signature: s.tx_signature, livemode: s.livemode })),
        materials: [{ material_id: 'iron_ore', qty: 320, pending: 0 }, { material_id: 'oak_log', qty: 90, pending: 12 }],
        season_entries: p.pass_source ? [{ season: 1, score: ((p.hero_level ?? 0) + (p.paragon_level ?? 0)) * 1_000_000 + (p.highest_floor ?? 0), level_total: (p.hero_level ?? 0) + (p.paragon_level ?? 0), highest_floor: p.highest_floor ?? 0, flags: [], disqualified: false, created_at: p.created_at }] : [],
        referral_rewards: [],
      };
      return delay(detail);
    },
    async legendaries(q) {
      const s = q.search.trim().toLowerCase();
      const f = q.filters;
      let rows = w.legendaries.filter((l) => !s || l.template_id.includes(s) || l.username?.toLowerCase().includes(s) || l.current_owner_username?.toLowerCase().includes(s) || l.item_id === s);
      if (f.source) rows = rows.filter((l) => l.source === f.source);
      if (f.status) rows = rows.filter((l) => l.status === f.status);
      if (f.kind) rows = rows.filter((l) => l.kind === f.kind);
      if (f.tier) rows = rows.filter((l) => l.tier === f.tier);
      if (f.from) rows = rows.filter((l) => l.issued_at >= f.from!);
      if (f.to) rows = rows.filter((l) => l.issued_at < f.to!);
      const count = (key: 'source' | 'status' | 'kind') => rows.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l[key]]: (acc[l[key]] ?? 0) + 1 }), {});
      const page = paginate(rows, q.page, q.pageSize);
      const out: LegendaryPage = { ...page, summary: { by_source: count('source'), by_status: count('status'), by_rarity_kind: count('kind') } };
      return delay(out);
    },
    async market(q) {
      const s = q.search.trim().toLowerCase();
      const f = q.filters;
      if (q.view === 'sales') {
        let rows = w.sales.filter((x) => !s || x.seller_username?.toLowerCase().includes(s) || x.buyer_username?.toLowerCase().includes(s) || x.item_template?.includes(s) || x.material_id?.includes(s) || x.tx_signature === q.search.trim());
        if (f.mode === 'live') rows = rows.filter((x) => x.livemode);
        if (f.mode === 'test') rows = rows.filter((x) => !x.livemode);
        if (f.kind) rows = rows.filter((x) => (f.kind === 'material') === Boolean(x.material_id));
        if (f.from) rows = rows.filter((x) => x.sold_at >= f.from!);
        if (f.to) rows = rows.filter((x) => x.sold_at < f.to!);
        const page = paginate(rows, q.page, q.pageSize);
        const out: MarketPage<SaleRow> = { ...page, view: 'sales', totals: { count: rows.length, volume_lamports: rows.reduce((a, x) => a + x.price_lamports, 0), fee_lamports: rows.reduce((a, x) => a + x.fee_lamports, 0), buyers: new Set(rows.map((x) => x.buyer_id)).size, sellers: new Set(rows.map((x) => x.seller_id)).size } };
        return delay(out);
      }
      let rows = w.listings.filter((x) => !s || x.seller_username?.toLowerCase().includes(s) || x.item_template?.includes(s) || x.material_id?.includes(s));
      if (f.status) rows = rows.filter((x) => x.status === f.status);
      if (f.kind) rows = rows.filter((x) => (f.kind === 'material') === Boolean(x.material_id));
      const page = paginate(rows, q.page, q.pageSize);
      const out: MarketPage<ListingRow> = { ...page, view: 'listings', totals: { count: rows.length, open_price_lamports: rows.filter((x) => x.status === 'open' || x.status === 'reserved').reduce((a, x) => a + x.price_lamports, 0) } };
      return delay(out);
    },
    economy: () => delay(w.economy),
    series: (days) => delay(w.series.slice(-Math.min(days, w.series.length))),
    async flags(q) {
      let rows = w.flags;
      const s = (q.search ?? '').trim().toLowerCase();
      if (s) rows = rows.filter((x) => x.username?.toLowerCase().includes(s) || x.user_id === s);
      if (q.kind === 'progress') rows = rows.filter((x) => x.flagged_snapshots + x.rejected_snapshots > 0);
      if (q.kind === 'items') rows = rows.filter((x) => x.item_flags > 0);
      if (q.kind === 'disqualified') rows = rows.filter((x) => x.disqualified);
      const counts = new Map<string, number>();
      for (const x of rows) for (const c of [...x.reasons, ...x.item_codes]) counts.set(c, (counts.get(c) ?? 0) + 1);
      const page = paginate(rows, q.page, q.pageSize);
      const out: FlagsPage = { ...page, reasons: [...counts.entries()].map(([code, players]) => ({ code, players })).sort((a, b) => b.players - a.players), reset_at: w.overview.league.reset_at };
      return delay(out);
    },
    league: (_season, top) => delay({ ...w.league, top: w.league.top.slice(0, top) }),
    waitlist: (days) => delay({ ...w.waitlist, days, by_day: w.waitlist.by_day.slice(-Math.min(days, 30)) }),
  };
}

export function createDemoBackend(): Backend {
  let signedIn = true;
  const listeners = new Set<() => void>();
  const auth: AuthPort = {
    async session() {
      return signedIn ? { email: 'dono@exemplo.com' } : null;
    },
    async signIn() {
      signedIn = true;
      listeners.forEach((l) => l());
      return { ok: true };
    },
    async signOut() {
      signedIn = false;
      listeners.forEach((l) => l());
    },
    async isAdmin() {
      return true;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { auth, api: createDemoApi(), demo: true };
}
