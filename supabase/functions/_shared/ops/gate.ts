import { PAUSE_JUSTIFIED_BY, signalsSeverity } from './prechecks.ts';
import type { AuditorOutput } from './schema.ts';
import { maxSeverity, severityRank } from './types.ts';
import type { Category, Evidence, Severity, Signal, SuggestedAction } from './types.ts';

// The gate between what the model SAYS and what is stored. The model is a classifier and a writer of Portuguese; it is not trusted with anything:
//   * a finding must cite ids that exist in the signals the deterministic pre-checks produced (anything else is dropped: a username that talks to the model cannot make it "find" something new);
//   * its severity is capped at the strongest signal it cites (the model may lower a severity, never raise it);
//   * its category is the category of the signals it cites;
//   * "pause_market" / "pause_scoring" survive only when the cited signals are of the matching area; "review_account" only when a user is cited; otherwise the suggestion becomes "watch".
// Nothing here changes a flag, bans, refunds or edits anything: the result is text for a human.

export interface ReportFinding {
  category: Category;
  severity: Severity;
  summary_pt: string;
  evidence: Evidence[];
  suggested_action: SuggestedAction;
  /** Why the gate changed what the model said (for the report: "gate: ..."), if it did. */
  gate_note?: string;
}

const evKey = (e: Evidence): string => `${e.type}:${e.id}`;

const DEFAULT_ACTION: Record<Category, SuggestedAction> = {
  anticheat: 'review_account',
  level_jump: 'review_account',
  legendary_spike: 'watch',
  market_outlier: 'review_account',
  market_wash: 'review_account',
  market_concentration: 'review_account',
  referral_cluster: 'watch',
  payments: 'watch',
  errors: 'watch',
};

/** What the report says when no model was used (or its answer was thrown away): one finding per signal, written by the pre-checks. */
export function deterministicFindings(signals: Signal[]): ReportFinding[] {
  return signals.map((s) => {
    const hasUser = s.evidence.some((e) => e.type === 'user');
    const action = DEFAULT_ACTION[s.category] === 'review_account' && !hasUser ? 'watch' : DEFAULT_ACTION[s.category];
    return { category: s.category, severity: s.severity, summary_pt: s.summary, evidence: s.evidence, suggested_action: action };
  });
}

export interface GateResult {
  findings: ReportFinding[];
  severity: Severity;
  summary_pt: string;
  /** Findings thrown away because they cited nothing the pre-checks found. */
  dropped: number;
  /** Findings whose severity, category or action was changed by the gate. */
  adjusted: number;
}

export function reconcile(output: AuditorOutput, signals: Signal[]): GateResult {
  const bySignalId = new Map<string, Signal>(signals.map((s) => [s.id, s]));
  const byEvidence = new Map<string, Signal[]>();
  for (const s of signals) for (const e of s.evidence) byEvidence.set(e.id, [...(byEvidence.get(e.id) ?? []), s]);

  const findings: ReportFinding[] = [];
  let dropped = 0;
  let adjusted = 0;
  for (const f of output.findings) {
    const linked = new Map<string, Signal>();
    const evidence = new Map<string, Evidence>();
    for (const id of f.evidence_ids) {
      const sig = bySignalId.get(id);
      if (sig) {
        linked.set(sig.id, sig);
        for (const e of sig.evidence) evidence.set(evKey(e), e);
        continue;
      }
      const sigs = byEvidence.get(id);
      if (sigs) {
        for (const s of sigs) {
          linked.set(s.id, s);
          for (const e of s.evidence) if (e.id === id) evidence.set(evKey(e), e);
        }
      }
    }
    if (linked.size === 0) {
      dropped++;
      continue;
    }

    const signalsLinked = [...linked.values()];
    const notes: string[] = [];
    const ceiling = maxSeverity(signalsLinked.map((s) => s.severity));
    const severity: Severity = severityRank(f.severity) > severityRank(ceiling) ? ceiling : f.severity;
    if (severity !== f.severity) notes.push(`severidade limitada a ${ceiling}`);

    const categories = new Set(signalsLinked.map((s) => s.category));
    const category: Category = categories.has(f.category) ? f.category : signalsLinked[0].category;
    if (category !== f.category) notes.push(`categoria corrigida para ${category}`);

    let action = f.suggested_action;
    const hasUser = [...evidence.values()].some((e) => e.type === 'user');
    const justified = (kind: 'pause_market' | 'pause_scoring'): boolean => signalsLinked.some((s) => PAUSE_JUSTIFIED_BY[kind].includes(s.category) && severityRank(s.severity) >= severityRank('medium'));
    if (action === 'review_account' && !hasUser) action = 'watch';
    else if (action === 'pause_market' && !justified('pause_market')) action = 'watch';
    else if (action === 'pause_scoring' && !justified('pause_scoring')) action = 'watch';
    if (action !== f.suggested_action) notes.push(`sugestão ${f.suggested_action} trocada por ${action}`);
    if (notes.length > 0) adjusted++;

    findings.push({ category, severity, summary_pt: f.summary_pt, evidence: [...evidence.values()], suggested_action: action, ...(notes.length > 0 ? { gate_note: notes.join('; ') } : {}) });
  }

  if (findings.length === 0) {
    // The model's whole answer was unusable (or it found everything benign): the pre-checks speak for themselves.
    const det = deterministicFindings(signals);
    return { findings: det, severity: signalsSeverity(signals), summary_pt: output.summary_pt, dropped, adjusted };
  }
  // The overall severity is the strongest FINDING (after the cap), never the model's own overall claim: a sentence in a username cannot talk the report down.
  return { findings, severity: maxSeverity(findings.map((f) => f.severity)), summary_pt: output.summary_pt, dropped, adjusted };
}
