// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App, { NAV, ROUTES, routeFromHash } from '../src/App';
import { AppContext } from '../src/hooks';
import type { AdminApi } from '../src/lib/api';
import { createDemoApi, createDemoBackend } from '../src/lib/demo';
import EconomyPage from '../src/pages/Economy';
import LeaguePage from '../src/pages/League';
import LegendariesPage from '../src/pages/Legendaries';
import PlayersPage from '../src/pages/Players';
import ToolsPage from '../src/pages/Tools';
import WaitlistPage from '../src/pages/WaitlistPage';

// The panel reorganized into three screens (owner's request, 22/10/2026): "Hoje", "Jogadores", "Ferramentas".

afterEach(() => {
  cleanup();
  window.location.hash = '';
  vi.unstubAllGlobals();
});

function withApi(node: React.ReactNode, override: Partial<AdminApi> = {}) {
  const base = createDemoApi();
  const api = new Proxy({} as AdminApi, {
    get(_t, prop: string) {
      return (...args: unknown[]) => {
        const fn = (override as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop] ?? (base as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
        return fn(...args);
      };
    },
  });
  return render(<AppContext.Provider value={{ api, onDenied: vi.fn(), demo: true }}>{node}</AppContext.Provider>);
}

describe('the menu', () => {
  test('three screens; every other page hangs under one of them and keeps its old address', () => {
    expect(NAV.map((n) => n.label)).toEqual(['Hoje', 'Jogadores', 'Ferramentas']);
    for (const r of ROUTES) expect(NAV.map((n) => n.id)).toContain(r.section);
    expect(ROUTES.filter((r) => r.section === 'ferramentas').map((r) => r.id)).toEqual(['ferramentas', 'pagamentos', 'codigos', 'ia-operacao']);
    expect(ROUTES.filter((r) => r.section === 'visao-geral').map((r) => r.id)).toEqual(['visao-geral', 'lendarios', 'mercado', 'economia', 'liga', 'espera']);
    expect(routeFromHash('#/mercado?q=sale-1')).toBe('mercado');
    expect(routeFromHash('#/qualquer-coisa')).toBe('visao-geral');
  });

  test('a detail page shows the way back to its screen, and the menu marks that screen', async () => {
    window.location.hash = '#/codigos';
    render(<App backend={createDemoBackend()} />);
    const crumb = await screen.findByRole('navigation', { name: 'Caminho' });
    expect(within(crumb).getByRole('link', { name: /Ferramentas/ }).getAttribute('href')).toBe('#/ferramentas');
    expect(crumb.textContent).toContain('Códigos');
    const nav = screen.getByRole('navigation', { name: 'Seções' });
    expect(within(nav).getByRole('link', { name: /Ferramentas/ }).getAttribute('aria-current')).toBe('location');
  });

  test('"Ferramentas" carries the count of open payments plus unread AI reports', async () => {
    render(<App backend={createDemoBackend()} />);
    const nav = await screen.findByRole('navigation', { name: 'Seções' });
    const api = createDemoApi();
    const expected = (await api.paymentExceptions({ status: 'open', page: 0, pageSize: 1 })).open + (await api.opsOverview()).open_reports;
    await waitFor(() => expect(within(nav).getByRole('link', { name: /Ferramentas/ }).textContent).toContain(String(expected)));
  });
});

describe('Ferramentas', () => {
  test('four cards, each with its state in words and a link to the page that existed', async () => {
    withApi(<ToolsPage />);
    await waitFor(() => expect(document.body.textContent).toContain('em aberto'));
    const links = Array.from(document.querySelectorAll('a.tool-card'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/pagamentos', '#/codigos', '#/ia-operacao', '#/ia-operacao']);
    expect(document.body.textContent).toContain('pausa ligada');
    expect(document.body.textContent).toMatch(/\d+ ativos?/);
  });

  test('a query that fails says so on its card; it never reads as "nothing to do"', async () => {
    withApi(<ToolsPage />, { paymentExceptions: async () => Promise.reject(new Error('rede caiu')), opsOverview: async () => Promise.reject(new Error('sem acesso')) });
    await waitFor(() => expect(screen.getAllByText('não foi possível consultar')).toHaveLength(3));
    expect(document.body.textContent).not.toContain('nada em aberto');
    expect(document.body.textContent).not.toContain('nenhuma pausa');
  });
});

describe('no chart left on the detail pages either (only data)', () => {
  test.each([
    ['Lendários', () => <LegendariesPage />, 'Lendários por origem'],
    ['Economia', () => <EconomyPage />, 'Ouro total declarado pelos saves por dia'],
    ['Liga', () => <LeaguePage />, 'Motivos mais comuns'],
    ['Lista de espera', () => <WaitlistPage />, 'Cadastros na lista de espera por dia'],
  ])('%s', async (_name, page, caption) => {
    withApi(page());
    expect(await screen.findByRole('table', { name: caption })).toBeTruthy();
    expect(document.querySelector('svg.chart, .bars, .track, [role="progressbar"], [role="img"], canvas')).toBeNull();
  });
});

describe('Jogadores: list and account side by side on a wide screen', () => {
  function stubWidth(wide: boolean) {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: wide && q.includes('min-width'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
  }

  test('wide: the account opens beside the list, not as a modal, and the row stays marked', async () => {
    stubWidth(true);
    withApi(<PlayersPage />);
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(3));
    const row = within(table).getAllByRole('row')[1];
    fireEvent.click(row);
    const pane = await screen.findByRole('complementary');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.players-split')).not.toBeNull();
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(await within(pane).findByText('Ações na conta')).toBeTruthy();
    fireEvent.click(within(pane).getByRole('button', { name: 'Fechar ficha' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
  });

  test('narrow (phone): the account opens as the modal panel, as before', async () => {
    stubWidth(false);
    withApi(<PlayersPage />);
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(3));
    fireEvent.click(within(table).getAllByRole('row')[1]);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
