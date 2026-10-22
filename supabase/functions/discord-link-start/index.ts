import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleDiscordLinkStart, randomStateValue } from '../_shared/discord/handler.ts';
import { createDiscordStore } from '../_shared/discord/restStore.ts';

// Supabase Edge Function (Deno): "Entrar no Discord", step 1 (docs/DISCORD_TASK.md). Creates a single-use state for the signed-in account and answers the Discord authorize URL; the game then sends the browser there.
// Secrets by NAME: DISCORD_CLIENT_ID, APP_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with JWT verification ON (the default): the player's session token is the only way in, and the user id comes from it and from nowhere else.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleDiscordLinkStart(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    config: env.DISCORD_CLIENT_ID && env.SUPABASE_URL ? { clientId: env.DISCORD_CLIENT_ID, callbackUrl: `${env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/discord-link-callback` } : null,
    store: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createDiscordStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }) : null,
    randomState: randomStateValue,
  });
});
