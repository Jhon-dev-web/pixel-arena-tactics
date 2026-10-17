// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import AiOpsPage, { EvidenceChip } from '../src/pages/AiOps';
import { AppContext } from '../src/hooks';
import { AccessDeniedError, ApiError, type AdminApi } from '../src/lib/api';
import { createDemoApi } from '../src/lib/demo';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

/** The demo API with every call recorded. `override` replaces single methods. */
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
  const onDenied = vi.fn();
  render(
    <AppContext.Provider value={{ api, onDenied, demo: true }}>
      <AiOpsPage />
    </AppContext.Provider>,
  );
  return { calls, onDenied };
}

const flagRow = (label: string) => screen.getByText(label, { selector: 'strong' }).closest('li') as HTMLElement;

describe('IA e operação: the flags', () => {
  test('shows the four switches with what each one does, who changed it and why, and warns that one is on', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'IA e operação' })).toBeTruthy();
    for (const label of ['Modo manutenção', 'Mercado pausado', 'Pontuação da Liga pausada', 'Vendas do Passe pausadas']) expect(await screen.findByText(label, { selector: 'strong' })).toBeTruthy();
    const market = flagRow('Mercado pausado');
    expect(within(market).getByText('Ligada')).toBeTruthy();
    expect(market.textContent).toContain('Vigia automático');
    expect(market.textContent).toContain('funções do mercado falhando repetidamente');
    expect(within(flagRow('Modo manutenção')).getByText('Desligada')).toBeTruthy();
    expect(screen.getByText(/1 interruptor está ligado/)).toBeTruthy();
    expect(screen.getByText(/O vigia nunca desliga sozinho/)).toBeTruthy();
  });

  test('turning a switch ON asks for confirmation and a note; nothing is called until both are given', async () => {
    const { calls } = setup();
    await screen.findByText('Modo manutenção', { selector: 'strong' });
    const row = flagRow('Modo manutenção');
    fireEvent.click(within(row).getByRole('button', { name: 'Ligar Modo manutenção' }));
    const form = await screen.findByRole('form', { name: /Confirmar: ligar Modo manutenção/ });
    expect(form.textContent).toContain('Todos os jogadores sentem isso');
    const confirm = within(form).getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motivo/), { target: { value: '  ' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motivo/), { target: { value: 'deploy do banco às 18h' } });
    expect(confirm.disabled).toBe(false);
    expect(calls.find((c) => c.name === 'setOpsFlag')).toBeUndefined();
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.find((c) => c.name === 'setOpsFlag')).toBeTruthy());
    expect(calls.find((c) => c.name === 'setOpsFlag')!.args).toEqual(['maintenance_mode', true, 'deploy do banco às 18h']);
    expect(await screen.findByText('Modo manutenção: ligada.')).toBeTruthy();
    await waitFor(() => expect(within(flagRow('Modo manutenção')).getByText('Ligada')).toBeTruthy());
    expect(flagRow('Modo manutenção').textContent).toContain('Administrador');
    expect(screen.queryByRole('form')).toBeNull();
  });

  test('turning a switch OFF (the only way it ever goes off) also needs a note, and says the watchdog will turn it back on if the problem persists', async () => {
    const { calls } = setup();
    await screen.findByText('Mercado pausado', { selector: 'strong' });
    fireEvent.click(within(flagRow('Mercado pausado')).getByRole('button', { name: 'Desligar Mercado pausado' }));
    const form = await screen.findByRole('form', { name: /desligar Mercado pausado/ });
    expect(form.textContent).toContain('o vigia liga de novo');
    fireEvent.change(within(form).getByLabelText(/Motivo/), { target: { value: 'nó da Solana voltou' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'setOpsFlag')).toBe(true));
    expect(calls.find((c) => c.name === 'setOpsFlag')!.args).toEqual(['market_paused', false, 'nó da Solana voltou']);
    await waitFor(() => expect(within(flagRow('Mercado pausado')).getByText('Desligada')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/interruptor está ligado/)).toBeNull());
  });

  test('cancel leaves everything as it was and calls nothing', async () => {
    const { calls } = setup();
    await screen.findByText('Modo manutenção', { selector: 'strong' });
    fireEvent.click(within(flagRow('Modo manutenção')).getByRole('button', { name: 'Ligar Modo manutenção' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('form')).toBeNull();
    expect(calls.some((c) => c.name === 'setOpsFlag')).toBe(false);
    expect(within(flagRow('Modo manutenção')).getByText('Desligada')).toBeTruthy();
  });

  test('only one confirmation can be open at a time', async () => {
    setup();
    await screen.findByText('Modo manutenção', { selector: 'strong' });
    fireEvent.click(within(flagRow('Modo manutenção')).getByRole('button', { name: 'Ligar Modo manutenção' }));
    const other = within(flagRow('Pontuação da Liga pausada')).getByRole('button', { name: 'Ligar Pontuação da Liga pausada' }) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
  });

  test('a database refusal is shown and the confirmation stays open; "not an admin" sends the app to the denied screen', async () => {
    setup({ setOpsFlag: async () => Promise.reject(new ApiError('OPS_NOTE_REQUIRED')) });
    await screen.findByText('Modo manutenção', { selector: 'strong' });
    fireEvent.click(within(flagRow('Modo manutenção')).getByRole('button', { name: 'Ligar Modo manutenção' }));
    fireEvent.change(await screen.findByLabelText(/Motivo/), { target: { value: 'um motivo qualquer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('OPS_NOTE_REQUIRED');
    expect(screen.getByRole('form', { name: /ligar Modo manutenção/ })).toBeTruthy();
    cleanup();

    const denied = setup({ setOpsFlag: async () => Promise.reject(new AccessDeniedError()) });
    await screen.findByText('Modo manutenção', { selector: 'strong' });
    fireEvent.click(within(flagRow('Modo manutenção')).getByRole('button', { name: 'Ligar Modo manutenção' }));
    fireEvent.change(await screen.findByLabelText(/Motivo/), { target: { value: 'um motivo qualquer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(denied.onDenied).toHaveBeenCalled());
  });
});

describe('IA e operação: incidents, reports, cost', () => {
  test('lists the open incident with what the watchdog switched on', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Incidentes abertos' });
    await waitFor(() => expect(table.textContent).toContain('Funções do mercado'));
    expect(table.textContent).toContain('Mercado pausado');
    expect(screen.getByText('Incidentes abertos', { selector: '.label' }).closest('.kpi')?.textContent).toContain('1');
  });

  test('reports come most severe first, each with its findings, advice and evidence links to the player and the sale', async () => {
    setup();
    const cards = await screen.findAllByRole('article');
    expect(cards.map((c) => c.getAttribute('aria-label')?.split(':')[0])).toEqual(['Relatório Alta', 'Relatório Média', 'Relatório Informativo']);
    const first = cards[0];
    expect(first.textContent).toContain('25 vezes');
    expect(first.textContent).toContain('Conselho: Revisar a conta');
    expect(first.textContent).toContain('alerta enviado');
    const links = within(first).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^#\/mercado\?q=demo-sale-1$/), expect.stringMatching(/^#\/jogadores\?q=[0-9a-f-]{8,}/)]),
    );
    // a report without the AI says so
    expect(cards[2].textContent).toContain('sem IA');
  });

  test('"Marcar como lido" acknowledges the report and it leaves the unread list', async () => {
    const { calls } = setup();
    const cards = await screen.findAllByRole('article');
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Marcar como lido' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'ackReport')).toBe(true));
    expect(calls.find((c) => c.name === 'ackReport')!.args).toEqual(['demo-report-1']);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    // the "Lidos" tab shows the acknowledged ones
    fireEvent.click(screen.getByRole('button', { name: 'Lidos' }));
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
    expect(screen.getAllByText(/Lido há|Lido agora|Lido/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));
  });

  test('the cost card shows the month so far, the projection and the runs, marked as an estimate', async () => {
    setup();
    expect(await screen.findByText('Custo da IA neste mês')).toBeTruthy();
    const kpi = screen.getByText('Custo da IA neste mês').closest('.kpi')!;
    await waitFor(() => expect(kpi.textContent).toMatch(/1,84/));
    expect(kpi.textContent).toMatch(/US\$\s?1,84/);
    expect(kpi.textContent).toMatch(/projeção do mês: US\$\s?4,35 \(estimativa\)/);
    expect(screen.getByText(/não são a fatura/)).toBeTruthy();
    expect(screen.getByText('claude-opus-5-5')).toBeTruthy();
    expect(screen.getByText('claude-haiku-5-5')).toBeTruthy();
  });

  test('a failing load is shown, not swallowed', async () => {
    setup({ opsOverview: async () => Promise.reject(new ApiError('rede fora do ar')) });
    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('rede fora do ar');
  });

  test('an empty inbox says so', async () => {
    setup({ aiReports: async () => ({ total: 0, page: 0, page_size: 20, rows: [] }) });
    expect(await screen.findByText('Nenhum relatório novo.')).toBeTruthy();
  });
});

describe('evidence chips', () => {
  test('players and sales are links (the id is encoded); the rest are plain labels', () => {
    render(
      <div>
        <EvidenceChip e={{ type: 'user', id: 'abc def', label: 'Ana' }} />
        <EvidenceChip e={{ type: 'sale', id: 'sale-1', label: 'steel_plate' }} />
        <EvidenceChip e={{ type: 'ip_prefix', id: 'ffffffff' }} />
        <EvidenceChip e={{ type: 'reason', id: 'PACE_TOO_FAST' }} />
      </div>,
    );
    expect(screen.getByRole('link', { name: 'Jogador: Ana' }).getAttribute('href')).toBe('#/jogadores?q=abc%20def');
    expect(screen.getByRole('link', { name: 'Venda: steel_plate' }).getAttribute('href')).toBe('#/mercado?q=sale-1');
    expect(screen.getByText('IP (hash): ffffffff').tagName).toBe('SPAN');
    expect(screen.getByText('Motivo: PACE_TOO_FAST')).toBeTruthy();
  });
});
