// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import OverviewPage from '../src/pages/Overview';
import { AppContext } from '../src/hooks';
import type { AdminApi } from '../src/lib/api';
import { buildAttention } from '../src/lib/attention';
import { createDemoApi } from '../src/lib/demo';
import { aggregateStatus } from '../src/lib/freshness';
import type { Overview } from '../src/lib/types';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function setup(override: Partial<AdminApi> = {}) {
  const base = createDemoApi();
  const calls: string[] = [];
  const api = new Proxy({} as AdminApi, {
    get(_t, prop: string) {
      return (...args: unknown[]) => {
        calls.push(prop);
        const fn = (override as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop] ?? (base as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
        return fn(...args);
      };
    },
  });
  render(
    <AppContext.Provider value={{ api, onDenied: vi.fn(), demo: true }}>
      <OverviewPage />
    </AppContext.Provider>,
  );
  return { calls, base };
}

const heading = (name: string) => screen.findByRole('heading', { name });

describe('Overview opens with what needs attention', () => {
  test('the first block lists pending payments, a paused switch and the unread AI reports, each with a link to its page', async () => {
    setup();
    const block = (await heading('Precisa de atenção')).closest('section') as HTMLElement;
    await waitFor(() => expect(within(block).getAllByRole('link').length).toBeGreaterThanOrEqual(3));
    expect(block.textContent).toContain('não casaram com nenhuma compra');
    expect(block.textContent).toContain('pausa de segurança');
    const hrefs = within(block).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#/pagamentos');
    expect(hrefs).toContain('#/ia-operacao');
    expect(hrefs).toContain('#/jogadores?alertas=1');
    // the "refund due" count comes from another table and says so
    expect(block.textContent).toContain('diferente da fila «Pagamentos a resolver»');
    // the four indicators come first, then the pending list, then the data blocks and the history
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s.indexOf('Precisa de atenção')).toBeLessThan(h2s.indexOf('Passe de Aventureiro'));
    expect(h2s.indexOf('Passe de Aventureiro')).toBeLessThan(h2s.indexOf('Histórico diário'));
  });

  test('four indicators on top, with “online estimado” explained next to them', async () => {
    setup();
    await screen.findByText('Online estimado');
    const facts = document.querySelector('.ov-facts') as HTMLElement;
    expect(facts.querySelectorAll('.ov-fact')).toHaveLength(4);
    for (const label of ['Online estimado', 'Jogando hoje', 'Contas criadas', 'Passe válido na temporada']) expect(facts.textContent).toContain(label);
    expect(document.body.textContent).toContain('Online estimado” = personagens salvos nos últimos 5 min');
    expect(screen.getAllByText(/Consulta atualizada às/).length).toBeGreaterThanOrEqual(2);
  });

  test('Passe and Mercado are two aligned data blocks (labels and values, SOL and USDC never summed)', async () => {
    setup();
    const pass = (await heading('Passe de Aventureiro')).closest('section') as HTMLElement;
    const market = screen.getByRole('heading', { name: 'Mercado' }).closest('section') as HTMLElement;
    expect(pass.textContent).toContain('USDC recebido');
    expect(pass.textContent).toContain('Meta do Passe');
    expect(market.textContent).toContain('Taxas recebidas');
    expect(market.textContent).toMatch(/SOL/);
    expect(market.textContent).not.toMatch(/USDC/);
    expect(pass.parentElement).toBe(market.parentElement);
  });

  test('NO chart anywhere on the page: no svg, no image role, no progress bar, even with every fold open', async () => {
    setup();
    await screen.findByText('Online estimado');
    await screen.findByText('Tabela por dia');
    document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    expect(document.querySelector('svg.chart')).toBeNull();
    expect(document.querySelector('.bars, .track, [role="progressbar"], [role="img"], canvas')).toBeNull();
    // the only svg left is the refresh icon of the button
    expect(document.querySelectorAll('svg').length).toBeLessThanOrEqual(1);
  });

  test('a source that fails is listed as NOT checked, and the page never says everything is fine', async () => {
    setup({ paymentExceptions: async () => Promise.reject(new Error('rede caiu')), opsOverview: async () => Promise.reject(new Error('sem acesso')) });
    const block = (await heading('Precisa de atenção')).closest('section') as HTMLElement;
    await waitFor(() => expect(block.textContent).toContain('Não foi possível verificar pagamentos a resolver'));
    expect(block.textContent).toContain('Não foi possível verificar interruptores e incidentes');
    expect(block.textContent).toContain('não quer dizer que está tudo certo');
    expect(block.textContent).not.toMatch(/Nenhuma pendência encontrada/);
    expect(within(block).getAllByRole('button', { name: 'Tentar de novo' })).toHaveLength(2);
  });

  test('with every source answering and nothing pending it says what was checked, not "tudo normal"', async () => {
    const base = createDemoApi();
    const clean: Overview = { ...(await base.overview()) };
    clean.league = { ...clean.league, players_with_open_flags: 0, players_with_item_flags: 0 };
    clean.market = { ...clean.market, refund_due_count: 0, refund_due_lamports: 0 };
    clean.pass = { ...clean.pass, usdc_to_refund: 0 };
    clean.freshness = { ...clean.freshness, player_cache_refreshed_at: new Date().toISOString(), gold_captured_at: new Date().toISOString(), daily_captured_at: new Date().toISOString() };
    const ops = await base.opsOverview();
    setup({
      overview: async () => clean,
      paymentExceptions: async () => ({ total: 0, page: 0, page_size: 1, rows: [], open: 0 }),
      opsOverview: async () => ({ ...ops, flags: ops.flags.map((f) => ({ ...f, value: false })), incidents: [], open_reports: 0 }),
    });
    const block = (await heading('Precisa de atenção')).closest('section') as HTMLElement;
    await waitFor(() => expect(block.textContent).toContain('Nenhuma pendência encontrada nas verificações'));
    expect(block.textContent).not.toMatch(/tudo (normal|certo|bem)/i);
    expect(block.textContent).toContain('Vale só para o que o painel consegue ver');
  });

  test('an empty database is not "all normal" either', async () => {
    const base = createDemoApi();
    const real = await base.overview();
    const empty: Overview = { ...real, players: { ...real.players, registered: 0, characters: 0, online_now: 0 }, league: { ...real.league, players_with_open_flags: 0, players_with_item_flags: 0 }, market: { ...real.market, refund_due_count: 0 }, pass: { ...real.pass, usdc_to_refund: 0 }, freshness: { ...real.freshness, player_cache_refreshed_at: new Date().toISOString(), daily_captured_at: new Date().toISOString() } };
    const ops = await base.opsOverview();
    setup({ overview: async () => empty, paymentExceptions: async () => ({ total: 0, page: 0, page_size: 1, rows: [], open: 0 }), opsOverview: async () => ({ ...ops, flags: ops.flags.map((f) => ({ ...f, value: false })), incidents: [], open_reports: 0 }) });
    expect(await screen.findByText(/ainda não tem nenhum jogador cadastrado/)).toBeTruthy();
    expect(screen.getByText(/sem dados, isso não diz nada sobre a saúde do jogo/)).toBeTruthy();
    expect(screen.queryByText('Online estimado')).toBeNull();
  });
});

describe('each block fails and recovers on its own', () => {
  test('only series() failing: a clear error with its own retry, the numbers stay, and it is never a skeleton or a table of zeros', async () => {
    let fail = true;
    const seed = createDemoApi();
    const { calls } = setup({ series: async (d) => (fail ? Promise.reject(new Error('timeout na série')) : seed.series(d)) });
    await screen.findByText('Online estimado');
    const failed = await screen.findByText(/Não foi possível carregar o histórico diário: timeout na série/);
    const box = failed.closest('.notice') as HTMLElement;
    expect(box.getAttribute('role')).toBe('alert');
    expect(document.querySelector('table.ov-table')).toBeNull();
    expect(document.body.textContent).not.toContain('US$ 0,00');
    expect(screen.getByRole('heading', { name: 'Histórico diário' }).nextElementSibling?.getAttribute('aria-busy')).toBeNull();
    const seriesCalls = () => calls.filter((c) => c === 'series').length;
    const ovCalls = calls.filter((c) => c === 'overview').length;
    fail = false;
    fireEvent.click(within(box).getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(document.querySelector('table.ov-table')).not.toBeNull());
    expect(seriesCalls()).toBe(2);
    expect(calls.filter((c) => c === 'overview').length).toBe(ovCalls); // the retry touched only the history
    expect(screen.queryByText(/Não foi possível carregar o histórico diário/)).toBeNull();
  });

  test('only overview() failing: the history still shows, and the numbers say they failed (no invented zeros)', async () => {
    setup({ overview: async () => Promise.reject(new Error('banco indisponível')) });
    expect(await screen.findByText(/Não foi possível carregar os números do jogo: banco indisponível/)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('table.ov-table')).not.toBeNull());
    expect(screen.queryByText('Online estimado')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Passe de Aventureiro' })).toBeNull();
  });

  test('only opsOverview() failing: the routines list says it could not check, not that all is in order', async () => {
    setup({ opsOverview: async () => Promise.reject(new Error('sem acesso')) });
    await screen.findByText('Online estimado');
    const title = await screen.findByText('Estado das rotinas');
    const fold = title.closest('details') as HTMLElement;
    await waitFor(() => expect(fold.textContent).toContain('Não foi possível consultar o vigia'));
    expect(fold.textContent).toContain('não quer dizer que estão em dia');
    expect(screen.getByText('não foi possível consultar')).toBeTruthy();
  });

  test('a later refresh that fails keeps the previous data and marks it as stale', async () => {
    let n = 0;
    const seed = createDemoApi();
    setup({ series: async (d) => (++n === 1 ? seed.series(d) : Promise.reject(new Error('caiu na atualização'))) });
    await waitFor(() => expect(document.querySelector('table.ov-table')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Atualizar tudo/ }));
    const warn = await screen.findByText(/Não foi possível atualizar o histórico diário/);
    expect(warn.closest('.notice')?.className).toContain('warn');
    expect(warn.textContent).toContain('da consulta das');
    expect(document.querySelector('table.ov-table')).not.toBeNull(); // still there
  });

  test('a series that legitimately has no days is "empty", not an error and not a table of zeros', async () => {
    setup({ series: async () => [] });
    expect(await screen.findByText(/não devolveu nenhum dia/)).toBeTruthy();
    expect(document.querySelector('table.ov-table')).toBeNull();
    expect(screen.queryByText(/Não foi possível carregar o histórico diário/)).toBeNull();
  });
});

describe('the daily history is a table', () => {
  test('7 rows (newest first) by default, all 30 days after expanding, and back', async () => {
    setup();
    await screen.findByText('Tabela por dia');
    const rows = () => document.querySelectorAll('table.ov-table tbody tr').length;
    expect(rows()).toBe(7);
    const all = screen.getByRole('button', { name: 'Mostrar todos os 30 dias' });
    expect(all.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(all);
    expect(rows()).toBe(30);
    fireEvent.click(screen.getByRole('button', { name: /Mostrar só os últimos 7 dias/ }));
    expect(rows()).toBe(7);
    expect(document.querySelectorAll('table.ov-table thead th[scope="col"]').length).toBeGreaterThanOrEqual(10);
  });
});

describe('the age of the information', () => {
  test('late aggregates are called late, with their date, near the block they affect', async () => {
    const base = createDemoApi();
    const real = await base.overview();
    const old = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
    setup({ overview: async () => ({ ...real, freshness: { ...real.freshness, player_cache_refreshed_at: old, gold_captured_at: old, daily_captured_at: old } }) });
    await screen.findByText('Online estimado');
    const att = (await heading('Precisa de atenção')).closest('section') as HTMLElement;
    await waitFor(() => expect(att.textContent).toContain('Os dados agregados estão atrasados'));
    expect(att.textContent).toContain('A rotina diária está atrasada');
    expect(document.body.textContent).toContain('dados agregados até');
    expect(document.body.textContent).toContain('(atrasado)');
  });
});

describe('pure helpers', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const f = (cache: string | null, daily: string | null) => ({ player_cache_rows: 1, player_cache_refreshed_at: cache, gold_total: 0, gold_day: null, gold_captured_at: cache, daily_captured_at: daily });

  test('aggregateStatus: never / late / fresh', () => {
    expect(aggregateStatus(f(null, null), now)).toEqual({ cache: { state: 'never', at: null }, daily: { state: 'never', at: null } });
    expect(aggregateStatus(f('2026-10-21T08:00:00Z', '2026-10-21T11:30:00Z'), now)).toMatchObject({ cache: { state: 'fresh' }, daily: { state: 'fresh' } });
    expect(aggregateStatus(f('2026-10-20T08:00:00Z', '2026-10-21T10:00:00Z'), now)).toMatchObject({ cache: { state: 'late' }, daily: { state: 'late' } });
  });

  test('buildAttention: a source without data is "unchecked", and loading differs from failed', () => {
    const a = buildAttention({ overview: { data: null, error: null }, payments: { data: null, error: 'x' }, ops: { data: null, error: null } }, now);
    expect(a.items).toEqual([]);
    expect(a.unchecked.map((u) => [u.id, u.reason])).toEqual([['overview', 'loading'], ['payments', 'failed'], ['ops', 'loading']]);
    expect(a.checked).toEqual([]);
  });
});
