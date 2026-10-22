import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleDiscordLinkCallback } from '../_shared/discord/handler.ts';
import { createDiscordStore } from '../_shared/discord/restStore.ts';

// Supabase Edge Function (Deno): "Entrar no Discord", step 2 (docs/DISCORD_TASK.md). Discord sends the browser here with ?code&state; the function checks the state, exchanges the code, confirms the guild
// membership, stores the verdict (never a token) and redirects the browser to the game with ?discord=ok|not_member|used|error.
// Secrets by NAME: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, APP_ORIGIN. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with --no-verify-jwt: it is a browser redirect from Discord and carries no Authorization header. The protection is the single-use, 10 minute state bound to the account at step 1.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleDiscordLinkCallback(req, {
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    config:
      env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_GUILD_ID && env.SUPABASE_URL
        ? {
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET,
            guildId: env.DISCORD_GUILD_ID,
            callbackUrl: `${env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/discord-link-callback`,
          }
        : null,
    store: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createDiscordStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }) : null,
  });
});
