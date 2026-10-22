// The only place the Edge Functions read environment variables, and only by NAME. Values are never logged or returned.
// `Deno` is declared by the runtime (see supabase/functions/deno-shim.d.ts for the repo's type-check).
export const EDGE_ENV_NAMES = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ADVENTURER_PASS',
  'STRIPE_WEBHOOK_SECRET',
  'APP_ORIGIN',
  // The admin dashboard's own origin (CORS of admin-delete-user), kept apart from APP_ORIGIN so the game's functions never answer the dashboard and vice versa.
  'ADMIN_ORIGIN',
  // The Solana market and the USDC Pass (docs/MARKET_SOLANA.md). SOLANA_RPC_URL may carry the provider's API key: it is read here and used by the chain module only, never logged or returned.
  'SOLANA_RPC_URL',
  'SOLANA_CLUSTER',
  'SOLANA_USDC_MINT',
  'MARKET_FEE_ADDRESS',
  'PASS_RECEIVE_ADDRESS',
  'PASS_PRICE_USDC',
  'SOL_USD_PRICE_URL',
  // The launch waitlist (docs/WAITLIST.md): the exact origin(s) of the public portal (CORS) and the HMAC key for hashes and unsubscribe tokens.
  'PORTAL_ORIGIN',
  'WAITLIST_SECRET',
  // The AI operations layer (docs/AI_OPS.md). ANTHROPIC_API_KEY is read by the ai-auditor / ops-watchdog model client only and never logged or returned. OPS_CRON_SECRET is the shared secret pg_cron sends
  // (header x-ops-secret); the two functions answer 503 until it is set. OPS_ALERT_WEBHOOK_URL is a Discord-compatible webhook (a secret in itself: it is never logged). OPS_ALERT_EMAIL_TO is reserved for a later e-mail alert.
  'ANTHROPIC_API_KEY',
  'AI_AUDITOR_MODEL_FAST',
  'AI_AUDITOR_MODEL_DAILY',
  'AI_AUDITOR_MAX_RUNS_PER_DAY',
  'AI_AUDITOR_MONTHLY_BUDGET_USD',
  'AI_AUDITOR_MAX_OUTPUT_TOKENS_FAST',
  'AI_AUDITOR_MAX_OUTPUT_TOKENS_DAILY',
  'OPS_CRON_SECRET',
  'OPS_ALERT_WEBHOOK_URL',
  'OPS_ALERT_EMAIL_TO',
  // The Discord community task (docs/DISCORD_TASK.md): the OAuth2 application's id and secret (the secret is read by discord-link-callback only and never logged or returned) and the id of the game's Discord server.
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_GUILD_ID',
] as const;

export type EdgeEnv = Partial<Record<(typeof EDGE_ENV_NAMES)[number], string>>;

export function getEdgeEnv(): EdgeEnv {
  const out: EdgeEnv = {};
  for (const name of EDGE_ENV_NAMES) {
    const v = Deno.env.get(name);
    if (v) out[name] = v;
  }
  return out;
}
