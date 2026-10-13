// A tiny local error recorder for the web build: no third-party service, no network. The last few uncaught errors, unhandled promise rejections and
// React render crashes are kept in a ring buffer in localStorage; Settings lets the player copy them as a plain-text report to paste to support.
// Nothing here ever reads the save, the account or any token, and every storage access is guarded (private windows / blocked storage must not
// turn the error recorder into the next error).

import { APP_VERSION } from './appVersion';

export { APP_VERSION };
export const ERROR_LOG_KEY = 'arena-error-log-v1';
export const ERROR_LOG_MAX = 5;
const MESSAGE_MAX = 300;
const STACK_MAX = 1500;

export type ErrorKind = 'error' | 'unhandledrejection' | 'boundary';

export interface ErrorEntry {
  at: string; // ISO time
  kind: ErrorKind;
  message: string;
  stack: string;
  version: string;
  screen: string; // viewport size and the game screen that was open
  count: number; // identical consecutive errors are folded into one entry
}


let currentView = '';
/** App tells the recorder which game screen is open (a plain label, no player data). */
export function setErrorContext(view: string): void {
  currentView = view;
}

function screenLabel(): string {
  try {
    const dpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;
    return `${window.innerWidth}x${window.innerHeight}@${dpr}${currentView ? ` view=${currentView}` : ''}`;
  } catch {
    return currentView ? `view=${currentView}` : 'unknown';
  }
}

export function readErrorLog(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is ErrorEntry => !!e && typeof e === 'object' && typeof (e as ErrorEntry).message === 'string')
      .slice(-ERROR_LOG_MAX);
  } catch {
    return [];
  }
}

function writeErrorLog(entries: ErrorEntry[]): void {
  try {
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries.slice(-ERROR_LOG_MAX)));
  } catch {
    /* storage unavailable or full: the report is best effort */
  }
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    /* ignore */
  }
}

function describe(reason: unknown): { message: string; stack: string } {
  if (reason instanceof Error) return { message: `${reason.name}: ${reason.message}`, stack: reason.stack ?? '' };
  if (typeof reason === 'string') return { message: reason, stack: '' };
  try {
    return { message: JSON.stringify(reason) ?? String(reason), stack: '' };
  } catch {
    return { message: String(reason), stack: '' };
  }
}

export function recordError(kind: ErrorKind, reason: unknown, extraStack = ''): void {
  try {
    const { message, stack } = describe(reason);
    const entry: ErrorEntry = {
      at: new Date().toISOString(),
      kind,
      message: message.slice(0, MESSAGE_MAX),
      stack: (stack || extraStack).slice(0, STACK_MAX),
      version: APP_VERSION,
      screen: screenLabel(),
      count: 1,
    };
    const log = readErrorLog();
    const last = log[log.length - 1];
    if (last && last.kind === entry.kind && last.message === entry.message) {
      log[log.length - 1] = { ...last, at: entry.at, count: last.count + 1 };
    } else {
      log.push(entry);
    }
    writeErrorLog(log);
  } catch {
    /* never throw from the recorder */
  }
}

/** Plain-text report for support. Contains the app version, browser and the recorded errors; nothing from the save or the account. */
export function buildErrorReport(entries: ErrorEntry[] = readErrorLog()): string {
  let ua = 'unknown';
  let locale = '';
  try {
    ua = navigator.userAgent;
    locale = localStorage.getItem('locale') ?? navigator.language;
  } catch {
    /* ignore */
  }
  const lines = [`Arena Duel ${APP_VERSION}`, `Browser: ${ua}`, `Language: ${locale}`, `Errors recorded: ${entries.length}`];
  entries.forEach((e, i) => {
    lines.push('', `#${i + 1} [${e.kind}] ${e.at} x${e.count}`, `version ${e.version} | ${e.screen}`, e.message);
    if (e.stack) lines.push(e.stack);
  });
  return lines.join('\n');
}

let installed = false;
/** Registers the global handlers once (main.tsx). The browser still logs the error to the console as usual. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    // Resource load failures (an img or audio 404) also fire 'error' but are not ErrorEvents: not an app crash.
    if (!(e instanceof ErrorEvent)) return;
    recordError('error', e.error ?? e.message, e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : '');
  });
  window.addEventListener('unhandledrejection', (e) => recordError('unhandledrejection', e.reason));
}

/** Copies text to the clipboard; falls back to a hidden textarea where the async API is blocked. Resolves false if both fail. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
