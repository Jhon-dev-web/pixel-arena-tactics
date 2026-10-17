// The app's only door to the data: the ten read-only functions of 0020_admin.sql and the five of 0021_ai_ops.sql (three reads and TWO audited writes: switch a flag with a mandatory note, mark an AI report as read),
// called with the signed-in admin's session.
// The anon key is public by design (it is in every browser that opens the game); what protects the data is the function itself,
// which refuses anyone who is not in arena_private.admins. No service key is, or may ever be, in this app.
import { flagsArgs, legendaryArgs, marketArgs, playerArgs } from './filters';
import type { OpsRpcName } from './opsRpcNames';
import type { RpcName } from './rpcNames';
import type { AiCost, AiReportRow, AiReportsQuery, Economy, FlagsPage, FlagsQuery, League, LegendaryPage, LegendaryQuery, ListingRow, MarketPage, MarketQuery, OpsFlagKey, OpsOverview, Overview, Page, PlayerDetail, PlayerQuery, PlayerRow, SaleRow, SeriesDay, Waitlist } from './types';

export interface AdminApi {
  overview(): Promise<Overview>;
  players(q: PlayerQuery): Promise<Page<PlayerRow>>;
  playerDetail(userId: string): Promise<PlayerDetail | null>;
  legendaries(q: LegendaryQuery): Promise<LegendaryPage>;
  market(q: MarketQuery): Promise<MarketPage<SaleRow> | MarketPage<ListingRow>>;
  economy(): Promise<Economy>;
  series(days: number): Promise<SeriesDay[]>;
  flags(q: FlagsQuery): Promise<FlagsPage>;
  league(season: number | null, top: number): Promise<League>;
  waitlist(days: number): Promise<Waitlist>;
  // ---- AI operations (0021) ----
  opsOverview(): Promise<OpsOverview>;
  aiReports(q: AiReportsQuery): Promise<Page<AiReportRow>>;
  aiCost(): Promise<AiCost>;
  /** The only way to switch a flag off. A note (3-300 characters) is mandatory in both directions: it is logged with who did it. */
  setOpsFlag(key: OpsFlagKey, value: boolean, note: string): Promise<{ flag: OpsFlagKey; value: boolean; changed: boolean }>;
  ackReport(id: string): Promise<{ id: string; acknowledged: boolean }>;
}

/** What the app needs from a Supabase client (so tests can pass a fake). */
export interface RpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** The database refused: the signed-in account is not an admin (or the session ended). */
export class AccessDeniedError extends Error {
  constructor() {
    super('ADMIN_ONLY');
    this.name = 'AccessDeniedError';
  }
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toError(error: { message: string; code?: string }): Error {
  if (/ADMIN_ONLY/.test(error.message) || error.code === '42501') return new AccessDeniedError();
  return new ApiError(error.message);
}

export function createRpcApi(client: RpcClient): AdminApi {
  async function call<T>(name: RpcName | OpsRpcName, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw toError(error);
    return data as T;
  }
  return {
    overview: () => call<Overview>('admin_overview'),
    players: (q) => call<Page<PlayerRow>>('admin_players', playerArgs(q)),
    playerDetail: (userId) => call<PlayerDetail | null>('admin_player_detail', { p_user_id: userId }),
    legendaries: (q) => call<LegendaryPage>('admin_legendaries', legendaryArgs(q)),
    market: (q) => call<MarketPage<SaleRow> | MarketPage<ListingRow>>('admin_market', marketArgs(q)),
    economy: () => call<Economy>('admin_economy'),
    series: (days) => call<SeriesDay[]>('admin_economy_series', { p_days: days }),
    flags: (q) => call<FlagsPage>('admin_flags', flagsArgs(q)),
    league: (season, top) => call<League>('admin_league', { p_season: season, p_top: top }),
    waitlist: (days) => call<Waitlist>('admin_waitlist', { p_days: days }),
    opsOverview: () => call<OpsOverview>('admin_ops_overview'),
    aiReports: (q) => call<Page<AiReportRow>>('admin_ai_reports', { p_status: q.status, p_page: q.page, p_page_size: q.pageSize }),
    aiCost: () => call<AiCost>('admin_ai_cost'),
    setOpsFlag: (key, value, note) => call('admin_set_ops_flag', { p_key: key, p_value: value, p_note: note }),
    ackReport: (id) => call('admin_ack_report', { p_id: id }),
  };
}
