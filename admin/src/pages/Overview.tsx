import { useState, type ReactNode } from 'react';
import { AsyncBlock, Freshness } from '../components/Block';
import { Icon, Notice, Pill, type IconName } from '../components/ui';
import { type AsyncState, useApp, useAsync, useInterval, useNow } from '../hooks';
import { liveOwnersBySource, materialsTotal, passMeasures, passRevenue, summarizeItems, testPassOwners } from '../lib/aggregate';
import { buildAttention } from '../lib/attention';
import { fmtAgo, fmtDay, fmtInt, fmtPercent, fmtSol, fmtUsd, lamportsToSol } from '../lib/format';
import { aggregateStatus, clockTime } from '../lib/freshness';
import { checkLabel, FLAG_INFO, FLAG_ORDER, passSourceLabel, seasonStatusLabel } from '../lib/labels';
import { watchdogState } from '../lib/opsState';
import type { OpsOverview, Overview, PaymentExceptionsPage, SeriesDay } from '../lib/types';

// "Hoje" (route visao-geral): numbers, tables and lists only. There is NO chart on this page (owner's decision, 21/10/2026): goals and distributions are text.
const REFRESH_MS = 60_000;
const ACTIVITY_DEFAULT_DAYS = 14;

export default function OverviewPage() {
  const { demo } = useApp();
  const ov = useAsync((api) => api.overview(), []);
  const series = useAsync((api) => api.series(30), []);
  // The two sources of "Precisa de atenção" that are not in the overview. Each one fails on its own.
  const pay = useAsync((api) => api.paymentExceptions({ status: 'open', page: 0, pageSize: 1 }), []);
  const ops = useAsync((api) => api.opsOverview(), []);
  const now = useNow(1000);
  const [allDays, setAllDays] = useState(false);
  const activityDays = allDays ? 30 : ACTIVITY_DEFAULT_DAYS;

  function reloadAll() {
    ov.reload();
    series.reload();
    pay.reload();
    ops.reload();
  }
  useInterval(reloadAll, REFRESH_MS);

  const hasPlayers = ov.data != null && !(ov.data.players.registered === 0 && ov.data.players.characters === 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hoje</h1>
          <p>
            O que precisa de você, os números principais e o resumo de cada área (toque no título para abrir). Atualiza sozinho a cada minuto{demo ? ' (dados de demonstração)' : ''}.
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

      <AsyncBlock state={ov} label="os números do jogo" now={now} skeleton={96} isEmpty={(o) => o.players.registered === 0 && o.players.characters === 0} empty="O banco ainda não tem nenhum jogador cadastrado. Sem dados, não há o que medir: isto não é um sinal de que está tudo bem.">
        {(o) => <Tiles ov={o} queriedAt={ov.loadedAt} />}
      </AsyncBlock>

      {ov.data && hasPlayers ? (
        <div className="ov-sections">
          <PassSheet ov={ov.data} />
          <MarketSheet ov={ov.data} queriedAt={ov.loadedAt} />
          <RaritySheet ov={ov.data} queriedAt={ov.loadedAt} />
          <Lists ov={ov.data} ops={ops} queriedAt={ov.loadedAt} now={now} />
        </div>
      ) : null}

      <section aria-labelledby="ov-activity" className="ov-activity">
        <div className="ov-sectionhead">
          <h2 id="ov-activity">{`Atividade — últimos ${activityDays} dias`}</h2>
        </div>
        <AsyncBlock
          state={series}
          label="o histórico diário"
          now={now}
          skeleton={160}
          isEmpty={(s) => s.length === 0}
          empty="A consulta funcionou, mas não devolveu nenhum dia. A tabela fica vazia de propósito, em vez de mostrar receita zero. Confira se a rotina diária já rodou (docs/ADMIN.md, seção 4)."
        >
          {(s) => <ActivityTable series={s} queriedAt={series.loadedAt} ov={ov.data} now={now} all={allDays} onToggle={() => setAllDays((v) => !v)} />}
        </AsyncBlock>
      </section>

      {ov.data ? (
        <p className="faint" style={{ marginTop: 18 }}>
          Fuso das contas por dia: {ov.data.timezone}. A receita é uma estimativa: vendas no cartão × o preço configurado, mais o USDC recebido. Valores de dinheiro nunca são filtrados pela validade atual do Passe. USDC e SOL nunca são somados.
        </p>
      ) : null}
    </>
  );
}

// ---- Tiles ----------------------------------------------------------------------------------------------------------------------------------------------------------

function Tile({ icon, label, value, note, live, warn }: { icon: IconName; label: string; value: ReactNode; note?: ReactNode; live?: boolean; warn?: boolean }) {
  return (
    <div className={`ov-tile${live ? ' live' : ''}${warn ? ' warn' : ''}`}>
      <span className="ov-tile-icon">
        <Icon name={icon} />
      </span>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function Tiles({ ov, queriedAt }: { ov: Overview; queriedAt: number | null }) {
  const p = ov.players;
  const passM = passMeasures(ov.pass);
  return (
    <>
      <dl className="ov-tiles">
        <Tile icon="pulse" label="Online agora" value={fmtInt(p.online_now)} note={`estimado: salvaram nos últimos ${p.online_window_minutes} min`} live />
        <Tile icon="user" label="Jogando hoje" value={fmtInt(p.active_today)} note={`${fmtInt(p.active_7d)} em 7 dias · ${fmtInt(p.active_30d)} em 30`} />
        <Tile icon="players" label="Jogadores" value={fmtInt(p.registered)} note={`+${fmtInt(p.signups_today)} hoje · +${fmtInt(p.signups_7d)} em 7 dias · ${fmtInt(p.confirmed)} confirmados`} />
        {passM.known ? (
          <Tile icon="scroll" label="Passe válido" value={fmtInt(passM.validNow)} note={`${passM.season ? `Temporada ${passM.season}` : 'temporada atual'} · ${fmtInt(passM.history)} no histórico`} />
        ) : (
          <Tile icon="scroll" label="Histórico de Passes" value={fmtInt(passM.history)} note="não diz se ainda vale: aplicar a migração 0026" warn />
        )}
      </dl>
      <Freshness
        queriedAt={queriedAt}
        note={
          <>
            “Online agora” é estimado: personagens salvos nos últimos {p.online_window_minutes} min (quem joga sem salvar não conta); “jogando hoje” começa à meia-noite de {ov.timezone}. Vendas e receita de cada dia estão na tabela “Atividade”, no fim da página.
          </>
        }
      />
    </>
  );
}

// ---- "Precisa de atenção" -------------------------------------------------------------------------------------------------------------------------------------------

function AttentionBlock({ ov, pay, ops, now }: { ov: AsyncState<Overview>; pay: AsyncState<PaymentExceptionsPage>; ops: AsyncState<OpsOverview>; now: number }) {
  const att = buildAttention({ overview: ov, payments: pay, ops }, now);
  const retry: Record<string, () => void> = { overview: ov.reload, payments: pay.reload, ops: ops.reload };
  const empty = ov.data != null && ov.data.players.registered === 0 && ov.data.players.characters === 0;
  return (
    <section aria-labelledby="atencao" className="attention ov-attention">
      <div className="ov-sectionhead">
        <h2 id="atencao">Precisa de atenção</h2>
        <span className="faint">
          Consultas: números do jogo às {clockTime(ov.loadedAt)} · pagamentos às {clockTime(pay.loadedAt)} · operação às {clockTime(ops.loadedAt)}
        </span>
      </div>
      {att.items.length > 0 ? (
        <ul className="ov-pending">
          {att.items.map((i) => (
            <li key={i.id} className={i.tone}>
              <Pill tone={i.tone}>{i.tone === 'bad' ? 'agir' : 'conferir'}</Pill>
              <div className="ov-pending-text">
                <strong>{i.title}</strong>
                <span className="muted">{i.detail}</span>
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
    </section>
  );
}

// ---- Sections: a title that opens and closes (a native <details>), remembered on this device ----------------------------------------------------------------------

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(`admin-open:${id}`);
    return v === '1' ? true : v === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

function Section({ id, icon, title, hint, open = false, more, children }: { id: string; icon: IconName; title: string; hint?: ReactNode; open?: boolean; more?: { href: string; label: string }[]; children: ReactNode | ((open: boolean) => ReactNode) }) {
  const [isOpen, setOpen] = useState(() => readOpen(id, open));
  return (
    <details
      className="ov-fold"
      open={isOpen}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(now);
        try {
          window.localStorage.setItem(`admin-open:${id}`, now ? '1' : '0');
        } catch {
          /* private window: not remembered */
        }
      }}
    >
      <summary>
        <span className="ov-fold-icon">
          <Icon name={icon} />
        </span>
        <h2 id={`ov-${id}`} className="ov-fold-title">
          {title}
        </h2>
        {hint ? <small>{hint}</small> : null}
      </summary>
      <div className="ov-fold-body">
        {typeof children === 'function' ? children(isOpen) : children}
        {more && more.length ? (
          <div className="ov-more">
            {more.map((m) => (
              <a key={m.href} className="btn" href={m.href}>
                {m.label}
                <Icon name="next" />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

// ---- Two aligned data blocks: Passe and Mercado ---------------------------------------------------------------------------------------------------------------------

function Ledger({ rows }: { rows: { label: string; value: ReactNode; total?: boolean; warn?: boolean }[] }) {
  return (
    <dl className="ov-ledger">
      {rows.map((r) => (
        <div key={r.label} className={`${r.total ? 'total' : ''}${r.warn ? ' warn' : ''}`.trim() || undefined}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PassSheet({ ov }: { ov: Overview }) {
  const rev = passRevenue(ov.pass);
  const passM = passMeasures(ov.pass);
  const measure = passM.known ? 'valid_now' : 'active';
  const owners = liveOwnersBySource(ov.pass.by_source, measure);
  const testOwners = testPassOwners(ov.pass.by_source, measure);
  const goalTarget = ov.pass.goal_target || ov.league.goal_target || 0;
  const rows: { label: string; value: ReactNode; total?: boolean; warn?: boolean }[] = [
    { label: 'USDC recebido', value: fmtUsd(rev.usdc).replace('US$', '').trim() + ' USDC', total: true },
    { label: 'Compras pagas em USDC', value: fmtInt(ov.pass.usdc_payments_live) },
  ];
  if (ov.pass.card_sold_live > 0 || ov.pass.card_refunded_live > 0) {
    rows.push({ label: 'Compras no cartão (legado)', value: `${fmtInt(ov.pass.card_sold_live)} × ${fmtUsd(ov.pass.card_price_usd)} · ${fmtInt(ov.pass.card_refunded_live)} reembolsadas` });
    rows.push({ label: 'Receita estimada, USDC + cartão', value: fmtUsd(rev.total) });
  }
  if (ov.pass.usdc_to_refund > 0) rows.push({ label: 'USDC a devolver', value: `${fmtUsd(ov.pass.usdc_to_refund).replace('US$', '').trim()} USDC`, warn: true });
  rows.push({ label: passM.known ? 'Passe válido na temporada' : 'Histórico de Passes (validade desconhecida)', value: fmtInt(passM.known ? passM.validNow : passM.history) });
  for (const o of owners) rows.push({ label: `${passM.known ? 'Válidos' : 'No histórico'}: ${passSourceLabel(o.source)}`, value: fmtInt(o.active) });
  if (testOwners) rows.push({ label: 'Passes de teste (fora dos números reais)', value: fmtInt(testOwners) });
  if (passM.known) {
    rows.push({ label: 'Histórico: contas que já tiveram Passe', value: fmtInt(passM.history) });
    if (passM.expired != null) rows.push({ label: 'Sem validade na temporada atual', value: fmtInt(passM.expired) });
    if (passM.ranking != null) rows.push({ label: 'Elegíveis ao ranking', value: fmtInt(passM.ranking) });
  }
  rows.push({
    label: 'Meta do Passe (Passes pagos válidos)',
    value: goalTarget ? `${fmtInt(ov.pass.goal_paid)} de ${fmtInt(goalTarget)} · ${fmtPercent(ov.pass.goal_paid / goalTarget, 1)}` : 'meta não configurada',
  });
  return (
    <Section id="pass" icon="scroll" title="Passe de Aventureiro" hint={`${fmtUsd(rev.total)} · ${fmtInt(passM.known ? passM.validNow : passM.history)} ${passM.known ? 'válidos' : 'no histórico'}`} open>
      <p className="ov-subtitle">Recebimentos desde o início · USDC{passM.known && passM.season ? ` · validade: Temporada ${passM.season}` : ''}</p>
      <Ledger rows={rows} />
      <p className="freshness">Receita e vendas são de todo o período; a validade só muda o número de Passes válidos.</p>
    </Section>
  );
}

function MarketSheet({ ov, queriedAt }: { ov: Overview; queriedAt: number | null }) {
  const live = ov.market.live;
  const test = ov.market.test;
  const rows: { label: string; value: ReactNode; total?: boolean; warn?: boolean }[] = [
    { label: 'Taxas recebidas (5%)', value: fmtSol(ov.collected.fees_lamports, 4), total: true },
    { label: 'Volume negociado', value: fmtSol(live?.volume_lamports ?? 0, 4) },
    { label: 'Vendas concluídas', value: fmtInt(live?.sales ?? 0) },
    { label: 'Itens vendidos', value: fmtInt(live?.sales_items ?? 0) },
    { label: 'Lotes de material vendidos', value: fmtInt(live?.sales_materials ?? 0) },
    { label: 'Compradores · vendedores', value: `${fmtInt(live?.buyers ?? 0)} · ${fmtInt(live?.sellers ?? 0)}` },
    { label: 'Anúncios abertos', value: `${fmtInt(ov.market.listings_open)} (${fmtInt(ov.market.listings_open_items)} itens · ${fmtInt(ov.market.listings_open_materials)} materiais)` },
    { label: 'Devoluções pendentes', value: ov.market.refund_due_count ? `${fmtInt(ov.market.refund_due_count)} · ${fmtSol(ov.market.refund_due_lamports)}` : '0', warn: ov.market.refund_due_count > 0 },
  ];
  if (test?.sales) rows.push({ label: 'Vendas de teste (devnet, à parte)', value: fmtInt(test.sales) });
  return (
    <Section id="market" icon="market" title="Mercado" hint={`${fmtSol(ov.collected.fees_lamports, 4)} em taxas · ${fmtInt(ov.market.listings_open)} anúncios`} open more={[{ href: '#/mercado', label: 'Ver vendas e anúncios' }]}>
      <p className="ov-subtitle">Acumulado · somente vendas reais · SOL</p>
      <Ledger rows={rows} />
      <Freshness queriedAt={queriedAt} note="só vendas reais; as de teste (devnet) aparecem à parte" />
    </Section>
  );
}

// ---- Activity table (always visible) and items by rarity -------------------------------------------------------------------------------------------------------

function ActivityTable({ series, queriedAt, ov, now, all, onToggle }: { series: SeriesDay[]; queriedAt: number | null; ov: Overview | null; now: number; all: boolean; onToggle: () => void }) {
  const agg = ov ? aggregateStatus(ov.freshness, now) : null;
  const days = [...series].reverse(); // newest first
  const shown = all ? days : days.slice(0, ACTIVITY_DEFAULT_DAYS);
  const sol = (l: number) => String(Math.round(lamportsToSol(l) * 10000) / 10000).replace('.', ',');
  return (
    <>
      <div className="table-wrap">
        <table className="data ov-table ov-compact">
          <caption className="ov-subtitle">Mais recente primeiro · dias no fuso {ov?.timezone ?? 'configurado'} · receita estimada · SOL à parte do dólar</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col" className="num">Contas novas</th>
              <th scope="col" className="num">Ativos</th>
              <th scope="col" className="num">Passes pagos</th>
              <th scope="col" className="num">Receita (US$)</th>
              <th scope="col" className="num">Vendas</th>
              <th scope="col" className="num">Volume (SOL)</th>
              <th scope="col" className="num">Taxa (SOL)</th>
              <th scope="col" className="num">Lendários</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.day}>
                <th scope="row">{fmtDay(d.day)}</th>
                <td className="num">{fmtInt(d.signups)}</td>
                <td className="num">{fmtInt(d.active_players)}</td>
                <td className="num">{fmtInt(d.pass_usdc + d.pass_stripe)}</td>
                <td className="num">{fmtUsd(d.pass_revenue_usd)}</td>
                <td className="num">{fmtInt(d.sales)}</td>
                <td className="num">{sol(d.volume_lamports)}</td>
                <td className="num">{sol(d.fee_lamports)}</td>
                <td className="num">{fmtInt(d.legendaries)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {days.length > ACTIVITY_DEFAULT_DAYS ? (
        <div className="ov-fold-actions">
          <button type="button" className="btn" aria-expanded={all} onClick={onToggle}>
            {all ? `Ver só ${ACTIVITY_DEFAULT_DAYS} dias` : `Ver ${days.length} dias`}
          </button>
        </div>
      ) : null}
      <Freshness
        queriedAt={queriedAt}
        aggregatedAt={agg?.daily.at ?? null}
        aggregateLate={agg ? agg.daily.state !== 'fresh' : false}
        aggregateNote={agg ? 'jogadores ativos por dia vêm da rotina diária' : 'jogadores ativos por dia vêm da rotina diária; a idade dela aparece quando os números do jogo carregarem'}
        note="a receita por dia é estimada; “Passes pagos” = USDC + cartão (convites, concessões e testes ficam de fora)"
      />
    </>
  );
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_TEXT: Record<string, string> = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário', unique: 'Único' };
type RarityView = 'existing' | 'listed' | 'burned';
const RARITY_VIEWS: { id: RarityView; label: string; match: (status: string) => boolean }[] = [
  { id: 'existing', label: 'Existentes', match: (s) => s === 'held' || s === 'listed' },
  { id: 'listed', label: 'À venda', match: (s) => s === 'listed' },
  { id: 'burned', label: 'Queimados', match: (s) => s === 'burned' },
];

function RaritySheet({ ov, queriedAt }: { ov: Overview; queriedAt: number | null }) {
  const [view, setView] = useState<RarityView>('existing');
  const match = (RARITY_VIEWS.find((v) => v.id === view) ?? RARITY_VIEWS[0]).match;
  const counts = new Map<string, number>();
  // Gold Pouches have no rarity and are a tile of their own; "Único" is the item kind, counted apart from the gear rarities.
  for (const g of ov.items) {
    if (g.kind === 'gold_pouch' || !match(g.status)) continue;
    const key = g.kind === 'unique' ? 'unique' : (g.rarity ?? 'sem raridade');
    counts.set(key, (counts.get(key) ?? 0) + g.count);
  }
  const extra = [...counts.keys()].filter((k) => !RARITY_ORDER.includes(k) && k !== 'unique');
  const keys = [...RARITY_ORDER, ...extra, 'unique'];
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return (
    <Section id="rarity" icon="legendary" title="Itens por raridade" hint={`${fmtInt(total)} ${(RARITY_VIEWS.find((v) => v.id === view) ?? RARITY_VIEWS[0]).label.toLowerCase()}`} more={[{ href: '#/lendarios', label: 'Ver todos os Lendários' }]}>
      <div className="ov-tabs" role="group" aria-label="Estado dos itens">
        {RARITY_VIEWS.map((v) => (
          <button key={v.id} type="button" className="ov-tab" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <table className="data ov-compact">
        <caption className="ov-subtitle">Itens certificados de equipamento e únicos · bolsas de ouro e materiais ficam à parte</caption>
        <thead>
          <tr>
            <th scope="col">Raridade</th>
            <th scope="col" className="num">Itens</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row">
                <span className={`rar-pill rar-${RARITY_ORDER.includes(k) || k === 'unique' ? k : 'other'}`}>{RARITY_TEXT[k] ?? k}</span>
              </th>
              <td className="num">{fmtInt(counts.get(k) ?? 0)}</td>
            </tr>
          ))}
          <tr className="total">
            <th scope="row">Total</th>
            <td className="num">{fmtInt(total)}</td>
          </tr>
        </tbody>
      </table>
      <Freshness queriedAt={queriedAt} note="consulta direta dos certificados; cópias compradas contam como itens que existem" />
    </Section>
  );
}

// ---- Expandable lists: items, routines, league ----------------------------------------------------------------------------------------------------------------------

function Lists({ ov, ops, queriedAt, now }: { ov: Overview; ops: AsyncState<OpsOverview>; queriedAt: number | null; now: number }) {
  const items = summarizeItems(ov.items);
  const uniques = ov.items.filter((g) => g.kind === 'unique' && (g.status === 'held' || g.status === 'listed')).reduce((a, g) => a + g.count, 0);
  const fresh = ov.freshness;
  const agg = aggregateStatus(fresh, now);
  return (
    <>
      <Section id="items" icon="box" title="Itens e circulação" hint={`${fmtInt(items.existing)} itens certificados`} more={[{ href: '#/economia', label: 'Ver economia completa' }]}>
        <Ledger
          rows={[
            { label: 'Itens certificados existentes', value: fmtInt(items.existing) },
            { label: 'À venda', value: fmtInt(items.listed) },
            { label: 'Cópias compradas', value: fmtInt(items.bought) },
            { label: 'Lendários existentes', value: fmtInt(items.legendary) },
            { label: 'Épicos existentes', value: fmtInt(items.epic) },
            { label: 'Únicos existentes', value: fmtInt(uniques) },
            { label: 'Bolsas de Ouro não abertas', value: `${fmtInt(ov.pouches.outstanding)} · ${fmtInt(ov.pouches.outstanding_gold)} de ouro em face` },
            { label: 'Bolsas de Ouro abertas', value: fmtInt(ov.pouches.opened) },
            { label: 'Materiais negociáveis (saldos e anúncios)', value: `${fmtInt(materialsTotal(ov.materials))} em ${fmtInt(ov.materials.length)} tipos` },
            { label: `Ouro nos saves${fresh.player_cache_refreshed_at ? ` · cache ${fmtAgo(fresh.player_cache_refreshed_at, now)}` : ''}`, value: fmtInt(fresh.gold_total) },
          ]}
        />
        <Freshness queriedAt={queriedAt} aggregatedAt={agg.cache.at} aggregateLate={agg.cache.state !== 'fresh'} aggregateNote="ouro vem do cache dos saves; os itens e bolsas são consulta direta" />
      </Section>

      <Section id="league" icon="league" title="Liga e alertas" hint={ov.league.season ? `Temporada ${ov.league.season.number} — ${seasonStatusLabel(ov.league.season.status)}` : 'nenhuma temporada aberta'} more={[{ href: '#/liga', label: 'Ver ranking e auditoria' }, { href: '#/jogadores?alertas=1', label: 'Jogadores com alerta' }]}>
        <Ledger
          rows={[
            { label: 'Temporada', value: ov.league.season ? `${ov.league.season.number} — ${seasonStatusLabel(ov.league.season.status)}` : 'nenhuma aberta' },
            { label: 'Inscritos', value: fmtInt(ov.league.entries) },
            { label: 'Jogadores com alerta de progresso', value: fmtInt(ov.league.players_with_open_flags), warn: ov.league.players_with_open_flags > 0 },
            { label: 'Entradas sinalizadas · desqualificadas', value: `${fmtInt(ov.league.entries_flagged)} · ${fmtInt(ov.league.entries_disqualified)}` },
            { label: 'Contas com alerta de itens', value: fmtInt(ov.league.players_with_item_flags), warn: ov.league.players_with_item_flags > 0 },
          ]}
        />
        <Freshness queriedAt={queriedAt} note="um alerta é um sinal para investigar, não uma sentença" />
      </Section>

      <Section id="waitlist" icon="mail" title="Lista de espera" hint="abra para consultar" more={[{ href: '#/espera', label: 'Ver origens e indicações' }]}>
        {(open) => (open ? <WaitlistSummary /> : null)}
      </Section>

      <Section id="routines" icon="clock" title="Estado das rotinas" hint={routinesHint(ops, now)}>
        <RoutinesList ov={ov} ops={ops} now={now} />
      </Section>
    </>
  );
}

function routinesHint(ops: AsyncState<OpsOverview>, now: number): string {
  if (!ops.data) return ops.error ? 'não foi possível consultar' : 'consultando…';
  const w = watchdogState(ops.data.checks, now);
  return w.state === 'not-deployed' ? 'vigia sem execuções' : w.state === 'late' ? 'vigia atrasado' : 'vigia em dia';
}

function RoutinesList({ ov, ops, now }: { ov: Overview; ops: AsyncState<OpsOverview>; now: number }) {
  const agg = aggregateStatus(ov.freshness, now);
  const at = (iso: string | null) => (iso ? `${clockTime(new Date(iso).getTime())} · ${fmtAgo(iso, now)}` : 'nunca rodou');
  const rows: { label: string; value: ReactNode; warn?: boolean }[] = [
    { label: 'Consolidação diária', value: agg.daily.state === 'never' ? 'nunca rodou' : `${at(ov.freshness.daily_captured_at)}${agg.daily.state === 'late' ? ' (atrasada)' : ''}`, warn: agg.daily.state !== 'fresh' },
    { label: 'Cache dos jogadores', value: agg.cache.state === 'never' ? 'nunca rodou' : `${at(ov.freshness.player_cache_refreshed_at)}${agg.cache.state === 'late' ? ' (atrasado)' : ''}`, warn: agg.cache.state !== 'fresh' },
  ];
  const o = ops.data;
  if (o) {
    const w = watchdogState(o.checks, now);
    rows.unshift({
      label: 'Vigia',
      value: w.state === 'not-deployed' ? 'sem nenhuma execução registrada' : `${at(w.lastCheckedAt)}${w.state === 'late' ? ' (atrasado)' : ' · em dia'}`,
      warn: w.state !== 'running',
    });
    for (const c of o.checks) {
      rows.push({
        label: `Verificação: ${checkLabel(c.check)}`,
        value: c.consecutive_failures > 0 ? `${fmtInt(c.consecutive_failures)} falhas seguidas · última ok ${c.last_ok_at ? fmtAgo(c.last_ok_at, now) : 'nunca'}` : `ok · checada ${fmtAgo(c.last_checked_at, now)}`,
        warn: c.consecutive_failures > 0,
      });
    }
    for (const k of FLAG_ORDER) {
      const f = o.flags.find((x) => x.key === k);
      if (f) rows.push({ label: FLAG_INFO[k].label, value: f.value ? 'pausa ligada' : 'desligada', warn: f.value });
    }
    rows.push({ label: 'Incidentes abertos do vigia', value: fmtInt(o.incidents.length), warn: o.incidents.length > 0 });
    rows.push({ label: 'Relatórios da IA não lidos', value: fmtInt(o.open_reports), warn: o.open_reports > 0 });
  }
  return (
    <>
      <Ledger rows={rows} />
      {!o ? (
        <Notice tone={ops.error ? 'bad' : undefined}>
          {ops.error ? (
            <>
              Não foi possível consultar o vigia, os interruptores e os relatórios: {ops.error}. Isto <strong>não</strong> quer dizer que estão em dia.{' '}
              <button type="button" className="btn" onClick={ops.reload}>
                Tentar de novo
              </button>
            </>
          ) : (
            'Consultando o vigia, os interruptores e os relatórios…'
          )}
        </Notice>
      ) : ops.error ? (
        <Notice tone="warn">Não foi possível atualizar a operação: {ops.error}. Acima estão os dados anteriores, da consulta das {clockTime(ops.loadedAt)}.</Notice>
      ) : null}
      <p className="freshness">
        Operação consultada às {clockTime(ops.loadedAt)} · mais detalhes em <a href="#/ia-operacao">Ferramentas › IA e operação</a>
      </p>
    </>
  );
}

/** The waiting list, read only when its section is opened (one more query the owner does not always need). */
function WaitlistSummary() {
  const w = useAsync((api) => api.waitlist(30), []);
  const now = useNow(5000);
  return (
    <AsyncBlock state={w} label="a lista de espera" now={now} skeleton={80}>
      {(d) => {
        const t = d.totals;
        const period = d.by_day.reduce((a, x) => a + x.count, 0);
        return (
          <>
            <Ledger
              rows={[
                { label: 'Na lista', value: `${fmtInt(t.total)} · ${fmtInt(t.active)} ativos · ${fmtInt(t.unsubscribed)} saíram`, total: true },
                { label: 'Entraram em 30 dias', value: fmtInt(period) },
                { label: 'Chegaram por indicação', value: `${fmtInt(t.referred)} · ${fmtPercent(t.total ? t.referred / t.total : 0)}` },
                { label: 'Indicados qualificados', value: fmtInt(t.qualified) },
                { label: 'Já criaram conta no jogo', value: `${fmtInt(t.registered_in_game)} · ${fmtPercent(t.total ? t.registered_in_game / t.total : 0)}` },
                { label: 'Convites dentro do jogo', value: `${fmtInt(t.account_referred ?? 0)} · ${fmtInt(t.account_qualified ?? 0)} qualificados` },
                { label: 'Idioma', value: `${fmtInt(t.locale_pt)} pt · ${fmtInt(t.locale_en)} en` },
              ]}
            />
            <Freshness queriedAt={w.loadedAt} note="e-mails ficam mascarados; quem mais indicou está na página da lista de espera" />
          </>
        );
      }}
    </AsyncBlock>
  );
}
