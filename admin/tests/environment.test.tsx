// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import App from '../src/App';
import type { AdminApi } from '../src/lib/api';
import type { AuthPort } from '../src/lib/auth';
import type { Backend } from '../src/lib/backend';
import { createDemoApi } from '../src/lib/demo';
import { describeEnvironment, projectRef } from '../src/lib/environment';

afterEach(() => cleanup());

describe('describeEnvironment (A07)', () => {
  const URL_TEST = 'https://ncufhkoyphktvmhmivxa.supabase.co';
  const URL_PROD = 'https://prodprojectref0000000.supabase.co';

  test('the project ref comes from the public URL; a bad URL gives none', () => {
    expect(projectRef(URL_TEST)).toBe('ncufhkoyphktvmhmivxa');
    expect(projectRef('not a url')).toBeNull();
    expect(projectRef(undefined)).toBeNull();
  });

  test('demo is its own environment and never looks like test or production', () => {
    const e = describeEnvironment({ demo: true, supabaseUrl: URL_PROD, declared: 'producao' });
    expect(e).toMatchObject({ kind: 'demo', label: 'Demonstração', ref: null });
  });

  test('a build declared as test and not pointing at the production project is "teste"', () => {
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_TEST, declared: 'teste', productionRef: 'prodprojectref0000000' })).toMatchObject({ kind: 'teste', ref: 'ncufhkoyphktvmhmivxa' });
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_TEST, declared: 'teste' })).toMatchObject({ kind: 'teste' });
  });

  test('production is confirmed only when the connected project is the configured production one', () => {
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_PROD, declared: 'producao', productionRef: 'prodprojectref0000000' })).toMatchObject({ kind: 'producao', label: 'Produção' });
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_PROD, productionRef: 'prodprojectref0000000' })).toMatchObject({ kind: 'producao' });
    // declared production without a ref to check against: still shown as production, but marked as unverified
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_PROD, declared: 'producao' })).toMatchObject({ kind: 'producao', label: 'Produção (não verificada)' });
  });

  test('a contradiction is shown as such, in both directions', () => {
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_TEST, declared: 'producao', productionRef: 'prodprojectref0000000' })).toMatchObject({ kind: 'inconsistente' });
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_PROD, declared: 'teste', productionRef: 'prodprojectref0000000' })).toMatchObject({ kind: 'inconsistente' });
  });

  test('nothing declared and nothing to compare: says it is not declared (never guesses)', () => {
    expect(describeEnvironment({ demo: false, supabaseUrl: URL_TEST })).toMatchObject({ kind: 'desconhecido', label: 'Ambiente não declarado' });
    expect(describeEnvironment({ demo: false })).toMatchObject({ kind: 'desconhecido', ref: null });
  });

  test('no secret can end up in the text: only the public ref is shown', () => {
    const e = describeEnvironment({ demo: false, supabaseUrl: `${URL_TEST}/?apikey=eyJsecretsecretsecretsecret`, declared: 'teste' });
    expect(JSON.stringify(e)).not.toContain('eyJ');
    expect(JSON.stringify(e)).not.toContain('apikey');
  });
});

describe('the shell shows the environment and the owner emblem', () => {
  function shell(env: Backend['env'], demo = false) {
    const auth: AuthPort = { session: async () => ({ email: 'dono@exemplo.com' }), signIn: async () => ({ ok: true }), signOut: async () => undefined, isAdmin: async () => true, onChange: () => () => undefined };
    const backend: Backend = { auth, api: createDemoApi() as AdminApi, demo, env };
    render(<App backend={backend} />);
    return backend;
  }

  test('teste: a chip with the label and the short ref, and the emblem image instead of the letter A', async () => {
    shell(describeEnvironment({ demo: false, supabaseUrl: 'https://ncufhkoyphktvmhmivxa.supabase.co', declared: 'teste' }));
    const nav = await screen.findByRole('navigation', { name: 'Seções' });
    const aside = nav.closest('aside')!;
    const env = aside.querySelector('.env-chip')!;
    expect(env.className).toContain('env-teste');
    expect(env.textContent).toContain('Teste');
    expect(env.textContent).toContain('ncufhkoy');
    const img = aside.querySelector('img.brand-emblem') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/emblem.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(aside.querySelector('.brand-mark')).toBeNull();
  });

  test('demo says demonstration, and a backend without env says it is not declared', async () => {
    shell(describeEnvironment({ demo: true }), true);
    expect((await screen.findByRole('navigation', { name: 'Seções' })).closest('aside')!.querySelector('.env-chip')!.textContent).toContain('Demonstração');
    cleanup();
    shell(undefined);
    expect((await screen.findByRole('navigation', { name: 'Seções' })).closest('aside')!.querySelector('.env-chip')!.textContent).toContain('Ambiente não declarado');
  });
});
