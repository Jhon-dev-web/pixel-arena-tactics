import { BarChart, LineChart } from '../components/Charts';
import { Bars, Card, Icon, Kpi, Notice, Progress, SectionTitle, Skeleton } from '../components/ui';
import { useApp, useAsync, useInterval, useNow } from '../hooks';
import { liveOwnersBySource, materialsTotal, passRevenue, summarizeItems, testPassOwners } from '../lib/aggregate';
import { fmtAgo, fmtDay, fmtInt, fmtPercent, fmtSol, fmtUsd, lamportsToSol, updatedLabel, agoFromSeconds } from '../lib/format';
import { passSourceLabel, seasonStatusLabel } from '../lib/labels';
import type { Overview, SeriesDay } from '../lib/types';

const REFRESH_MS = 60_000;

export default function OverviewPage() {
  const { demo } = useApp();
  const ov = useAsync((api) => api.overview(), []);
  const series = useAsync((api) => api.series(30), []);
  const now = useNow(1000);

  function reloadAll() {
    ov.reload();
    series.reload();
  }
  useInterval(reloadAll, REFRESH_MS);

  const loadedAt = ov.loadedAt ?? 0;
  const seconds = loadedAt ? (now - loadedAt) / 1000 : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <p>Números do jogo agora{demo ? ' (dados de demonstração)' : ''}. A tela se atualiza sozinha a cada 60 segundos.</p>
        </div>
        <div className="head-actions">
          <span role="status" aria-live="off">
            {loadedAt ? updatedLabel(seconds) : 'carregando…'}
          </span>
          <button type="button" className="btn" onClick={reloadAll} disabled={ov.loading}>
            <Icon name="refresh" />
            Atualizar
          </button>
        </div>
      </div>

      {ov.error ? <Notice tone="bad">Não foi possível carregar: {ov.error}</Notice> : null}
      {!ov.data ? <LoadingKpis /> : <Body ov={ov.data} series={series.data} now={now} />}
    </>
  );
}

function LoadingKpis() {
  return (
    <div className="kpis" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div className="card kpi" key={i}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={28} width="40%" />
        </div>
      ))}
    </div>
  );
}

function Body({ ov, series, now }: { ov: Overview; series: SeriesDay[] | null; now: number }) {
  const p = ov.players;
  const live = ov.market.live;
  const test = ov.market.test;
  const rev = passRevenue(ov.pass);
  const items = summarizeItems(ov.items);
  const owners = liveOwnersBySource(ov.pass.by_source);
  const testOwners = testPassOwners(ov.pass.by_source);
  const goalTarget = ov.pass.goal_target || ov.league.goal_target || 0;
  const fresh = ov.freshness;
  const labels = (series ?? []).map((d) => fmtDay(d.day));
  const col = (f: (d: SeriesDay) => number) => (series ?? []).map(f);

  return (
    <>
      <SectionTitle>Jogadores</SectionTitle>
      <div className="kpis">
        <Kpi label="Online agora" value={fmtInt(p.online_now)} sub={`salvaram nos últimos ${p.online_window_minutes} min`} live />
        <Kpi label="Cadastros" value={fmtInt(p.registered)} sub={`+${fmtInt(p.signups_today)} hoje · +${fmtInt(p.signups_7d)} em 7 dias · +${fmtInt(p.signups_30d)} em 30`} />
        <Kpi label="Jogando hoje" value={fmtInt(p.active_today)} sub={`${fmtInt(p.active_7d)} em 7 dias · ${fmtInt(p.active_30d)} em 30 dias`} />
        <Kpi label="Personagens criados" value={fmtInt(p.characters)} sub={`${fmtInt(p.with_username)} com nome de jogador · ${fmtInt(p.confirmed)} e-mails confirmados`} />
        <Kpi label="Lista de espera" value={fmtInt(ov.waitlist.total)} sub={`+${fmtInt(ov.waitlist.today)} hoje · +${fmtInt(ov.waitlist.last_7d)} em 7 dias · ${fmtInt(ov.waitlist.referred)} indicados`} />
      </div>

      <SectionTitle>Passe do Aventureiro</SectionTitle>
      <div className="kpis">
        <Kpi label="Passes ativos" value={fmtInt(ov.pass.owners_active)} sub={goalTarget ? `${fmtInt(ov.pass.goal_paid)} pagos de ${fmtInt(goalTarget)} da meta` : undefined} />
        <Kpi label="Receita estimada" value={fmtUsd(rev.total)} sub={rev.card > 0 ? `USDC ${fmtUsd(rev.usdc)} + cartão ${fmtUsd(rev.card)}` : `USDC ${fmtUsd(rev.usdc)}`} tone="good" />
        <Kpi label="Vendas em USDC" value={fmtInt(ov.pass.usdc_payments_live)} sub={`${fmtUsd(ov.pass.usdc_live)} recebidos${ov.pass.usdc_to_refund > 0 ? ` · ${fmtUsd(ov.pass.usdc_to_refund)} a devolver` : ''}`} tone={ov.pass.usdc_to_refund > 0 ? 'warn' : undefined} />
        {(ov.pass.card_sold_live > 0 || ov.pass.card_refunded_live > 0) && <Kpi label="Vendas no cartão (legado)" value={fmtInt(ov.pass.card_sold_live)} sub={`× ${fmtUsd(ov.pass.card_price_usd)} · ${fmtInt(ov.pass.card_refunded_live)} reembolsadas`} />}
      </div>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <Card title="Passes ativos por origem" note={testOwners ? `fora disto: ${fmtInt(testOwners)} de teste` : undefined}>
          {owners.length === 0 ? <p className="muted">Nenhum Passe ativo ainda.</p> : <Bars rows={owners.map((o, i) => ({ label: passSourceLabel(o.source), value: o.active, tone: ((i % 6) + 1) as 1 })) } format={fmtInt} />}
        </Card>
        <Card title="Meta do Passe" note="abre a Liga paga">
          {goalTarget ? (
            <div className="stack">
              <Progress value={ov.pass.goal_paid} target={goalTarget} label="Passes pagos até a meta" />
              <div className="muted">
                {fmtInt(ov.pass.goal_paid)} de {fmtInt(goalTarget)} ({fmtPercent(ov.pass.goal_paid / goalTarget, 1)})
              </div>
            </div>
          ) : (
            <p className="muted">Meta não configurada.</p>
          )}
        </Card>
      </div>

      <SectionTitle>Mercado e Solana</SectionTitle>
      <div className="kpis">
        <Kpi label="Anúncios abertos" value={fmtInt(ov.market.listings_open)} sub={`${fmtInt(ov.market.listings_open_items)} itens · ${fmtInt(ov.market.listings_open_materials)} lotes de material`} />
        <Kpi label="Vendas concluídas" value={fmtInt(live?.sales ?? 0)} sub={`${fmtInt(live?.sales_items ?? 0)} itens · ${fmtInt(live?.sales_materials ?? 0)} materiais${test?.sales ? ` · +${fmtInt(test.sales)} de teste` : ''}`} />
        <Kpi label="Volume negociado" value={fmtSol(live?.volume_lamports ?? 0, 3)} sub={`${fmtInt(live?.buyers ?? 0)} compradores · ${fmtInt(live?.sellers ?? 0)} vendedores`} />
        <Kpi label="Taxas do jogo (5%)" value={fmtSol(ov.collected.fees_lamports, 4)} sub="recebidas em SOL" tone="good" />
        <Kpi label="Arrecadado na Solana" value={`${fmtSol(ov.collected.fees_lamports, 3)}`} sub={`+ ${fmtUsd(ov.collected.usdc)} em USDC (Passes)`} tone="good" />
        <Kpi label="Pagamentos a devolver" value={fmtInt(ov.market.refund_due_count)} sub={ov.market.refund_due_count ? fmtSol(ov.market.refund_due_lamports) : 'nenhum pendente'} tone={ov.market.refund_due_count ? 'warn' : undefined} />
      </div>

      <SectionTitle>Itens e circulação</SectionTitle>
      <div className="kpis">
        <Kpi label="Itens certificados" value={fmtInt(items.existing)} sub={`${fmtInt(items.listed)} à venda · ${fmtInt(items.bought)} compradas`} />
        <Kpi label="Lendários e épicos" value={fmtInt(items.legendary)} sub={`${fmtInt(items.epic)} épicos em circulação`} />
        <Kpi label="Bolsas de Ouro" value={fmtInt(ov.pouches.outstanding)} sub={`${fmtInt(ov.pouches.outstanding_gold)} de ouro em face · ${fmtInt(ov.pouches.opened)} abertas`} />
        <Kpi label="Materiais negociáveis" value={fmtInt(materialsTotal(ov.materials))} sub={`${fmtInt(ov.materials.length)} tipos, saldos e anúncios`} />
        <Kpi label="Ouro nos saves" value={fmtInt(fresh.gold_total)} sub={fresh.player_cache_refreshed_at ? `declarado pelos saves, ${fmtAgo(fresh.player_cache_refreshed_at, now)}` : 'rodar a rotina diária (docs/ADMIN.md)'} />
      </div>

      <SectionTitle>Liga</SectionTitle>
      <div className="grid-2">
        <Card title={ov.league.season ? `Temporada ${ov.league.season.number} — ${seasonStatusLabel(ov.league.season.status)}` : 'Nenhuma temporada aberta'}>
          <div className="kpis">
            <Kpi label="Inscritos" value={fmtInt(ov.league.entries)} />
            <Kpi label="Jogadores sinalizados" value={fmtInt(ov.league.players_with_open_flags)} sub={`${fmtInt(ov.league.entries_flagged)} entradas · ${fmtInt(ov.league.entries_disqualified)} desqualificadas`} tone={ov.league.players_with_open_flags ? 'warn' : undefined} />
          </div>
        </Card>
        <Card title="Alertas de itens">
          <div className="kpis">
            <Kpi label="Contas com alerta de itens" value={fmtInt(ov.league.players_with_item_flags)} tone={ov.league.players_with_item_flags ? 'warn' : undefined} />
          </div>
        </Card>
      </div>

      <SectionTitle>Últimos 30 dias</SectionTitle>
      {!series ? (
        <Skeleton height={220} />
      ) : (
        <div className="grid-2">
          <Card title="Cadastros e jogadores ativos por dia">
            <LineChart label="Cadastros e jogadores ativos por dia" labels={labels} axis={(n) => fmtInt(n)} tip={fmtInt} series={[{ name: 'Cadastros', tone: 1, values: col((d) => d.signups) }, { name: 'Jogadores ativos', tone: 3, values: col((d) => d.active_players) }]} />
          </Card>
          <Card title="Vendas do Passe por origem">
            <BarChart stacked label="Vendas do Passe por dia e origem" labels={labels} axis={(n) => fmtInt(n)} tip={fmtInt} series={[{ name: 'USDC', tone: 3, values: col((d) => d.pass_usdc) }, ...((series ?? []).some((d) => d.pass_stripe > 0) ? [{ name: 'Cartão', tone: 1 as const, values: col((d) => d.pass_stripe) }] : []), { name: 'Indicação', tone: 4, values: col((d) => d.pass_referral) }, { name: 'Concessão', tone: 6, values: col((d) => d.pass_grant) }, { name: 'Teste', tone: 2, values: col((d) => d.pass_test) }]} />
          </Card>
          <Card title="Receita do Passe por dia (US$)">
            <BarChart label="Receita do Passe por dia" labels={labels} axis={(n) => fmtUsd(n).replace(',00', '')} tip={fmtUsd} series={[{ name: 'Receita estimada', tone: 3, values: col((d) => d.pass_revenue_usd) }]} />
          </Card>
          <Card title="Volume e taxas no mercado (SOL)">
            <BarChart label="Volume e taxas do mercado por dia, em SOL" labels={labels} axis={(n) => String(Math.round(n * 100) / 100)} tip={(n) => `${Math.round(n * 10000) / 10000} SOL`} series={[{ name: 'Volume', tone: 1, values: col((d) => lamportsToSol(d.volume_lamports)) }, { name: 'Taxas', tone: 2, values: col((d) => lamportsToSol(d.fee_lamports)) }]} />
          </Card>
          <Card title="Lendários e únicos emitidos por dia">
            <BarChart stacked label="Lendários e únicos emitidos por dia" labels={labels} axis={(n) => fmtInt(n)} tip={fmtInt} series={[{ name: 'Lendários', tone: 2, values: col((d) => d.legendaries) }, { name: 'Únicos', tone: 4, values: col((d) => d.uniques) }]} />
          </Card>
          <Card title="Bolsas de Ouro criadas e abertas por dia">
            <BarChart label="Bolsas de Ouro criadas e abertas por dia" labels={labels} axis={(n) => fmtInt(n)} tip={fmtInt} series={[{ name: 'Criadas', tone: 1, values: col((d) => d.pouches_minted) }, { name: 'Abertas', tone: 3, values: col((d) => d.pouches_opened) }]} />
          </Card>
        </div>
      )}
      <p className="faint" style={{ marginTop: 18 }}>
        Fuso: {ov.timezone}. Gerado {agoFromSeconds((now - new Date(ov.generated_at).getTime()) / 1000)}. Jogadores ativos por dia vêm da rotina diária{fresh.daily_captured_at ? ` (última execução ${fmtAgo(fresh.daily_captured_at, now)})` : ' (ainda não executada)'}. A receita é uma estimativa: vendas no cartão × o preço configurado, mais o USDC recebido.
      </p>
    </>
  );
}
