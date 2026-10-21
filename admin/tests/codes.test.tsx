// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Codes from '../src/pages/Codes';
import App, { ROUTES } from '../src/App';
import { AppContext } from '../src/hooks';
import { endOfDayIso, formatPromoCode, promoErrorText, promoFormProblem } from '../src/lib/actions';
import { AccessDeniedError, ApiError, type AdminApi } from '../src/lib/api';
import { createDemoApi, createDemoBackend } from '../src/lib/demo';

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
  const denied = vi.fn();
  render(
    <AppContext.Provider value={{ api, onDenied: denied, demo: true }}>
      <Codes />
    </AppContext.Provider>,
  );
  return { calls, denied };
}

describe('helpers', () => {
  test('a code is shown in two groups of five', () => {
    expect(formatPromoCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(formatPromoCode('short')).toBe('short');
  });
  test('the validity is the END of the chosen day, local time', () => {
    const iso = endOfDayIso('2026-11-30')!;
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 30, 23, 59]);
    expect(endOfDayIso('')).toBeNull();
    expect(endOfDayIso('30/11/2026')).toBeNull();
  });
  test('the form problem names the limit that is broken', () => {
    expect(promoFormProblem({ count: 10, maxUses: 1, note: 'sorteio' })).toBeNull();
    expect(promoFormProblem({ count: 0, maxUses: 1, note: 'sorteio' })).toMatch(/1 a 500/);
    expect(promoFormProblem({ count: 501, maxUses: 1, note: 'sorteio' })).toMatch(/1 a 500/);
    expect(promoFormProblem({ count: 1.5, maxUses: 1, note: 'sorteio' })).toMatch(/1 a 500/);
    expect(promoFormProblem({ count: 5, maxUses: 0, note: 'sorteio' })).toMatch(/usos/);
    expect(promoFormProblem({ count: 5, maxUses: 100001, note: 'sorteio' })).toMatch(/usos/);
    expect(promoFormProblem({ count: 5, maxUses: 1, note: 'ab' })).toMatch(/nota/);
  });
  test('server errors turn into plain Portuguese', () => {
    for (const code of ['PROMO_BAD_COUNT', 'PROMO_BAD_MAX_USES', 'PROMO_BAD_REWARD', 'PROMO_BAD_EXPIRY', 'PROMO_NOT_FOUND', 'ADMIN_NOTE_REQUIRED', 'ADMIN_ONLY']) expect(promoErrorText(code)).not.toBe(code);
    expect(promoErrorText('something odd')).toBe('something odd');
  });
});

describe('the Códigos page', () => {
  test('is a route of the app, after "Pagamentos a resolver"', () => {
    const ids = ROUTES.map((r) => r.id);
    expect(ids).toContain('codigos');
    expect(ROUTES.find((r) => r.id === 'codigos')!.label).toBe('Códigos');
    expect(App).toBeTruthy();
    expect(createDemoBackend().demo).toBe(true);
  });

  test('lists the codes with uses, validity and a status; filters by status', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Códigos promocionais' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(3));
    expect(table.textContent).toContain('DEMKA-2B3C4');
    expect(table.textContent).toContain('3 / 10');
    expect(table.textContent).toMatch(/Ativo/);
    expect(table.textContent).toMatch(/Esgotado/);
    expect(table.textContent).toMatch(/Desativado/);
    fireEvent.click(screen.getByRole('button', { name: 'Esgotados' }));
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(table.textContent).toContain('DEMKK-5M6N7');
  });

  test('generating asks first, shows what it will do, then calls with the exact arguments and shows the codes', async () => {
    const { calls } = setup();
    await screen.findByRole('table', { name: 'Códigos promocionais' });
    const form = screen.getByRole('form', { name: 'Gerar códigos' });
    const submit = within(form).getByRole('button', { name: /Gerar…/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // no note yet
    const [count, uses] = within(form).getAllByRole('spinbutton');
    fireEvent.change(count, { target: { value: '3' } });
    fireEvent.change(uses, { target: { value: '2' } });
    fireEvent.change(within(form).getByPlaceholderText(/sorteio do Discord/), { target: { value: 'sorteio de novembro' } });
    const day = form.querySelector('input[type="date"]') as HTMLInputElement;
    const next = new Date(Date.now() + 10 * 86_400_000);
    const dayValue = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    fireEvent.change(day, { target: { value: dayValue } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(calls.some((c) => c.name === 'createPromoCodes')).toBe(false);
    const confirm = screen.getByRole('form', { name: 'Confirmar: gerar códigos' });
    expect(confirm.textContent).toContain('3 códigos');
    expect(confirm.textContent).toContain('2 usos');
    expect(confirm.textContent).toContain('de graça');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Gerar os códigos' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'createPromoCodes')).toBe(true));
    const args = calls.find((c) => c.name === 'createPromoCodes')!.args[0] as Record<string, unknown>;
    expect(args).toMatchObject({ count: 3, reward: 'pass', maxUses: 2, note: 'sorteio de novembro' });
    expect(new Date(args.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
    const area = (await screen.findByLabelText('Códigos gerados')) as HTMLTextAreaElement;
    const lines = area.value.split('\n');
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    // and they are in the list
    const table = screen.getByRole('table', { name: 'Códigos promocionais' });
    await waitFor(() => expect(table.textContent).toContain(lines[0]));
  });

  test('a server refusal is shown in plain words', async () => {
    setup({ createPromoCodes: async () => Promise.reject(new ApiError('PROMO_BAD_EXPIRY')) });
    await screen.findByRole('table', { name: 'Códigos promocionais' });
    const form = screen.getByRole('form', { name: 'Gerar códigos' });
    fireEvent.change(within(form).getByPlaceholderText(/sorteio do Discord/), { target: { value: 'lote de teste' } });
    fireEvent.click(within(form).getByRole('button', { name: /Gerar…/ }));
    fireEvent.click(within(screen.getByRole('form', { name: 'Confirmar: gerar códigos' })).getByRole('button', { name: 'Gerar os códigos' }));
    await screen.findByText(/data de validade precisa estar no futuro/);
  });

  test('"not an admin" from the server sends the app back to the access-denied screen', async () => {
    const { denied } = setup({ createPromoCodes: async () => Promise.reject(new AccessDeniedError()) });
    await screen.findByRole('table', { name: 'Códigos promocionais' });
    const form = screen.getByRole('form', { name: 'Gerar códigos' });
    fireEvent.change(within(form).getByPlaceholderText(/sorteio do Discord/), { target: { value: 'lote de teste' } });
    fireEvent.click(within(form).getByRole('button', { name: /Gerar…/ }));
    fireEvent.click(within(screen.getByRole('form', { name: 'Confirmar: gerar códigos' })).getByRole('button', { name: 'Gerar os códigos' }));
    await waitFor(() => expect(denied).toHaveBeenCalled());
  });

  test('disabling asks first, then disables the code and the list shows it', async () => {
    const { calls } = setup();
    const table = await screen.findByRole('table', { name: 'Códigos promocionais' });
    await waitFor(() => expect(table.textContent).toContain('DEMKA-2B3C4'));
    fireEvent.click(screen.getByRole('button', { name: 'Desativar o código DEMKA-2B3C4' }));
    expect(calls.some((c) => c.name === 'disablePromoCode')).toBe(false);
    const confirm = screen.getByRole('form', { name: 'Confirmar: desativar código' });
    expect(confirm.textContent).toContain('Ninguém mais consegue usá-lo');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(calls.find((c) => c.name === 'disablePromoCode')?.args).toEqual(['DEMKA2B3C4']));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Confirmar: desativar código' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Desativados' }));
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBe(3));
  });
});
