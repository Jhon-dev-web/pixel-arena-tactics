// The app's only door to the data: the ten read-only functions of 0020_admin.sql and the five of 0021_ai_ops.sql (three reads and TWO audited writes: switch a flag with a mandatory note, mark an AI report as read),
// called with the signed-in admin's session.
// The anon key is public by design (it is in every browser that opens the game); what protects the data is the function itself,
// which refuses anyone who is not in arena_private.admins. No service key is, or may ever be, in this app.
import type { ActionRpcName } from './actionRpcNames';
import type { DeleteUserResult, GrantPassResult, RevokePassResult } from './actions';
import { flagsArgs, legendaryArgs, marketArgs, playerArgs } from './filters';
import type { OpsRpcName } from './opsRpcNames';
import type { PaymentRpcName } from './paymentRpcNames';
import type { RpcName } from './rpcNames';
import type { AiCost, AiReportRow, AiReportsQuery, Economy, FlagsPage, FlagsQuery, League, LegendaryPage, LegendaryQuery, ListingRow, MarketPage, MarketQuery, OpsFlagKey, OpsOverview, Overview, Page, PlayerDetail, PaymentExceptionsPage, PaymentExceptionsQuery, PlayerQuery, PlayerRow, SaleRow, SeriesDay, Waitlist } from './types';

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
  // ---- payments to resolve (0022): ONE read; resolving is SQL the owner runs by hand ----
  paymentExceptions(q: PaymentExceptionsQuery): Promise<PaymentExceptionsPage>;
  // ---- actions that WRITE (0027): each is admin-only in the database and leaves an audit row ----
  /** Deletes an account through the Edge Function admin-delete-user. `confirm` is the name the owner typed. Never throws for a refusal: the result says why. */
  deleteUser(userId: string, confirm: string): Promise<DeleteUserResult>;
  /** Gives the account a Pass for the current season (idempotent: 'already' when it holds one). A note is mandatory and goes into the audit row. */
  grantPass(userId: string, note: string): Promise<GrantPassResult>;
  /** Revokes the Pass(es) that cover the current season. */
  revokePass(userId: string, note: string): Promise<RevokePassResult>;
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

/** The calls that are not PostgREST rpc (the Edge Function). Supplied by backend.ts, which owns the session token. */
export interface ApiExtras {
  deleteUser?: AdminApi['deleteUser'];
}

export function createRpcApi(client: RpcClient, extras: ApiExtras = {}): AdminApi {
  async function call<T>(name: RpcName | OpsRpcName | PaymentRpcName | ActionRpcName, args?: Record<string, unknown>): Promise<T> {
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
    paymentExceptions: (q) => call<PaymentExceptionsPage>('admin_payment_exceptions', { p_status: q.status, p_page: q.page, p_page_size: q.pageSize }),
    grantPass: (userId, note) => call<GrantPassResult>('admin_grant_pass', { p_user: userId, p_note: note }),
    revokePass: (userId, note) => call<RevokePassResult>('admin_revoke_pass', { p_user: userId, p_note: note }),
    deleteUser: (userId, confirm) => (extras.deleteUser ? extras.deleteUser(userId, confirm) : Promise.resolve<DeleteUserResult>({ ok: false, reason: 'unavailable' })),
  };
}
