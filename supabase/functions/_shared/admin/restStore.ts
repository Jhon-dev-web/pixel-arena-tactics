import type { AdminDeleteStore, PrepareResult } from './deleteUser.ts';

// The real store of admin-delete-user. Three HTTP calls, none of which logs or returns a key:
//   * PostgREST rpc admin_delete_user_prepare with the apikey = the anon key and Authorization = the CALLER's JWT (so auth.uid() inside the database is the admin);
//   * the Auth server's admin API (DELETE /auth/v1/admin/users/<id>) with the service-role key;
//   * PostgREST rpc admin_audit_record with the service-role key.
export interface AdminDbConfig {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

const REFUSALS = ['ADMIN_ONLY', 'ADMIN_DELETE_SELF', 'ADMIN_DELETE_ADMIN', 'USER_NOT_FOUND', 'CONFIRM_MISMATCH'] as const;

export function createAdminDeleteStore(cfg: AdminDbConfig): AdminDeleteStore {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  return {
    async prepare(jwt, userId, confirm): Promise<PrepareResult> {
      const res = await doFetch(`${base}/rest/v1/rpc/admin_delete_user_prepare`, {
        method: 'POST',
        headers: { apikey: cfg.anonKey, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ p_user: userId, p_confirm: confirm }),
      });
      let out: unknown;
      try {
        out = await res.json();
      } catch {
        out = null;
      }
      const o = out && typeof out === 'object' ? (out as Record<string, unknown>) : {};
      if (!res.ok) {
        const message = typeof o.message === 'string' ? o.message : '';
        const refusal = REFUSALS.find((r) => message.includes(r));
        // 42501 is "permission denied" from a role that may not call the function at all: also "not an admin".
        if (refusal) return { kind: 'refused', code: refusal };
        if (o.code === '42501') return { kind: 'refused', code: 'ADMIN_ONLY' };
        throw new Error(`prepare_${res.status}`);
      }
      if (o.status === 'ok') {
        return { kind: 'ok', username: typeof o.username === 'string' ? o.username : null, heroName: typeof o.hero_name === 'string' ? o.hero_name : null, auditId: typeof o.audit_id === 'number' ? o.audit_id : null };
      }
      if (o.status === 'blocked') return { kind: 'blocked', constraint: typeof o.constraint === 'string' ? o.constraint : null, table: typeof o.table === 'string' ? o.table : null };
      throw new Error('prepare_bad_answer');
    },
    async deleteAuthUser(userId) {
      const res = await doFetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ should_soft_delete: false }),
      });
      if (!res.ok) throw new Error(`auth_delete_${res.status}`);
    },
    async record(adminId, action, userId, details) {
      const res = await doFetch(`${base}/rest/v1/rpc/admin_audit_record`, {
        method: 'POST',
        headers: { apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ p_admin: adminId, p_action: action, p_target: userId, p_details: details }),
      });
      if (!res.ok) throw new Error(`audit_${res.status}`);
    },
  };
}
