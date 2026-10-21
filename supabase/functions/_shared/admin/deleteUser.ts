import type { AuthConfig } from '../auth.ts';
import { UUID_RE, json } from '../http.ts';
import { prelude } from '../market/prelude.ts';

// admin-delete-user: the owner deletes a game account from the dashboard (docs/ADMIN.md, "Ações do painel").
// Every rule that can be decided in the database is decided there, by public.admin_delete_user_prepare (migration 0027), which this function calls WITH THE CALLER'S OWN JWT:
//   the caller must be in arena_private.admins, may not delete himself or another admin, must type the account's username / hero name, and a dry run must show that no foreign key blocks the deletion.
// That call also writes the audit row, BEFORE anything is deleted. Only then does this function use the service key, for the one call a browser can never make: auth.admin.deleteUser (the cascades remove the game data).
// The outcome ('delete_user_done' / 'delete_user_failed') is appended to the log afterwards. The service key never leaves this file's store; the user id deleted comes from the request body, but only an admin who typed the account's own name gets that far.

export type PrepareResult =
  | { kind: 'ok'; username: string | null; heroName: string | null; auditId: number | null }
  | { kind: 'blocked'; constraint: string | null; table: string | null }
  | { kind: 'refused'; code: 'ADMIN_ONLY' | 'ADMIN_DELETE_SELF' | 'ADMIN_DELETE_ADMIN' | 'USER_NOT_FOUND' | 'CONFIRM_MISMATCH' };

export interface AdminDeleteStore {
  /** admin_delete_user_prepare with the caller's JWT. Throws on anything that is not a clean answer (the caller then sees a 502 and nothing was deleted). */
  prepare(jwt: string, userId: string, confirm: string): Promise<PrepareResult>;
  /** auth.admin.deleteUser with the service key. Throws when the Auth server refuses. */
  deleteAuthUser(userId: string): Promise<void>;
  /** admin_audit_record with the service key; best effort (the 'delete_user' line already exists). */
  record(adminId: string, action: 'delete_user_done' | 'delete_user_failed', userId: string, details: Record<string, unknown>): Promise<void>;
}

export interface AdminDeleteDeps {
  auth: AuthConfig;
  /** The exact origin(s) of the admin dashboard (ADMIN_ORIGIN). Empty = the function answers 503. */
  allowedOrigins: string[];
  store: AdminDeleteStore | null;
}

export const CONFIRM_MAX = 200;

export function parseDeleteBody(raw: Record<string, unknown>): { userId: string; confirm: string } | null {
  if (typeof raw.user_id !== 'string' || !UUID_RE.test(raw.user_id)) return null;
  if (typeof raw.confirm_username !== 'string') return null;
  const confirm = raw.confirm_username.trim();
  if (confirm.length < 1 || confirm.length > CONFIRM_MAX) return null;
  return { userId: raw.user_id.toLowerCase(), confirm };
}

const REFUSAL_STATUS: Record<string, number> = { ADMIN_ONLY: 403, ADMIN_DELETE_SELF: 409, ADMIN_DELETE_ADMIN: 409, USER_NOT_FOUND: 404, CONFIRM_MISMATCH: 400 };

export async function handleAdminDeleteUser(req: Request, deps: AdminDeleteDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if ('response' in pre) return pre.response;
  const { userId: adminId, cors } = pre;
  if (!deps.store) return json({ error: 'unavailable' }, 503, cors);
  const body = parseDeleteBody(pre.body);
  if (!body) return json({ error: 'bad_request' }, 400, cors);
  const jwt = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!jwt) return json({ error: 'unauthenticated' }, 401, cors);

  let prepared: PrepareResult;
  try {
    prepared = await deps.store.prepare(jwt, body.userId, body.confirm);
  } catch {
    return json({ error: 'unavailable' }, 502, cors);
  }
  if (prepared.kind === 'refused') return json({ error: 'refused', reason: prepared.code }, REFUSAL_STATUS[prepared.code] ?? 400, cors);
  if (prepared.kind === 'blocked') return json({ error: 'blocked', constraint: prepared.constraint, table: prepared.table }, 409, cors);

  try {
    await deps.store.deleteAuthUser(body.userId);
  } catch {
    await deps.store.record(adminId, 'delete_user_failed', body.userId, { audit_id: prepared.auditId }).catch(() => undefined);
    return json({ error: 'delete_failed' }, 502, cors);
  }
  await deps.store.record(adminId, 'delete_user_done', body.userId, { audit_id: prepared.auditId, username: prepared.username }).catch(() => undefined);
  return json({ ok: true, user_id: body.userId, username: prepared.username }, 200, cors);
}
