import { getEdgeEnv } from '../_shared/env.ts';
import { createWebhookSender } from '../_shared/ops/alerts.ts';
import { createAnthropicModelClient } from '../_shared/ops/anthropicModel.ts';
import { runAuditor } from '../_shared/ops/auditor.ts';
import { DEFAULT_MODEL_DAILY, DEFAULT_MODEL_FAST, parseLimits, parseModelId } from '../_shared/ops/budget.ts';
import { handleAuditorRequest } from '../_shared/ops/opsHandlers.ts';
import { createOpsStore } from '../_shared/ops/opsStore.ts';

// Supabase Edge Function (Deno): the AI auditor (docs/AI_OPS.md). Called by pg_cron through pg_net, hourly ({"mode":"hourly"}) and once a day ({"mode":"daily"}), with the shared secret in the header x-ops-secret.
// Deploy with --no-verify-jwt (the secret is the authentication; it answers 503 until OPS_CRON_SECRET is set). Needs the npm import map in this folder (deno.json: the official Anthropic SDK).
// Secrets by NAME: OPS_CRON_SECRET, ANTHROPIC_API_KEY, AI_AUDITOR_MODEL_FAST, AI_AUDITOR_MODEL_DAILY, OPS_ALERT_WEBHOOK_URL, and the optional budget guards AI_AUDITOR_MAX_RUNS_PER_DAY, AI_AUDITOR_MONTHLY_BUDGET_USD,
// AI_AUDITOR_MAX_OUTPUT_TOKENS_FAST, AI_AUDITOR_MAX_OUTPUT_TOKENS_DAILY (OPS_ALERT_EMAIL_TO is reserved for a later e-mail alert). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// The model only ever reads compact aggregates and writes advisory reports; this function has no code path that changes a flag, bans, refunds, edits a save or moves money.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  const store = createOpsStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' });
  return handleAuditorRequest(req, {
    secret: env.OPS_CRON_SECRET,
    run: (mode) =>
      runAuditor(mode, {
        store,
        model: env.ANTHROPIC_API_KEY ? createAnthropicModelClient({ apiKey: env.ANTHROPIC_API_KEY }) : null,
        alerts: createWebhookSender(env.OPS_ALERT_WEBHOOK_URL),
        limits: parseLimits(env),
        models: { fast: parseModelId(env.AI_AUDITOR_MODEL_FAST, DEFAULT_MODEL_FAST), daily: parseModelId(env.AI_AUDITOR_MODEL_DAILY, DEFAULT_MODEL_DAILY) },
      }),
  });
});
