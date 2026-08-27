import en from './en.json';
import pt from './pt.json';

const DEFAULT_LOCALE = 'en';
const LOCALES = { en, pt } as const;
type Locale = keyof typeof LOCALES;

function resolve(): Locale {
  const saved = localStorage.getItem('locale');
  if (saved && saved in LOCALES) return saved as Locale;
  const want = navigator.language.slice(0, 2);
  return (want in LOCALES ? want : DEFAULT_LOCALE) as Locale;
}

const current = resolve();

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
  localStorage.setItem('locale', next);
  location.reload();
}

export const locales = Object.keys(LOCALES) as Locale[];
export const activeLocale = current;
