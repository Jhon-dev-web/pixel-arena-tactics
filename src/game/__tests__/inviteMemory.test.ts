import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureInvite, clearPendingInvite, pendingInvite } from '../../lib/inviteMemory';
import { shareLinks } from '../../lib/referral';

// The invite code of a link lives in MEMORY only (owner rule: nothing is saved in the browser).
afterEach(() => {
  clearPendingInvite();
  vi.restoreAllMocks();
});

describe('reading ?ref= into memory', () => {
  it('keeps a well-formed code, takes it out of the address and never touches storage', () => {
    const local = [vi.spyOn(localStorage, 'setItem'), vi.spyOn(localStorage, 'getItem'), vi.spyOn(localStorage, 'removeItem')];
    const session = typeof sessionStorage === 'undefined' ? [] : [vi.spyOn(sessionStorage, 'setItem'), vi.spyOn(sessionStorage, 'getItem'), vi.spyOn(sessionStorage, 'removeItem')];
    let replaced = '';
    expect(captureInvite('https://play.example/game?x=1&ref=k7m2qxa9rb#top', (u) => (replaced = u))).toBe('K7M2QXA9RB');
    expect(pendingInvite()).toBe('K7M2QXA9RB');
    expect(replaced).toBe('/game?x=1#top');
    for (const spy of [...local, ...session]) expect(spy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('also reads ?invite=, ignores a malformed code (but still cleans the address) and a link without one', () => {
    let replaced: string | null = null;
    expect(captureInvite('https://play.example/?invite=K7M2QXA9RB', (u) => (replaced = u))).toBe('K7M2QXA9RB');
    expect(replaced).toBe('/');
    clearPendingInvite();
    replaced = null;
    expect(captureInvite('https://play.example/?ref=ILLEGAL000', (u) => (replaced = u))).toBeNull();
    expect(pendingInvite()).toBeNull();
    expect(replaced).toBe('/');
    replaced = null;
    expect(captureInvite('https://play.example/?comprar=passe', (u) => (replaced = u))).toBeNull();
    expect(replaced).toBeNull();
    expect(captureInvite('not a url', () => undefined)).toBeNull();
  });

  it('share links carry the link and use no script', () => {
    const links = shareLinks('Come play', 'https://play.example/?ref=K7M2QXA9RB');
    expect(links.map((l) => l.key)).toEqual(['whatsapp', 'x', 'telegram']);
    for (const l of links) expect(decodeURIComponent(l.href)).toContain('K7M2QXA9RB');
  });
});
