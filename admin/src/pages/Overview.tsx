import { AsyncBlock, Freshness } from '../components/Block';
import { BarChart, LineChart } from '../components/Charts';
import { Bars, Card, Icon, Kpi, Notice, Pill, Progress, SectionTitle } from '../components/ui';
import { type AsyncState, useApp, useAsync, useInterval, useNow } from '../hooks';
import { liveOwnersBySource, materialsTotal, passMeasures, passRevenue, summarizeItems, testPassOwners } from '../lib/aggregate';
import { buildAttention } from '../lib/attention';
import { fmtAgo, fmtDay, fmtInt, fmtPercent, fmtSol, fmtUsd, lamportsToSol } from '../lib/format';
import { aggregateStatus, clockTime } from '../lib/freshness';
import { passSourceLabel, seasonStatusLabel } from '../lib/labels';
import type { OpsOverview, Overview, PaymentExceptionsPage, SeriesDay } from '../lib/types';

const REFRESH_MS = 60_000;

export default function OverviewPage() {
  const { demo } = useApp();
  const ov = useAsync((api) => api.overview(), []);
  const series = useAsync((api) => api.series(30), []);
  // The two sources of "Precisa de atenção" that are not in the overview. Each one fails on its own.
  const pay = useAsync((api) => api.paymentExceptions({ status: 'open', page: 0, pageSize: 1 }), []);
  const ops = useAsync((api) => api.opsOverview(), []);
  const now = useNow(1000);

  function reloadAll() {
    ov.reload();
    series.reload();
    pay.reload();
    ops.reload();
  }
  useInterval(reloadAll, REFRESH_MS);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <p>
            Primeiro o que precisa de você, depois os números centrais. Cada bloco diz de quando é. A tela se atualiza sozinha a cada 60 segundos{demo ? ' (dados de demonstração)' : ''}.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={reloadAll} disabled={ov.loading && series.loading}>
            <Icon name="refresh" />
            Atualizar tudo
          </button>
        </div>
      </div>

      <AttentionBlock ov={ov} pay={pay} ops={ops} now={now} />

      <SectionTitle>Números centrais</SectionTitle>
      <AsyncBlock state={ov} label="os números do jogo" now={now} skeleton={160} isEmpty={(o) => o.players.registered === 0 && o.players.characters === 0} empty="O banco ainda não tem nenhum jogador cadastrado. Sem dados, não há o que medir: isto não é um sinal de que está tudo bem.">
        {(o) => <CoreKpis ov={o} queriedAt={ov.loadedAt} />}
      </AsyncBlock>

      <SectionTitle>Últimos 30 dias</SectionTitle>
      <AsyncBlock
        state={series}
        label="os gráficos"
        now={now}
        skeleton={220}
        isEmpty={(s) => s.length === 0}
        empty="A consulta funcionou, mas não devolveu nenhum dia. Os gráficos ficam em branco de propósito, em vez de mostrar receita zero. Confira se a rotina diária já rodou (docs/ADMIN.md, seção 4)."
      >
        {(s) => <Charts series={s} queriedAt={series.loadedAt} ov={ov.data} now={now} />}
      </AsyncBlock>

      {ov.data ? <Details ov={ov.data} queriedAt={ov.loadedAt} now={now} /> : null}

      {ov.data ? (
        <p className="faint" style={{ marginTop: 18 }}>
          Fuso das contas por dia: {ov.data.timezone}. A receita é uma estimativa: vendas no cartão × o preço configurado, mais o USDC recebido. Valores de dinheiro nunca são filtrados pela validade atual do Passe.
        </p>
      ) : null}
    </>
  );
}

// ---- "Precisa de atenção" -------------------------------------------------------------------------------------------------------------------------------------------

function AttentionBlock({ ov, pay, ops, now }: { ov: AsyncState<Overview>; pay: AsyncState<PaymentExceptionsPage>; ops: AsyncState<OpsOverview>; now: number }) {
  const att = buildAttention({ overview: ov, payments: pay, ops }, now);
  const retry: Record<string, () => void> = { overview: ov.reload, payments: pay.reload, ops: ops.reload };
  const empty = ov.data != null && ov.data.players.registered === 0 && ov.data.players.characters === 0;
  return (
    <section aria-labelledby="atencao" className="attention">
      <h2 id="atencao" className="section-title">
        Precisa de atenção
      </h2>
      {att.items.length > 0 ? (
        <ul className="attention-list">
          {att.items.map((i) => (
            <li key={i.id} className={`attention-item ${i.tone}`}>
              <Pill tone={i.tone}>{i.tone === 'bad' ? 'agir' : 'conferir'}</Pill>
              <div>
                <strong>{i.title}</strong>
                <p className="muted">{i.detail}</p>
              </div>
              {i.href ? (
                <a className="btn" href={i.href}>
                  {i.linkLabel ?? 'Abrir'}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {att.unchecked.map((u) => (
        <Notice key={u.id} tone={u.reason === 'failed' ? 'bad' : undefined}>
          {u.reason === 'failed' ? (
            <>
              Não foi possível verificar {u.label}. Isto <strong>não</strong> quer dizer que está tudo certo.{' '}
              <button type="button" className="btn" onClick={retry[u.id]}>
                Tentar de novo
              </button>
            </>
          ) : (
            <>Verificando {u.label}…</>
          )}
        </Notice>
      ))}
      {att.items.length === 0 && att.unchecked.length === 0 ? (
        <Notice>
          {empty
            ? 'Nenhuma pendência encontrada, mas o banco ainda não tem jogadores: sem dados, isso não diz nada sobre a saúde do jogo.'
            : `Nenhuma pendência encontrada nas verificações: ${att.checked.map((c) => c.label).join(', ')}, alertas e rotinas. Vale só para o que o painel consegue ver.`}
        </Notice>
      ) : null}
      <p className="freshness">
        Consultas: números do jogo às {clockTime(ov.loadedAt)} · pagamentos às {clockTime(pay.loadedAt)} · operação às {clockTime(ops.loadedAt)}
      </p>
    </section>
  );
}

// ---- Core numbers ---------------------------------------------------------------------------------------------------------------------------------------------------

function CoreKpis({ ov, queriedAt }: { ov: Overview; queriedAt: number | null }) {
  const p = ov.players;
  const rev = passRevenue(ov.pass);
  const passM = passMeasures(ov.pass);
  return (
    <>
      <div className="kpis">
        <Kpi label="Online agora" value={fmtInt(p.online_now)} sub={`salvaram nos últimos ${p.online_window_minutes} min (estimativa: quem joga sem salvar não conta)`} live />
        <Kpi label="Jogando hoje" value={fmtInt(p.active_today)} sub={`${fmtInt(p.active_7d)} em 7 dias · ${fmtInt(p.active_30d)} em 30 dias`} />
        <Kpi label="Cadastros" value={fmtInt(p.registered)} sub={`+${fmtInt(p.signups_today)} hoje · +${fmtInt(p.signups_7d)} em 7 dias · +${fmtInt(p.signups_30d)} em 30`} />
        {passM.known ? (
          <Kpi label="Passe válido nesta temporada" value={fmtInt(passM.validNow)} sub={`${passM.season ? `Temporada ${passM.season}` : 'temporada atual'} · ${fmtInt(passM.history)} já tiveram um Passe`} />
        ) : (
          <Kpi label="Histórico de Passes" value={fmtInt(passM.history)} sub="não diz se ainda vale: aplicar a migração 0026" tone="warn" />
        )}
        <Kpi label="Receita estimada do Passe" value={fmtUsd(rev.total)} sub={`desde o início, não depende da validade atual · USDC ${fmtUsd(rev.usdc)}${rev.card > 0 ? ` + cartão ${fmtUsd(rev.card)}` : ''}`} tone="good" />
        <Kpi label="Taxas do jogo (5%)" value={fmtSol(ov.collected.fees_lamports, 4)} sub="vendas reais no mercado, em SOL" tone="good" />
      </div>
      <Freshness
        queriedAt={queriedAt}
        note={
          <>
            “Online agora” = personagens salvos nos últimos {p.online_window_minutes} min; “jogando hoje” começa à meia-noite de {ov.timezone}.
          </>
        }
      />
    </>
  );
}

// ---- Charts ---------------------------------------------------------------------------------------------------------------------------------------------------------

function Charts({ series, queriedAt, ov, now }: { series: SeriesDay[]; queriedAt: number | null; ov: Overview | null; now: number }) {
  const labels = series.map((d) => fmtDay(d.day));
  const col = (f: (d: SeriesDay) => number) => series.map(f);
  const agg = ov ? aggregateStatus(ov.freshness, now) : null;
  return (
    <>
      <div className="grid-2">
        <Card title="Cadastros e jogadores ativos por dia">
          <LineChart label="Cadastros e jogadores ativos por dia" labels={labels} axis={(n) => fmtInt(n)} tip={fmtInt} series={[{ name: 'Cadastros', tone: 1, values: col((d) => d.signups) }, { name: 'Jogadores ativos', tone: 3, values: col((d) => d.active_players) }]} />
        </Card>
        <Card title="Vendas do Passe por origem">
          <BarChart stacked label="Vendas do Passe por dia e origem" labels={labels} axis={(n) => fmtInt(n)} tip={fmtInt} series={[{ name: 'USDC', tone: 3, values: col((d) => d.pass_usdc) }, ...(series.some((d) => d.pass_stripe > 0) ? [{ name: 'Cartão', tone: 1 as const, values: col((d) => d.pass_stripe) }] : []), { name: 'Indicação', tone: 4, values: col((d) => d.pass_referral) }, { name: 'Concessão', tone: 6, values: col((d) => d.pass_grant) }, { name: 'Teste', tone: 2, values: col((d) => d.pass_test) }]} />
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
      <Freshness
        queriedAt={queriedAt}
        aggregatedAt={agg?.daily.at ?? null}
        aggregateLate={agg ? agg.daily.state !== 'fresh' : false}
        aggregateNote={agg ? 'jogadores ativos por dia vêm da rotina diária' : 'jogadores ativos por dia vêm da rotina diária; a idade dela aparece quando os números do jogo carregarem'}
        note="a receita por dia é estimada"
      />
    </>
  );
}

// ---- The rest, below --------------------------------------------------------------------------------------------------------------------------------------------------

function Details({ ov, queriedAt, now }: { ov: Overview; queriedAt: number | null; now: number }) {
  const live = ov.market.live;
  const test = ov.market.test;
  const rev = passRevenue(ov.pass);
  const items = summarizeItems(ov.items);
  const passM = passMeasures(ov.pass);
  const measure = passM.known ? 'valid_now' : 'active';
  const owners = liveOwnersBySource(ov.pass.by_source, measure);
  const testOwners = testPassOwners(ov.pass.by_source, measure);
  const goalTarget = ov.pass.goal_target || ov.league.goal_target || 0;
  const fresh = ov.freshness;
  const agg = aggregateStatus(fresh, now);
  return (
    <>
      <SectionTitle>Mais números</SectionTitle>

      <details className="fold">
        <summary>
          <strong>Passe do Aventureiro em detalhe</strong>
          <span className="faint">{passM.known ? `${fmtInt(passM.validNow)} válidos agora · ${fmtInt(passM.history)} no histórico` : `${fmtInt(passM.history)} no histórico`}</span>
        </summary>
        <div className="fold-body">
          <div className="kpis">
            {passM.known ? (
              <>
                <Kpi label="Passe válido nesta temporada" value={fmtInt(passM.validNow)} sub={`${passM.season ? `Temporada ${passM.season}` : 'temporada atual'}${passM.ranking != null ? ` · ${fmtInt(passM.ranking)} elegíveis ao ranking` : ''}`} />
                <Kpi label="Histórico de Passes" value={fmtInt(passM.history)} sub={`contas que já tiveram Passe${passM.expired ? ` · ${fmtInt(passM.expired)} sem validade agora` : ''}`} />
              </>
            ) : null}
            <Kpi label="Receita estimada" value={fmtUsd(rev.total)} sub={rev.card > 0 ? `USDC ${fmtUsd(rev.usdc)} + cartão ${fmtUsd(rev.card)}` : `USDC ${fmtUsd(rev.usdc)}`} tone="good" />
            <Kpi label="Vendas em USDC" value={fmtInt(ov.pass.usdc_payments_live)} sub={`${fmtUsd(ov.pass.usdc_live)} recebidos${ov.pass.usdc_to_refund > 0 ? ` · ${fmtUsd(ov.pass.usdc_to_refund)} a devolver` : ''}`} tone={ov.pass.usdc_to_refund > 0 ? 'warn' : undefined} />
            {(ov.pass.card_sold_live > 0 || ov.pass.card_refunded_live > 0) && <Kpi label="Vendas no cartão (legado)" value={fmtInt(ov.pass.card_sold_live)} sub={`× ${fmtUsd(ov.pass.card_price_usd)} · ${fmtInt(ov.pass.card_refunded_live)} reembolsadas`} />}
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <Card title={passM.known ? 'Passe válido nesta temporada, por origem' : 'Histórico de Passes, por origem'} note={testOwners ? `fora disto: ${fmtInt(testOwners)} de teste` : undefined}>
              {owners.length === 0 ? <p className="muted">{passM.known ? 'Nenhum Passe vale nesta temporada.' : 'Nenhum Passe ainda.'}</p> : <Bars rows={owners.map((o, i) => ({ label: passSourceLabel(o.source), value: o.active, tone: ((i % 6) + 1) as 1 }))} format={fmtInt} />}
            </Card>
            <Card title="Meta do Passe" note="abre a Liga paga">
              {goalTarget ? (
                <div className="stack">
                  <Progress value={ov.pass.goal_paid} target={goalTarget} label="Passes pagos até a meta" />
                  <div className="muted">
                    {fmtInt(ov.pass.goal_paid)} de {fmtInt(goalTarget)} ({fmtPercent(ov.pass.goal_paid / goalTarget, 1)}) · só Passes pagos que valem na temporada atual
                  </div>
                </div>
              ) : (
                <p className="muted">Meta não configurada.</p>
              )}
            </Card>
          </div>
          <Freshness queriedAt={queriedAt} note="receita e vendas são de todo o período; a validade só muda o número de Passes válidos" />
        </div>
      </details>

      <details className="fold">
        <summary>
          <strong>Mercado e Solana</strong>
          <span className="faint">
            {fmtInt(ov.market.listings_open)} anúncios · {fmtInt(live?.sales ?? 0)} vendas reais
          </span>
        </summary>
        <div className="fold-body">
          <div className="kpis">
            <Kpi label="Anúncios abertos" value={fmtInt(ov.market.listings_open)} sub={`${fmtInt(ov.market.listings_open_items)} itens · ${fmtInt(ov.market.listings_open_materials)} lotes de material`} />
            <Kpi label="Vendas concluídas" value={fmtInt(live?.sales ?? 0)} sub={`${fmtInt(live?.sales_items ?? 0)} itens · ${fmtInt(live?.sales_materials ?? 0)} materiais${test?.sales ? ` · +${fmtInt(test.sales)} de teste` : ''}`} />
            <Kpi label="Volume negociado" value={fmtSol(live?.volume_lamports ?? 0, 3)} sub={`${fmtInt(live?.buyers ?? 0)} compradores · ${fmtInt(live?.sellers ?? 0)} vendedores`} />
            <Kpi label="Taxas do jogo (5%)" value={fmtSol(ov.collected.fees_lamports, 4)} sub="recebidas em SOL" tone="good" />
            <Kpi label="Arrecadado na Solana" value={`${fmtSol(ov.collected.fees_lamports, 3)}`} sub={`+ ${fmtUsd(ov.collected.usdc)} em USDC (Passes)`} tone="good" />
            <Kpi label="Marcados para devolução (mercado)" value={fmtInt(ov.market.refund_due_count)} sub={ov.market.refund_due_count ? fmtSol(ov.market.refund_due_lamports) : 'nenhum marcado'} tone={ov.market.refund_due_count ? 'warn' : undefined} />
          </div>
          <Freshness queriedAt={queriedAt} note="só vendas reais; as de teste (devnet) aparecem à parte" />
        </div>
      </details>

      <details className="fold">
        <summary>
          <strong>Itens e circulação</strong>
          <span className="faint">{fmtInt(items.existing)} itens certificados</span>
        </summary>
        <div className="fold-body">
          <div className="kpis">
            <Kpi label="Itens certificados" value={fmtInt(items.existing)} sub={`${fmtInt(items.listed)} à venda · ${fmtInt(items.bought)} compradas`} />
            <Kpi label="Lendários e épicos" value={fmtInt(items.legendary)} sub={`${fmtInt(items.epic)} épicos em circulação`} />
            <Kpi label="Bolsas de Ouro" value={fmtInt(ov.pouches.outstanding)} sub={`${fmtInt(ov.pouches.outstanding_gold)} de ouro em face · ${fmtInt(ov.pouches.opened)} abertas`} />
            <Kpi label="Materiais negociáveis" value={fmtInt(materialsTotal(ov.materials))} sub={`${fmtInt(ov.materials.length)} tipos, saldos e anúncios`} />
            <Kpi label="Ouro nos saves" value={fmtInt(fresh.gold_total)} sub={fresh.player_cache_refreshed_at ? `declarado pelos saves, ${fmtAgo(fresh.player_cache_refreshed_at, now)}` : 'rodar a rotina diária (docs/ADMIN.md)'} />
          </div>
          <Freshness queriedAt={queriedAt} aggregatedAt={agg.cache.at} aggregateLate={agg.cache.state !== 'fresh'} aggregateNote="ouro vem do cache dos saves; os itens e bolsas são consulta direta" />
        </div>
      </details>

      <details className="fold">
        <summary>
          <strong>Liga e alertas</strong>
          <span className="faint">{ov.league.season ? `Temporada ${ov.league.season.number} — ${seasonStatusLabel(ov.league.season.status)}` : 'nenhuma temporada aberta'}</span>
        </summary>
        <div className="fold-body">
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
          <Freshness queriedAt={queriedAt} note="um alerta é um sinal para investigar, não uma sentença" />
        </div>
      </details>
    </>
  );
}
