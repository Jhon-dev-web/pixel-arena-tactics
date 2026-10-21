// Chooses the real backend (Supabase) or, in a build made with VITE_ADMIN_DEMO=1, a fake one with invented data (for screenshots and for working on the layout).
// The demo module is imported dynamically behind a build-time constant, so a normal build contains none of it (a test checks the built bundle).
import { createClient } from '@supabase/supabase-js';
import { parseDeleteResponse, type DeleteUserResult } from './actions';
import { type AdminApi, createRpcApi } from './api';
import type { AuthPort } from './auth';
import { signInMessage } from './auth';
import { type EnvInfo, environmentFromBuild } from './environment';

export interface Backend {
  auth: AuthPort;
  api: AdminApi;
  demo: boolean;
  /** Which environment this build is connected to (shown in the shell). Absent = not declared. */
  env?: EnvInfo;
}

export type BackendResult = { ok: true; backend: Backend } | { ok: false; reason: 'missing-config' };

export async function createBackend(): Promise<BackendResult> {
  if (import.meta.env.VITE_ADMIN_DEMO === '1') {
    const { createDemoBackend } = await import('./demo');
    return { ok: true, backend: createDemoBackend() };
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: 'missing-config' };

  const client = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const auth: AuthPort = {
    async session() {
      const { data } = await client.auth.getSession();
      return data.session ? { email: data.session.user.email ?? null } : null;
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, message: signInMessage(error.message) } : { ok: true };
    },
    async signOut() {
      await client.auth.signOut();
    },
    async isAdmin() {
      const { data, error } = await client.rpc('is_admin');
      if (error) throw new Error(error.message);
      return data === true;
    },
    onChange(callback) {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') callback();
      });
      return () => data.subscription.unsubscribe();
    },
  };
  // The one call that is not an rpc: the Edge Function that deletes an account. It carries the signed-in admin's own session token (verified by the platform, and again by the database, which insists the caller is an admin).
  async function deleteUser(userId: string, confirm: string): Promise<DeleteUserResult> {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, reason: 'session' };
    try {
      const res = await fetch(`${String(url).replace(/\/$/, '')}/functions/v1/admin-delete-user`, {
        method: 'POST',
        headers: { apikey: String(anon), authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: userId, confirm_username: confirm }),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return parseDeleteResponse(res.status, body);
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }
  return { ok: true, backend: { auth, api: createRpcApi(client, { deleteUser }), demo: false, env: environmentFromBuild(false) } };
}
