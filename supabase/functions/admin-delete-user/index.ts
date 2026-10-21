import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleAdminDeleteUser } from '../_shared/admin/deleteUser.ts';
import { createAdminDeleteStore } from '../_shared/admin/restStore.ts';

// Supabase Edge Function (Deno): the owner deletes a game account from the admin dashboard (docs/ADMIN.md, "Ações do painel").
// Secrets by NAME: ADMIN_ORIGIN (the exact https origin of the dashboard, for CORS). SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with JWT verification ON (the default): the caller's session token is the only way in. Beyond the token, the database insists the caller is in arena_private.admins (public.admin_delete_user_prepare).
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleAdminDeleteUser(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.ADMIN_ORIGIN),
    store:
      env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminDeleteStore({ supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
        : null,
  });
});
