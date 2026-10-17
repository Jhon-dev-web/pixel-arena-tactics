import { LineChart } from '../components/Charts';
import { DataTable, type Column } from '../components/Table';
import { Bars, Card, Icon, Kpi, Notice, SectionTitle, Skeleton } from '../components/ui';
import { useAsync } from '../hooks';
import { materialsTotal, summarizeItems } from '../lib/aggregate';
import { fmtAgo, fmtDay, fmtGold, fmtInt, fmtPercent, fmtSol, humanize } from '../lib/format';
import { kindLabel, rarityLabel, statusLabel } from '../lib/labels';
import type { Economy, ItemGroup, MaterialRow } from '../lib/types';

const MATERIAL_COLUMNS: Column<MaterialRow>[] = [
  { key: 'm', header: 'Material', cell: (r) => humanize(r.material_id) },
  { key: 'q', header: 'Nos saldos', align: 'num', cell: (r) => fmtInt(r.qty) },
  { key: 'p', header: 'A entregar', align: 'num', cell: (r) => fmtInt(r.pending) },
  { key: 'l', header: 'Em anúncios', align: 'num', cell: (r) => fmtInt(r.listed) },
  { key: 't', header: 'Total', align: 'num', cell: (r) => fmtInt(Number(r.qty) + Number(r.listed)) },
  { key: 'h', header: 'Donos', align: 'num', cell: (r) => (r.holders == null ? '—' : fmtInt(r.holders)) },
];

interface ItemRow {
  key: string;
  label: string;
  held: number;
  listed: number;
  transferred: number;
  burned: number;
  revoked: number;
  bought: number;
}

function itemRows(groups: ItemGroup[]): ItemRow[] {
  const map = new Map<string, ItemRow>();
  for (const g of groups) {
    const key = `${g.kind}|${g.rarity ?? ''}`;
    const row = map.get(key) ?? { key, label: g.rarity ? `${kindLabel(g.kind)} · ${rarityLabel(g.rarity)}` : kindLabel(g.kind), held: 0, listed: 0, transferred: 0, burned: 0, revoked: 0, bought: 0 };
    if (g.status === 'held') row.held += g.count;
    else if (g.status === 'listed') row.listed += g.count;
    else if (g.status === 'transferred') row.transferred += g.count;
    else if (g.status === 'burned') row.burned += g.count;
    else if (g.status === 'revoked') row.revoked += g.count;
    if (g.bought) row.bought += g.count;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const ITEM_COLUMNS: Column<ItemRow>[] = [
  { key: 'l', header: 'Item', cell: (r) => r.label },
  { key: 'h', header: statusLabel('held'), align: 'num', cell: (r) => fmtInt(r.held) },
  { key: 'li', header: statusLabel('listed'), align: 'num', cell: (r) => fmtInt(r.listed) },
  { key: 't', header: 'Vendidos (cópia ao comprador)', align: 'num', cell: (r) => fmtInt(r.transferred) },
  { key: 'b', header: 'Compradas', align: 'num', cell: (r) => fmtInt(r.bought) },
  { key: 'bu', header: statusLabel('burned'), align: 'num', cell: (r) => fmtInt(r.burned) },
  { key: 'r', header: statusLabel('revoked'), align: 'num', cell: (r) => fmtInt(r.revoked) },
];

export default function EconomyPage() {
  const eco = useAsync((api) => api.economy(), []);
  const now = Date.now();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Economia</h1>
          <p>O que está em circulação: ouro, Bolsas de Ouro, materiais negociáveis e itens certificados.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={eco.reload} disabled={eco.loading}>
            <Icon name="refresh" />
            Atualizar
          </button>
        </div>
      </div>
      {eco.error ? <Notice tone="bad">Não foi possível carregar: {eco.error}</Notice> : null}
      {!eco.data ? <Skeleton height={260} /> : <Body e={eco.data} now={now} />}
    </>
  );
}

function Body({ e, now }: { e: Economy; now: number }) {
  const g = e.gold_latest;
  const items = summarizeItems(e.items);
  const rows = itemRows(e.items);
  const series = e.gold_series;
  const labels = series.map((d) => fmtDay(d.day));
  return (
    <>
      <SectionTitle>Ouro nos saves</SectionTitle>
      {!g ? (
        <Notice tone="warn">Ainda não há agregado de ouro. Rode a rotina arena_private.admin_refresh_aggregates() (docs/ADMIN.md, seção 4); depois ela roda sozinha pelo pg_cron.</Notice>
      ) : (
        <>
          <div className="kpis">
            <Kpi label="Ouro total declarado" value={fmtGold(g.gold_total)} sub={`${fmtInt(g.accounts)} contas · ${fmtAgo(g.captured_at, now)}`} />
            <Kpi label="Média por conta" value={fmtGold(g.gold_avg)} sub={`mediana ${fmtGold(g.gold_median)}`} />
            <Kpi label="Top 10% das contas" value={fmtGold(g.gold_p90)} sub="a partir deste valor (percentil 90)" />
            <Kpi label="Maior saldo" value={fmtGold(g.gold_max)} />
            <Kpi label="10 mais ricos" value={fmtPercent(g.top10_share, 1)} sub="parte do ouro total" />
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <Card title="Ouro total ao longo do tempo" note="um ponto por dia">
              <LineChart label="Ouro total declarado pelos saves por dia" labels={labels} axis={(n) => fmtInt(n / 1000) + ' mil'} tip={fmtGold} series={[{ name: 'Ouro total', tone: 2, values: series.map((d) => Number(d.gold_total)) }]} />
            </Card>
            <Card title="Maiores saldos" note="declarado pelos saves">
              <DataTable
                caption="Maiores saldos de ouro"
                columns={[
                  { key: 'u', header: 'Jogador', cell: (r) => r.username ?? '—' },
                  { key: 'l', header: 'Nível', align: 'num', cell: (r) => (r.hero_level == null ? '—' : r.hero_level) },
                  { key: 'g', header: 'Ouro', align: 'num', cell: (r) => fmtGold(r.gold) },
                ]}
                rows={e.gold_top}
                rowKey={(r) => r.user_id}
              />
            </Card>
          </div>
        </>
      )}

      <SectionTitle>Bolsas de Ouro</SectionTitle>
      <div className="kpis">
        <Kpi label="Em circulação" value={fmtInt(e.pouches.outstanding)} sub={`${fmtGold(e.pouches.outstanding_gold)} de ouro em face`} />
        <Kpi label="À venda" value={fmtInt(e.pouches.listed)} />
        <Kpi label="Criadas" value={fmtInt(e.pouches.minted)} sub={`${fmtGold(e.pouches.minted_gold)} de ouro em face`} />
        <Kpi label="Abertas" value={fmtInt(e.pouches.opened)} sub={`${fmtGold(e.pouches.opened_gold)} de ouro devolvido`} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Card title="Em circulação por tamanho">
          {e.pouches_by_id.length === 0 ? <p className="muted">Nenhuma Bolsa em circulação.</p> : <Bars rows={e.pouches_by_id.map((p, i) => ({ label: `${humanize(p.pouch_id)} (${fmtInt(p.count)})`, value: p.gold, tone: ((i % 6) + 1) as 1 }))} format={(n) => `${fmtGold(n)} de ouro`} />}
        </Card>
      </div>

      <SectionTitle>Materiais negociáveis</SectionTitle>
      <Card flush title={`${fmtInt(materialsTotal(e.materials))} unidades no total`}>
        <DataTable caption="Materiais negociáveis" columns={MATERIAL_COLUMNS} rows={e.materials} rowKey={(r) => r.material_id} empty="Nenhum saldo de material negociável." />
      </Card>

      <SectionTitle>Itens certificados por estado</SectionTitle>
      <div className="kpis">
        <Kpi label="Existem" value={fmtInt(items.existing)} sub="com o jogador ou à venda" />
        <Kpi label="À venda" value={fmtInt(items.listed)} />
        <Kpi label="Compradas" value={fmtInt(items.bought)} sub="cópias emitidas a compradores" />
        <Kpi label="Consumidas" value={fmtInt(items.burned)} sub="gastas em forja" />
        <Kpi label="Itens nos saves" value={fmtInt(e.saves_items.common + e.saves_items.rare + e.saves_items.epic + e.saves_items.legendary)} sub={`${fmtInt(e.saves_items.legendary)} lendários · ${fmtInt(e.saves_items.epic)} épicos (declarado)`} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Card flush>
          <DataTable caption="Itens certificados por tipo, raridade e estado" columns={ITEM_COLUMNS} rows={rows} rowKey={(r) => r.key} empty="Nenhum item certificado ainda." />
        </Card>
      </div>

      <SectionTitle>Solana</SectionTitle>
      <div className="kpis">
        <Kpi label="Volume em 7 dias" value={fmtSol(e.sol.volume_7d_lamports, 3)} sub={`taxas ${fmtSol(e.sol.fees_7d_lamports, 4)}`} />
        <Kpi label="Volume em 30 dias" value={fmtSol(e.sol.volume_30d_lamports, 3)} sub={`taxas ${fmtSol(e.sol.fees_30d_lamports, 4)}`} />
        <Kpi label="Volume total" value={fmtSol(e.sol.volume_total_lamports, 3)} sub={`${fmtInt(e.sol.sales_total)} vendas reais`} />
        <Kpi label="Taxas totais" value={fmtSol(e.sol.fees_total_lamports, 4)} tone="good" />
      </div>
      <p className="faint" style={{ marginTop: 14 }}>
        O ouro vem dos saves, que são enviados pelo próprio cliente: é um indicador de circulação, não um saldo auditado. Os números de ouro são atualizados pela rotina agendada, não ao vivo.
        {e.saves_items.refreshed_at ? ` Última atualização do cache: ${fmtAgo(e.saves_items.refreshed_at, now)}.` : ''}
      </p>
    </>
  );
}
