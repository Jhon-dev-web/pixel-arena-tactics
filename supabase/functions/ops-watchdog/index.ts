import { getEdgeEnv } from '../_shared/env.ts';
import { createWebhookSender } from '../_shared/ops/alerts.ts';
import { createAnthropicModelClient } from '../_shared/ops/anthropicModel.ts';
import { DEFAULT_MODEL_FAST, parseLimits, parseModelId } from '../_shared/ops/budget.ts';
import { createWatchdogHandler } from '../_shared/ops/opsHandlers.ts';
import { createOpsStore } from '../_shared/ops/opsStore.ts';
import { createSolanaProbe, newWatchdogMemory, runWatchdog } from '../_shared/ops/watchdog.ts';

// Supabase Edge Function (Deno): the watchdog (docs/AI_OPS.md). POST with the shared secret (header x-ops-secret) runs the health checks, opens/closes incidents, switches the safe pauses ON and alerts;
// pg_cron calls it every 5 minutes. GET (no secret) is the public health URL for an external uptime monitor: {"ok":true,"checkedAt":"..."} or 503. Deploy with --no-verify-jwt (answers 503 until OPS_CRON_SECRET is set).
// Needs the npm import map in this folder (deno.json: the official Anthropic SDK, used only for the one-paragraph incident explanation).
// Secrets by NAME: OPS_CRON_SECRET, OPS_ALERT_WEBHOOK_URL, ANTHROPIC_API_KEY (optional), AI_AUDITOR_MODEL_FAST (optional), SOLANA_RPC_URL (optional: its health is checked; the URL is never logged or returned).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform. The watchdog NEVER switches a flag off: a human clears flags in the admin panel.
const memory = newWatchdogMemory(); // survives between runs of the same isolate: the fallback when the database cannot be written

Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  const store = createOpsStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' });
  const handler = createWatchdogHandler({
    secret: env.OPS_CRON_SECRET,
    probe: async () => {
      await store.callRpc('ops_health_probe');
      return true;
    },
    run: () =>
      runWatchdog({
        store,
        alerts: createWebhookSender(env.OPS_ALERT_WEBHOOK_URL),
        model: env.ANTHROPIC_API_KEY ? createAnthropicModelClient({ apiKey: env.ANTHROPIC_API_KEY, timeoutMs: 30_000 }) : null,
        limits: parseLimits(env),
        solana: createSolanaProbe(env.SOLANA_RPC_URL),
        memory,
        fastModel: parseModelId(env.AI_AUDITOR_MODEL_FAST, DEFAULT_MODEL_FAST),
      }),
  });
  return handler(req);
});
