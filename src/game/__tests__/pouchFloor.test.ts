import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { OfferForm, SellFlowProps, useSellFlow } from '../../components/market/SellPanel';
import { listFailureText, pouchStartPrice } from '../../components/market/listFailure';
import { setLocale } from '../../locales';
import { POUCH_FLOOR_USD_MICRO_PER_1000_GOLD, pouchFloorLamports } from '../../../supabase/functions/_shared/chain/solMoney';
import { POUCH_TABLE } from '../../../supabase/functions/_shared/items/tables';
import { USER_A, makeMarket } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import { defaultSave, SaveData } from '../engine';
import { LEGACY_POUCH_FACES, pouchFace } from '../goldPouch';
import { clearCertificates, setCertificates } from '../itemCerts';
import { MarketApi, MarketFn, createMarketApi } from '../market/api';
import { SellableEntry, sellableEntries } from '../market/items';
import { pouchFloorOf, pouchFloorUsd } from '../market/pouchFloor';
import { listForSale } from '../market/sync';
import type { CertificateView } from '../../../supabase/functions/_shared/items/types';
import type { MarketOverview } from '../../../supabase/functions/_shared/market/types';

// The Gold Pouch price floor on the game's side (owner decision 2026-10-22): US$ 0.25 per 1,000 Gold, in SOL at the server's rate. The constant lives on the server file the game imports; these tests pin the three
// pouch faces of the game, the three of the server tables and the old faces to the dollar amounts the owner named.

beforeEach(() => {
  setLocale('pt');
  clearCertificates();
});

const pouchEntry = (gold: number, id = `c${gold}`): SellableEntry => ({ kind: 'gold_pouch', certificateId: id, pouchId: 'gold_pouch_s', goldAmount: gold });

describe('the constant and the dollar amounts', () => {
  it('US$ 0.25 per 1,000 Gold: small US$ 0.50, medium US$ 1.25, large US$ 5.00, in the game and in the server tables', () => {
    expect(POUCH_FLOOR_USD_MICRO_PER_1000_GOLD).toBe(250_000);
    expect((['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l'] as const).map((id) => pouchFloorUsd(pouchFace(id)))).toEqual([0.5, 1.25, 5]);
    expect(Object.values(POUCH_TABLE.faces).map(pouchFloorUsd)).toEqual([0.5, 1.25, 5]);
    expect(Object.values(LEGACY_POUCH_FACES).map(pouchFloorUsd)).toEqual([2.5, 12.5, 25]);
  });

  it('the client reads the SAME sum as the server (one function, one file)', () => {
    expect(pouchFloorOf([pouchEntry(2000)], 150)?.lamports).toBe(pouchFloorLamports(2000, 150));
    expect(pouchFloorOf([pouchEntry(2000)], 150)?.lamports).toBe(4_000_000);
  });
});

describe('pouchFloorOf', () => {
  it('is null when nothing is a pouch, and uses the HIGHEST face when pouches of different faces are listed at one price', () => {
    expect(pouchFloorOf([], 150)).toBeNull();
    expect(pouchFloorOf([{ kind: 'gear', certificateId: 'x' } as unknown as SellableEntry], 150)).toBeNull();
    expect(pouchFloorOf([pouchEntry(2000), pouchEntry(10_000)], 100)).toEqual({ lamports: 25_000_000, usd: 2.5 });
  });

  it('keeps the dollar amount and has no SOL amount when the server sent no price', () => {
    expect(pouchFloorOf([pouchEntry(5000)], null)).toEqual({ lamports: null, usd: 1.25 });
  });

  it('the price box starts at the floor (both languages), or empty without a rate', () => {
    expect(pouchStartPrice([pouchEntry(2000)], 150)).toBe('0,004');
    setLocale('en');
    expect(pouchStartPrice([pouchEntry(2000)], 150)).toBe('0.004');
    expect(pouchStartPrice([pouchEntry(2000)], null)).toBe('');
  });
});

describe('the refusal messages', () => {
  it('below_pouch_floor names the floor from the server, in pt and en', () => {
    expect(listFailureText('below_pouch_floor', 4_000_000)).toContain('0,004 SOL');
    setLocale('en');
    expect(listFailureText('below_pouch_floor', 4_000_000)).toContain('0.004 SOL');
    expect(listFailureText('below_pouch_floor')).toBe(listFailureText('price'));
  });

  it('pouch_rate_unavailable says to try again and that the pouch stays; unknown reasons stay generic', () => {
    expect(listFailureText('pouch_rate_unavailable')).toContain('Tente de novo');
    setLocale('en');
    expect(listFailureText('pouch_rate_unavailable')).toContain('Try again');
    expect(listFailureText('who_knows')).toBe(listFailureText('generic'));
  });
});

// ---- the form (rendered at its starting state) and the real handler ----

const cert = (gold: number): CertificateView => ({
  id: '11111111-1111-4111-8111-1111111111bb',
  kind: 'gold_pouch',
  templateId: 'gold_pouch_s',
  rarity: null,
  tier: null,
  substats: [],
  upgrade: 0,
  goldAmount: gold,
  source: 'pouch',
  status: 'held',
  bound: false,
  createdAt: '2026-11-02T12:00:00.000Z',
  contentHash: 'c'.repeat(64),
});
const saveWithPouch = (c: CertificateView): SaveData => ({ ...defaultSave(), consumables: { ...defaultSave().consumables, gold_pouch_s: 1 }, pouchCerts: { gold_pouch_s: [c.id] } });
const overview: MarketOverview = { wallet: { address: 'x', chainId: 502 }, chain: null, listings: [], reservation: null, sales: [], refundsDue: [], pending: [], solUsd: 150 };
const api = createMarketApi(async () => ({ status: 200, body: { ok: true } }));

function Form(props: SellFlowProps) {
  const flow = useSellFlow(props);
  return h(OfferForm, { flow });
}
const form = (solUsd: number | null, gold = 2000): string => {
  const c = cert(gold);
  setCertificates([c]);
  const save = saveWithPouch(c);
  return renderToStaticMarkup(h(Form, { api, save, overview, feePercent: 5, solUsd, host: { getSave: () => save, applySave: () => undefined }, onChanged: () => undefined, initialPicked: 'gold_pouch_s' }));
};
const publishDisabled = (out: string): boolean => /<button[^>]*disabled=""[^>]*>[^<]*(Publicar oferta|Publish offer)/.test(out);

describe('the offer form for a Gold Pouch', () => {
  it('shows "Preço mínimo: X SOL (cerca de US$ Y)" and the box is pre-filled with the floor', () => {
    const out = form(150);
    expect(out).toContain('Preço mínimo: 0,004 SOL (cerca de US$ 0,50)');
    expect(out).toContain('value="0,004"');
    expect(out).toContain('Entre 0,004 e'); // the price hint starts at the floor, not at 0.001
    expect(out).not.toContain('Abaixo do mínimo');
    expect(publishDisabled(out)).toBe(false);
    setLocale('en');
    const en = form(150, 10_000); // an old-face pouch: the same per-1,000 rule
    expect(en).toContain('Minimum price: 0.017 SOL (about US$ 2.50)');
    expect(en).toContain('value="0.017"');
  });

  it('without a SOL price the floor is shown in dollars, the box stays empty and the button is blocked', () => {
    const out = form(null);
    expect(out).toContain('Preço mínimo: US$ 0,50, pago em SOL');
    expect(out).toContain('value=""');
    expect(publishDisabled(out)).toBe(true);
  });
});

describe('the refusal reaches the game from the real handler', () => {
  it('listForSale hands back the floor when the price is below it, and the pouch stays in the save', async () => {
    const m = makeMarket();
    m.link(USER_A);
    m.usd.value = 150;
    const c = m.store.addCert(USER_A, { kind: 'gold_pouch', templateId: 'gold_pouch_s', rarity: null, tier: null, substats: [], goldAmount: 2000, source: 'pouch' });
    const save = saveWithPouch(c);
    setCertificates([c]);
    const run = async (fn: MarketFn, body: object) => (fn === 'market-list' ? m.list(body, USER_A) : { status: 404, body: {} });
    const myApi: MarketApi = createMarketApi(run);
    let current = save;
    const deps = { api: myApi, getSave: () => current, applySave: (s: SaveData) => void (current = s) };
    const entry = sellableEntries(save)[0];
    const refused = await listForSale(deps, entry, c, 3_000_000);
    expect(refused).toEqual({ ok: false, reason: 'below_pouch_floor', floorLamports: 4_000_000 });
    expect(current).toBe(save);
    expect(listFailureText('below_pouch_floor', 4_000_000)).toContain('0,004 SOL');
    const ok = await listForSale(deps, entry, c, 4_000_000);
    expect(ok.ok).toBe(true);
  });
});
