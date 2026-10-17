// Query state of each table -> the arguments of the database function, plus the small helpers the tables share.
import type { FlagsQuery, LegendaryFilters, LegendaryQuery, MarketFilters, MarketQuery, PlayerFilters, PlayerQuery, PlayerSort } from './types';

export const PAGE_SIZE = 50;
/** The most rows a CSV export reads (50 pages of 200). The export asks the database page by page. */
export const EXPORT_MAX_ROWS = 10_000;
export const EXPORT_PAGE_SIZE = 200;

export const defaultPlayerQuery = (): PlayerQuery => ({ search: '', sort: 'last_seen', dir: 'desc', page: 0, pageSize: PAGE_SIZE, filters: {} });
export const defaultLegendaryQuery = (): LegendaryQuery => ({ search: '', page: 0, pageSize: PAGE_SIZE, filters: {} });
export const defaultMarketQuery = (): MarketQuery => ({ view: 'sales', search: '', page: 0, pageSize: PAGE_SIZE, filters: { mode: 'all' } });
export const defaultFlagsQuery = (): FlagsQuery => ({ page: 0, pageSize: PAGE_SIZE });

/** Drops empty values so the JSON sent to the database only carries filters that are on. */
export function compact<T extends object>(filters: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** The trimmed search text, or null when empty (the database treats null as "no search"). */
export const searchArg = (s: string): string | null => {
  const t = s.trim();
  return t.length === 0 ? null : t.slice(0, 120);
};

export function playerArgs(q: PlayerQuery): Record<string, unknown> {
  return { p_search: searchArg(q.search), p_sort: q.sort, p_dir: q.dir, p_page: q.page, p_page_size: q.pageSize, p_filters: compact<PlayerFilters>(q.filters) };
}

export function legendaryArgs(q: LegendaryQuery): Record<string, unknown> {
  return { p_search: searchArg(q.search), p_page: q.page, p_page_size: q.pageSize, p_filters: compact<LegendaryFilters>(q.filters) };
}

export function marketArgs(q: MarketQuery): Record<string, unknown> {
  const f: MarketFilters = { ...q.filters };
  if (q.view === 'listings') delete f.mode; // the mode (live/test) belongs to sales
  if (q.view === 'sales') delete f.status; // the status belongs to listings
  if (f.mode === 'all') delete f.mode;
  return { p_view: q.view, p_search: searchArg(q.search), p_page: q.page, p_page_size: q.pageSize, p_filters: compact<MarketFilters>(f) };
}

export function flagsArgs(q: FlagsQuery): Record<string, unknown> {
  return { p_page: q.page, p_page_size: q.pageSize, p_filters: compact({ kind: q.kind, search: q.search ? q.search.trim() : undefined }) };
}

/** Clicking a column header: the same column flips the direction, a new one starts descending (numbers) or ascending (text). */
export function toggleSort(q: PlayerQuery, key: PlayerSort): PlayerQuery {
  if (q.sort === key) return { ...q, dir: q.dir === 'desc' ? 'asc' : 'desc', page: 0 };
  return { ...q, sort: key, dir: key === 'username' ? 'asc' : 'desc', page: 0 };
}

export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, size)));
export const clampPage = (page: number, total: number, size: number): number => Math.min(Math.max(0, page), pageCount(total, size) - 1);

/** How many filters are switched on (for the "Limpar filtros" button). */
export const activeFilterCount = (filters: object, ignore: readonly string[] = []): number => Object.entries(compact(filters)).filter(([k]) => !ignore.includes(k)).length;

/** Reads every page a table can show, up to `maxRows`, for a CSV export. `fetchPage(page)` returns one page. */
export async function fetchAllRows<T>(fetchPage: (page: number) => Promise<{ total: number; rows: T[] }>, pageSize = EXPORT_PAGE_SIZE, maxRows = EXPORT_MAX_ROWS): Promise<{ rows: T[]; truncated: boolean; total: number }> {
  const rows: T[] = [];
  let total = 0;
  for (let page = 0; rows.length < maxRows; page++) {
    const r = await fetchPage(page);
    total = r.total;
    rows.push(...r.rows);
    if (r.rows.length < pageSize || rows.length >= r.total) break;
  }
  return { rows: rows.slice(0, maxRows), truncated: total > maxRows, total };
}

/** The local-datetime value of an <input type="date"> ("2026-10-17") as the start of that UTC day for the database. */
export const dayStartIso = (day: string): string | undefined => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00.000Z` : undefined);
/** The end of a day (exclusive): the next midnight. */
export function dayEndIso(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
