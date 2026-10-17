// Number, money, date and link formatting. Pure functions (no DOM), so they are unit-tested.

const LOCALE = 'pt-BR';
const LAMPORTS_PER_SOL = 1_000_000_000;

const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const usdFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const DASH = '—';

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 12345 -> "12.345"; null/undefined/NaN -> an em dash. */
export function fmtInt(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return DASH;
  const v = Number(n);
  return isNum(v) ? intFmt.format(v) : DASH;
}

/** 1,250,000 -> "1,3 mi"; used where a card is narrow. */
export function fmtCompact(n: number | null | undefined): string {
  return isNum(n) ? compactFmt.format(n) : DASH;
}

export function fmtUsd(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return DASH;
  const v = Number(n);
  return isNum(v) ? usdFmt.format(v) : DASH;
}

export function fmtPercent(ratio: number | null | undefined, digits = 0): string {
  return isNum(ratio) ? `${(ratio * 100).toFixed(digits).replace('.', ',')}%` : DASH;
}

/** Lamports (a number, a numeric string or a bigint) -> SOL as a number. 1,000,000,000 -> 1. */
export function lamportsToSol(l: number | string | bigint | null | undefined): number {
  if (l === null || l === undefined || l === '') return 0;
  const v = typeof l === 'bigint' ? Number(l) : Number(l);
  return isNum(v) ? v / LAMPORTS_PER_SOL : 0;
}

/** Lamports -> "1,25 SOL" with at most `digits` decimals (trailing zeros dropped). */
export function fmtSol(l: number | string | bigint | null | undefined, digits = 4): string {
  const sol = lamportsToSol(l);
  const text = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(sol);
  return `${text} SOL`;
}

/** Gold: "1.200.000". */
export const fmtGold = fmtInt;

/** An ISO timestamp -> "17/10/2026 14:05". `timeZone` is only passed by tests; the browser's own zone is used otherwise. */
export function fmtDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d).replace(',', '');
}

/** "2026-10-17" -> "17/10" (a calendar day, no timezone maths). */
export function fmtDay(day: string | null | undefined): string {
  if (!day) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? `${m[3]}/${m[2]}` : DASH;
}

export function fmtDate(day: string | null | undefined): string {
  if (!day) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : DASH;
}

/** Seconds -> "há 12 s" / "há 3 min" / "há 2 h" / "há 4 d". */
export function agoFromSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

/** An ISO timestamp -> "há 5 min" relative to `now` (ms). */
export function fmtAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return DASH;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return DASH;
  return agoFromSeconds((now - t) / 1000);
}

/** "atualizado há 12 s" for the overview. */
export function updatedLabel(seconds: number): string {
  return `atualizado ${agoFromSeconds(seconds)}`;
}

/** Same masking the database applies: "an***@example.com". */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return DASH;
  const at = email.indexOf('@');
  if (at < 0) return DASH;
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** "5Xk2...9qLm" */
export function shortAddress(address: string | null | undefined, head = 4, tail = 4): string {
  if (!address) return DASH;
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : DASH;
}

/** A Solscan link for a transaction signature. A test-mode sale (devnet) needs the cluster parameter. Signatures are base58, so they are safe in a URL. */
export function solscanTx(signature: string, livemode: boolean): string {
  const clean = signature.replace(/[^1-9A-HJ-NP-Za-km-z]/g, '');
  return `https://solscan.io/tx/${clean}${livemode ? '' : '?cluster=devnet'}`;
}

export function solscanAccount(address: string, livemode = true): string {
  const clean = address.replace(/[^1-9A-HJ-NP-Za-km-z]/g, '');
  return `https://solscan.io/account/${clean}${livemode ? '' : '?cluster=devnet'}`;
}

/** Progress 0..1 of `value` towards `target`, clamped. */
export function ratio(value: number, target: number): number {
  if (!isNum(value) || !isNum(target) || target <= 0) return 0;
  return Math.max(0, Math.min(1, value / target));
}

/** Material ids are snake_case: "iron_ore" -> "Iron ore". */
export function humanize(id: string | null | undefined): string {
  if (!id) return DASH;
  const t = id.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
