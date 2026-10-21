// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PlayersPage from '../src/pages/Players';
import { AppContext } from '../src/hooks';
import type { AdminApi } from '../src/lib/api';
import { createDemoApi } from '../src/lib/demo';

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
  test('the table keeps five summary columns: player, recent activity, progress, valid Pass, alerts', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))).toEqual(['Jogador', 'Atividade recente', 'Progresso', 'Passe válido', 'Alertas']);
    expect(table.textContent).not.toContain('Ouro (save)');
    expect(table.textContent).toMatch(/Nível \d+/);
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
});
