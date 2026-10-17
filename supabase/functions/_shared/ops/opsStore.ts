import { parseOpsStatus } from './flags.ts';
import type { FlagKey, OpsFlags } from './flags.ts';
import type { Severity } from './types.ts';

// What the auditor and the watchdog need from the database. The real one (createOpsStore) calls the service-role-only functions of migration 0021 over PostgREST with the SERVICE ROLE key (injected by the
// Supabase Edge runtime; never logged, never returned); the tests use an in-memory fake. Errors carry the status only (bodies can echo data).

export interface CheckResult {
  check: string;
  ok: boolean;
  detail: Record<string, unknown>;
}
export interface CheckStreak {
  consecutiveFailures: number;
  failingSeconds: number;
  wasFailing: boolean;
}
export interface HealthCounts {
  leagueOpen: boolean;
  functionErrors: Record<string, number>;
  payments: { unprocessed: number; oldestUnprocessedSeconds: number | null; errors: number };
}
export interface IncidentOpened {
  incidentId: string;
  isNew: boolean;
  openedAtMs: number;
  lastAlertAtMs: number | null;
  alertCount: number;
}

export interface OpsEventInput {
  kind: 'health_check' | 'incident_opened' | 'incident_reminder' | 'incident_resolved' | 'flag_change' | 'alert_sent' | 'alert_failed' | 'ai_run' | 'report_ack' | 'note';
  source: 'watchdog' | 'ai-auditor' | 'admin' | 'system';
  severity: Severity;
  checkName?: string | null;
  ok?: boolean | null;
  actor: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface RunLogInput {
  kind: 'hourly' | 'daily' | 'incident';
  model: string | null;
  status: 'ok' | 'invalid_output' | 'error' | 'skipped_no_signals' | 'skipped_budget' | 'skipped_disabled';
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  reportId: string | null;
  note: string | null;
}

export interface ReportInput {
  kind: 'anomaly' | 'daily' | 'incident';
  severity: Severity;
  summary: string;
  details: Record<string, unknown>;
  suggestedActions: { action: string; reason?: string }[];
}

/** The auditor's side. */
export interface AuditorStore {
  gatherAggregates(hours: number): Promise<unknown>;
  budget(): Promise<{ runsToday: number; monthCostUsd: number }>;
  recentAlertedFingerprints(hours: number): Promise<string[]>;
  insertReport(report: ReportInput): Promise<string>;
  logRun(run: RunLogInput): Promise<void>;
  addEvent(event: OpsEventInput): Promise<void>;
}

/** The watchdog's side. */
export interface WatchdogStore {
  /** Calls a read-only database function (a "key RPC") and resolves when it answered; the caller times it. */
  callRpc(name: 'ops_health_probe' | 'ops_status' | 'league_reset_at'): Promise<unknown>;
  healthCounts(minutes: number): Promise<HealthCounts>;
  recordChecks(results: CheckResult[]): Promise<Record<string, CheckStreak>>;
  openIncident(args: { check: string; severity: Severity; summary: string; details: Record<string, unknown>; actions: { flag: FlagKey; changed: boolean }[] }): Promise<IncidentOpened>;
  incidentAlerted(incidentId: string): Promise<void>;
  resolveIncident(check: string): Promise<{ resolved: boolean; openedAtMs: number | null }>;
  /** Switches a flag ON. There is no way to switch one off from here: the database function behind it only knows "on". */
  pause(flag: FlagKey, reason: string): Promise<{ changed: boolean }>;
  readFlags(): Promise<OpsFlags>;
  addEvent(event: OpsEventInput): Promise<void>;
  budget(): Promise<{ runsToday: number; monthCostUsd: number }>;
  logRun(run: RunLogInput): Promise<void>;
  insertReport(report: ReportInput): Promise<string>;
}

export interface OpsDbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
  /** Per call (default 8 s): a hung database must not hang the watchdog. */
  timeoutMs?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const toNum = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const toMs = (v: unknown): number | null => {
  const ms = typeof v === 'string' ? Date.parse(v) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

export function createOpsStore(cfg: OpsDbConfig): AuditorStore & WatchdogStore {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc`;
  const timeout = cfg.timeoutMs ?? 8_000;

  async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}, what = fn): Promise<T> {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const res = await doFetch(`${base}/${fn}`, {
        method: 'POST',
        headers: { apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(args),
        signal: ctrl?.signal,
      });
      if (!res.ok) throw new Error(`${what}_${res.status}`);
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const addEvent = async (e: OpsEventInput): Promise<void> => {
    await rpc('ops_event_add', { p_kind: e.kind, p_source: e.source, p_severity: e.severity, p_check_name: e.checkName ?? null, p_ok: e.ok ?? null, p_actor: e.actor, p_summary: e.summary.slice(0, 500), p_details: e.details ?? {} });
  };
  const budget = async (): Promise<{ runsToday: number; monthCostUsd: number }> => {
    const r = await rpc<unknown>('ai_budget');
    const o = isObj(r) ? r : {};
    return { runsToday: toNum(o.runs_today), monthCostUsd: toNum(o.month_cost_usd) };
  };
  const logRun = async (r: RunLogInput): Promise<void> => {
    await rpc('ai_run_log', { p_kind: r.kind, p_model: r.model, p_status: r.status, p_input_tokens: r.inputTokens, p_output_tokens: r.outputTokens, p_cost: r.costUsd, p_report_id: r.reportId, p_note: r.note });
  };
  const insertReport = async (r: ReportInput): Promise<string> => {
    const id = await rpc<unknown>('ai_report_insert', { p_kind: r.kind, p_severity: r.severity, p_summary: r.summary, p_details: r.details, p_suggested: r.suggestedActions });
    if (typeof id !== 'string') throw new Error('ai_report_insert_bad_answer');
    return id;
  };

  return {
    addEvent,
    budget,
    logRun,
    insertReport,

    gatherAggregates: (hours) => rpc('ai_gather_aggregates', { p_hours: hours }),
    async recentAlertedFingerprints(hours) {
      const r = await rpc<unknown>('ai_recent_fingerprints', { p_hours: hours });
      return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : [];
    },

    async callRpc(name) {
      return rpc(name, {});
    },
    async healthCounts(minutes) {
      const r = await rpc<unknown>('ops_health_counts', { p_minutes: minutes });
      const o = isObj(r) ? r : {};
      const fe = isObj(o.function_errors) ? o.function_errors : {};
      const pay = isObj(o.payments) ? o.payments : {};
      return {
        leagueOpen: o.league_open === true,
        functionErrors: Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, toNum(v)])),
        payments: { unprocessed: toNum(pay.unprocessed), oldestUnprocessedSeconds: pay.oldest_unprocessed_seconds === null || pay.oldest_unprocessed_seconds === undefined ? null : toNum(pay.oldest_unprocessed_seconds), errors: toNum(pay.errors) },
      };
    },
    async recordChecks(results) {
      const r = await rpc<unknown>('ops_checks_record', { p_results: results.map((c) => ({ check: c.check, ok: c.ok, detail: c.detail })) });
      const o = isObj(r) ? r : {};
      const out: Record<string, CheckStreak> = {};
      for (const [k, v] of Object.entries(o)) {
        const s = isObj(v) ? v : {};
        out[k] = { consecutiveFailures: toNum(s.consecutive_failures), failingSeconds: toNum(s.failing_seconds), wasFailing: s.was_failing === true };
      }
      return out;
    },
    async openIncident(a) {
      const r = await rpc<unknown>('ops_incident_open', { p_check: a.check, p_severity: a.severity, p_summary: a.summary, p_details: a.details, p_actions: a.actions });
      const o = isObj(r) ? r : {};
      if (typeof o.incident_id !== 'string') throw new Error('ops_incident_open_bad_answer');
      return { incidentId: o.incident_id, isNew: o.is_new === true, openedAtMs: toMs(o.opened_at) ?? Date.now(), lastAlertAtMs: toMs(o.last_alert_at), alertCount: toNum(o.alert_count) };
    },
    async incidentAlerted(id) {
      await rpc('ops_incident_alerted', { p_id: id });
    },
    async resolveIncident(check) {
      const r = await rpc<unknown>('ops_incident_resolve', { p_check: check });
      const o = isObj(r) ? r : {};
      return { resolved: o.resolved === true, openedAtMs: toMs(o.opened_at) };
    },
    async pause(flag, reason) {
      const r = await rpc<unknown>('ops_pause', { p_key: flag, p_actor: 'watchdog', p_reason: reason });
      return { changed: isObj(r) && r.changed === true };
    },
    async readFlags() {
      return parseOpsStatus(await rpc('ops_status'));
    },
  };
}
