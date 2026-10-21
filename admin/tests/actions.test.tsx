// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PlayersPage from '../src/pages/Players';
import { AppContext } from '../src/hooks';
import { deleteConfirmName, deleteRefusalText, parseDeleteResponse } from '../src/lib/actions';
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
  const denied = vi.fn();
  render(
    <AppContext.Provider value={{ api, onDenied: denied, demo: true }}>
      <PlayersPage />
    </AppContext.Provider>,
  );
  return { calls, denied, base };
}

async function openFirstPlayer() {
  const table = await screen.findByRole('table', { name: 'Jogadores' });
  await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(10));
  const row = within(table).getAllByRole('row')[1];
  const name = row.querySelector('strong')!.textContent!;
  fireEvent.click(row);
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('region', { name: 'Ações na conta' });
  return { dialog, name };
}

describe('parseDeleteResponse', () => {
  test('only a 200 with ok:true is a success', () => {
    expect(parseDeleteResponse(200, { ok: true, user_id: 'x', username: 'Ana' })).toEqual({ ok: true, username: 'Ana' });
    expect(parseDeleteResponse(200, { ok: false })).toEqual({ ok: false, reason: 'failed' });
    expect(parseDeleteResponse(200, null)).toEqual({ ok: false, reason: 'failed' });
    expect(parseDeleteResponse(500, { ok: true })).toEqual({ ok: false, reason: 'failed' }); // a body that says ok is trusted only with a 200
  });
  test('refusals keep their reason; blocked keeps the constraint; 401 is the session; 503 is unavailable', () => {
    for (const reason of ['ADMIN_ONLY', 'ADMIN_DELETE_SELF', 'ADMIN_DELETE_ADMIN', 'USER_NOT_FOUND', 'CONFIRM_MISMATCH']) {
      expect(parseDeleteResponse(409, { error: 'refused', reason })).toEqual({ ok: false, reason });
    }
    expect(parseDeleteResponse(409, { error: 'refused', reason: 'SOMETHING_NEW' })).toEqual({ ok: false, reason: 'failed' });
    expect(parseDeleteResponse(409, { error: 'blocked', constraint: 'c', table: 't' })).toEqual({ ok: false, reason: 'blocked', constraint: 'c', table: 't' });
    expect(parseDeleteResponse(401, { message: 'Invalid JWT' })).toEqual({ ok: false, reason: 'session' });
    expect(parseDeleteResponse(503, { error: 'unavailable' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(parseDeleteResponse(502, { error: 'delete_failed' })).toEqual({ ok: false, reason: 'failed' });
  });
  test('every refusal has plain words, and the blocked one names the constraint', () => {
    for (const reason of ['ADMIN_ONLY', 'ADMIN_DELETE_SELF', 'ADMIN_DELETE_ADMIN', 'USER_NOT_FOUND', 'CONFIRM_MISMATCH', 'session', 'unavailable', 'failed'] as const) {
      expect(deleteRefusalText({ ok: false, reason }).length).toBeGreaterThan(20);
    }
    expect(deleteRefusalText({ ok: false, reason: 'blocked', constraint: 'fk_x', table: 'item_certificates' })).toContain('fk_x');
  });
  test('the name to type: username, else hero name, else e-mail', () => {
    expect(deleteConfirmName({ username: ' Ana ', heroName: 'H', email: 'e@x.co' })).toBe('Ana');
    expect(deleteConfirmName({ username: null, heroName: 'Hero', email: 'e@x.co' })).toBe('Hero');
    expect(deleteConfirmName({ username: '', heroName: null, email: 'e@x.co' })).toBe('e@x.co');
    expect(deleteConfirmName({ username: null, heroName: null, email: null })).toBeNull();
  });
});

describe('deleting an account from the player panel', () => {
  test('the button only opens a warning; nothing is called until the name is typed exactly', async () => {
    const { calls } = setup();
    const { dialog, name } = await openFirstPlayer();
    expect(calls.some((c) => c.name === 'deleteUser')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: /Apagar conta/ }));
    const form = within(dialog).getByRole('form', { name: 'Confirmar: apagar conta' });
    expect(form.textContent).toContain('não pode ser desfeito');
    const confirmButton = within(form).getByRole('button', { name: 'Apagar para sempre' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    const input = within(form).getByRole('textbox');
    fireEvent.change(input, { target: { value: name.slice(0, -1) } });
    expect(confirmButton.disabled).toBe(true);
    fireEvent.submit(form);
    expect(calls.some((c) => c.name === 'deleteUser')).toBe(false);
    fireEvent.change(input, { target: { value: ` ${name.toUpperCase()} ` } });
    expect(confirmButton.disabled).toBe(false);
  });

  test('cancelling closes the warning without calling anything', async () => {
    const { calls } = setup();
    const { dialog } = await openFirstPlayer();
    fireEvent.click(within(dialog).getByRole('button', { name: /Apagar conta/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(within(dialog).queryByRole('form', { name: 'Confirmar: apagar conta' })).toBeNull();
    expect(calls.some((c) => c.name === 'deleteUser')).toBe(false);
  });

  test('confirming calls deleteUser with the id and the typed name, closes the panel and reloads the list without that player', async () => {
    const { calls, base } = setup();
    const totalBefore = (await base.players(defaultPlayerQuery())).total;
    const { dialog, name } = await openFirstPlayer();
    fireEvent.click(within(dialog).getByRole('button', { name: /Apagar conta/ }));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: name } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar para sempre' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'deleteUser')).toBe(true));
    const call = calls.find((c) => c.name === 'deleteUser')!;
    expect(call.args[1]).toBe(name);
    expect(typeof call.args[0]).toBe('string');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(calls.filter((c) => c.name === 'players').length).toBeGreaterThanOrEqual(2));
    expect((await base.players(defaultPlayerQuery())).total).toBe(totalBefore - 1);
  });

  test('a refusal stays in the panel in plain words and the list is not touched', async () => {
    const { dialog, name } = await (async () => {
      setup({ deleteUser: async () => ({ ok: false, reason: 'blocked', constraint: 'item_certificates_origin_certificate_id_fkey', table: 'item_certificates' }) });
      return openFirstPlayer();
    })();
    fireEvent.click(within(dialog).getByRole('button', { name: /Apagar conta/ }));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: name } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar para sempre' }));
    await within(dialog).findByText(/O banco protege o histórico desta conta/);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
