// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../src/App';
import { AccessDeniedError, type AdminApi } from '../src/lib/api';
import type { AuthPort } from '../src/lib/auth';
import type { Backend } from '../src/lib/backend';
import { createDemoApi } from '../src/lib/demo';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

/** An API whose every method is recorded; `base` answers (the demo data), `override` replaces single methods. */
function spyApi(override: Partial<AdminApi> = {}) {
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
  return { api, calls };
}

function fakeAuth(opts: { session: { email: string } | null; admin: boolean | Error; signIn?: AuthPort['signIn'] }) {
  let session = opts.session;
  const listeners = new Set<() => void>();
  const isAdmin = vi.fn(async () => {
    if (opts.admin instanceof Error) throw opts.admin;
    return opts.admin;
  });
  const signOut = vi.fn(async () => {
    session = null;
    listeners.forEach((l) => l());
  });
  const auth: AuthPort = {
    session: async () => session,
    signIn: opts.signIn ?? (async () => ({ ok: false, message: 'E-mail ou senha incorretos.' })),
    signOut,
    isAdmin,
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { auth, isAdmin, signOut };
}

const backend = (auth: AuthPort, api: AdminApi): Backend => ({ auth, api, demo: false });

describe('access', () => {
  test('signed out: the sign-in form, and no admin function is called', async () => {
    const { api, calls } = spyApi();
    const { auth, isAdmin } = fakeAuth({ session: null, admin: false });
    render(<App backend={backend(auth, api)} />);
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
    expect(isAdmin).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  test('a wrong password shows the message and stays on the form', async () => {
    const { api } = spyApi();
    const { auth } = fakeAuth({ session: null, admin: false });
    render(<App backend={backend(auth, api)} />);
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'dono@exemplo.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeTruthy();
  });

  test('signed in but NOT an admin: "Acesso negado", the pages are never rendered and no admin function is called', async () => {
    const { api, calls } = spyApi();
    const { auth, isAdmin, signOut } = fakeAuth({ session: { email: 'jogador@exemplo.com' }, admin: false });
    render(<App backend={backend(auth, api)} />);
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeTruthy();
    expect(screen.getByText(/jogador@exemplo\.com/)).toBeTruthy();
    expect(isAdmin).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
    expect(screen.queryByText('Visão geral')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    // the only thing left to do is leave
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  test('an admin gets the shell with every section and the overview loads', async () => {
    const { api, calls } = spyApi();
    const { auth } = fakeAuth({ session: { email: 'dono@exemplo.com' }, admin: true });
    render(<App backend={backend(auth, api)} />);
    const nav = await screen.findByRole('navigation', { name: 'Seções' });
    for (const label of ['Visão geral', 'Jogadores', 'Lendários', 'Mercado', 'Economia', 'Liga', 'Lista de espera', 'IA e operação']) {
      expect(nav.textContent).toContain(label);
    }
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeTruthy();
    await waitFor(() => expect(calls).toContain('overview'));
    expect(await screen.findByText(/atualizado há/)).toBeTruthy();
  });

  test('the database refusing a call later (not an admin any more) sends the app back to "Acesso negado"', async () => {
    const { api } = spyApi({ overview: async () => Promise.reject(new AccessDeniedError()) });
    const { auth } = fakeAuth({ session: { email: 'ex-admin@exemplo.com' }, admin: true });
    render(<App backend={backend(auth, api)} />);
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  test('if the access check itself fails, the app fails closed with a retry', async () => {
    const { api, calls } = spyApi();
    const { auth } = fakeAuth({ session: { email: 'dono@exemplo.com' }, admin: new Error('rede fora do ar') });
    render(<App backend={backend(auth, api)} />);
    expect(await screen.findByText('rede fora do ar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(calls).toEqual([]);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
