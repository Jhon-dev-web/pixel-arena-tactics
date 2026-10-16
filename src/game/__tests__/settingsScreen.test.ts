import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import SettingsModal from '../../components/SettingsModal';
import { defaultSave } from '../engine';
import { UsernameContext } from '../usernameContext';
import { setLocale } from '../../locales';
import { maskEmail } from '../../lib/maskEmail';
import { cleanEmail, safeHttpsUrl, SUPPORT } from '../../lib/supportConfig';
import { applyMotionPref, manualReduceMotion, reducedMotion, setManualReduceMotion } from '../../lib/motionPref';

// The Settings screen: grouped in panels, the account shown masked, the Pass read-only, the support / legal items only when configured, and the pt / en texts of every group.
const noop = () => undefined;
const props = (over: Record<string, unknown> = {}) => ({
  save: defaultSave(),
  audio: { music: 60, sfx: 40, musicMuted: false, sfxMuted: false },
  onMusicVolume: noop,
  onSfxVolume: noop,
  onToggleMusicMute: noop,
  onToggleSfxMute: noop,
  onChangeLocale: noop,
  onReplayTutorial: noop,
  accountConfigured: true,
  accountEmail: 'jhonatan@gmail.com',
  onSignOut: noop,
  onExportSave: noop,
  onImportSave: noop,
  onResetSave: noop,
  onMaterialPrefs: noop,
  onClose: noop,
  ...over,
});
const render = (over: Record<string, unknown> = {}, username: string | null = 'jhon') =>
  renderToStaticMarkup(h(UsernameContext.Provider, { value: username }, h(SettingsModal, props(over) as never)));

beforeEach(() => setLocale('pt'));

describe('the account panel', () => {
  it('masks the e-mail, shows the username and offers sign out and the account-deletion note', () => {
    const html = render();
    expect(html).toContain('data-settings="account"');
    expect(html).toContain('j*******@gmail.com');
    expect(html).not.toContain('jhonatan@gmail.com');
    expect(html).toContain('jhon');
    expect(html).toContain('Sair');
    expect(html).toContain('Excluir minha conta');
  });

  it('without an account (local only) it says so and shows no e-mail, sign out or deletion', () => {
    const html = render({ accountConfigured: false, accountEmail: null });
    expect(html).toContain('Conta online ainda não conectada');
    expect(html).not.toContain('Excluir minha conta');
    expect(html).not.toContain('masked-email');
  });

  it('maskEmail keeps the first letter and the domain, and never the whole name', () => {
    expect(maskEmail('jhonatan@gmail.com')).toBe('j*******@gmail.com');
    expect(maskEmail('ab@x.io')).toBe('a***@x.io');
    expect(maskEmail('no-at-sign')).toBe('n***');
    expect(maskEmail('')).toBe('***');
  });
});

describe('the Pass panel', () => {
  it('says whether the Pass is owned (read-only: no buy or change button)', () => {
    const html = render();
    expect(html).toContain('data-settings="pass"');
    expect(html).toContain('Passe de Aventureiro');
    expect(html).toContain('Não ativo');
    const owned = render({ save: { ...defaultSave(), hasBattlePass: true } });
    expect(owned).toContain('Ativo, permanente');
    expect(owned).toContain('Neste aparelho');
  });
});

describe('the game panel', () => {
  it('has language, the two audio channels, reduced motion and the tradeable-material order (online only)', () => {
    const online = render();
    expect(online).toContain('data-settings="game"');
    expect(online).toContain('Idioma');
    expect(online).toContain('Música');
    expect(online).toContain('Efeitos');
    expect(online).toContain('Reduzir animações');
    expect(online).toContain('data-settings="tradeable"');
    expect(online).toContain('Gastar os negociáveis antes dos comuns');
    expect(render({ accountConfigured: false, accountEmail: null })).not.toContain('data-settings="tradeable"');
  });
});

describe('data, support and about', () => {
  it('keeps export, import and reset, the error report copy and the game version', () => {
    const html = render();
    expect(html).toContain('data-settings="data"');
    expect(html).toContain('Exportar save');
    expect(html).toContain('Importar save');
    expect(html).toContain('Reiniciar save');
    expect(html).toContain('data-settings="error-report"');
    expect(html).toContain('Copiar relatório de erro');
    expect(html).toContain('data-settings="about"');
    expect(html).toContain('Versão');
  });

  it('shows no support e-mail and no legal links while the owner has not configured them (the shipped default)', () => {
    expect(SUPPORT).toEqual({ supportEmail: null, termsUrl: null, privacyUrl: null, refundUrl: null, portalUrl: null });
    const html = render();
    expect(html).not.toContain('data-settings="legal"');
    expect(html).not.toContain('data-settings="support-email"');
    expect(html).not.toContain('mailto:');
  });

  it('only a real https link or a real address counts as configured', () => {
    expect(safeHttpsUrl('https://example.com/terms')).toBe('https://example.com/terms');
    expect(safeHttpsUrl('http://example.com')).toBeNull();
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('')).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
    expect(cleanEmail(' help@example.com ')).toBe('help@example.com');
    expect(cleanEmail('not an address')).toBeNull();
    expect(cleanEmail(null)).toBeNull();
  });

  it('a wallet panel is shown only when it is handed in (the web build with the market on)', () => {
    expect(render()).not.toContain('data-settings="wallet"');
    expect(render({ walletSlot: h('section', { 'data-settings': 'wallet' }, 'w') })).toContain('data-settings="wallet"');
  });
});

describe('both languages', () => {
  it('has every group title in English too', () => {
    setLocale('en');
    const html = render();
    for (const word of ['Account', 'Adventurer Pass', 'Game', 'Support', 'About', 'Reduce motion', 'Delete my account', 'Version']) expect(html).toContain(word);
    setLocale('pt');
  });
});

describe('reduced motion', () => {
  it('is off by default, and the manual switch is remembered and read back', () => {
    expect(manualReduceMotion()).toBe(false);
    expect(reducedMotion()).toBe(false);
    setManualReduceMotion(true);
    expect(manualReduceMotion()).toBe(true);
    expect(reducedMotion()).toBe(true);
    setManualReduceMotion(false);
    expect(reducedMotion()).toBe(false);
    expect(() => applyMotionPref()).not.toThrow();
  });
});
