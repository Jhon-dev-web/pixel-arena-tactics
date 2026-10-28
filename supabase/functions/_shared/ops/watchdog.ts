import { decideIncidentAlert, formatIncidentAlert } from './alerts.ts';
import type { AlertSender } from './alerts.ts';
import { decideBudget, estimateCostUsd, DEFAULT_MODEL_FAST } from './budget.ts';
import type { BudgetLimits } from './budget.ts';
import { NO_FLAGS } from './flags.ts';
import type { FlagKey, OpsFlags } from './flags.ts';
import type { ModelClient } from './model.ts';
import type { CheckResult, CheckStreak, HealthCounts, WatchdogStore } from './opsStore.ts';
import { buildIncidentPrompt, cleanText } from './prompt.ts';
import type { Severity } from './types.ts';

// The watchdog: health checks of the game's critical paths, incidents, a small set of AUTOMATIC and REVERSIBLE pauses, and an alert. It NEVER switches a flag off (the database function it uses only knows "on");
// a human clears flags in the admin panel. The AI only writes a one-paragraph explanation of the incident (advisory text that goes into the alert).

export const CHECK_NAMES = ['db', 'key_rpcs', 'market_path', 'payments_path', 'progress_path', 'solana_rpc'] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

export const WATCHDOG = {
  /** A database round trip slower than this is a failure of the "db" check. */
  dbBudgetMs: 3_000,
  /** Same for each of the key RPCs (ops_status, league_reset_at). */
  rpcBudgetMs: 3_000,
  solanaBudgetMs: 4_000,
  /** The 5xx counters are read over this many minutes. */
  functionWindowMinutes: 10,
  /** 5xx answers in the window that make a path "failing". */
  marketErrorsFail: 8,
  paymentsErrorsFail: 5,
  progressErrorsFail: 15,
  /** The database counts as UNREACHABLE for the maintenance banner after failing this long. */
  dbDownSeconds: 180,
} as const;

/** Which Edge Function belongs to which path. */
export const PATH_FUNCTIONS = {
  market_path: ['market-list', 'market-buy', 'market-wallet', 'market-my'],
  payments_path: ['pass-crypto'],
  progress_path: ['submit-progress'],
} as const;

// ---- the decision table (pure) ----------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface CheckState {
  name: CheckName;
  failing: boolean;
  consecutiveFailures: number;
  failingSeconds: number;
}

export interface DecisionContext {
  /** A League is open (public.seasons has an open one). Unknown = true: pausing the scoring is reversible, missing a cheat window is not. */
  leagueOpen: boolean;
}

export interface Decision {
  check: CheckName;
  severity: Severity;
  summary: string;
  /** Flags to switch ON because of this check (never off). */
  pauses: { flag: FlagKey; why: string }[];
}

interface Rule {
  /** Runs in a row that open an incident. */
  openAfter: number;
  severity: Severity;
  summary: string;
  pauses: (state: CheckState, ctx: DecisionContext) => { flag: FlagKey; why: string }[];
}

const RULES: Record<CheckName, Rule> = {
  // The database is slow or unreachable. League scoring is paused as soon as it is clearly degraded (2 runs) during an open League; after DB_DOWN_SECONDS the whole game is told to show maintenance and the
  // money paths stop too. (If the database is really down these writes fail; the game's own static check and the uptime monitor cover that case: docs/AI_OPS.md.)
  db: {
    openAfter: 2,
    severity: 'high',
    summary: 'O banco de dados está lento ou fora do ar.',
    pauses: (s, ctx) => {
      const out: { flag: FlagKey; why: string }[] = [];
      if (ctx.leagueOpen) out.push({ flag: 'season_scoring_paused', why: 'banco degradado durante uma Liga aberta' });
      if (s.failingSeconds >= WATCHDOG.dbDownSeconds) {
        out.push({ flag: 'maintenance_mode', why: `banco inacessível há ${Math.floor(s.failingSeconds / 60)} min` });
        out.push({ flag: 'market_paused', why: 'banco inacessível' });
        out.push({ flag: 'pass_sales_paused', why: 'banco inacessível' });
      }
      return out;
    },
  },
  key_rpcs: {
    openAfter: 3,
    severity: 'high',
    summary: 'Funções-chave do banco (status operacional, reset da Liga) não respondem dentro do tempo.',
    pauses: (_s, ctx) => (ctx.leagueOpen ? [{ flag: 'season_scoring_paused', why: 'funções-chave do banco falhando durante uma Liga aberta' }] : []),
  },
  progress_path: {
    openAfter: 2,
    severity: 'high',
    summary: 'A função que recebe o progresso dos jogadores (submit-progress) está devolvendo erros.',
    pauses: (_s, ctx) => (ctx.leagueOpen ? [{ flag: 'season_scoring_paused', why: 'submit-progress falhando durante uma Liga aberta' }] : []),
  },
  market_path: {
    openAfter: 2,
    severity: 'high',
    summary: 'As funções do mercado estão devolvendo erros.',
    pauses: () => [{ flag: 'market_paused', why: 'funções do mercado falhando repetidamente' }],
  },
  solana_rpc: {
    openAfter: 3,
    severity: 'high',
    summary: 'O nó da Solana não responde: a verificação de pagamentos do mercado e do Passe em USDC está comprometida.',
    pauses: () => [{ flag: 'market_paused', why: 'verificação de pagamento on-chain indisponível' }],
  },
  payments_path: {
    openAfter: 2,
    severity: 'high',
    summary: 'A função de pagamento do Passe (USDC) está devolvendo erros.',
    pauses: () => [{ flag: 'pass_sales_paused', why: 'pagamento do Passe falhando repetidamente' }],
  },
};

/** THE decision table: which failing checks open an incident and which flags they switch on. Pure. The result can only contain pauses: there is no "clear" anywhere. */
export function decide(states: CheckState[], ctx: DecisionContext): Decision[] {
  const out: Decision[] = [];
  for (const s of states) {
    if (!s.failing) continue;
    const rule = RULES[s.name];
    if (s.consecutiveFailures < rule.openAfter) continue;
    out.push({ check: s.name, severity: s.name === 'db' && s.failingSeconds >= WATCHDOG.dbDownSeconds ? 'critical' : rule.severity, summary: rule.summary, pauses: rule.pauses(s, ctx) });
  }
  return out;
}

// ---- the checks (I/O) -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function timed(fn: () => Promise<unknown>, budgetMs: number): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([fn(), new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('timeout')), budgetMs)))]);
    const ms = Date.now() - start;
    return { ok: ms <= budgetMs, ms };
  } catch (err) {
    // the message is a status code or "timeout": never a URL, a key or a body
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 60) : 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface SolanaProbe {
  /** Resolves when the node says it is healthy; rejects (message = status or "timeout") otherwise. Never exposes the URL. */
  (): Promise<void>;
}

/** getHealth against the configured node. null when SOLANA_RPC_URL is not set (the check is then skipped, not failed). */
export function createSolanaProbe(rpcUrl: string | undefined, fetchFn: typeof fetch = fetch): SolanaProbe | null {
  if (!rpcUrl) return null;
  return async () => {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), WATCHDOG.solanaBudgetMs) : null;
    try {
      const res = await fetchFn(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }), signal: ctrl?.signal });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const body = (await res.json()) as { result?: unknown };
      if (body.result !== 'ok') throw new Error('unhealthy');
    } catch (err) {
      throw new Error(err instanceof Error && /^(http_\d+|unhealthy)$/.test(err.message) ? err.message : 'unreachable', { cause: err });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

const sumErrors = (counts: HealthCounts, fns: readonly string[]): number => fns.reduce((n, f) => n + (counts.functionErrors[f] ?? 0), 0);

/** Pure: what the 5xx counters say. */
export function evaluateCounts(counts: HealthCounts): CheckResult[] {
  const market = sumErrors(counts, PATH_FUNCTIONS.market_path);
  const pay = sumErrors(counts, PATH_FUNCTIONS.payments_path);
  const progress = sumErrors(counts, PATH_FUNCTIONS.progress_path);
  return [
    { check: 'market_path', ok: market < WATCHDOG.marketErrorsFail, detail: { errors: market, window_minutes: WATCHDOG.functionWindowMinutes } },
    { check: 'payments_path', ok: pay < WATCHDOG.paymentsErrorsFail, detail: { errors: pay, window_minutes: WATCHDOG.functionWindowMinutes } },
    { check: 'progress_path', ok: progress < WATCHDOG.progressErrorsFail, detail: { errors: progress, window_minutes: WATCHDOG.functionWindowMinutes } },
  ];
}

export interface CheckRun {
  results: CheckResult[];
  counts: HealthCounts | null;
}

export async function runChecks(store: WatchdogStore, solana: SolanaProbe | null): Promise<CheckRun> {
  const results: CheckResult[] = [];
  const db = await timed(() => store.callRpc('ops_health_probe'), WATCHDOG.dbBudgetMs);
  results.push({ check: 'db', ok: db.ok, detail: { ms: db.ms, ...(db.error ? { error: db.error } : {}) } });

  let counts: HealthCounts | null = null;
  if (db.ok) {
    // Only when the database answers do the checks that depend on it mean anything; a dead database would fail every one of them and bury the real cause.
    const status = await timed(() => store.callRpc('ops_status'), WATCHDOG.rpcBudgetMs);
    const reset = await timed(() => store.callRpc('league_reset_at'), WATCHDOG.rpcBudgetMs);
    results.push({ check: 'key_rpcs', ok: status.ok && reset.ok, detail: { ops_status_ms: status.ms, league_reset_ms: reset.ms, ...(status.error || reset.error ? { error: status.error ?? reset.error } : {}) } });
    try {
      counts = await store.healthCounts(WATCHDOG.functionWindowMinutes);
      results.push(...evaluateCounts(counts));
    } catch {
      results.push({ check: 'key_rpcs', ok: false, detail: { error: 'health_counts_failed' } });
    }
  }
  if (solana) {
    const s = await timed(solana, WATCHDOG.solanaBudgetMs);
    results.push({ check: 'solana_rpc', ok: s.ok, detail: { ms: s.ms, ...(s.error ? { error: s.error } : {}) } });
  }
  // key_rpcs may have been pushed twice (counts failure): keep the failing one
  const merged = new Map<string, CheckResult>();
  for (const r of results) {
    const prev = merged.get(r.check);
    merged.set(r.check, prev && !prev.ok ? prev : r);
  }
  return { results: [...merged.values()], counts };
}

// ---- the run ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What survives between two runs of the same isolate when the database cannot be written: a streak counter and the incident alert times. Best effort; the database is the source of truth when it answers. */
export interface WatchdogMemory {
  streaks: Map<string, { count: number; firstFailedMs: number }>;
  incidents: Map<string, { openedMs: number; lastAlertMs: number | null }>;
}
export const newWatchdogMemory = (): WatchdogMemory => ({ streaks: new Map(), incidents: new Map() });

export interface WatchdogDeps {
  store: WatchdogStore;
  alerts: AlertSender | null;
  /** null = no key: the incident paragraph is skipped. */
  model: ModelClient | null;
  limits: BudgetLimits;
  solana: SolanaProbe | null;
  memory: WatchdogMemory;
  nowMs?: () => number;
  fastModel?: string;
  dashboardHint?: string;
}

export interface WatchdogResult {
  ok: boolean;
  checks: { check: string; ok: boolean }[];
  incidents: { check: string; severity: Severity; alert: 'alert' | 'reminder' | 'quiet'; sent: boolean }[];
  pauses: { flag: FlagKey; changed: boolean; error?: boolean }[];
  resolved: string[];
  persisted: boolean;
}

export async function runWatchdog(deps: WatchdogDeps): Promise<WatchdogResult> {
  const now = deps.nowMs ?? (() => Date.now());
  const hint = deps.dashboardHint ?? 'Painel do dono, página "IA e operação".';
  const run = await runChecks(deps.store, deps.solana);

  // 1. the streaks: from the database, or from this isolate's memory when the database cannot be written (it is probably the thing that is down)
  let persisted = true;
  const streaks: Record<string, CheckStreak> = {};
  try {
    Object.assign(streaks, await deps.store.recordChecks(run.results));
  } catch {
    persisted = false;
    for (const r of run.results) {
      const prev = deps.memory.streaks.get(r.check);
      if (r.ok) {
        deps.memory.streaks.delete(r.check);
        streaks[r.check] = { consecutiveFailures: 0, failingSeconds: 0, wasFailing: !!prev };
      } else {
        const cur = { count: (prev?.count ?? 0) + 1, firstFailedMs: prev?.firstFailedMs ?? now() };
        deps.memory.streaks.set(r.check, cur);
        streaks[r.check] = { consecutiveFailures: cur.count, failingSeconds: Math.floor((now() - cur.firstFailedMs) / 1000), wasFailing: !!prev };
      }
    }
  }
  if (persisted) deps.memory.streaks.clear();

  const states: CheckState[] = run.results.map((r) => ({ name: r.check as CheckName, failing: !r.ok, consecutiveFailures: streaks[r.check]?.consecutiveFailures ?? (r.ok ? 0 : 1), failingSeconds: streaks[r.check]?.failingSeconds ?? 0 }));
  const ctx: DecisionContext = { leagueOpen: run.counts ? run.counts.leagueOpen : true };
  const decisions = decide(states, ctx);

  // 2. the automatic pauses (only ON), each once per run even when several checks ask for the same flag
  let flags: OpsFlags = { ...NO_FLAGS };
  try {
    flags = await deps.store.readFlags();
  } catch {
    /* unknown: try anyway, switching on is idempotent */
  }
  const pauseResults = new Map<FlagKey, { changed: boolean; error?: boolean }>();
  for (const d of decisions) {
    for (const p of d.pauses) {
      if (pauseResults.has(p.flag)) continue;
      if (flags[p.flag]) {
        pauseResults.set(p.flag, { changed: false });
        continue;
      }
      try {
        const r = await deps.store.pause(p.flag, p.why);
        pauseResults.set(p.flag, { changed: r.changed });
      } catch {
        pauseResults.set(p.flag, { changed: false, error: true });
      }
    }
  }

  // 3. incidents and alerts
  const incidents: WatchdogResult['incidents'] = [];
  for (const d of decisions) {
    const actions = d.pauses.map((p) => ({ flag: p.flag, changed: pauseResults.get(p.flag)?.changed === true }));
    const detail = run.results.find((r) => r.check === d.check)?.detail ?? {};
    let isNew: boolean;
    let lastAlertAtMs: number | null;
    let openedAtMs: number;
    let incidentId: string | null = null;
    try {
      const inc = await deps.store.openIncident({ check: d.check, severity: d.severity, summary: d.summary, details: detail, actions });
      isNew = inc.isNew;
      lastAlertAtMs = inc.lastAlertAtMs;
      openedAtMs = inc.openedAtMs;
      incidentId = inc.incidentId;
    } catch {
      // the incident table is unreachable: remember it in this isolate so the alerts still do not repeat every run
      const mem = deps.memory.incidents.get(d.check);
      isNew = !mem;
      lastAlertAtMs = mem?.lastAlertMs ?? null;
      openedAtMs = mem?.openedMs ?? now();
      if (!mem) deps.memory.incidents.set(d.check, { openedMs: openedAtMs, lastAlertMs: null });
    }
    const kind = decideIncidentAlert({ isNew, lastAlertAtMs }, now());
    let sent = false;
    if (kind !== 'quiet') {
      const paragraph = kind === 'alert' ? await incidentParagraph(deps, d, detail, actions.filter((a) => a.changed).map((a) => a.flag)) : null;
      if (deps.alerts) {
        sent = await deps.alerts.send(
          formatIncidentAlert({ kind, severity: d.severity, summary: d.summary, minutesOpen: Math.max(0, Math.round((now() - openedAtMs) / 60_000)), actionsTaken: actions.map((a) => `${a.flag}${a.changed ? '' : ' (já estava ligada)'}`), aiParagraph: paragraph, dashboardHint: hint }),
        );
      }
      if (sent) {
        if (incidentId) await deps.store.incidentAlerted(incidentId).catch(() => undefined);
        const mem = deps.memory.incidents.get(d.check);
        if (mem) mem.lastAlertMs = now();
      } else {
        await deps.store.addEvent({ kind: 'alert_failed', source: 'watchdog', severity: d.severity, checkName: d.check, actor: 'watchdog', summary: deps.alerts ? 'Falha ao enviar o alerta do incidente' : 'Sem webhook de alerta configurado' }).catch(() => undefined);
      }
    }
    incidents.push({ check: d.check, severity: d.severity, alert: kind, sent });
  }

  // 4. recoveries: the incident closes and one "resolved" message goes out. The pauses stay until a human clears them.
  const resolved: string[] = [];
  for (const r of run.results) {
    if (!r.ok || !(streaks[r.check]?.wasFailing ?? false)) continue;
    let closed = false;
    let openedAtMs: number | null = null;
    try {
      const res = await deps.store.resolveIncident(r.check);
      closed = res.resolved;
      openedAtMs = res.openedAtMs;
    } catch {
      /* ignore */
    }
    const mem = deps.memory.incidents.get(r.check);
    if (mem) {
      closed = true;
      openedAtMs = openedAtMs ?? mem.openedMs;
      deps.memory.incidents.delete(r.check);
    }
    if (!closed) continue;
    resolved.push(r.check);
    if (deps.alerts) {
      await deps.alerts.send(formatIncidentAlert({ kind: 'resolved', severity: 'info', summary: RULES[r.check as CheckName]?.summary ?? r.check, minutesOpen: openedAtMs ? Math.round((now() - openedAtMs) / 60_000) : 0, actionsTaken: [], aiParagraph: null, dashboardHint: hint }));
    }
  }

  return {
    ok: decisions.length === 0,
    checks: run.results.map((r) => ({ check: r.check, ok: r.ok })),
    incidents,
    pauses: [...pauseResults.entries()].map(([flag, v]) => ({ flag, ...v })),
    resolved,
    persisted,
  };
}

/** One advisory paragraph in Portuguese about a NEW incident (fast model, free text, capped). Any failure just means the alert goes out without it. */
async function incidentParagraph(deps: WatchdogDeps, d: Decision, detail: Record<string, unknown>, switchedOn: FlagKey[]): Promise<string | null> {
  if (!deps.model) return null;
  const modelId = deps.fastModel ?? DEFAULT_MODEL_FAST;
  try {
    const budget = decideBudget(deps.limits, await deps.store.budget());
    if (!budget.allowed) {
      await deps.store.logRun({ kind: 'incident', model: modelId, status: 'skipped_budget', inputTokens: 0, outputTokens: 0, costUsd: 0, reportId: null, note: budget.reason }).catch(() => undefined);
      return null;
    }
    const prompt = buildIncidentPrompt([{ name: d.check, detail }], switchedOn);
    const res = await deps.model.complete({ kind: 'incident', model: modelId, system: prompt.system, user: prompt.user, maxTokens: 1_500, effort: 'low' });
    const cost = estimateCostUsd(res.model || modelId, res.usage);
    const text = cleanText(res.text, 900);
    const usable = res.stopReason === 'end_turn' && text.length >= 20;
    await deps.store.logRun({ kind: 'incident', model: res.model || modelId, status: usable ? 'ok' : 'invalid_output', inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, costUsd: cost, reportId: null, note: usable ? null : `stop_reason ${res.stopReason ?? 'nulo'}` }).catch(() => undefined);
    return usable ? text : null;
  } catch {
    return null;
  }
}
