// The shapes the admin functions return (supabase/migrations/0020_admin.sql). Money from the market is in lamports (1 SOL = 1,000,000,000).

export interface Page<T> {
  total: number;
  page: number;
  page_size: number;
  rows: T[];
}

export interface PassSourceRow {
  source: string;
  livemode: boolean;
  /** Every active row, whatever season it covered (history). */
  active: number;
  /** Active rows that cover the CURRENT season (migration 0026; absent before it is applied). */
  valid_now?: number;
  refunded: number;
  revoked: number;
}

export interface MarketSide {
  sales: number;
  sales_items: number;
  sales_materials: number;
  volume_lamports: number;
  fee_lamports: number;
  buyers: number;
  sellers: number;
}

export interface ItemGroup {
  kind: string;
  rarity: string | null;
  status: string;
  bound: boolean;
  bought: boolean;
  count: number;
}

export interface MaterialRow {
  material_id: string;
  qty: number;
  pending: number;
  listed: number;
  holders?: number;
}

export interface SeasonInfo {
  number: number;
  kind: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  freeze_at: string | null;
  prize_note?: string | null;
}

export interface Overview {
  generated_at: string;
  timezone: string;
  players: {
    registered: number;
    confirmed: number;
    with_username: number;
    signups_today: number;
    signups_7d: number;
    signups_30d: number;
    characters: number;
    online_now: number;
    active_today: number;
    active_7d: number;
    active_30d: number;
    online_window_minutes: number;
  };
  pass: {
    by_source: PassSourceRow[];
    /** Accounts that ever held an active Pass (history; the old meaning, kept by 0026). */
    owners_active: number;
    /** Migration 0026 (absent until it is applied): the season a Pass bought now covers, and the distinct measures. */
    current_season?: number;
    owners_history?: number;
    /** Accounts whose Pass gives the perks now (owns_adventurer_pass). */
    owners_valid_now?: number;
    /** Accounts that count for the ranking now (owns_ranking_pass: live or granted). */
    owners_valid_ranking?: number;
    /** Had a Pass, none covers the current season. */
    owners_expired?: number;
    card_price_usd: number;
    card_sold_live: number;
    card_refunded_live: number;
    card_sold_test: number;
    usdc_live: number;
    usdc_test: number;
    usdc_to_refund: number;
    usdc_payments_live: number;
    goal_target: number;
    goal_paid: number;
  };
  market: {
    live?: MarketSide;
    test?: MarketSide;
    listings_open: number;
    listings_open_items: number;
    listings_open_materials: number;
    listings_total: number;
    refund_due_count: number;
    refund_due_lamports: number;
  };
  collected: { fees_lamports: number; volume_lamports: number; usdc: number };
  items: ItemGroup[];
  pouches: { outstanding: number; outstanding_gold: number; listed: number; minted: number; opened: number };
  materials: MaterialRow[];
  league: {
    season: SeasonInfo | null;
    goal_target: number | null;
    goal_paid: number;
    goal_opened_at: string | null;
    reset_at: string | null;
    entries: number;
    entries_flagged: number;
    entries_disqualified: number;
    players_with_open_flags: number;
    players_with_item_flags: number;
  };
  waitlist: { total: number; unsubscribed: number; today: number; last_7d: number; referred: number; qualified: number };
  freshness: {
    player_cache_rows: number;
    player_cache_refreshed_at: string | null;
    gold_total: number;
    gold_day: string | null;
    gold_captured_at: string | null;
    daily_captured_at: string | null;
  };
}

export interface PlayerRow {
  user_id: string;
  username: string | null;
  hero_name: string | null;
  email_masked: string | null;
  created_at: string;
  last_seen: string | null;
  online: boolean;
  hero_level: number | null;
  paragon_level: number | null;
  highest_floor: number | null;
  deepest_depth: number | null;
  gold: number | null;
  stats_at: string | null;
  pass_source: string | null;
  pass_livemode: boolean | null;
  /** Migration 0026 (absent until it is applied): the Pass gives the perks now / counts for the ranking now / active rows ever / last season covered. */
  pass_valid_now?: boolean;
  pass_ranking?: boolean;
  pass_history?: number;
  pass_valid_through?: number | null;
  wallet: string | null;
  open_flags: number;
  item_flags: number;
  items_held: number;
  items_listed: number;
  sales: number;
  purchases: number;
}

export interface PlayerFilters {
  online?: boolean;
  /** yes = valid now, no = not valid now, expired = had one but none valid now, history = ever had one */
  pass?: 'yes' | 'no' | 'expired' | 'history';
  flagged?: boolean;
  wallet?: boolean;
}

export type PlayerSort = 'last_seen' | 'created' | 'level' | 'floor' | 'depth' | 'gold' | 'username';

export interface PlayerQuery {
  search: string;
  sort: PlayerSort;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  filters: PlayerFilters;
}

export interface PlayerDetail {
  account: { user_id: string; email: string | null; email_confirmed_at: string | null; created_at: string; last_sign_in_at: string | null; username: string | null; username_set_at: string | null };
  character: { hero_name: string; revision: number; schema_version: number; imported_from_legacy: boolean; created_at: string; updated_at: string } | null;
  stats: { hero_level: number | null; paragon_level: number | null; highest_floor: number | null; deepest_depth: number | null; gold: number | null; items_common: number | null; items_rare: number | null; items_epic: number | null; items_legendary: number | null; refreshed_at: string } | null;
  entitlements: { kind: string; source: string; provider_ref: string; status: string; livemode: boolean; granted_at: string; valid_through_season?: number; valid_now?: boolean }[];
  /** Migration 0026 */
  pass?: { current_season: number; valid_now: boolean; ranking_eligible: boolean; history: number; valid_through: number | null };
  wallet: { address: string; chain_id: number; linked_at: string } | null;
  snapshots: { created_at: string; verdict: string; reasons: string[]; app_version: string | null; hero_level: number | null; paragon_level: number | null; highest_floor: number | null; deepest_depth: number | null; seconds_played: number | null }[];
  open_flags: { created_at: string; verdict: string; reasons: string[] }[];
  item_flags: { code: string; detail: unknown; created_at: string }[];
  certificates: { kind: string; rarity: string | null; status: string; bound: boolean; count: number }[];
  recent_certificates: { id: string; kind: string; template_id: string; rarity: string | null; tier: number | null; status: string; bound: boolean; source: string; created_at: string }[];
  sales: { id: string; sold_at: string; role: 'seller' | 'buyer'; item_kind: string; item_template: string | null; material_id: string | null; material_qty: number | null; price_lamports: number; fee_lamports: number; tx_signature: string; livemode: boolean }[];
  materials: { material_id: string; qty: number; pending: number }[];
  season_entries: { season: number; score: number; level_total: number; highest_floor: number; flags: string[]; disqualified: boolean; created_at: string }[];
  referral_rewards: { metric: string; min_count: number; kind: string; reward_ref: string; granted_at: string }[];
}

export type LegendarySource = 'forge' | 'pity' | 'seal' | 'drop' | 'boss';
export type LegendaryStatus = 'held' | 'listed' | 'sold' | 'bound' | 'burned' | 'revoked';

export interface LegendaryRow {
  item_id: string;
  issued_at: string;
  user_id: string;
  username: string | null;
  kind: 'gear' | 'unique';
  template_id: string;
  tier: number | null;
  slot: string | null;
  rarity: string | null;
  source: LegendarySource;
  status: LegendaryStatus;
  current_owner_id: string;
  current_owner_username: string | null;
  current_status: string;
}

export interface LegendaryFilters {
  source?: LegendarySource;
  status?: LegendaryStatus;
  kind?: 'gear' | 'unique';
  tier?: number;
  from?: string;
  to?: string;
}

export interface LegendaryQuery {
  search: string;
  page: number;
  pageSize: number;
  filters: LegendaryFilters;
}

export interface LegendaryPage extends Page<LegendaryRow> {
  summary: { by_source: Record<string, number>; by_status: Record<string, number>; by_rarity_kind: Record<string, number> };
}

export type MarketView = 'sales' | 'listings';

export interface SaleRow {
  id: string;
  sold_at: string;
  seller_id: string;
  seller_username: string | null;
  buyer_id: string;
  buyer_username: string | null;
  item_kind: string;
  item_template: string | null;
  material_id: string | null;
  material_qty: number | null;
  price_lamports: number;
  fee_lamports: number;
  seller_lamports: number;
  tx_signature: string;
  livemode: boolean;
}

export interface ListingRow {
  id: string;
  created_at: string;
  seller_id: string;
  seller_username: string | null;
  status: string;
  item_kind: string | null;
  item_template: string | null;
  rarity: string | null;
  tier: number | null;
  material_id: string | null;
  material_qty: number | null;
  price_lamports: number;
  expires_at: string;
  closed_at: string | null;
}

export interface MarketFilters {
  mode?: 'live' | 'test' | 'all';
  status?: string;
  kind?: 'item' | 'material';
  from?: string;
  to?: string;
}

export interface MarketQuery {
  view: MarketView;
  search: string;
  page: number;
  pageSize: number;
  filters: MarketFilters;
}

export interface MarketPage<T> extends Page<T> {
  view: MarketView;
  totals: { count: number; volume_lamports?: number; fee_lamports?: number; buyers?: number; sellers?: number; open_price_lamports?: number };
}

export interface GoldDaily {
  day: string;
  accounts: number;
  gold_total: number;
  gold_avg: number;
  gold_median: number;
  gold_p90: number;
  gold_max: number;
  top10_share: number;
  pouch_count: number;
  pouch_gold: number;
  materials_qty: number;
  captured_at: string;
}

export interface Economy {
  generated_at: string;
  gold_latest: GoldDaily | null;
  gold_series: GoldDaily[];
  gold_top: { user_id: string; username: string | null; gold: number; hero_level: number | null }[];
  saves_items: { accounts: number; common: number; rare: number; epic: number; legendary: number; refreshed_at: string | null };
  pouches: { outstanding: number; outstanding_gold: number; listed: number; minted: number; opened: number; minted_gold: number; opened_gold: number };
  pouches_by_id: { pouch_id: string; count: number; gold: number }[];
  materials: MaterialRow[];
  items: ItemGroup[];
  sol: { volume_7d_lamports: number; volume_30d_lamports: number; fees_7d_lamports: number; fees_30d_lamports: number; volume_total_lamports: number; fees_total_lamports: number; sales_total: number };
}

export interface SeriesDay {
  day: string;
  signups: number;
  active_players: number;
  sales: number;
  volume_lamports: number;
  fee_lamports: number;
  pass_stripe: number;
  pass_usdc: number;
  pass_test: number;
  pass_grant: number;
  pass_referral: number;
  pass_other: number;
  pass_revenue_usd: number;
  legendaries: number;
  uniques: number;
  pouches_minted: number;
  pouches_minted_gold: number;
  pouches_opened: number;
}

export interface FlagRow {
  user_id: string;
  username: string | null;
  flagged_snapshots: number;
  rejected_snapshots: number;
  reasons: string[];
  item_flags: number;
  item_codes: string[];
  disqualified: boolean;
  last_flag_at: string | null;
  hero_level: number | null;
  paragon_level: number | null;
  highest_floor: number | null;
  pass_source: string | null;
  last_seen: string | null;
}

export interface FlagsPage extends Page<FlagRow> {
  reasons: { code: string; players: number }[];
  reset_at: string | null;
}

export interface FlagsQuery {
  page: number;
  pageSize: number;
  kind?: 'progress' | 'items' | 'disqualified';
  search?: string;
}

export interface LeagueRow {
  audit_rank: number;
  user_id: string;
  username: string | null;
  score: number;
  level_total: number;
  hero_level: number;
  paragon_level: number;
  highest_floor: number;
  deepest_depth: number;
  tiebreak_at: string;
  entry_flags: string[];
  open_flags: boolean;
  item_flags: boolean;
  disqualified: boolean;
  has_pass: boolean;
  eligible: boolean;
}

export interface League {
  season: SeasonInfo | null;
  goal: { target: number; paid: number; season_number: number; opened_at: string | null; reset_at: string | null } | null;
  counts: { entries: number; with_score: number; flagged: number; disqualified: number };
  seasons: { number: number; kind: string; status: string }[];
  top: LeagueRow[];
}

export interface Waitlist {
  days: number;
  totals: { total: number; active: number; unsubscribed: number; confirmed: number; locale_pt: number; locale_en: number; referred: number; qualified: number; registered_in_game: number; account_referred?: number; account_qualified?: number };
  by_day: { day: string; count: number }[];
  by_source: { source: string; count: number }[];
  referral_ignored: { referral_ignored: string; count: number }[];
  top_referrers: { ref_code: string; email_masked: string; invited: number; qualified: number; since: string }[];
}

// ---- AI operations (supabase/migrations/0021_ai_ops.sql) ----------------------------------------------------------------------------------------------------------------

export type OpsFlagKey = 'maintenance_mode' | 'market_paused' | 'season_scoring_paused' | 'pass_sales_paused';
export type OpsSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface OpsFlagRow {
  key: OpsFlagKey;
  value: boolean;
  changed_at: string;
  /** 'migration' | 'watchdog' | 'admin:<user id>' */
  changed_by: string;
  note: string | null;
}

export interface OpsIncident {
  id: string;
  check: string;
  severity: OpsSeverity;
  summary: string;
  opened_at: string;
  last_seen_at: string;
  alert_count: number;
  /** the flags the watchdog switched on because of this incident */
  actions: { flag: OpsFlagKey; changed: boolean }[];
}

export interface OpsEvent {
  id: number;
  at: string;
  kind: string;
  severity: OpsSeverity;
  check: string | null;
  ok: boolean | null;
  actor: string | null;
  summary: string;
}

export interface OpsCheck {
  check: string;
  consecutive_failures: number;
  first_failed_at: string | null;
  last_ok_at: string | null;
  last_checked_at: string;
}

export interface OpsOverview {
  flags: OpsFlagRow[];
  incidents: OpsIncident[];
  recent_events: OpsEvent[];
  checks: OpsCheck[];
  open_reports: number;
  now: string;
}

export interface ReportEvidence {
  type: string;
  id: string;
  label?: string;
}

export interface ReportFindingRow {
  category: string;
  severity: OpsSeverity;
  summary: string;
  suggested_action: string;
  evidence: ReportEvidence[];
  gate_note?: string;
}

export interface AiReportRow {
  id: string;
  kind: 'anomaly' | 'daily' | 'incident';
  severity: OpsSeverity;
  summary: string;
  details: {
    mode?: string;
    window_hours?: number;
    model?: string | null;
    model_used?: boolean;
    model_status?: string;
    alerted?: boolean;
    notes?: string[];
    findings?: ReportFindingRow[];
    signals?: { id: string; category: string; severity: OpsSeverity; summary: string }[];
    usage?: { input_tokens: number; output_tokens: number; cost_usd_estimate: number };
  };
  suggested_actions: { action: string; reason?: string }[];
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export type ReportStatus = 'open' | 'acknowledged' | 'all';
export interface AiReportsQuery {
  status: ReportStatus;
  page: number;
  pageSize: number;
}

export interface AiCost {
  month_to_date_usd: number;
  projected_month_usd: number;
  runs_today: number;
  months: { month: string; cost_usd: number; runs: number }[];
  by_model: { model: string; runs: number; cost_usd: number }[];
}

// ---- Payments to resolve (supabase/migrations/0022_payment_fixes.sql) -----------------------------------------------------------------------------------------------

export type PaymentExceptionStatus = 'open' | 'granted' | 'refunded' | 'resolved';
export type PaymentExceptionReason = 'no_memo' | 'wrong_memo' | 'short_amount' | 'too_early' | 'wrong_sender' | 'already_owned' | 'duplicate';

export interface PaymentExceptionRow {
  id: string;
  signature: string;
  purpose: 'pass' | 'market';
  reason: PaymentExceptionReason;
  status: PaymentExceptionStatus;
  livemode: boolean;
  user_id: string | null;
  username: string | null;
  /** the wallet linked to the player NOW (to compare with who paid) */
  linked_wallet: string | null;
  /** other players who submitted the same signature */
  claimed_by: string[];
  reservation_id: string | null;
  payer_address: string | null;
  receiver_address: string;
  /** USDC base units (6 decimals) for the Pass, lamports for a sale */
  amount_units: number | string;
  memo: string | null;
  block_time: string | null;
  /** the entitlement id (granted) or the refund transaction signature (refunded) */
  resolution_ref: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type PaymentExceptionsPage = Page<PaymentExceptionRow> & { open: number };
export interface PaymentExceptionsQuery {
  status: 'open' | 'resolved' | 'all';
  page: number;
  pageSize: number;
}
