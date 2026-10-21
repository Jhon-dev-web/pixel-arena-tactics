import { afterEach, describe, expect, it, vi } from 'vitest';

// <html lang> follows the chosen language (screen readers and the browser's "translate this page" offer read it).
describe('document language', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is set at load and on every language change', async () => {
    const doc = { documentElement: { lang: 'en' } };
    vi.stubGlobal('document', doc);
    const { setLocale } = await import('../../locales');
    setLocale('en');
    setLocale('pt');
    expect(doc.documentElement.lang).toBe('pt');
    setLocale('en');
    expect(doc.documentElement.lang).toBe('en');
  });
});
