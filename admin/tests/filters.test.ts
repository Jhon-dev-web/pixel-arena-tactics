import { describe, expect, test } from 'vitest';
import {
  activeFilterCount,
  clampPage,
  compact,
  dayEndIso,
  dayStartIso,
  defaultMarketQuery,
  defaultPlayerQuery,
  fetchAllRows,
  flagsArgs,
  legendaryArgs,
  marketArgs,
  pageCount,
  playerArgs,
  searchArg,
  toggleSort,
} from '../src/lib/filters';

describe('arguments of the database functions', () => {
  test('compact drops everything that is off', () => {
    expect(compact({ a: true, b: false, c: '', d: undefined, e: null, f: 0, g: 'x' })).toEqual({ a: true, f: 0, g: 'x' });
  });

  test('searchArg trims, caps and turns empty into null', () => {
    expect(searchArg('  ana ')).toBe('ana');
    expect(searchArg('   ')).toBeNull();
    expect(searchArg('x'.repeat(500))).toHaveLength(120);
  });

  test('player arguments carry only the filters that are on', () => {
    const q = { ...defaultPlayerQuery(), search: ' ana ', sort: 'level' as const, dir: 'asc' as const, page: 2, filters: { online: true, pass: 'yes' as const, flagged: false } };
    expect(playerArgs(q)).toEqual({ p_search: 'ana', p_sort: 'level', p_dir: 'asc', p_page: 2, p_page_size: 50, p_filters: { online: true, pass: 'yes' } });
  });

  test('legendary arguments', () => {
    expect(legendaryArgs({ search: '', page: 0, pageSize: 50, filters: { source: 'pity', tier: 4, from: undefined } })).toEqual({ p_search: null, p_page: 0, p_page_size: 50, p_filters: { source: 'pity', tier: 4 } });
  });

  test('market arguments keep the mode for sales and the status for listings only', () => {
    const sales = { ...defaultMarketQuery(), filters: { mode: 'live' as const, status: 'open', kind: 'material' as const } };
    expect(marketArgs(sales)).toEqual({ p_view: 'sales', p_search: null, p_page: 0, p_page_size: 50, p_filters: { mode: 'live', kind: 'material' } });
    const listings = { ...defaultMarketQuery(), view: 'listings' as const, filters: { mode: 'live' as const, status: 'open' } };
    expect(marketArgs(listings)).toEqual({ p_view: 'listings', p_search: null, p_page: 0, p_page_size: 50, p_filters: { status: 'open' } });
    expect(marketArgs(defaultMarketQuery()).p_filters).toEqual({});
  });

  test('flags arguments', () => {
    expect(flagsArgs({ page: 1, pageSize: 50, kind: 'items', search: ' bruno ' })).toEqual({ p_page: 1, p_page_size: 50, p_filters: { kind: 'items', search: 'bruno' } });
    expect(flagsArgs({ page: 0, pageSize: 50 })).toEqual({ p_page: 0, p_page_size: 50, p_filters: {} });
  });
});

describe('sorting and paging', () => {
  test('clicking the same column flips the direction and goes back to page 0', () => {
    const q = { ...defaultPlayerQuery(), sort: 'gold' as const, dir: 'desc' as const, page: 3 };
    expect(toggleSort(q, 'gold')).toMatchObject({ sort: 'gold', dir: 'asc', page: 0 });
    expect(toggleSort(toggleSort(q, 'gold'), 'gold')).toMatchObject({ dir: 'desc' });
  });

  test('a new column starts descending, except the name', () => {
    const q = defaultPlayerQuery();
    expect(toggleSort(q, 'level')).toMatchObject({ sort: 'level', dir: 'desc' });
    expect(toggleSort(q, 'username')).toMatchObject({ sort: 'username', dir: 'asc' });
  });

  test('pageCount and clampPage', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(clampPage(9, 120, 50)).toBe(2);
    expect(clampPage(-4, 120, 50)).toBe(0);
  });

  test('activeFilterCount ignores empty values and chosen keys', () => {
    expect(activeFilterCount({ online: true, pass: undefined, flagged: false, wallet: true })).toBe(2);
    expect(activeFilterCount({ mode: 'all', status: 'open' }, ['mode'])).toBe(1);
  });
});

describe('dates', () => {
  test('a day input becomes a UTC range', () => {
    expect(dayStartIso('2026-10-17')).toBe('2026-10-17T00:00:00.000Z');
    expect(dayEndIso('2026-10-17')).toBe('2026-10-18T00:00:00.000Z');
    expect(dayEndIso('2026-12-31')).toBe('2027-01-01T00:00:00.000Z');
    expect(dayStartIso('')).toBeUndefined();
    expect(dayEndIso('17/10/2026')).toBeUndefined();
  });
});

describe('fetchAllRows (the CSV export)', () => {
  const make = (n: number) => async (page: number) => {
    const all = Array.from({ length: n }, (_, i) => i);
    return { total: n, rows: all.slice(page * 3, page * 3 + 3) };
  };

  test('reads every page', async () => {
    const r = await fetchAllRows(make(8), 3, 100);
    expect(r.rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.truncated).toBe(false);
    expect(r.total).toBe(8);
  });

  test('stops at the cap and says so', async () => {
    const r = await fetchAllRows(make(30), 3, 7);
    expect(r.rows).toHaveLength(7);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(30);
  });

  test('an empty result is one request', async () => {
    let calls = 0;
    const r = await fetchAllRows(async () => {
      calls++;
      return { total: 0, rows: [] };
    }, 3, 100);
    expect(r.rows).toEqual([]);
    expect(calls).toBe(1);
  });

  test('an exact multiple of the page size does not loop forever', async () => {
    const r = await fetchAllRows(make(6), 3, 100);
    expect(r.rows).toHaveLength(6);
  });
});
