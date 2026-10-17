import type { ModelClient, ModelRequest, ModelResponse } from '../ops/model.ts';
import type { AuditorStore, OpsEventInput, ReportInput, RunLogInput } from '../ops/opsStore.ts';
import { ModelError } from '../ops/model.ts';

// Fake data and fakes for the AI-operations tests. Nothing here talks to the network or needs a key.

export const U1 = '00000000-0000-4000-8000-0000000000a1';
export const U2 = '00000000-0000-4000-8000-0000000000a2';
export const U3 = '00000000-0000-4000-8000-0000000000a3';
export const SALE1 = '70000000-0000-4000-8000-000000000001';

/** The jsonb public.ai_gather_aggregates returns (snake_case), quiet by default. */
export function rawAggregates(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    window_hours: 2,
    since: '2026-10-17T10:00:00Z',
    generated_at: '2026-10-17T12:00:00Z',
    anticheat: { flagged_snapshots: 0, rejected_snapshots: 0, accounts_with_new_flags: 0, reason_counts: [], accounts: [], item_flags: [] },
    level_jumps: { accounts_compared: 0, top: [] },
    legendary: { issued_in_window: 0, baseline_per_hour: 0.1, by_source: [], top_accounts: [] },
    market: { sales_in_window: 0, volume_lamports: 0, pair_lookback_hours: 24, outliers: [], pairs: [], heavy_buyers: [] },
    referrals: { lookback_hours: 24, signups: 0, ip_clusters: [], subnet_clusters: [], inviters: [], ignored: [] },
    payments: { refunded: 0, revoked_disputes: 0, new_active: 0, event_errors: 0, events_unprocessed_10min: 0 },
    errors: { by_function: [] },
    ...over,
  };
}

/** One market outlier (10x the median) between two named accounts: a medium/high signal with user evidence. */
export function outlierAggregates(sellerName = 'Carla', buyerName = 'Bruno', ratio = 25): Record<string, unknown> {
  return rawAggregates({
    market: {
      sales_in_window: 1,
      volume_lamports: 25_000_000_000,
      pair_lookback_hours: 24,
      outliers: [{ sale_id: SALE1, thing: 'steel_plate', seller_id: U1, seller_username: sellerName, buyer_id: U2, buyer_username: buyerName, price_lamports: 25_000_000_000, ratio_to_median: ratio, median_samples: 9 }],
      pairs: [],
      heavy_buyers: [],
    },
  });
}

/** A moderate anti-cheat finding (medium): 6 accounts flagged. */
export function flagsAggregates(): Record<string, unknown> {
  return rawAggregates({
    anticheat: {
      flagged_snapshots: 6,
      rejected_snapshots: 1,
      accounts_with_new_flags: 6,
      reason_counts: [{ reason: 'PACE_TOO_FAST', count: 5 }],
      accounts: [{ user_id: U3, username: 'AnaSilva', flagged: 2, rejected: 1, reasons: ['PACE_TOO_FAST'] }],
      item_flags: [],
    },
  });
}

export class FakeAuditorStore implements AuditorStore {
  aggregates: unknown = rawAggregates();
  budgetState = { runsToday: 0, monthCostUsd: 0 };
  alertedFingerprints: string[] = [];
  reports: (ReportInput & { id: string })[] = [];
  runs: RunLogInput[] = [];
  events: OpsEventInput[] = [];
  gatherFails = false;
  hoursAsked: number[] = [];
  async gatherAggregates(hours: number) {
    this.hoursAsked.push(hours);
    if (this.gatherFails) throw new Error('ai_gather_aggregates_500');
    return this.aggregates;
  }
  async budget() {
    return { ...this.budgetState };
  }
  async recentAlertedFingerprints() {
    return [...this.alertedFingerprints, ...this.reports.filter((r) => r.details.alerted === true).map((r) => String(r.details.fingerprint))];
  }
  async insertReport(report: ReportInput) {
    const id = `report-${this.reports.length + 1}`;
    this.reports.push({ ...report, id });
    return id;
  }
  async logRun(run: RunLogInput) {
    this.runs.push(run);
    if (run.status === 'ok' || run.status === 'invalid_output' || run.status === 'error') this.budgetState = { runsToday: this.budgetState.runsToday + 1, monthCostUsd: this.budgetState.monthCostUsd + run.costUsd };
  }
  async addEvent(event: OpsEventInput) {
    this.events.push(event);
  }
}

/** A scripted model: returns the next canned answer, records every request. */
export class FakeModel implements ModelClient {
  requests: ModelRequest[] = [];
  constructor(private readonly answers: (string | ((req: ModelRequest) => string) | ModelError | Partial<ModelResponse>)[]) {}
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.requests.push(req);
    const next = this.answers[Math.min(this.requests.length - 1, this.answers.length - 1)];
    if (next instanceof ModelError) throw next;
    const base: ModelResponse = { text: '', stopReason: 'end_turn', usage: { inputTokens: 3_000, outputTokens: 900 }, model: req.model };
    if (typeof next === 'string') return { ...base, text: next };
    if (typeof next === 'function') return { ...base, text: next(req) };
    return { ...base, ...next };
  }
}

export class FakeAlerts {
  sent: string[] = [];
  ok = true;
  async send(message: string) {
    this.sent.push(message);
    return this.ok;
  }
}
