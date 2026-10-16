// What the owner can fill in for the Settings > Suporte panel and the account-deletion note. Every field is null until the owner decides it; a null field shows nothing at all (never a placeholder).
// These mirror the portal's owner settings (portal/src/content.mjs: company.supportEmail and legalLive.terms / privacy / refund): fill the same values here when the legal pages are live.
export interface SupportConfig {
  /** the support e-mail address (also where an account deletion is requested). null: no address is shown. */
  supportEmail: string | null;
  /** https addresses of the public legal pages, each only when its real text is live on the site. */
  termsUrl: string | null;
  privacyUrl: string | null;
  refundUrl: string | null;
}

export const SUPPORT: SupportConfig = {
  supportEmail: null,
  termsUrl: null,
  privacyUrl: null,
  refundUrl: null,
};

/** Only a plain https address becomes a link; anything else (an empty string, a script URL) is treated as "not configured". */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A support address that looks like an address, or null. */
export function cleanEmail(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v) ? v : null;
}
