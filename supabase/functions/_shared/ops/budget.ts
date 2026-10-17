// Budget guards of the AI layer: a hard cap on model calls per day and on the estimated spend per month, a cap on output tokens per call and on the size of what is sent. The point is that a bug, an attack
// that floods the pre-checks, or a price change can never turn into a large bill: when a guard trips the model is simply not called (the deterministic report is still stored).

/** Models this layer knows the price of (USD per million tokens, standard rates for prompts up to 100K tokens). Estimates, never an invoice: check the Anthropic price page (docs/AI_OPS.md). */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-fable-5-1': { in: 10, out: 50 },
  'claude-fable-5': { in: 10, out: 50 },
};
/** An unknown model id (an owner override) is priced like the most expensive known one: the guard errs on the side of stopping early. */
const FALLBACK_PRICE = { in: 10, out: 50 };

export const DEFAULT_MODEL_FAST = 'claude-haiku-5-5';
export const DEFAULT_MODEL_DAILY = 'claude-opus-5-5';

export function estimateCostUsd(model: string, usage: { inputTokens: number; outputTokens: number }): number {
  const p = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  const cost = (Math.max(usage.inputTokens, 0) * p.in + Math.max(usage.outputTokens, 0) * p.out) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

export interface BudgetLimits {
  /** Model calls per UTC day, all kinds together (hourly + daily + incident summaries). */
  maxRunsPerDay: number;
  /** Estimated spend per UTC month; at or above it no model is called until next month. */
  monthlyBudgetUsd: number;
  maxOutputTokensFast: number;
  maxOutputTokensDaily: number;
  /** Characters of the data block sent to the model (about a quarter of that in tokens). */
  maxInputChars: number;
}

export const DEFAULT_LIMITS: BudgetLimits = { maxRunsPerDay: 40, monthlyBudgetUsd: 30, maxOutputTokensFast: 4_000, maxOutputTokensDaily: 8_000, maxInputChars: 40_000 };

const intIn = (raw: string | undefined, def: number, min: number, max: number): number => {
  const n = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), min), max) : def;
};
const numIn = (raw: string | undefined, def: number, min: number, max: number): number => {
  const n = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};

/** The limits from the optional secrets (AI_AUDITOR_MAX_RUNS_PER_DAY ...), clamped to sane ranges so a typo cannot lift a guard to infinity. */
export function parseLimits(env: { AI_AUDITOR_MAX_RUNS_PER_DAY?: string; AI_AUDITOR_MONTHLY_BUDGET_USD?: string; AI_AUDITOR_MAX_OUTPUT_TOKENS_FAST?: string; AI_AUDITOR_MAX_OUTPUT_TOKENS_DAILY?: string }): BudgetLimits {
  return {
    maxRunsPerDay: intIn(env.AI_AUDITOR_MAX_RUNS_PER_DAY, DEFAULT_LIMITS.maxRunsPerDay, 1, 200),
    monthlyBudgetUsd: numIn(env.AI_AUDITOR_MONTHLY_BUDGET_USD, DEFAULT_LIMITS.monthlyBudgetUsd, 0.5, 500),
    maxOutputTokensFast: intIn(env.AI_AUDITOR_MAX_OUTPUT_TOKENS_FAST, DEFAULT_LIMITS.maxOutputTokensFast, 500, 16_000),
    maxOutputTokensDaily: intIn(env.AI_AUDITOR_MAX_OUTPUT_TOKENS_DAILY, DEFAULT_LIMITS.maxOutputTokensDaily, 1_000, 32_000),
    maxInputChars: DEFAULT_LIMITS.maxInputChars,
  };
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: 'daily_runs' | 'monthly_budget' };

export function decideBudget(limits: BudgetLimits, state: { runsToday: number; monthCostUsd: number }): BudgetDecision {
  if (state.runsToday >= limits.maxRunsPerDay) return { allowed: false, reason: 'daily_runs' };
  if (state.monthCostUsd >= limits.monthlyBudgetUsd) return { allowed: false, reason: 'monthly_budget' };
  return { allowed: true };
}

/** AI_AUDITOR_MODEL_FAST / AI_AUDITOR_MODEL_DAILY: a model id from the owner, or the default when it is unset or does not look like an id. */
export function parseModelId(raw: string | undefined, def: string): string {
  const v = (raw ?? '').trim();
  return /^[a-z0-9][a-z0-9.-]{2,59}$/.test(v) ? v : def;
}
