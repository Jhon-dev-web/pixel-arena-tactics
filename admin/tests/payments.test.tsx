// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PagamentosPage, { amountText, grantSql, refundSql } from '../src/pages/Pagamentos';
import { ROUTES } from '../src/App';
import { AppContext } from '../src/hooks';
import { createRpcApi, type AdminApi, type RpcClient } from '../src/lib/api';
import { createDemoApi } from '../src/lib/demo';
import { PAYMENT_RPC_NAMES } from '../src/lib/paymentRpcNames';

// "Pagamentos a resolver": the owner's read-only queue of payments that reached the game but could not be matched (migration 0022).
afterEach(() => cleanup());

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
      <PagamentosPage />
    </AppContext.Provider>,
  );
  return { calls };
}

describe('the page', () => {
  test('is a route in the menu', () => {
    expect(ROUTES.map((r) => r.id)).toContain('pagamentos');
    expect(ROUTES.find((r) => r.id === 'pagamentos')?.label).toBe('Pagamentos a resolver');
  });

  test('lists the open payments with who, what, how much, why it did not match and who paid compared with the linked wallet', async () => {
    const { calls } = setup();
    expect(await screen.findByRole('heading', { name: 'Pagamentos a resolver' })).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'Pagamentos a resolver' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(3));
    const text = table.textContent ?? '';
    expect(text).toContain('Sem referência'); // no memo
    expect(text).toContain('Valor menor'); // short
    expect(text).toContain('Pagamento repetido');
    expect(text).toContain('10.00 USDC');
    expect(text).toContain('4.00 USDC');
    expect(text).toContain('1.0000 SOL'); // a sale is in SOL
    expect(text).toContain('Passe do Aventureiro');
    expect(text).toContain('Compra no mercado');
    expect(text).toContain('não é a ligada'); // paid from a wallet that is not the linked one
    expect(text).toContain('é a carteira ligada');
    expect(text).toContain('teste'); // devnet
    expect(text).not.toContain('Devolvido'); // the refunded one is under "Resolvidos"
    expect(screen.getByText(/pagamentos esperam por você/)).toBeTruthy();
    expect(calls.find((c) => c.name === 'paymentExceptions')!.args).toEqual([{ status: 'open', page: 0, pageSize: 50 }]);
  });

  test('"Resolvidos" shows the refunded one with its refund signature, and "Todos" shows everything', async () => {
    const { calls } = setup();
    await screen.findByRole('table', { name: 'Pagamentos a resolver' });
    fireEvent.click(screen.getByRole('button', { name: 'Resolvidos' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Pagamentos a resolver' }).textContent).toContain('Devolvido'));
    expect(calls.filter((c) => c.name === 'paymentExceptions').at(-1)!.args).toEqual([{ status: 'resolved', page: 0, pageSize: 50 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Pagamentos a resolver' }).textContent).toContain('Sem referência'));
  });

  test('every open row has the two SQL commands with ITS signature; the page itself never writes (no resolve method exists)', async () => {
    const written: string[] = [];
    Object.assign(navigator, { clipboard: { writeText: async (t: string) => void written.push(t) } });
    setup();
    const table = await screen.findByRole('table', { name: 'Pagamentos a resolver' });
    await waitFor(() => expect(within(table).getAllByRole('button', { name: /Copiar SQL: marcar devolvido/ }).length).toBe(3));
    // the two Pass payments have a "grant the Pass" button; the market payment (not a Pass) has none
    const grants = within(table).getAllByRole('button', { name: /Copiar SQL: conceder o Passe/ });
    expect(grants).toHaveLength(2);
    fireEvent.click(grants[0]);
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toMatch(/^select arena_private\.payment_exception_grant_pass\('5DemoSig1/);
    expect(written[0]).not.toContain('<');
    expect(Object.keys(createDemoApi()).filter((k) => /resolve|grant|refund/i.test(k))).toEqual([]);
  });

  test('explains how to resolve one with the two documented SQL calls', async () => {
    setup();
    expect(await screen.findByText('Como resolver')).toBeTruthy();
    expect(document.body.textContent).toContain(grantSql('ASSINATURA'));
    expect(document.body.textContent).toContain('payment_exception_mark_refunded');
    expect(document.body.textContent).toContain('Concessão manual');
  });

  test('an empty queue says everything is fine; a failure is shown, not swallowed', async () => {
    setup({ paymentExceptions: async () => ({ total: 0, page: 0, page_size: 50, rows: [], open: 0 }) });
    expect(await screen.findByText('Nenhum pagamento em aberto. Tudo certo.')).toBeTruthy();
    cleanup();
    setup({ paymentExceptions: async () => Promise.reject(new Error('boom')) });
    expect(await screen.findByText(/Não foi possível carregar/)).toBeTruthy();
  });
});

describe('the helpers and the api', () => {
  test('amounts are in the unit of their purpose', () => {
    expect(amountText({ purpose: 'pass', amount_units: 12_500_000 })).toBe('12.50 USDC');
    expect(amountText({ purpose: 'market', amount_units: 950_000_000 })).toBe('0.9500 SOL');
  });

  test('the SQL carries only base58 characters of the signature (nothing can be injected through it)', () => {
    expect(grantSql("abc'; drop table x; --")).toBe("select arena_private.payment_exception_grant_pass('abcdroptabex');"); // only characters of the base58 alphabet survive
    expect(refundSql('ABC')).toContain("'ABC'");
  });

  test('the api method calls the one admin function with named arguments', async () => {
    const calls: { name: string; args?: Record<string, unknown> }[] = [];
    const client: RpcClient = {
      rpc(name, args) {
        calls.push({ name, args });
        return Promise.resolve({ data: { total: 0, open: 0, page: 0, page_size: 50, rows: [] }, error: null });
      },
    };
    await createRpcApi(client).paymentExceptions({ status: 'open', page: 1, pageSize: 50 });
    expect(calls).toEqual([{ name: 'admin_payment_exceptions', args: { p_status: 'open', p_page: 1, p_page_size: 50 } }]);
    expect(PAYMENT_RPC_NAMES).toEqual(['admin_payment_exceptions']);
  });
});

describe('reading a row before reaching the SQL helper (A05)', () => {
  test('value with currency, network, origin and reason come before the column that only copies SQL', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Pagamentos a resolver' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(3));
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const at = (re: RegExp) => headers.findIndex((h) => re.test(h));
    const sql = at(/copia SQL/);
    expect(sql).toBe(headers.length - 1);
    for (const re of [/Valor \(moeda\)/, /Rede/, /Origem/, /Motivo/]) expect(at(re)).toBeGreaterThanOrEqual(0), expect(at(re)).toBeLessThan(sql);
    expect(table.textContent).toContain('Solana');
    expect(table.textContent).toContain('teste (devnet)');
    expect(headers[sql]).toContain('não executa nada');
  });

  test('a failed load offers a retry and the table does not claim the queue is empty', async () => {
    let fail = true;
    const base = createDemoApi();
    setup({ paymentExceptions: async (q) => (fail ? Promise.reject(new Error('sem rede')) : base.paymentExceptions(q)) });
    expect(await screen.findByText(/Não foi possível carregar: sem rede/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Nenhum pagamento em aberto');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByText(/Não foi possível carregar/)).toBeNull());
  });
});
