// Sign-in and the access check. The admin signs in with an ordinary game account (e-mail + password); being allowed in is a separate question
// that only the database answers (public.is_admin()). Everything here talks to a small port, so tests can use a fake.

export interface AuthPort {
  /** The current session's e-mail, or null when signed out. */
  session(): Promise<{ email: string | null } | null>;
  signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }>;
  signOut(): Promise<void>;
  /** public.is_admin(): true only for a row in arena_private.admins. */
  isAdmin(): Promise<boolean>;
  /** Called when the session appears or disappears (sign-in in another tab, expiry, sign-out). Returns an unsubscribe. */
  onChange(callback: () => void): () => void;
}

export type Access = { state: 'signed-out' } | { state: 'denied'; email: string | null } | { state: 'admin'; email: string | null } | { state: 'error'; message: string };

/** Signed out -> signed-out. Signed in but not an admin (or the check failed to say yes) -> denied: the pages are never rendered, no admin function is called. */
export async function resolveAccess(auth: AuthPort): Promise<Access> {
  let session: { email: string | null } | null;
  try {
    session = await auth.session();
  } catch (e) {
    return { state: 'error', message: errorText(e) };
  }
  if (!session) return { state: 'signed-out' };
  try {
    return (await auth.isAdmin()) ? { state: 'admin', email: session.email } : { state: 'denied', email: session.email };
  } catch (e) {
    return { state: 'error', message: errorText(e) };
  }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A friendly Portuguese message for the sign-in errors Supabase returns (it never says which of the two fields was wrong, and neither do we). */
export function signInMessage(raw: string): string {
  if (/invalid login credentials/i.test(raw)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(raw)) return 'Este e-mail ainda não foi confirmado.';
  if (/rate limit|too many/i.test(raw)) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (/network|fetch/i.test(raw)) return 'Sem conexão com o servidor.';
  return 'Não foi possível entrar.';
}
