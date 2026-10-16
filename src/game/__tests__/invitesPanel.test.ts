import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import InvitesPanel, { InvitesView } from '../../components/InvitesPanel';
import SettingsModal from '../../components/SettingsModal';
import { defaultSave } from '../engine';
import { UsernameContext } from '../usernameContext';
import { setLocale } from '../../locales';
import { DEFAULT_REFERRAL_TIERS, parseReferralStatus } from '../../lib/referral';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Settings > Convites in its four states (nothing earned / some earned / all earned / offline) plus the states of the read itself.
const granted = (kind: string, ref: string, metric: string, min: number) => ({ kind, ref, metric, min_count: min, granted_at: '2026-10-10T10:00:00Z', label_pt: ref, label_en: ref });
const ready = (raw: Record<string, unknown>) => ({ phase: 'ready' as const, status: parseReferralStatus(raw)!, tiers: [...DEFAULT_REFERRAL_TIERS] });
const view = (state: Parameters<typeof InvitesView>[0]['state'], link: string | null = null) => renderToStaticMarkup(h(InvitesView, { state, link, onCopy: () => undefined, onRetry: () => undefined }));
const earnedRefs = (html: string): string[] => [...html.matchAll(/data-tier="([a-z_]+)" data-earned="true"/g)].map((m) => m[1]);
const lockedRefs = (html: string): string[] => [...html.matchAll(/data-tier="([a-z_]+)" data-earned="false"/g)].map((m) => m[1]);

beforeEach(() => setLocale('pt'));

describe('the Convites panel', () => {
  it('none: no link to give (the e-mail is not on the waitlist), a line saying where to get one, zero counters and every tier still to earn', () => {
    const html = view(ready({ code: null, qualified: 0, paying: 0, pass_goal: 10, rewards: [] }));
    expect(html).toContain('data-settings="invites"');
    expect(html).toContain('data-testid="invite-no-code"');
    expect(html).toContain('lista de espera');
    expect(html).not.toContain('data-testid="invite-link"');
    expect(html).toContain('Convites ativos: 0 · Compraram o Passe: 0 de 10');
    expect(earnedRefs(html)).toEqual([]);
    expect(lockedRefs(html)).toEqual(['recruiter', 'portrait_frame_recruiter', 'adventurer_pass', 'recruitment_legend']);
    expect(html).not.toContain('✓');
  });

  it('some: the code (the link when the portal address is configured), the counters, a check on exactly the tiers the server granted', () => {
    const raw = { code: 'K7M2QXA9RB', qualified: 3, paying: 4, pass_goal: 10, rewards: [granted('title', 'recruiter', 'qualified', 1), granted('cosmetic', 'portrait_frame_recruiter', 'qualified', 3)] };
    const html = view(ready(raw));
    expect(html).toContain('data-testid="invite-link"');
    expect(html).toContain('K7M2QXA9RB');
    expect(html).toContain('Convites ativos: 3 · Compraram o Passe: 4 de 10');
    expect(earnedRefs(html)).toEqual(['recruiter', 'portrait_frame_recruiter']);
    expect(lockedRefs(html)).toEqual(['adventurer_pass', 'recruitment_legend']);
    expect(html.match(/✓/g)).toHaveLength(2);
    expect(html).toContain('Título: Recrutador');
    expect(html).toContain('Moldura de retrato: Recrutador');
    // with a portal configured the player sees the whole link, not the bare code
    const linked = view(ready(raw), 'https://arena.example/?ref=K7M2QXA9RB');
    expect(linked).toContain('https://arena.example/?ref=K7M2QXA9RB');
    expect(linked).toContain('Seu link de convite');
    expect(html).toContain('Seu código de convite');
  });

  it('all earned: every tier is checked and none is left to earn', () => {
    const html = view(
      ready({
        code: 'K7M2QXA9RB',
        qualified: 27,
        paying: 10,
        pass_goal: 10,
        rewards: [granted('title', 'recruiter', 'qualified', 1), granted('cosmetic', 'portrait_frame_recruiter', 'qualified', 3), granted('pass', 'adventurer_pass', 'paying', 10), granted('title', 'recruitment_legend', 'qualified', 25)],
      }),
    );
    expect(earnedRefs(html)).toEqual(['recruiter', 'portrait_frame_recruiter', 'adventurer_pass', 'recruitment_legend']);
    expect(lockedRefs(html)).toEqual([]);
    expect(html).toContain('Convites ativos: 27 · Compraram o Passe: 10 de 10');
    expect(html).toContain('Passe de Aventureiro grátis');
  });

  it('offline (no account / the desktop build): the panel is not there, neither alone nor inside the Settings screen', () => {
    expect(renderToStaticMarkup(h(InvitesPanel, { online: false }))).toBe('');
    const noop = () => undefined;
    const props = { save: defaultSave(), audio: { music: 60, sfx: 40, musicMuted: false, sfxMuted: false }, onMusicVolume: noop, onSfxVolume: noop, onToggleMusicMute: noop, onToggleSfxMute: noop, onChangeLocale: noop, onReplayTutorial: noop, accountEmail: null, onSignOut: noop, onExportSave: noop, onImportSave: noop, onResetSave: noop, onMaterialPrefs: noop, onClose: noop };
    const offline = renderToStaticMarkup(h(UsernameContext.Provider, { value: null }, h(SettingsModal, { ...props, accountConfigured: false } as never)));
    expect(offline).not.toContain('data-settings="invites"');
    expect(offline).not.toContain('Convites');
    const online = renderToStaticMarkup(h(UsernameContext.Provider, { value: 'jhon' }, h(SettingsModal, { ...props, accountConfigured: true, accountEmail: 'jhon@gmail.com' } as never)));
    expect(online).toContain('data-settings="invites"');
    expect(online).toContain('Carregando seus convites');
  });

  it('while the read is running or when it failed it says so, and offers a retry only for the failure', () => {
    expect(view({ phase: 'loading' })).toContain('Carregando seus convites');
    const failed = view({ phase: 'error' });
    expect(failed).toContain('Não foi possível carregar seus convites');
    expect(failed).toContain('Tentar de novo');
    expect(view({ phase: 'loading' })).not.toContain('Tentar de novo');
  });

  it('has the same texts in Portuguese and English, and the counters line asks for every number it prints', () => {
    const keys = Object.keys(pt.settings).filter((k) => k.startsWith('invites') || k === 'passSource_referral');
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const k of keys) {
      const a = (pt.settings as Record<string, string>)[k];
      const b = (en.settings as Record<string, string>)[k];
      expect(b, k).toBeTruthy();
      expect((a.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((b.match(/\{\w+\}/g) ?? []).sort());
    }
    setLocale('en');
    const html = view(ready({ code: 'K7M2QXA9RB', qualified: 1, paying: 0, pass_goal: 10, rewards: [granted('title', 'recruiter', 'qualified', 1)] }));
    expect(html).toContain('Active invites: 1 · Bought the Pass: 0 of 10');
    expect(html).toContain('Title: Recruiter');
    expect(html).toContain('Earned');
  });
});
