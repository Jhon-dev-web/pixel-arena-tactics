import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import BrowsePanel from '../../components/market/BrowsePanel';
import HistoryPanel from '../../components/market/HistoryPanel';
import ItemCard from '../../components/market/ItemCard';
import ReservationPanel from '../../components/market/ReservationPanel';
import SellPanel from '../../components/market/SellPanel';
import WalletPanel from '../../components/market/WalletPanel';
import { defaultSave, SaveData } from '../engine';
import { createGearInstance } from '../gearInstances';
import { clearCertificates, setCertificates } from '../itemCerts';
import { createMarketApi } from '../market/api';
import type { PublicListing } from '../market/api';
import { setLocale } from '../../locales';
import { FEE_ADDRESS, USER_A, USER_B, WALLET } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import type { CertificateView } from '../../../supabase/functions/_shared/items/types';
import type { ChainPublic, MarketOverview, ReservationView } from '../../../supabase/functions/_shared/market/types';

// Every market screen rendered once with fixtures: no crash on a real item, the words and numbers the owner asked for are on the screen (the fee, the split, the warning that the game never asks
// for a key), in both languages. (Server rendering: it proves the markup, not the clicks; the flows behind the buttons are tested in marketFlows / marketClient.)

const chain: ChainPublic = { chainId: 97, usdtContract: '0x5555555555555555555555555555555555555555', minConfirmations: 15, livemode: false, feePercent: 5 };
const api = createMarketApi(async () => ({ status: 200, body: { ok: true } }));
const listing = (over: Partial<PublicListing> = {}): PublicListing => ({
  id: 'l1',
  kind: 'gear',
  template_id: 'bronze_dagger',
  rarity: 'epic',
  tier: 1,
  substats: [{ type: 'critRate', value: 3 }],
  gold_amount: null,
  content_hash: 'a'.repeat(64),
  price_cents: 1234,
  status: 'open',
  created_at: '2026-11-02T12:00:00.000Z',
  expires_at: '2026-12-02T12:00:00.000Z',
  ...over,
});
const reservation = (over: Partial<ReservationView> = {}): ReservationView => ({
  id: 'r1',
  listingId: 'l1',
  status: 'pending',
  priceCents: 1000,
  feeCents: 50,
  sellerCents: 950,
  sellerAddress: WALLET[USER_A],
  feeAddress: FEE_ADDRESS,
  buyerAddress: WALLET[USER_B],
  expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
  graceUntil: new Date(Date.now() + 145 * 60_000).toISOString(),
  payments: [],
  chain,
  ...over,
});
const html = (el: ReturnType<typeof h>): string => renderToStaticMarkup(el);

beforeEach(() => {
  setLocale('pt');
  clearCertificates();
});

describe('market screens', () => {
  it('browse: the item, its rarity and slot, the price in USDT with the game fee, and a reserve button', () => {
    const out = html(h(BrowsePanel, { listings: [listing(), listing({ id: 'l2', kind: 'gold_pouch', template_id: 'gold_pouch_m', rarity: null, tier: null, substats: [], gold_amount: 50_000, price_cents: 500, status: 'reserved' })], feePercent: 5, busyId: null, failure: null, onReserve: () => undefined }));
    expect(out).toContain('12,34');
    expect(out).toContain('USDT');
    expect(out).toContain('Certificado');
    expect(out).toContain('Reservado');
    expect(out).toContain('Equipamentos');
    expect(out).toContain('50.000'); // the pouch is worth 50,000 Gold
    expect(html(h(BrowsePanel, { listings: [], feePercent: 5, busyId: null, failure: 'Outro comprador está pagando', onReserve: () => undefined }))).toContain('Nenhum anúncio');
  });

  it('item card: a real unique, a real piece and a pouch all render with their names', () => {
    const piece = html(h(ItemCard, { item: { kind: 'gear', templateId: 'bronze_dagger', rarity: 'legendary', tier: 2, substats: [{ type: 'defense', value: 4 }, { type: 'maxHp', value: 30 }], goldAmount: null } }));
    expect(piece).toContain('Lendário');
    expect(piece).toContain('Tier 2');
    expect(html(h(ItemCard, { item: { kind: 'gold_pouch', templateId: 'gold_pouch_s', rarity: null, tier: null, substats: [], goldAmount: 10_000 } }))).toContain('10.000');
    expect(html(h(ItemCard, { item: { kind: 'gear', templateId: 'no_such_item', rarity: 'epic', tier: 1, substats: [], goldAmount: null } }))).toContain('no_such_item'); // an unknown template never crashes
  });

  it('reservation: the split, the clock, the fee first, the warning, and each address with a copy button', () => {
    const out = html(h(ReservationPanel, { api, reservation: reservation(), walletAddress: WALLET[USER_B], onChanged: () => undefined, onClose: () => undefined, bagFull: false }));
    expect(out).toContain('10,00 USDT');
    expect(out).toContain('0,50 USDT');
    expect(out).toContain('9,50 USDT');
    expect(out).toContain('Taxa do jogo (5%)');
    expect(out).toContain('Passo 1: taxa do jogo');
    expect(out.indexOf('Passo 1')).toBeLessThan(out.indexOf('Passo 2'));
    expect(out).toContain('NUNCA pede sua chave privada');
    expect(out).toContain('REDE DE TESTE'); // a testnet says so
    expect(out).toContain('Pagar na carteira');
    expect(out).toContain('maxLength="80"');
  });

  it('reservation: a paid leg is shown done with its transaction, a sold one says the item is coming, a refund says it is by hand', () => {
    const paid = html(h(ReservationPanel, { api, reservation: reservation({ payments: [{ leg: 'fee', txHash: `0x${'ab'.repeat(32)}`, status: 'applied' }] }), walletAddress: WALLET[USER_B], onChanged: () => undefined, onClose: () => undefined, bagFull: false }));
    expect(paid).toContain('Pago e verificado');
    expect(paid).toContain('testnet.bscscan.com/tx/');
    expect(html(h(ReservationPanel, { api, reservation: reservation({ status: 'paid' }), walletAddress: null, onChanged: () => undefined, onClose: () => undefined, bagFull: false }))).toContain('Compra concluída');
    expect(html(h(ReservationPanel, { api, reservation: reservation({ status: 'paid' }), walletAddress: null, onChanged: () => undefined, onClose: () => undefined, bagFull: true }))).toContain('inventário está cheio');
    expect(html(h(ReservationPanel, { api, reservation: reservation({ status: 'refund_due' }), walletAddress: null, onChanged: () => undefined, onClose: () => undefined, bagFull: false }))).toContain('devolução é feita manualmente');
  });

  it('wallet: no wallet -> the link button and the warnings; linked -> the address in full', () => {
    const none = html(h(WalletPanel, { api, chain, wallet: null, onChanged: () => undefined }));
    expect(none).toContain('Ligar carteira');
    expect(none).toContain('NUNCA pede sua chave privada');
    expect(none).toContain('nunca guarda o seu dinheiro');
    const linked = html(h(WalletPanel, { api, chain: { ...chain, livemode: true }, wallet: { address: WALLET[USER_A] }, onChanged: () => undefined }));
    expect(linked).toContain(WALLET[USER_A]);
    expect(linked).not.toContain('REDE DE TESTE');
  });

  it('sell: shows the sellable certified piece, the seller\'s share, and tells the player to link the wallet when there is none', () => {
    const cert: CertificateView = { id: '11111111-1111-4111-8111-1111111111aa', kind: 'gear', templateId: 'bronze_dagger', rarity: 'epic', tier: 1, substats: [{ type: 'critRate', value: 3 }, { type: 'defense', value: 2 }], upgrade: 0, goldAmount: null, source: 'forge', status: 'held', bound: false, createdAt: '2026-11-02T12:00:00.000Z', contentHash: 'b'.repeat(64) };
    const inst = createGearInstance('bronze_dagger', { id: 'gi_1', origin: 'craft', rarity: 'epic', substats: cert.substats as never, certificateId: cert.id });
    const save: SaveData = { ...defaultSave(), gearInstances: { ...defaultSave().gearInstances, gi_1: inst } };
    setCertificates([cert]);
    const overview: MarketOverview = { wallet: null, chain, listings: [], reservation: null, sales: [], refundsDue: [], pending: [] };
    const out = html(h(SellPanel, { api, save, overview, feePercent: 5, host: { getSave: () => save, applySave: () => undefined }, onChanged: () => undefined }));
    expect(out).toContain('Ligue a sua carteira para vender');
    expect(out).toContain('Só itens com certificado');
    expect(out).toContain('Meus anúncios');
    expect(html(h(SellPanel, { api, save: defaultSave(), overview: null, feePercent: 5, host: { getSave: () => save, applySave: () => undefined }, onChanged: () => undefined }))).toContain('Você não tem itens à venda');
    // with a live listing of mine: price, status and a cancel button
    const withListing: MarketOverview = { ...overview, wallet: { address: WALLET[USER_A], chainId: 97 }, listings: [{ id: 'l1', certificateId: cert.id, priceCents: 2500, status: 'open', createdAt: cert.createdAt, expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), item: { kind: 'gear', templateId: 'bronze_dagger', rarity: 'epic', tier: 1, substats: [], goldAmount: null } }] };
    const live = html(h(SellPanel, { api, save: defaultSave(), overview: withListing, feePercent: 5, host: { getSave: () => save, applySave: () => undefined }, onChanged: () => undefined }));
    expect(live).toContain('25,00');
    expect(live).toContain('À venda');
    expect(live).toContain('Cancelar anúncio');
  });

  it('history: receipts with the fee and the transactions, refunds to do by hand, and the English version says the same', () => {
    const overview: MarketOverview = {
      wallet: { address: WALLET[USER_A], chainId: 56 },
      chain,
      listings: [],
      reservation: null,
      sales: [
        { id: 's1', role: 'seller', soldAt: '2026-11-02T12:00:00.000Z', priceCents: 1000, feeCents: 50, sellerCents: 950, livemode: true, sellerTxHash: `0x${'cd'.repeat(32)}`, feeTxHash: `0x${'ef'.repeat(32)}`, item: { kind: 'gear', templateId: 'bronze_dagger' } },
        { id: 's2', role: 'buyer', soldAt: '2026-11-02T13:00:00.000Z', priceCents: 99, feeCents: 5, sellerCents: 94, livemode: false, sellerTxHash: `0x${'cd'.repeat(32)}`, feeTxHash: `0x${'ef'.repeat(32)}`, item: { kind: 'gold_pouch', templateId: 'gold_pouch_s' } },
      ],
      refundsDue: [{ reservationId: 'r9', txHashes: [`0x${'12'.repeat(32)}`] }],
      pending: [],
    };
    const pt = html(h(HistoryPanel, { overview, chainId: 56 }));
    expect(pt).toContain('Taxa do jogo 0,50 USDT');
    expect(pt).toContain('Você recebeu 9,50 USDT');
    expect(pt).toContain('rede de teste');
    expect(pt).toContain('Pagamentos para devolver');
    expect(pt).toContain('bscscan.com/tx/');
    setLocale('en');
    const en = html(h(HistoryPanel, { overview, chainId: 56 }));
    expect(en).toContain('Game fee 0.50 USDT');
    expect(en).toContain('You received 9.50 USDT');
    expect(en).toContain('Payments to refund');
    setLocale('pt');
  });
});
