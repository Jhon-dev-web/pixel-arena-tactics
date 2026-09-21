import en from './en.json';
import pt from './pt.json';

const DEFAULT_LOCALE = 'pt';
const LOCALES = { en, pt } as const;
export type Locale = keyof typeof LOCALES;

function resolve(): Locale {
  const saved = localStorage.getItem('locale');
  if (saved && saved in LOCALES) return saved as Locale;
  const want = navigator.language.slice(0, 2);
  return (want in LOCALES ? want : DEFAULT_LOCALE) as Locale;
}

let current = resolve();
export let activeLocale: Locale = current;
let localeListener: (() => void) | null = null;

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

export function setLocale(next: Locale): void {
  if (next === current) return;
  localStorage.setItem('locale', next);
  current = next;
  activeLocale = next;
  localeListener?.();
}

// The game has one React root. Keeping a tiny listener here lets the established locale module
// update that root immediately while preserving the same localStorage preference mechanism.
export function setLocaleListener(listener: (() => void) | null): void {
  localeListener = listener;
}

export const locales = Object.keys(LOCALES) as Locale[];
