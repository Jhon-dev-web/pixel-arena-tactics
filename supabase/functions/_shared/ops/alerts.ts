import type { ReportFinding } from './gate.ts';
import type { Severity, SuggestedAction } from './types.ts';
import { shouldAlert } from './types.ts';

// Alerts to the owner: a short Portuguese message to a Discord-compatible webhook (OPS_ALERT_WEBHOOK_URL, a secret: never logged, never echoed). No spam by construction:
//   * the watchdog sends ONE message when an incident opens, ONE reminder per 30 minutes while it stays open, and ONE "resolved" message (decideIncidentAlert);
//   * the auditor sends a message only for severity >= high and never twice for the same set of findings within 24 hours (decideReportAlert).
// The webhook body disables mentions (allowed_mentions.parse = []) so nothing a player typed can ping anybody.

export const REMINDER_MS = 30 * 60 * 1000;
export const REPORT_DEDUPE_HOURS = 24;
export const MAX_ALERT_CHARS = 1_800;

export type IncidentAlertDecision = 'alert' | 'reminder' | 'quiet';

/** isNew = the incident was just opened by this run. lastAlertAtMs = when it was last alerted (null = never, e.g. the first alert failed to send). */
export function decideIncidentAlert(inc: { isNew: boolean; lastAlertAtMs: number | null }, nowMs: number): IncidentAlertDecision {
  if (inc.isNew || inc.lastAlertAtMs === null) return 'alert';
  return nowMs - inc.lastAlertAtMs >= REMINDER_MS ? 'reminder' : 'quiet';
}

export interface ReportAlertDecision {
  send: boolean;
  reason: 'severity_below_high' | 'duplicate' | 'send';
}

export function decideReportAlert(severity: Severity, fingerprint: string, recentAlertedFingerprints: readonly string[]): ReportAlertDecision {
  if (!shouldAlert(severity)) return { send: false, reason: 'severity_below_high' };
  if (recentAlertedFingerprints.includes(fingerprint)) return { send: false, reason: 'duplicate' };
  return { send: true, reason: 'send' };
}

/** A stable id of a set of findings: category + the ids they cite, sorted. The same problem seen again hashes the same. */
export async function fingerprintFindings(findings: Pick<ReportFinding, 'category' | 'evidence'>[]): Promise<string> {
  const parts = findings.map((f) => `${f.category}:${f.evidence.map((e) => `${e.type}/${e.id}`).sort().join(',')}`).sort();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

export const ACTION_LABEL_PT: Record<SuggestedAction, string> = {
  review_account: 'revisar a conta',
  watch: 'continuar observando',
  pause_market: 'considerar pausar o mercado',
  pause_scoring: 'considerar pausar a pontuação da Liga',
  none: 'nenhuma ação',
};

export const SEVERITY_LABEL_PT: Record<Severity, string> = { info: 'INFORMATIVO', low: 'BAIXA', medium: 'MÉDIA', high: 'ALTA', critical: 'CRÍTICA' };

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

export function formatReportAlert(args: { severity: Severity; summary: string; findings: Pick<ReportFinding, 'summary_pt' | 'suggested_action' | 'severity'>[]; dashboardHint: string }): string {
  const lines = [`[Arena Idle - IA] Alerta de severidade ${SEVERITY_LABEL_PT[args.severity]}`, clip(args.summary, 500)];
  for (const f of args.findings.slice(0, 5)) lines.push(`- ${clip(f.summary_pt, 260)} (${ACTION_LABEL_PT[f.suggested_action]})`);
  if (args.findings.length > 5) lines.push(`- e mais ${args.findings.length - 5} achado(s) no painel.`);
  lines.push(args.dashboardHint, 'Nenhuma ação automática foi tomada: banir, reembolsar e mexer em saves continuam sendo decisões suas.');
  return clip(lines.join('\n'), MAX_ALERT_CHARS);
}

export function formatIncidentAlert(args: { kind: 'alert' | 'reminder' | 'resolved'; severity: Severity; summary: string; minutesOpen: number; actionsTaken: string[]; aiParagraph: string | null; dashboardHint: string }): string {
  const head =
    args.kind === 'resolved'
      ? `[Arena Idle - Operação] Incidente RESOLVIDO: ${clip(args.summary, 200)}`
      : args.kind === 'reminder'
        ? `[Arena Idle - Operação] LEMBRETE (${args.minutesOpen} min): incidente ainda aberto: ${clip(args.summary, 200)}`
        : `[Arena Idle - Operação] Incidente aberto (${SEVERITY_LABEL_PT[args.severity]}): ${clip(args.summary, 200)}`;
  const lines = [head];
  if (args.actionsTaken.length > 0) lines.push(`Ações automáticas (só pausas, reversíveis): ${args.actionsTaken.join(', ')}.`);
  if (args.kind === 'resolved') lines.push('As pausas NÃO são desligadas sozinhas: limpe as flags no painel quando quiser reabrir.');
  if (args.aiParagraph) lines.push(`Resumo da IA (conselho, pode errar): ${clip(args.aiParagraph, 900)}`);
  lines.push(args.dashboardHint);
  return clip(lines.join('\n'), MAX_ALERT_CHARS);
}

export interface AlertSender {
  /** True when the webhook accepted the message. Never throws. */
  send(message: string): Promise<boolean>;
}

/** The webhook sender. null when the URL is missing or is not a plain https URL (a missing alert channel is not an error: the report is stored anyway). */
export function createWebhookSender(url: string | undefined, fetchFn: typeof fetch = fetch): AlertSender | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  return {
    async send(message) {
      try {
        const res = await fetchFn(parsed.toString(), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: clip(message, MAX_ALERT_CHARS), username: 'Arena Idle Ops', allowed_mentions: { parse: [] } }),
        });
        return res.ok;
      } catch {
        return false; // never log the url or the error: the url is the secret
      }
    },
  };
}
