// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Codes from '../src/pages/Codes';
import { AppContext } from '../src/hooks';
import { PROMO_AMOUNT_MAX, PROMO_POTIONS, promoErrorText, promoFormProblem, promoRewardText } from '../src/lib/actions';
import { ApiError, createRpcApi, type AdminApi } from '../src/lib/api';
import { createDemoApi } from '../src/lib/demo';
import { MIGRATIONS_DIR } from './sql/harness';

// Promo codes that give Ouro, Éter or a potion (migration 0028): the owner picks the reward in the "Códigos" page.
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
      <Codes />
    </AppContext.Provider>,
  );
  return { calls };
}

describe('the potion list', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0028_server_credits.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
  test('is exactly the list the database accepts, with a name for each', () => {
    const list = /promo_consumable_ids\(\)\s*returns text\[\][\s\S]*?array\[([\s\S]*?)\]::text/.exec(sql)![1];
    const ids = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(PROMO_POTIONS.map((p) => p.id).sort()).toEqual([...ids].sort());
    for (const p of PROMO_POTIONS) expect(p.label.trim(), p.id).not.toBe('');
  });
  test('never offers a tradeable item (Gold Pouches) or a Pass-track exclusive', () => {
    const ids = PROMO_POTIONS.map((p) => p.id);
    for (const bad of ['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l', 'stash_deed', 'forge_seal', 'refine_catalyst', 'expedition_ticket_1h']) expect(ids).not.toContain(bad);
  });
  test('the caps are the database caps', () => {
    expect(PROMO_AMOUNT_MAX).toEqual({ gold: 1_000_000, shards: 10_000, consumable: 100 });
    expect(sql).toContain('reward_amount between 1 and 1000000');
    expect(sql).toContain('reward_amount between 1 and 10000');
  });
});

describe('words and checks', () => {
  test('a reward is told in plain Portuguese', () => {
    expect(promoRewardText({ reward_kind: 'pass' })).toBe('Passe de Aventureiro');
    expect(promoRewardText({ reward_kind: 'gold', reward_amount: 25000 })).toBe('25.000 Ouro');
    expect(promoRewardText({ reward_kind: 'shards', reward_amount: 40 })).toBe('40 Éter');
    expect(promoRewardText({ reward_kind: 'consumable', reward_item_id: 'knowledge_elixir', reward_amount: 5 })).toBe('5 × Elixir do Conhecimento');
  });
  test('the form names the limit that is broken', () => {
    const ok = { count: 1, maxUses: 1, note: 'youtuber' };
    expect(promoFormProblem({ ...ok, reward: 'pass' })).toBeNull();
    expect(promoFormProblem({ ...ok, reward: 'gold', amount: 1000 })).toBeNull();
    expect(promoFormProblem({ ...ok, reward: 'gold', amount: 0 })).toMatch(/quantidade/i);
    expect(promoFormProblem({ ...ok, reward: 'gold', amount: 1_000_001 })).toMatch(/1\.000\.000/);
    expect(promoFormProblem({ ...ok, reward: 'shards', amount: 10_001 })).toMatch(/10\.000/);
    expect(promoFormProblem({ ...ok, reward: 'consumable', itemId: 'small_hp', amount: 101 })).toMatch(/100/);
    expect(promoFormProblem({ ...ok, reward: 'consumable', itemId: 'gold_pouch_l', amount: 1 })).toMatch(/poção/i);
    expect(promoFormProblem({ ...ok, reward: 'gold', amount: 2.5 })).toMatch(/quantidade/i);
  });
  test('the new database errors are plain words', () => {
    for (const code of ['PROMO_BAD_ITEM', 'PROMO_BAD_AMOUNT']) expect(promoErrorText(code)).not.toBe(code);
  });
});

describe('the rpc', () => {
  test('sends the potion and the amount only where they belong', async () => {
    const calls: { name: string; args: unknown }[] = [];
    const client = { rpc: async (name: string, args?: unknown) => (calls.push({ name, args }), { data: { codes: [] }, error: null }) } as never;
    const api = createRpcApi(client);
    await api.createPromoCodes({ count: 2, reward: 'gold', amount: 5000, maxUses: 1, expiresAt: null, note: 'canal' });
    await api.createPromoCodes({ count: 2, reward: 'consumable', itemId: 'large_hp', amount: 3, maxUses: 1, expiresAt: null, note: 'canal' });
    await api.createPromoCodes({ count: 2, reward: 'pass', itemId: 'large_hp', amount: 9, maxUses: 1, expiresAt: null, note: 'canal' });
    expect(calls.map((c) => c.args)).toEqual([
      { p_count: 2, p_reward: 'gold', p_max_uses: 1, p_expires_at: null, p_note: 'canal', p_item_id: null, p_amount: 5000 },
      { p_count: 2, p_reward: 'consumable', p_max_uses: 1, p_expires_at: null, p_note: 'canal', p_item_id: 'large_hp', p_amount: 3 },
      { p_count: 2, p_reward: 'pass', p_max_uses: 1, p_expires_at: null, p_note: 'canal', p_item_id: null, p_amount: null },
    ]);
  });
  test('the demo refuses what the database refuses', async () => {
    const api = createDemoApi();
    const base = { count: 1, maxUses: 1, expiresAt: null, note: 'canal' };
    await expect(api.createPromoCodes({ ...base, reward: 'gold', amount: 0 })).rejects.toBeInstanceOf(ApiError);
    await expect(api.createPromoCodes({ ...base, reward: 'consumable', itemId: 'gold_pouch_s', amount: 1 })).rejects.toThrow(/PROMO_BAD_ITEM/);
    await expect(api.createPromoCodes({ ...base, reward: 'shards', amount: 10_001 })).rejects.toThrow(/PROMO_BAD_AMOUNT/);
  });
});

describe('the Códigos page with rewards', () => {
  test('the list shows what each code gives', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Códigos promocionais' });
    await waitFor(() => expect(table.textContent).toContain('25.000 Ouro'));
    expect(table.textContent).toContain('5 × Elixir do Conhecimento');
    expect(table.textContent).toContain('Passe de Aventureiro');
  });

  test('choosing Ouro asks for an amount and sends reward + amount; the confirmation names the reward', async () => {
    const { calls } = setup();
    await screen.findByRole('table', { name: 'Códigos promocionais' });
    const form = screen.getByRole('form', { name: 'Gerar códigos' });
    expect(within(form).queryByLabelText('Quantidade da recompensa')).toBeNull();
    fireEvent.change(within(form).getByLabelText('Recompensa'), { target: { value: 'gold' } });
    const amount = within(form).getByLabelText('Quantidade da recompensa') as HTMLInputElement;
    expect(amount.value).toBe('10000');
    fireEvent.change(amount, { target: { value: '50000' } });
    fireEvent.change(within(form).getByPlaceholderText(/sorteio do Discord/), { target: { value: 'parceria com o canal' } });
    fireEvent.click(within(form).getByRole('button', { name: /Gerar…/ }));
    const confirm = screen.getByRole('form', { name: 'Confirmar: gerar códigos' });
    expect(confirm.textContent).toContain('50.000 Ouro');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Gerar os códigos' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'createPromoCodes')).toBe(true));
    expect(calls.find((c) => c.name === 'createPromoCodes')!.args[0]).toMatchObject({ reward: 'gold', amount: 50000, itemId: null, note: 'parceria com o canal' });
  });

  test('choosing Poção shows the potion list (only allowed ones) and sends the id', async () => {
    const { calls } = setup();
    await screen.findByRole('table', { name: 'Códigos promocionais' });
    const form = screen.getByRole('form', { name: 'Gerar códigos' });
    fireEvent.change(within(form).getByLabelText('Recompensa'), { target: { value: 'consumable' } });
    const pick = within(form).getByLabelText('Qual poção') as HTMLSelectElement;
    expect([...pick.options].map((o) => o.value)).toEqual(PROMO_POTIONS.map((p) => p.id));
    fireEvent.change(pick, { target: { value: 'greater_elixir' } });
    fireEvent.change(within(form).getByLabelText('Quantidade da recompensa'), { target: { value: '12' } });
    fireEvent.change(within(form).getByPlaceholderText(/sorteio do Discord/), { target: { value: 'sorteio no youtube' } });
    fireEvent.click(within(form).getByRole('button', { name: /Gerar…/ }));
    const confirm = screen.getByRole('form', { name: 'Confirmar: gerar códigos' });
    expect(confirm.textContent).toContain('12 × Elixir de Vida Maior');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Gerar os códigos' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'createPromoCodes')).toBe(true));
    expect(calls.find((c) => c.name === 'createPromoCodes')!.args[0]).toMatchObject({ reward: 'consumable', itemId: 'greater_elixir', amount: 12 });
  });

  test('an amount above the cap blocks the button and says why', async () => {
    setup();
    await screen.findByRole('table', { name: 'Códigos promocionais' });
    const form = screen.getByRole('form', { name: 'Gerar códigos' });
    fireEvent.change(within(form).getByLabelText('Recompensa'), { target: { value: 'shards' } });
    fireEvent.change(within(form).getByLabelText('Quantidade da recompensa'), { target: { value: '10001' } });
    fireEvent.change(within(form).getByPlaceholderText(/sorteio do Discord/), { target: { value: 'parceria' } });
    expect((within(form).getByRole('button', { name: /Gerar…/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(form.parentElement!.textContent).toMatch(/10\.000/);
  });
});
