import { deviceStorage } from '../lib/deviceStore';
import en from './en.json';
import pt from './pt.json';

const DEFAULT_LOCALE = 'pt';
const LOCALES = { en, pt } as const;
export type Locale = keyof typeof LOCALES;

function resolve(): Locale {
  const saved = deviceStorage.getItem('locale');
  if (saved && saved in LOCALES) return saved as Locale;
  const want = navigator.language.slice(0, 2);
  return (want in LOCALES ? want : DEFAULT_LOCALE) as Locale;
}

let current = resolve();
export let activeLocale: Locale = current;
let localeListener: (() => void) | null = null;

/** Keeps <html lang> equal to the chosen language (screen readers, the browser's translate offer). */
function syncDocumentLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
syncDocumentLang();

function read(locale: Locale, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    LOCALES[locale],
  );
}

export function t(path: string, vars?: Record<string, string | number>): string {
  const raw = read(current, path) ?? read(DEFAULT_LOCALE, path);
  if (typeof raw !== 'string') {
    console.warn(`[i18n] missing key: ${path}`);
    return '';
  }
  return vars ? raw.replace(/\{(\w+)\}/g, (whole, key) => String(vars[key] ?? whole)) : raw;
}

/** The online game learns the player's language from the server save after this module loaded: take it. */
export function reloadLocale(): void {
  const next = resolve();
  if (next === current) return;
  current = next;
  activeLocale = next;
  syncDocumentLang();
  localeListener?.();
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  deviceStorage.setItem('locale', next);
  current = next;
  activeLocale = next;
  syncDocumentLang();
  localeListener?.();
}

// The game has one React root. Keeping a tiny listener here lets the established locale module
// update that root immediately while preserving the same localStorage preference mechanism.
export function setLocaleListener(listener: (() => void) | null): void {
  localeListener = listener;
}

export const locales = Object.keys(LOCALES) as Locale[];

// Number with thousands separators in the active language (pt-BR "1.234", en-US "1,234"): the one formatter every screen uses for counts, gold and XP.
// Decimal number in the active language (pt-BR "3,5", en-US "3.5"): up to `digits` decimals, or exactly `digits` when `fixed`.
export const fmtDec = (n: number, digits = 1, fixed = false): string =>
  Number.isFinite(n) ? n.toLocaleString(activeLocale === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: fixed ? digits : 0, maximumFractionDigits: digits }) : '-';

export const fmtNum = (n: number): string => (Number.isFinite(n) ? n.toLocaleString(activeLocale === 'pt' ? 'pt-BR' : 'en-US') : '-');

// A unit price can be a fraction of a Gold (the wholesale merchant pays a quarter of a Gold for a common material): decimals only below 10.
export const fmtPrice = (n: number): string => (n >= 10 ? fmtNum(Math.round(n)) : fmtDec(n, 2));
