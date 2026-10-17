import { decideReportAlert, fingerprintFindings, formatReportAlert, REPORT_DEDUPE_HOURS } from './alerts.ts';
import type { AlertSender } from './alerts.ts';
import { DEFAULT_MODEL_DAILY, DEFAULT_MODEL_FAST, decideBudget, estimateCostUsd } from './budget.ts';
import type { BudgetLimits } from './budget.ts';
import { deterministicFindings, reconcile } from './gate.ts';
import type { ReportFinding } from './gate.ts';
import { ModelError } from './model.ts';
import type { ModelClient } from './model.ts';
import type { AuditorStore } from './opsStore.ts';
import { runPrechecks, signalsSeverity } from './prechecks.ts';
import { buildAuditorPrompt } from './prompt.ts';
import { AUDITOR_JSON_SCHEMA, parseModelJson, validateAuditorOutput } from './schema.ts';
import { maxSeverity, normalizeAggregates } from './types.ts';
import type { Severity, Signal } from './types.ts';

// The AI auditor, end to end: gather compact aggregates -> deterministic pre-checks -> (only if they found something, and the budget allows) ask the model to classify and explain with a STRICT schema ->
// validate and gate its answer -> store the report -> alert (severity >= high, never twice for the same findings). It reads and writes reports and logs; it has no path to a flag, a ban, a refund or a save.

export type AuditorMode = 'hourly' | 'daily';

/** Hourly runs look back 2 h (the cron may drift; the alert de-duplication absorbs the overlap), the daily review 24 h. */
export const WINDOW_HOURS: Record<AuditorMode, number> = { hourly: 2, daily: 24 };

export interface AuditorDeps {
  store: AuditorStore;
  /** null = no ANTHROPIC_API_KEY: the pre-checks and the reports still run, the model is never called. */
  model: ModelClient | null;
  alerts: AlertSender | null;
  limits: BudgetLimits;
  models?: { fast?: string; daily?: string };
  /** Text appended to alerts so the owner knows where to look. */
  dashboardHint?: string;
}

export interface AuditorResult {
  mode: AuditorMode;
  status: 'quiet' | 'reported';
  signals: number;
  severity: Severity;
  modelCalled: boolean;
  modelStatus: 'ok' | 'invalid_output' | 'error' | 'skipped_no_signals' | 'skipped_budget' | 'skipped_disabled';
  alerted: boolean;
  alertReason: string;
  costUsd: number;
  reportId: string | null;
  notes: string[];
}

const trimReason = (s: string): string => (s.length > 160 ? `${s.slice(0, 159)}…` : s);

export async function runAuditor(mode: AuditorMode, deps: AuditorDeps): Promise<AuditorResult> {
  const hours = WINDOW_HOURS[mode];
  const modelId = mode === 'daily' ? (deps.models?.daily ?? DEFAULT_MODEL_DAILY) : (deps.models?.fast ?? DEFAULT_MODEL_FAST);
  const notes: string[] = [];
  const result: AuditorResult = { mode, status: 'quiet', signals: 0, severity: 'info', modelCalled: false, modelStatus: 'skipped_no_signals', alerted: false, alertReason: 'severity_below_high', costUsd: 0, reportId: null, notes };

  const aggregates = normalizeAggregates(await deps.store.gatherAggregates(hours));
  const signals: Signal[] = runPrechecks(aggregates);
  result.signals = signals.length;

  // ---- nothing found: no model call, no cost ----
  if (signals.length === 0) {
    await deps.store.logRun({ kind: mode, model: null, status: 'skipped_no_signals', inputTokens: 0, outputTokens: 0, costUsd: 0, reportId: null, note: 'sem sinais nas verificações determinísticas' });
    if (mode === 'daily') {
      // A short "all quiet" report, written without any model, so the owner can see the daily job is alive.
      const id = await deps.store.insertReport({
        kind: 'daily',
        severity: 'info',
        summary: 'Sem sinais nas últimas 24 horas: nenhuma marcação nova de anti-trapaça, nenhum pico de Lendários, mercado e pagamentos dentro do normal.',
        details: { mode, window_hours: hours, model_used: false, signals: [], findings: [], alerted: false, fingerprint: 'quiet' },
        suggestedActions: [],
      });
      result.reportId = id;
      result.status = 'reported';
    }
    return result;
  }

  // ---- something found: the model may explain it, if the guards allow ----
  let findings: ReportFinding[] = deterministicFindings(signals);
  let severity: Severity = signalsSeverity(signals);
  let summary = `${signals.length} sinal(is) encontrado(s) pelas verificações automáticas (sem análise da IA). Veja os achados abaixo.`;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let answeredBy: string | null = null;
  let gateInfo: { dropped: number; adjusted: number } | null = null;
  let truncated = false;
  // What to write in ai_runs once the report exists (the row points at it).
  let pendingRun: { status: AuditorResult['modelStatus']; note: string | null } | null = null;

  if (!deps.model) {
    result.modelStatus = 'skipped_disabled';
    notes.push('sem chave da API: a IA não foi chamada');
    await deps.store.logRun({ kind: mode, model: modelId, status: 'skipped_disabled', inputTokens: 0, outputTokens: 0, costUsd: 0, reportId: null, note: 'ANTHROPIC_API_KEY ausente' });
  } else {
    const budget = decideBudget(deps.limits, await deps.store.budget());
    if (!budget.allowed) {
      result.modelStatus = 'skipped_budget';
      notes.push(`IA não chamada: limite ${budget.reason === 'daily_runs' ? 'diário de execuções' : 'mensal de custo'} atingido`);
      await deps.store.logRun({ kind: mode, model: modelId, status: 'skipped_budget', inputTokens: 0, outputTokens: 0, costUsd: 0, reportId: null, note: budget.reason });
    } else {
      const prompt = buildAuditorPrompt({ mode, signals, aggregates, maxChars: deps.limits.maxInputChars });
      truncated = prompt.truncated;
      result.modelCalled = true;
      let status: AuditorResult['modelStatus'] = 'ok';
      let note: string | null = null;
      try {
        const res = await deps.model.complete({
          kind: mode,
          model: modelId,
          system: prompt.system,
          user: prompt.user,
          maxTokens: mode === 'daily' ? deps.limits.maxOutputTokensDaily : deps.limits.maxOutputTokensFast,
          effort: mode === 'daily' ? 'medium' : 'low',
          schema: AUDITOR_JSON_SCHEMA as unknown as Record<string, unknown>,
          fallbacks: mode === 'daily',
        });
        usage = res.usage;
        answeredBy = res.model;
        costUsd = estimateCostUsd(res.model || modelId, usage);
        if (res.stopReason !== 'end_turn') {
          status = 'invalid_output';
          note = `resposta não confiável (stop_reason ${res.stopReason ?? 'nulo'})`;
        } else {
          const parsed = parseModelJson(res.text);
          const valid = parsed.ok ? validateAuditorOutput(parsed.value) : parsed;
          if (!valid.ok) {
            status = 'invalid_output';
            note = `saída fora do esquema: ${valid.errors.slice(0, 3).join('; ')}`;
          } else {
            const gated = reconcile(valid.value, signals);
            findings = gated.findings;
            severity = gated.severity;
            summary = gated.summary_pt;
            gateInfo = { dropped: gated.dropped, adjusted: gated.adjusted };
          }
        }
      } catch (err) {
        status = 'error';
        note = err instanceof ModelError ? `falha da API (${err.kind}${err.status ? ` ${err.status}` : ''})` : 'falha ao chamar a IA';
      }
      result.modelStatus = status;
      if (note) notes.push(note);
      result.costUsd = costUsd;
      // The cost estimate is logged after the report below (the row points at it); a model failure keeps the deterministic findings.
      pendingRun = { status, note };
    }
  }

  // The overall severity never goes below the pre-checks' strongest signal: the model explains, it does not mute.
  const detSeverity = signalsSeverity(signals);
  const alertSeverity = maxSeverity([severity, detSeverity]);
  result.severity = severity;

  // ---- alert (before the insert, so the stored report says whether it went out) ----
  const fingerprint = await fingerprintFindings(signals.map((s) => ({ category: s.category, evidence: s.evidence })));
  const decision = decideReportAlert(alertSeverity, fingerprint, await deps.store.recentAlertedFingerprints(REPORT_DEDUPE_HOURS));
  result.alertReason = decision.reason;
  let alerted = false;
  if (decision.send) {
    if (deps.alerts) {
      alerted = await deps.alerts.send(formatReportAlert({ severity: alertSeverity, summary, findings, dashboardHint: deps.dashboardHint ?? 'Abra o painel do dono, página "IA e operação".' }));
      await deps.store.addEvent({ kind: alerted ? 'alert_sent' : 'alert_failed', source: 'ai-auditor', severity: alertSeverity, actor: 'ai-auditor', summary: alerted ? 'Alerta do auditor enviado' : 'Falha ao enviar o alerta do auditor', details: { fingerprint } }).catch(() => undefined);
    } else {
      result.alertReason = 'no_webhook';
    }
  }
  result.alerted = alerted;

  // ---- store the report ----
  const suggested = Array.from(new Map(findings.filter((f) => f.suggested_action !== 'none').map((f) => [f.suggested_action, { action: f.suggested_action, reason: trimReason(f.summary_pt) }])).values());
  const reportId = await deps.store.insertReport({
    kind: mode === 'daily' ? 'daily' : 'anomaly',
    severity: alertSeverity,
    summary,
    details: {
      mode,
      window_hours: hours,
      fingerprint,
      alerted,
      model_used: result.modelStatus === 'ok',
      model: answeredBy,
      model_status: result.modelStatus,
      notes,
      gate: gateInfo,
      input_truncated: truncated,
      usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_usd_estimate: costUsd },
      signals: signals.map((s) => ({ id: s.id, category: s.category, severity: s.severity, summary: s.summary })),
      findings: findings.map((f) => ({ category: f.category, severity: f.severity, summary: f.summary_pt, suggested_action: f.suggested_action, evidence: f.evidence, ...(f.gate_note ? { gate_note: f.gate_note } : {}) })),
    },
    suggestedActions: suggested,
  });
  result.reportId = reportId;
  result.status = 'reported';

  if (pendingRun) {
    await deps.store.logRun({ kind: mode, model: answeredBy ?? modelId, status: pendingRun.status, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd, reportId, note: pendingRun.note });
  }
  return result;
}
