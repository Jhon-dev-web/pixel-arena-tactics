import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommunityView } from '../../components/CommunityTasks';
import type { CommunityState } from '../../components/CommunityTasks';
import { setLocale } from '../../locales';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { captureDiscordReturn, discordInviteUrl, fetchDiscordTask, isDiscordAuthorizeUrl, setDiscordReturnForTest, startDiscordLink, takeDiscordReturn } from '../../lib/discordTask';
import type { DiscordClient } from '../../lib/discordTask';
import { DISCORD_SOURCE_REFS, DISCORD_TASK, discordView, isDiscordCredit, parseDiscordTask } from '../discordTask';
import { defaultSave } from '../engine';
import { applyServerCredits, parseServerCredits } from '../promoRewards';

const root = resolve(__dirname, '../../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/0038_discord_task.sql'), 'utf8');
const EMOJI = /\p{Extended_Pictographic}/u;

beforeEach(() => {
  setLocale('pt');
  setDiscordReturnForTest(null);
});

describe('the reward amount is one number on the server and one in the game', () => {
  it('discord_reward() in the migration and DISCORD_TASK say the same, and the source_ref matches', () => {
    const m = /pg_catalog\.jsonb_build_object\('gold', (\d+), 'source_ref', '([a-z-]+)'\)/.exec(sql);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(DISCORD_TASK.gold);
    expect(DISCORD_TASK.gold).toBe(500);
    expect([m![2]]).toEqual([...DISCORD_SOURCE_REFS]);
    expect(sql).toContain("check (source in ('promo', 'pioneer', 'discord'))");
  });

  it('a Discord credit from the ledger is parsed, recognised and applied to the save once', () => {
    const credits = parseServerCredits([{ id: '3b9c3e0a-1a2b-4c3d-8e4f-5a6b7c8d9e0f', kind: 'gold', item_id: null, amount: 500, source_ref: 'discord-gold' }]);
    expect(credits).toHaveLength(1);
    expect(isDiscordCredit(credits[0]!)).toBe(true);
    expect(isDiscordCredit({ sourceRef: 'pioneer-gold' })).toBe(false);
    const base = defaultSave();
    const once = applyServerCredits(base, credits);
    expect(once.save.gold).toBe(base.gold + 500);
    expect(applyServerCredits(once.save, credits).save).toBe(once.save);
  });
});

describe('the status of the task', () => {
  it('parses the four states of my_discord_task()', () => {
    expect(discordView(parseDiscordTask({ linked: false, verified: false, reward: 'none', reward_amount: 500 })!)).toBe('not_linked');
    expect(discordView(parseDiscordTask({ linked: true, verified: false, reward: 'none', reward_amount: 500 })!)).toBe('not_member');
    expect(discordView(parseDiscordTask({ linked: true, verified: true, reward: 'pending', reward_amount: 500 })!)).toBe('verified_pending');
    expect(discordView(parseDiscordTask({ linked: true, verified: true, reward: 'credited', reward_amount: 500 })!)).toBe('verified_credited');
  });
  it('anything unusable is null; an unverified account never shows a reward as pending', () => {
    for (const bad of [null, undefined, 5, [], {}, { linked: 'yes', verified: true }]) expect(parseDiscordTask(bad)).toBeNull();
    expect(parseDiscordTask({ linked: true, verified: false, reward: 'credited', reward_amount: 500 })!.reward).toBe('none');
    expect(parseDiscordTask({ linked: true, verified: true, reward: 'pending' })!.rewardAmount).toBe(DISCORD_TASK.gold);
  });
  it('fetchDiscordTask asks my_discord_task and never throws', async () => {
    const calls: string[] = [];
    const ok = { rpc: async (n: string) => (calls.push(n), { data: { linked: true, verified: true, reward: 'pending', reward_amount: 500 }, error: null }), functions: { invoke: async () => ({ data: null, error: null }) } } as DiscordClient;
    expect((await fetchDiscordTask(ok))?.verified).toBe(true);
    expect(calls).toEqual(['my_discord_task']);
    const bad = { rpc: async () => ({ data: null, error: { message: 'x' } }), functions: ok.functions } as DiscordClient;
    expect(await fetchDiscordTask(bad)).toBeNull();
    const boom = { rpc: async () => { throw new Error('x'); }, functions: ok.functions } as DiscordClient;
    expect(await fetchDiscordTask(boom)).toBeNull();
    expect(await fetchDiscordTask(null)).toBeNull();
  });
});

describe('starting the round trip', () => {
  const clientWith = (res: { data: unknown; error: unknown }): DiscordClient => ({ rpc: async () => ({ data: null, error: null }), functions: { invoke: async () => res } });
  it('follows only a Discord authorize address', async () => {
    const url = 'https://discord.com/oauth2/authorize?response_type=code&client_id=1';
    expect(await startDiscordLink(clientWith({ data: { status: 'ok', url }, error: null }))).toEqual({ kind: 'url', url });
    expect(isDiscordAuthorizeUrl('https://evil.test/oauth2/authorize?x')).toBe(false);
    expect(isDiscordAuthorizeUrl('https://discord.com.evil.test/oauth2/authorize?x')).toBe(false);
    expect(await startDiscordLink(clientWith({ data: { status: 'ok', url: 'https://evil.test/' }, error: null }))).toEqual({ kind: 'error' });
  });
  it('maps already verified, rate limit and failures', async () => {
    expect(await startDiscordLink(clientWith({ data: { status: 'already_verified' }, error: null }))).toEqual({ kind: 'already_verified' });
    expect(await startDiscordLink(clientWith({ data: null, error: { context: { status: 429 } } }))).toEqual({ kind: 'rate_limited' });
    expect(await startDiscordLink(clientWith({ data: null, error: { context: { status: 502 } } }))).toEqual({ kind: 'error' });
    expect(await startDiscordLink(null)).toEqual({ kind: 'error' });
  });
});

describe('the return parameter (?discord=) is handled once and cleared from the address', () => {
  it('keeps a known value in memory, removes only that parameter, and hands it over once', () => {
    let replaced = '';
    expect(captureDiscordReturn('https://game.test/play?x=1&discord=not_member#top', (u) => (replaced = u))).toBe('not_member');
    expect(replaced).toBe('/play?x=1#top');
    expect(takeDiscordReturn()).toBe('not_member');
    expect(takeDiscordReturn()).toBeNull();
  });
  it('an unknown value is dropped from the address and ignored; no parameter changes nothing', () => {
    let replaced: string | null = null;
    expect(captureDiscordReturn('https://game.test/?discord=hack', (u) => (replaced = u))).toBeNull();
    expect(replaced).toBe('/');
    expect(takeDiscordReturn()).toBeNull();
    replaced = null;
    expect(captureDiscordReturn('https://game.test/?ref=ABC', (u) => (replaced = u))).toBeNull();
    expect(replaced).toBeNull();
  });
});

describe('the invite button', () => {
  it('needs a plain https address; otherwise it is hidden', () => {
    expect(discordInviteUrl('https://discord.gg/abc123')).toBe('https://discord.gg/abc123');
    for (const bad of [undefined, '', 'javascript:alert(1)', 'http://discord.gg/x', 'discord.gg/x']) expect(discordInviteUrl(bad)).toBeNull();
  });
});

describe('the card', () => {
  const ready = (raw: Record<string, unknown>): CommunityState => ({ phase: 'ready', status: parseDiscordTask(raw)! });
  const render = (state: CommunityState, inviteUrl: string | null = 'https://discord.gg/abc123') => renderToStaticMarkup(h(CommunityView, { state, inviteUrl, onVerify: () => undefined, onRetry: () => undefined }));

  it('not linked: both buttons, the reward waiting for the opening of the season', () => {
    const html = render(ready({ linked: false, verified: false, reward: 'none', reward_amount: 500 }));
    expect(html).toContain('Tarefas da comunidade');
    expect(html).toContain('Entrar no Discord');
    expect(html).toContain('data-testid="discord-join"');
    expect(html).toContain('href="https://discord.gg/abc123"');
    expect(html).toContain('data-testid="discord-verify"');
    expect(html).toContain('>Verificar<');
    expect(html).toContain('500 de Ouro');
  });
  it('without the invite address the join button is not there', () => {
    expect(render(ready({ linked: false, verified: false, reward: 'none', reward_amount: 500 }), null)).not.toContain('data-testid="discord-join"');
  });
  it('not a member yet: says so and offers to try again', () => {
    const html = render(ready({ linked: true, verified: false, reward: 'none', reward_amount: 500 }));
    expect(html).toContain('data-testid="discord-not-member"');
    expect(html).toContain('Verificar de novo');
  });
  it('verified, League not open: the Gold comes at the opening of Season 1; no buttons left', () => {
    const html = render(ready({ linked: true, verified: true, reward: 'pending', reward_amount: 500 }));
    expect(html).toContain('Verificado');
    expect(html).toContain('500 de Ouro na abertura da Temporada 1');
    expect(html).not.toContain('data-testid="discord-verify"');
    expect(html).not.toContain('data-testid="discord-join"');
  });
  it('verified and credited', () => {
    const html = render(ready({ linked: true, verified: true, reward: 'credited', reward_amount: 500 }));
    expect(html).toContain('500 de Ouro creditado');
  });
  it('loading and error states', () => {
    expect(render({ phase: 'loading' })).toContain('Consultando o servidor');
    const err = render({ phase: 'error' });
    expect(err).toContain('Não foi possível consultar a tarefa');
    expect(err).toContain('Tentar de novo');
  });
  it('English renders too', () => {
    setLocale('en');
    const html = render(ready({ linked: true, verified: true, reward: 'pending', reward_amount: 500 }));
    expect(html).toContain('500 Gold when Season 1 opens');
  });
});

describe('texts', () => {
  it('every discord text exists in Portuguese and English with the same placeholders and no emoji', () => {
    const p = (pt as unknown as { discord: Record<string, string> }).discord;
    const e = (en as unknown as { discord: Record<string, string> }).discord;
    expect(Object.keys(e).sort()).toEqual(Object.keys(p).sort());
    for (const k of Object.keys(p)) {
      expect(typeof p[k], k).toBe('string');
      expect([...p[k]!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), k).toEqual([...e[k]!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
      expect(EMOJI.test(p[k]!) || EMOJI.test(e[k]!), k).toBe(false);
    }
    expect((pt as unknown as { quests: Record<string, string> }).quests.communityTab).toBeTruthy();
    expect((en as unknown as { quests: Record<string, string> }).quests.communityTab).toBeTruthy();
  });
});
