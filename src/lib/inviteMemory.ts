import { INVITE_CODE_RE } from './referral';

// The invite code of the link the player arrived by (`<game>/?ref=CODE`, also `?invite=CODE`). OWNER RULE: nothing is saved in the browser, so the code lives in this variable only: it is
// read once at start (main.tsx), taken out of the address bar, shown on the login screen ("Você foi convidado por um amigo"), sent with the sign-up (user metadata { invite }) and, if the
// server trigger missed it, handed to claim_invite once after the first login. A reload forgets it, which is fine: the sign-up already carried it to the server.

export const INVITE_PARAMS = ['ref', 'invite'] as const;

let pending: string | null = null;

/** Reads ?ref= / ?invite= once, removes them from the address bar and keeps a well-formed code in memory. Returns the code (or null). Never throws, never touches storage. */
export function captureInvite(
  href: string = typeof window !== 'undefined' ? window.location.href : '',
  replaceUrl: (relative: string) => void = (u) => window.history.replaceState(null, '', u),
): string | null {
  try {
    const url = new URL(href);
    let found: string | null = null;
    let touched = false;
    for (const name of INVITE_PARAMS) {
      if (!url.searchParams.has(name)) continue;
      const value = (url.searchParams.get(name) ?? '').trim().toUpperCase();
      if (found === null && INVITE_CODE_RE.test(value)) found = value;
      url.searchParams.delete(name);
      touched = true;
    }
    if (touched) replaceUrl(url.pathname + url.search + url.hash);
    if (found) pending = found;
    return found;
  } catch {
    return null;
  }
}

/** The code waiting in memory, or null. */
export const pendingInvite = (): string | null => pending;

/** Forgets the code (after it was claimed, or when the player signs in to an existing account). */
export function clearPendingInvite(): void {
  pending = null;
}

/** Test helper. */
export function setPendingInviteForTest(code: string | null): void {
  pending = code;
}
