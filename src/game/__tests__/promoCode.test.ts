import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsModal from '../../components/SettingsModal';
import { defaultSave } from '../engine';
import { setPassSource } from '../entitlements';
import { UsernameContext } from '../usernameContext';
import { setLocale } from '../../locales';
import { looksLikePromoCode, normalizePromoInput, parsePromoResult, PROMO_CODE_RE, redeemPromoCode } from '../../lib/promo';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Settings > Código promocional (migration 0027 part C). The server decides; the game sends the text and tells the answer in plain words, online only, in both languages.
const rpc = (answer: { data?: unknown; error?: unknown }, spy = vi.fn()) => ({ rpc: async (name: string, args: unknown) => (spy(name, args), { data: answer.data ?? null, error: answer.error ?? null }) });

describe('what the player typed', () => {
  it('upper-cases and drops spaces and dashes', () => {
    expect(normalizePromoInput(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(normalizePromoInput('abc de\tfg-hjk')).toBe('ABCDEFGHJK');
  });
  it('a code is 10 characters of the unambiguous alphabet; nothing else leaves the device', () => {
    expect(looksLikePromoCode('abcde-fghjk')).toBe(true);
    expect(PROMO_CODE_RE.test('ABCDEFGHJK')).toBe(true);
    for (const bad of ['', 'abc', 'ABCDEFGHJK1', 'ABCDEFGHI0', 'ABCDEFGHJ', 'ABCDE FGHJK L', '<script>']) expect(looksLikePromoCode(bad), bad).toBe(false);
  });
});

describe('the server answer', () => {
  it('maps the seven known statuses; anything else is an error, never an accidental ok', () => {
    for (const s of ['ok', 'invalid', 'expired', 'exhausted', 'already_redeemed', 'already_has_pass', 'rate_limited']) expect(parsePromoResult({ status: s })).toBe(s);
    for (const bad of [null, undefined, 5, 'ok', [], {}, { status: 'granted' }, { status: 5 }, { ok: true }]) expect(parsePromoResult(bad), JSON.stringify(bad)).toBe('error');
  });
});

describe('redeemPromoCode', () => {
  it('sends the canonical code, and only that, to redeem_promo_code', async () => {
    const spy = vi.fn();
    expect(await redeemPromoCode(' abcde-fghjk ', rpc({ data: { status: 'ok', reward: 'pass', season: 1 } }, spy))).toBe('ok');
    expect(spy).toHaveBeenCalledWith('redeem_promo_code', { p_code: 'ABCDEFGHJK' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('a text that cannot be a code is invalid WITHOUT calling the server (it would only burn one of the ten hourly tries)', async () => {
    const spy = vi.fn();
    expect(await redeemPromoCode('hello', rpc({ data: { status: 'ok' } }, spy))).toBe('invalid');
    expect(spy).not.toHaveBeenCalled();
  });
  it('relays every refusal as it is', async () => {
    for (const s of ['invalid', 'expired', 'exhausted', 'already_redeemed', 'already_has_pass', 'rate_limited'] as const) {
      expect(await redeemPromoCode('ABCDEFGHJK', rpc({ data: { status: s } }))).toBe(s);
    }
  });
  it('no backend is offline; a failed call or a thrown one is an error, and it never throws', async () => {
    expect(await redeemPromoCode('ABCDEFGHJK', null)).toBe('offline');
    expect(await redeemPromoCode('ABCDEFGHJK', rpc({ error: { message: 'boom' } }))).toBe('error');
    expect(await redeemPromoCode('ABCDEFGHJK', { rpc: async () => Promise.reject(new Error('network')) })).toBe('error');
    expect(await redeemPromoCode('ABCDEFGHJK', rpc({ data: 'garbage' }))).toBe('error');
  });
});

describe('the Settings screen', () => {
  const noop = () => undefined;
  const props = { save: defaultSave(), audio: { music: 60, sfx: 40, musicMuted: false, sfxMuted: false }, onMusicVolume: noop, onSfxVolume: noop, onToggleMusicMute: noop, onToggleSfxMute: noop, onChangeLocale: noop, onReplayTutorial: noop, accountEmail: 'jhon@gmail.com', onSignOut: noop, onExportSave: noop, onImportSave: noop, onResetSave: noop, onMaterialPrefs: noop, onClose: noop };
  const render = (accountConfigured: boolean) => renderToStaticMarkup(h(UsernameContext.Provider, { value: 'jhon' }, h(SettingsModal, { ...props, accountConfigured } as never)));

  beforeEach(() => setLocale('pt'));
  afterEach(() => setPassSource('save'));

  it('online (an account, the server owns the Pass): the code box and its button are there, in Portuguese and in English', () => {
    setPassSource('server');
    const html = render(true);
    expect(html).toContain('data-settings="promo"');
    expect(html).toContain('Código promocional');
    expect(html).toContain('Tem um código?');
    expect(html).toContain('Resgatar');
    expect(html).toContain('autoCapitalize="characters"');
    setLocale('en');
    const english = render(true);
    expect(english).toContain('Promo code');
    expect(english).toContain('Redeem');
  });
  it('offline, the desktop build, or a build without accounts: no code box at all', () => {
    expect(render(true)).not.toContain('data-settings="promo"'); // pass source 'save' (no server)
    setPassSource('server');
    expect(render(false)).not.toContain('data-settings="promo"');
  });
  it('the screen asks the server through the lib only, shows the outcome by its data-outcome, and refreshes the Pass after an ok', () => {
    const src = readFileSync(resolve(__dirname, '../../components/SettingsModal.tsx'), 'utf8');
    expect(src).toContain("from '../lib/promo'");
    expect(src).toContain('onPromoRedeemed?.()');
    expect(src).not.toMatch(/localStorage|sessionStorage|deviceStorage/);
    const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(app).toMatch(/onPromoRedeemed=\{\(\) => \{[\s\S]*?recheckServerPass\(userId\)/);
  });
});

describe('texts', () => {
  const keys = (tree: unknown) => Object.keys((tree as { settings: Record<string, string> }).settings).filter((k) => k.startsWith('promo') || k === 'passSource_promo');
  it('every promo text exists in both languages with the same placeholders, and every outcome has one', () => {
    expect(keys(pt).sort()).toEqual(keys(en).sort());
    expect(keys(pt).length).toBeGreaterThanOrEqual(15);
    for (const k of keys(pt)) {
      const a = (pt.settings as Record<string, string>)[k];
      const b = (en.settings as Record<string, string>)[k];
      expect(a.trim(), k).not.toBe('');
      expect(b.trim(), k).not.toBe('');
      expect((a.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((b.match(/\{\w+\}/g) ?? []).sort());
    }
    for (const outcome of ['promoOk', 'promoInvalid', 'promoExpired', 'promoExhausted', 'promoAlreadyRedeemed', 'promoHasPass', 'promoRateLimited', 'promoOffline', 'promoError']) expect((pt.settings as Record<string, string>)[outcome], outcome).toBeTruthy();
  });
  it('the texts do not promise Gold or Éter (a code gives the Pass only)', () => {
    for (const k of keys(pt)) expect((pt.settings as Record<string, string>)[k], k).not.toMatch(/ouro|éter|ether|aether|gold/i);
    for (const k of keys(en)) expect((en.settings as Record<string, string>)[k], k).not.toMatch(/gold|aether/i);
  });
});
