import { useState } from 'react';
import { DataTable, ExportButton, Pager, type Column } from '../components/Table';
import { Card, ExternalLink, Field, Kpi, Notice, Pill } from '../components/ui';
import { hashParam, useApp, useAsync, useDebounced } from '../hooks';
import { dayEndIso, dayStartIso, defaultMarketQuery, EXPORT_PAGE_SIZE } from '../lib/filters';
import { DASH, fmtDateTime, fmtInt, fmtSol, humanize, shortAddress, shortId, solscanTx } from '../lib/format';
import { rarityLabel, statusLabel } from '../lib/labels';
import type { ListingRow, MarketPage, MarketQuery, MarketView, SaleRow } from '../lib/types';

const itemText = (r: { item_template: string | null; material_id: string | null; material_qty: number | null }): string => (r.material_id ? `${fmtInt(r.material_qty)} × ${humanize(r.material_id)}` : (r.item_template ?? DASH));

const SALE_COLUMNS: Column<SaleRow>[] = [
  { key: 'when', header: 'Quando', cell: (r) => fmtDateTime(r.sold_at) },
  { key: 'item', header: 'Item', cell: (r) => itemText(r) },
  { key: 'seller', header: 'Vendedor', cell: (r) => r.seller_username ?? shortId(r.seller_id) },
  { key: 'buyer', header: 'Comprador', cell: (r) => r.buyer_username ?? shortId(r.buyer_id) },
  { key: 'price', header: 'Preço', align: 'num', cell: (r) => fmtSol(r.price_lamports) },
  { key: 'fee', header: 'Taxa (5%)', align: 'num', cell: (r) => fmtSol(r.fee_lamports) },
  { key: 'seller_got', header: 'Vendedor recebeu', align: 'num', cell: (r) => fmtSol(r.seller_lamports) },
  { key: 'net', header: 'Rede', cell: (r) => (r.livemode ? <Pill tone="good">real</Pill> : <Pill tone="warn">teste</Pill>) },
  { key: 'tx', header: 'Transação', cell: (r) => <ExternalLink href={solscanTx(r.tx_signature, r.livemode)} title={r.tx_signature}><span className="mono">{shortAddress(r.tx_signature, 6, 6)}</span> ↗</ExternalLink> },
];

const listingTone = (s: string): 'good' | 'info' | 'warn' | 'bad' | undefined => (s === 'open' ? 'good' : s === 'reserved' ? 'info' : s === 'sold' ? undefined : s === 'cancelled' || s === 'expired' ? 'warn' : undefined);

const LISTING_COLUMNS: Column<ListingRow>[] = [
  { key: 'when', header: 'Criado', cell: (r) => fmtDateTime(r.created_at) },
  { key: 'item', header: 'Item', cell: (r) => <span>{itemText(r)}{r.rarity ? <div className="faint">{rarityLabel(r.rarity)}{r.tier ? ` · tier ${r.tier}` : ''}</div> : null}</span> },
  { key: 'seller', header: 'Vendedor', cell: (r) => r.seller_username ?? shortId(r.seller_id) },
  { key: 'price', header: 'Preço', align: 'num', cell: (r) => fmtSol(r.price_lamports) },
  { key: 'status', header: 'Estado', cell: (r) => <Pill tone={listingTone(r.status)}>{statusLabel(r.status)}</Pill> },
  { key: 'expires', header: 'Expira', cell: (r) => fmtDateTime(r.expires_at) },
  { key: 'closed', header: 'Encerrado', cell: (r) => fmtDateTime(r.closed_at) },
];

export default function MarketPageView() {
  const { api } = useApp();
  const [q, setQ] = useState<MarketQuery>(() => ({ ...defaultMarketQuery(), search: hashParam('q') }));
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const search = useDebounced(q.search, 350);
  const query: MarketQuery = { ...q, search, filters: { ...q.filters, from: dayStartIso(fromDay), to: dayEndIso(toDay) } };
  const data = useAsync((a) => a.market(query), [JSON.stringify(query)]);
  const setView = (view: MarketView) => setQ((s) => ({ ...s, view, page: 0, filters: { mode: 'all' } }));
  const totals = data.data?.totals;
  const isSales = q.view === 'sales';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mercado</h1>
          <p>Anúncios e vendas entre jogadores, em SOL, com a taxa do jogo e o link da transação na Solscan.</p>
        </div>
        <div className="head-actions">
          {isSales ? (
            <ExportButton<SaleRow>
              filename="mercado-vendas"
              pageSize={EXPORT_PAGE_SIZE}
              fetchPage={async (page) => (await api.market({ ...query, page, pageSize: EXPORT_PAGE_SIZE })) as MarketPage<SaleRow>}
              headers={['id', 'quando', 'vendedor', 'comprador', 'tipo', 'item', 'material', 'quantidade', 'preco_sol', 'taxa_sol', 'vendedor_recebeu_sol', 'real', 'assinatura']}
              toRow={(r) => [r.id, r.sold_at, r.seller_username ?? r.seller_id, r.buyer_username ?? r.buyer_id, r.item_kind, r.item_template, r.material_id, r.material_qty, r.price_lamports / 1e9, r.fee_lamports / 1e9, r.seller_lamports / 1e9, r.livemode, r.tx_signature]}
            />
          ) : (
            <ExportButton<ListingRow>
              filename="mercado-anuncios"
              pageSize={EXPORT_PAGE_SIZE}
              fetchPage={async (page) => (await api.market({ ...query, page, pageSize: EXPORT_PAGE_SIZE })) as MarketPage<ListingRow>}
              headers={['id', 'criado', 'vendedor', 'item', 'raridade', 'tier', 'material', 'quantidade', 'preco_sol', 'estado', 'expira', 'encerrado']}
              toRow={(r) => [r.id, r.created_at, r.seller_username ?? r.seller_id, r.item_template, r.rarity, r.tier, r.material_id, r.material_qty, r.price_lamports / 1e9, r.status, r.expires_at, r.closed_at]}
            />
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Vista">
          <button type="button" aria-pressed={isSales} onClick={() => setView('sales')}>
            Vendas
          </button>
          <button type="button" aria-pressed={!isSales} onClick={() => setView('listings')}>
            Anúncios
          </button>
        </div>
        <div className="grow">
          <Field label="Buscar">
            <input className="input" type="search" placeholder="jogador, item, material ou assinatura da transação" value={q.search} onChange={(e) => setQ((s) => ({ ...s, search: e.target.value, page: 0 }))} aria-label="Buscar no mercado" />
          </Field>
        </div>
        {isSales ? (
          <Field label="Rede">
            <select className="select" value={q.filters.mode ?? 'all'} onChange={(e) => setQ((s) => ({ ...s, page: 0, filters: { ...s.filters, mode: e.target.value as 'live' | 'test' | 'all' } }))}>
              <option value="all">Todas</option>
              <option value="live">Real (mainnet)</option>
              <option value="test">Teste (devnet)</option>
            </select>
          </Field>
        ) : (
          <Field label="Estado">
            <select className="select" value={q.filters.status ?? ''} onChange={(e) => setQ((s) => ({ ...s, page: 0, filters: { ...s.filters, status: e.target.value || undefined } }))}>
              <option value="">Todos</option>
              {['open', 'reserved', 'sold', 'cancelled', 'expired'].map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Tipo">
          <select className="select" value={q.filters.kind ?? ''} onChange={(e) => setQ((s) => ({ ...s, page: 0, filters: { ...s.filters, kind: (e.target.value || undefined) as 'item' | 'material' | undefined } }))}>
            <option value="">Todos</option>
            <option value="item">Itens</option>
            <option value="material">Materiais</option>
          </select>
        </Field>
        {isSales ? (
          <>
            <Field label="De">
              <input className="input" type="date" value={fromDay} onChange={(e) => { setFromDay(e.target.value); setQ((s) => ({ ...s, page: 0 })); }} />
            </Field>
            <Field label="Até">
              <input className="input" type="date" value={toDay} onChange={(e) => { setToDay(e.target.value); setQ((s) => ({ ...s, page: 0 })); }} />
            </Field>
          </>
        ) : null}
      </div>

      {totals ? (
        <div className="kpis" style={{ marginBottom: 12 }}>
          <Kpi label={isSales ? 'Vendas no filtro' : 'Anúncios no filtro'} value={fmtInt(totals.count)} />
          {isSales ? (
            <>
              <Kpi label="Volume" value={fmtSol(totals.volume_lamports ?? 0, 3)} sub={`${fmtInt(totals.buyers ?? 0)} compradores · ${fmtInt(totals.sellers ?? 0)} vendedores`} />
              <Kpi label="Taxas do jogo" value={fmtSol(totals.fee_lamports ?? 0, 4)} tone="good" />
            </>
          ) : (
            <Kpi label="Preço dos abertos" value={fmtSol(totals.open_price_lamports ?? 0, 3)} sub="soma dos anúncios abertos ou reservados" />
          )}
        </div>
      ) : null}

      {data.error ? <Notice tone="bad">Não foi possível carregar: {data.error}</Notice> : null}
      <Card flush>
        {isSales ? (
          <DataTable caption="Vendas do mercado" columns={SALE_COLUMNS} rows={(data.data?.view === 'sales' ? (data.data.rows as SaleRow[]) : [])} rowKey={(r) => r.id} loading={data.loading} empty="Nenhuma venda com esses filtros." />
        ) : (
          <DataTable caption="Anúncios do mercado" columns={LISTING_COLUMNS} rows={(data.data?.view === 'listings' ? (data.data.rows as ListingRow[]) : [])} rowKey={(r) => r.id} loading={data.loading} empty="Nenhum anúncio com esses filtros." />
        )}
        <Pager page={q.page} total={data.data?.total ?? 0} size={q.pageSize} onPage={(page) => setQ((s) => ({ ...s, page }))} />
      </Card>
      <p className="faint" style={{ marginTop: 10 }}>
        Preços em SOL (1 SOL = 1.000.000.000 lamports). Vendas de teste (devnet) não são dinheiro real e ficam fora dos totais da tela Hoje. O link abre a Solscan, um site externo.
      </p>
    </>
  );
}
