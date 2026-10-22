// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PlayersPage from '../src/pages/Players';
import { AppContext } from '../src/hooks';
import type { AdminApi } from '../src/lib/api';
import { createDemoApi } from '../src/lib/demo';
import { defaultPlayerQuery } from '../src/lib/filters';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function setup(override: Partial<AdminApi> = {}) {
  const base = createDemoApi();
  const calls: { name: string; args: unknown[] }[] = [];
  const api = new Proxy({} as AdminApi, {
    get(_t, prop: string) {
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        const fn = (override as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop] ?? (base as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
        return fn(...args);
      };
    },
  });
  render(
    <AppContext.Provider value={{ api, onDenied: vi.fn(), demo: true }}>
      <PlayersPage />
    </AppContext.Provider>,
  );
  return { calls };
}

describe('Players (A05)', () => {
  test('one line per player: name, level, gold, Pass, last seen, alerts (the owner example)', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))).toEqual(['Jogador', 'Nível', 'Ouro', 'Passe', 'Último acesso', 'Alertas']);
    expect(table.textContent).not.toContain('Ouro (save)');
    expect(table.querySelector('tbody td.num strong')?.textContent).toMatch(/^\d+/);
  });

  test('the account sheet has tabs, Resumo open first, and the actions always at the bottom', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
    fireEvent.click(within(table).getAllByRole('row')[1]);
    const dialog = await screen.findByRole('dialog');
    const tabs = await within(dialog).findAllByRole('tab');
    expect(tabs.map((x) => x.textContent)).toEqual(['Resumo', 'Herói', 'Itens', 'Progresso', 'Atividade']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    const visible = () => within(dialog).getAllByRole('tabpanel', { hidden: true }).filter((x) => !x.hidden);
    expect(visible()).toHaveLength(1);
    fireEvent.click(tabs[2]);
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    expect(visible()[0].textContent).toContain('Itens certificados');
    expect(within(dialog).getByRole('region', { name: 'Ações na conta' })).toBeTruthy();
  });

  test('e-mails stay masked in the table', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
    expect(table.textContent).toMatch(/\w{2}\*\*\*@/);
    expect(table.textContent).not.toMatch(/(?<!\*\*\*)@/); // every @ is preceded by the mask
  });

  test('the Pass filter distinguishes valid now, not valid, expired and history, and sends the chosen value', async () => {
    const { calls } = setup();
    await screen.findByRole('table', { name: 'Jogadores' });
    const select = screen.getByLabelText('Passe') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'yes', 'no', 'expired', 'history']);
    fireEvent.change(select, { target: { value: 'expired' } });
    await waitFor(() => expect(calls.filter((c) => c.name === 'players').at(-1)!.args[0]).toMatchObject({ filters: { pass: 'expired' } }));
  });

  test('a row opens the detail panel with the summary the table dropped and the Pass in two separate answers', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
    fireEvent.click(within(table).getAllByRole('row')[1]);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Resumo')).toBeTruthy());
    for (const label of ['Ouro no save', 'Vendas / compras', 'Válido nesta temporada', 'Entra no ranking', 'Histórico de Passes']) expect(dialog.textContent).toContain(label);
    // the full e-mail is only behind the button
    expect(dialog.textContent).toContain('***');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mostrar e-mail completo' }));
    expect(dialog.textContent).toMatch(/@(gmail|outlook|proton|uol)\./);
  });

  test('links from other pages open it filtered', async () => {
    window.location.hash = '#/jogadores?alertas=1&passe=expired';
    const { calls } = setup();
    await screen.findByRole('table', { name: 'Jogadores' });
    expect(calls.find((c) => c.name === 'players')!.args[0]).toMatchObject({ filters: { flagged: true, pass: 'expired' } });
  });

  test('the drawer reads the account live: every section is there and the cache message is gone', async () => {
    const { calls } = setup();
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
    fireEvent.click(within(table).getAllByRole('row')[1]);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Inventário e baú')).toBeTruthy());
    for (const title of ['Resumo', 'Herói', 'Inventário e baú', 'Materiais e poções', 'Progresso e auditoria', 'Passe de Aventureiro', 'Mercado', 'Créditos e códigos', 'Convites', 'Registro de ações']) expect(dialog.textContent).toContain(title);
    for (const label of ['Éter (cristais)', 'Equipamentos no save', 'Passe marcado no save', 'Profissões']) expect(dialog.textContent).toContain(label);
    expect(dialog.textContent).not.toContain('a rotina de cache não passou');
    expect(calls.some((c) => c.name === 'playerFull')).toBe(true);
    // the long sections are folded (native details) and open on click
    const folds = dialog.querySelectorAll('details.fold');
    expect(folds.length).toBeGreaterThanOrEqual(7);
  });

  test('when the live function is not in the database yet, the drawer says so and falls back to the cache block', async () => {
    setup({ playerFull: () => Promise.reject(new Error('function public.admin_player_full does not exist')) });
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
    fireEvent.click(within(table).getAllByRole('row')[1]);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('0034_admin_player_full'));
    expect(dialog.textContent).toContain('Progresso');
    expect(dialog.textContent).toContain('Passe de Aventureiro');
  });

  test('in the list, a missing cache value is a dash with the tooltip "atualiza pela rotina", never a zero', async () => {
    const base = createDemoApi();
    const page = await base.players(defaultPlayerQuery());
    const rows = page.rows.map((r, i) => (i === 0 ? { ...r, hero_level: null, highest_floor: null, gold: null, username: 'SemCache' } : r));
    setup({ players: () => Promise.resolve({ ...page, rows }) });
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    const row = (await within(table).findByText('SemCache')).closest('tr')!;
    expect(row.querySelectorAll('[title="atualiza pela rotina"]').length).toBe(2);
    expect(row.textContent).not.toMatch(/Nível 0|andar 0/);
  });
});
