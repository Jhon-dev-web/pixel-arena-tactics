// The dashboard's ACTIONS (migration 0027, docs/ADMIN.md "Ações do painel"): delete an account, grant / revoke the Pass, promo codes. Every one is admin-only in the database, audited, and confirmed in the UI first.
// This file holds the types, the pure helpers and the Portuguese wording; the calls themselves are in api.ts (RPC) and backend.ts (the Edge Function).

/** Why the delete function said no. 'blocked' = a foreign key the database protects (market history); 'session' = the token was refused before the function ran. */
export type DeleteRefusal = 'ADMIN_ONLY' | 'ADMIN_DELETE_SELF' | 'ADMIN_DELETE_ADMIN' | 'USER_NOT_FOUND' | 'CONFIRM_MISMATCH' | 'blocked' | 'session' | 'unavailable' | 'failed';

export type DeleteUserResult = { ok: true; username: string | null } | { ok: false; reason: DeleteRefusal; constraint?: string | null; table?: string | null };

const KNOWN_REFUSALS: readonly string[] = ['ADMIN_ONLY', 'ADMIN_DELETE_SELF', 'ADMIN_DELETE_ADMIN', 'USER_NOT_FOUND', 'CONFIRM_MISMATCH'];

/** Maps the answer of the admin-delete-user function (its HTTP status and JSON body) to a result the UI can show. Anything unexpected is 'failed': never "ok" by accident. */
export function parseDeleteResponse(status: number, body: unknown): DeleteUserResult {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (status === 200 && b.ok === true) return { ok: true, username: typeof b.username === 'string' ? b.username : null };
  if (b.error === 'refused' && typeof b.reason === 'string' && KNOWN_REFUSALS.includes(b.reason)) return { ok: false, reason: b.reason as DeleteRefusal };
  if (b.error === 'blocked') return { ok: false, reason: 'blocked', constraint: typeof b.constraint === 'string' ? b.constraint : null, table: typeof b.table === 'string' ? b.table : null };
  if (status === 401) return { ok: false, reason: 'session' };
  if (status === 503 || b.error === 'unavailable') return { ok: false, reason: 'unavailable' };
  return { ok: false, reason: 'failed' };
}

export function deleteRefusalText(r: Extract<DeleteUserResult, { ok: false }>): string {
  switch (r.reason) {
    case 'ADMIN_ONLY':
      return 'O servidor recusou: esta conta não é de administrador.';
    case 'ADMIN_DELETE_SELF':
      return 'Você não pode apagar a própria conta por aqui.';
    case 'ADMIN_DELETE_ADMIN':
      return 'Esta conta é de administrador. Para apagá-la, primeiro tire-a da lista de administradores (SQL).';
    case 'USER_NOT_FOUND':
      return 'Conta não encontrada (talvez já tenha sido apagada).';
    case 'CONFIRM_MISMATCH':
      return 'O nome digitado não é o nome desta conta. Nada foi apagado.';
    case 'blocked':
      return `O banco protege o histórico desta conta (restrição ${r.constraint ?? 'desconhecida'}${r.table ? ` em ${r.table}` : ''}), então ela não pode ser apagada pelo painel. Nada foi apagado.`;
    case 'session':
      return 'Sua sessão expirou. Entre de novo e repita.';
    case 'unavailable':
      return 'A função de apagar contas não está disponível agora (não implantada ou sem a origem do painel configurada). Nada foi apagado.';
    default:
      return 'Não foi possível apagar a conta. Confira o registro de ações antes de tentar de novo.';
  }
}

/** What the player drawer asks the owner to type: the username, or the hero name when there is no username (the database accepts either, and the e-mail for an account with neither). */
export function deleteConfirmName(p: { username: string | null; heroName: string | null; email: string | null }): string | null {
  return p.username?.trim() || p.heroName?.trim() || p.email?.trim() || null;
}

// ---- Grant / revoke the Pass (public.admin_grant_pass / admin_revoke_pass) ----------------------------------------------------------------------------------------------------

export const NOTE_MIN = 3;
export const NOTE_MAX = 300;

export interface GrantPassResult {
  status: 'granted' | 'already';
  season: number;
  entitlement_id?: string;
}

export interface RevokePassResult {
  status: 'revoked' | 'none';
  season: number;
  /** The sources of the Pass(es) taken away ('grant', 'stripe', ...). */
  sources?: string[];
}

/** Plain words for the errors the action functions raise. Anything else is shown as the server sent it. */
export function actionErrorText(message: string): string {
  if (/ADMIN_NOTE_REQUIRED/.test(message)) return `Escreva o motivo (pelo menos ${NOTE_MIN} letras). Ele fica registrado com o seu nome.`;
  if (/ADMIN_NOTE_TOO_LONG/.test(message)) return `O motivo é longo demais (no máximo ${NOTE_MAX} letras).`;
  if (/USER_NOT_FOUND/.test(message)) return 'Conta não encontrada (talvez já tenha sido apagada).';
  if (/ADMIN_ONLY/.test(message)) return 'O servidor recusou: esta conta não é de administrador.';
  return message;
}
