import { useCallback, useEffect, useState } from 'react';
import { AccountActions } from '../components/AccountActions';
import { Drawer } from '../components/Drawer';
import { DataTable, ExportButton, Pager, type Column } from '../components/Table';
import { FullAudit, FullCredits, FullHero, FullInventory, FullInvites, FullMarket, FullMaterials, FullMissingNotice, FullPassSave, FullProgress } from '../components/PlayerFullView';
import { DefList, ExternalLink, Field, Icon, Notice, Pill, Skeleton, type IconName } from '../components/ui';
import { hashParam, useApp, useAsync, useDebounced } from '../hooks';
import { playerPassState } from '../lib/aggregate';
import { activeFilterCount, defaultPlayerQuery, EXPORT_PAGE_SIZE, toggleSort } from '../lib/filters';
import { DASH, fmtDateTime, fmtGold, fmtInt, fmtAgo, shortAddress, shortId, solscanAccount } from '../lib/format';
import { normalizeFull, rarityTally } from '../lib/full';
import { kindLabel, passSourceLabel, rarityLabel, statusLabel } from '../lib/labels';
import type { PlayerFilters, PlayerQuery, PlayerRow, PlayerSort } from '../lib/types';

const CACHE_HINT = 'atualiza pela rotina';
const levelText = (p: PlayerRow): string => (p.hero_level == null ? DASH : p.paragon_level ? `${p.hero_level} + P${p.paragon_level}` : String(p.hero_level));

/** On a phone the Pass and the alerts columns are hidden; the same two facts appear here, under the player's name, so the table never needs a sideways scroll to answer "does he have a valid Pass, is anything wrong". */
function PhoneBadges({ p }: { p: PlayerRow }) {
  const state = playerPassState(p);
  const alerts = p.open_flags + p.item_flags;
  if (state === 'none' && alerts === 0) return null;
  return (
    <span className="show-narrow badges">
      {state === 'valid' ? <Pill tone="good">Passe válido</Pill> : state === 'expired' ? <Pill tone="warn">Passe expirado</Pill> : state === 'unknown' ? <Pill>Passe (histórico)</Pill> : null}
      {alerts > 0 ? <Pill tone="bad">{alerts} a investigar</Pill> : null}
    </span>
  );
}

/** The Pass in one word, for the list (origin in the tooltip). The full story (origin, real/test, ranking) is in the account sheet. */
function PassCell({ p }: { p: PlayerRow }) {
  const state = playerPassState(p);
  if (state === 'none') return <span className="faint" title="sem Passe">{DASH}<span className="sr-only">sem Passe</span></span>;
  const real = p.pass_livemode || p.pass_source === 'grant';
  const origin = `${passSourceLabel(p.pass_source)}${real ? '' : ' (teste)'}`;
  if (state === 'valid') return <span title={`${origin}${p.pass_ranking === false ? ' · fora do ranking' : ''}`}><Pill tone={real ? 'good' : 'warn'}>{real ? 'Válido' : 'Válido (teste)'}</Pill><span className="sr-only">, {origin}</span></span>;
  if (state === 'expired') return <span title={origin}><Pill tone="warn">Expirado</Pill><span className="sr-only">, {origin}</span></span>;
  return <span title={`${origin} · validade desconhecida`}><Pill>Histórico</Pill></span>;
}

// One line per player: who (name and masked e-mail), level, gold, the Pass, last seen, alerts. Everything else is in the account sheet (click a row or press Enter).
const COLUMNS: Column<PlayerRow>[] = [
  {
    key: 'username',
    header: 'Jogador',
    sortKey: 'username',
    cell: (p) => (
      <span className="who">
        <span className="monogram" aria-hidden="true">
          {(p.hero_name ?? p.username ?? '?').trim().charAt(0).toUpperCase() || '?'}
          {p.online ? <span className="dot live" /> : null}
        </span>
        <span className="who-text">
          {p.online ? <span className="sr-only">online agora, </span> : null}
          <strong>{p.username ?? <span className="faint">(sem nome)</span>}</strong>
          <span className="faint">{p.email_masked ?? DASH}</span>
          <PhoneBadges p={p} />
        </span>
      </span>
    ),
  },
  {
    key: 'level',
    header: 'Nível',
    sortKey: 'level',
    align: 'num',
    cell: (p) => (
      <span title={p.highest_floor == null ? CACHE_HINT : `andar ${fmtInt(p.highest_floor)}${p.deepest_depth ? ` · profundeza ${fmtInt(p.deepest_depth)}` : ''}`}>
        <strong>{p.hero_level == null ? DASH : levelText(p)}</strong>
      </span>
    ),
  },
  { key: 'gold', header: 'Ouro', sortKey: 'gold', align: 'num', narrow: 'hide', cell: (p) => (p.gold == null ? <span className="faint" title={CACHE_HINT}>{DASH}</span> : <span className="gold-num">{fmtInt(p.gold)}</span>) },
  { key: 'pass', header: 'Passe', narrow: 'hide', cell: (p) => <PassCell p={p} /> },
  {
    key: 'last_seen',
    header: 'Último acesso',
    sortKey: 'last_seen',
    cell: (p) => <span title={p.last_seen ? `último salvamento: ${fmtDateTime(p.last_seen)}` : 'nunca salvou'}>{p.online ? 'agora' : p.last_seen ? fmtAgo(p.last_seen) : 'nunca'}</span>,
  },
  {
    key: 'flags',
    header: 'Alertas',
    narrow: 'hide',
    align: 'num',
    cell: (p) => (p.open_flags + p.item_flags > 0 ? <span title={`${p.open_flags + p.item_flags} alertas a investigar`}><Pill tone="bad">{p.open_flags + p.item_flags}</Pill></span> : <span className="faint">{DASH}</span>),
  },
];

type SheetTab = 'resumo' | 'heroi' | 'itens' | 'progresso' | 'atividade';
const SHEET_TABS: { id: SheetTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'heroi', label: 'Herói' },
  { id: 'itens', label: 'Itens' },
  { id: 'progresso', label: 'Progresso' },
  { id: 'atividade', label: 'Atividade' },
];

/** The account's main numbers, read live from the save, as small tiles (like the owner's example). */
function StatTiles({ full, summary }: { full: NonNullable<ReturnType<typeof normalizeFull>>; summary: PlayerRow | null }) {
  const sv = full.save;
  if (!sv) return <Notice tone="warn">Esta conta ainda não tem personagem salvo: não há nada de jogo para mostrar.</Notice>;
  const tiles: { icon: IconName; label: string; value: string }[] = [
    { icon: 'star', label: 'Nível', value: `${sv.level}${sv.paragon_level ? ` + P${fmtInt(sv.paragon_level)}` : ''}` },
    { icon: 'coin', label: 'Ouro no save', value: fmtInt(sv.gold) },
    { icon: 'gem', label: 'Éter (cristais)', value: fmtInt(sv.shards) },
    { icon: 'stairs', label: 'Andar mais alto', value: fmtInt(sv.highest_dungeon_floor) },
    { icon: 'down', label: 'Profundeza', value: fmtInt(sv.counters.deepest_depth) },
    { icon: 'trade', label: 'Vendas / compras', value: summary ? `${fmtInt(summary.sales)} / ${fmtInt(summary.purchases)}` : `${fmtInt(full.market.sold.count)} / ${fmtInt(full.market.bought.count)}` },
  ];
  return (
    <dl className="pf-stats">
      {tiles.map((t) => (
        <div key={t.label} className="pf-stat">
          <dt>
            <Icon name={t.icon} />
            {t.label}
          </dt>
          <dd>{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The top of the account sheet: initial, name, online or last seen, masked e-mail. */
function SheetHead({ title, summary, id, onClose }: { title: string; summary: PlayerRow | null; id: string; onClose?: () => void }) {
  return (
    <div className="pf-head">
      <span className="monogram big" aria-hidden="true">
        {(summary?.hero_name ?? title).trim().charAt(0).toUpperCase() || '?'}
      </span>
      <div className="pf-head-text">
        {onClose ? <h2>{title}</h2> : null}
        <div className="pf-head-line">
          {summary?.online ? <Pill tone="good">Online</Pill> : summary?.last_seen ? <span className="faint">visto {fmtAgo(summary.last_seen)}</span> : null}
          <span className="mono faint">{summary?.email_masked ?? shortId(id)}</span>
        </div>
      </div>
      {onClose ? (
        <button type="button" className="btn ghost" onClick={onClose} aria-label="Fechar ficha">
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}

const SORT_HEADERS = new Set<string>(['username', 'level', 'last_seen', 'gold']);

/** On a wide screen the account opens BESIDE the list (the owner keeps both in view); on a phone or a narrow window it opens as a modal panel. */
const WIDE = '(min-width: 1180px)';
function useWide(): boolean {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null;
  const [wide, setWide] = useState(() => Boolean(query?.matches));
  useEffect(() => {
    if (!query) return;
    const on = () => setWide(query.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, [query]);
  return wide;
}

/** Links from other pages open this one already filtered: #/jogadores?q=texto, ?alertas=1 (only accounts with alerts), ?passe=expired|yes|no|history. */
function initialQuery(): PlayerQuery {
  const passe = hashParam('passe');
  const base = defaultPlayerQuery();
  return { ...base, search: hashParam('q'), filters: { ...(hashParam('alertas') === '1' ? { flagged: true } : {}), ...(passe === 'yes' || passe === 'no' || passe === 'expired' || passe === 'history' ? { pass: passe } : {}) } };
}

export default function PlayersPage() {
  const { api } = useApp();
  const [q, setQ] = useState<PlayerQuery>(() => initialQuery());
  const [openId, setOpenId] = useState<string | null>(null);
  const wide = useWide();
  const side = Boolean(openId && wide);
  const search = useDebounced(q.search, 350);
  const query: PlayerQuery = { ...q, search };
  const list = useAsync((a) => a.players(query), [JSON.stringify(query)]);

  const setFilter = (patch: Partial<PlayerFilters>) => setQ((s) => ({ ...s, page: 0, filters: { ...s.filters, ...patch } }));
  const filtersOn = activeFilterCount(q.filters);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jogadores</h1>
          <p>Clique num jogador para abrir a ficha.</p>
        </div>
        <div className="head-actions">
          <ExportButton
            filename="jogadores"
            pageSize={EXPORT_PAGE_SIZE}
            fetchPage={(page) => api.players({ ...query, page, pageSize: EXPORT_PAGE_SIZE })}
            headers={['id', 'jogador', 'heroi', 'email_mascarado', 'cadastro', 'visto_por_ultimo', 'online', 'nivel', 'paragon', 'andar', 'profundeza', 'ouro_no_save', 'passe_valido_agora', 'passe_ranking', 'passes_no_historico', 'passe_valido_ate_temporada', 'passe_origem', 'passe_real', 'carteira', 'alertas_progresso', 'alertas_itens', 'itens', 'vendas', 'compras']}
            toRow={(p) => [p.user_id, p.username, p.hero_name, p.email_masked, p.created_at, p.last_seen, p.online, p.hero_level, p.paragon_level, p.highest_floor, p.deepest_depth, p.gold, p.pass_valid_now, p.pass_ranking, p.pass_history, p.pass_valid_through, p.pass_source, p.pass_livemode, p.wallet, p.open_flags, p.item_flags, p.items_held, p.sales, p.purchases]}
          />
        </div>
      </div>

      <div className={side ? 'players-split' : undefined}>
      <section className="card players-card players-list">
      <div className="toolbar players-tools">
        <div className="grow">
          <Field label="Buscar">
            <input className="input" type="search" placeholder="nome do jogador, herói, e-mail ou id" value={q.search} onChange={(e) => setQ((s) => ({ ...s, search: e.target.value, page: 0 }))} aria-label="Buscar jogador" />
          </Field>
        </div>
        <Field label="Ordenar por">
          <select className="select" value={q.sort} onChange={(e) => setQ((s) => ({ ...s, sort: e.target.value as PlayerSort, page: 0, dir: e.target.value === 'username' ? 'asc' : 'desc' }))}>
            <option value="last_seen">Visto por último</option>
            <option value="created">Cadastro</option>
            <option value="level">Nível</option>
            <option value="floor">Andar</option>
            <option value="depth">Profundeza</option>
            <option value="gold">Ouro</option>
            <option value="username">Nome</option>
          </select>
        </Field>
        <Field label="Passe">
          <select className="select" value={q.filters.pass ?? ''} onChange={(e) => setFilter({ pass: (e.target.value || undefined) as PlayerFilters['pass'] })}>
            <option value="">Todos</option>
            <option value="yes">Válido nesta temporada</option>
            <option value="no">Sem Passe válido agora</option>
            <option value="expired">Expirado (já teve)</option>
            <option value="history">Já teve Passe (histórico)</option>
          </select>
        </Field>
        <label className="check">
          <input type="checkbox" checked={Boolean(q.filters.online)} onChange={(e) => setFilter({ online: e.target.checked })} /> Online agora
        </label>
        <label className="check">
          <input type="checkbox" checked={Boolean(q.filters.flagged)} onChange={(e) => setFilter({ flagged: e.target.checked })} /> Com alertas
        </label>
        <label className="check">
          <input type="checkbox" checked={Boolean(q.filters.wallet)} onChange={(e) => setFilter({ wallet: e.target.checked })} /> Com carteira
        </label>
        {filtersOn > 0 || q.search ? (
          <button type="button" className="btn ghost" onClick={() => setQ(defaultPlayerQuery())}>
            Limpar
          </button>
        ) : null}
      </div>

      {list.error ? (
        <Notice tone="bad">
          Não foi possível carregar: {list.error}{' '}
          <button type="button" className="btn" onClick={() => list.reload()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}
        <DataTable
          caption="Jogadores"
          columns={COLUMNS}
          rows={list.data?.rows ?? []}
          rowKey={(p) => p.user_id}
          loading={list.loading}
          empty="Nenhum jogador com esses filtros."
          sort={{ key: q.sort, dir: q.dir }}
          onSort={(k) => SORT_HEADERS.has(k) && setQ((s) => toggleSort(s, k as PlayerSort))}
          onRowClick={(p) => setOpenId(p.user_id)}
          selectedKey={openId}
        />
        <Pager page={q.page} total={list.data?.total ?? 0} size={q.pageSize} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        <details className="players-note">
          <summary>Como ler esta lista</summary>
          <p className="faint">“Passe” segue a regra do jogo: vale para a temporada atual (a pré-temporada e a Temporada 1 usam o mesmo Passe). Nível, ouro e andar desta lista vêm da rotina de cache (atualizada a cada poucas horas; um traço quer dizer que ela ainda não passou pela conta). A ficha lê o save ao vivo. “Último acesso” é o último salvamento do personagem.</p>
        </details>
      </section>

      {openId ? <PlayerDrawer key={openId} id={openId} pane={side} summary={list.data?.rows.find((r) => r.user_id === openId) ?? null} onClose={() => setOpenId(null)} onDeleted={() => { setOpenId(null); list.reload(); }} onListChanged={() => list.reload()} /> : null}
      </div>
    </>
  );
}

function PlayerDrawer({ id, pane, summary, onClose, onDeleted, onListChanged }: { id: string; pane: boolean; summary: PlayerRow | null; onClose: () => void; onDeleted: () => void; onListChanged: () => void }) {
  const detail = useAsync((a) => a.playerDetail(id), [id]);
  const liveRaw = useAsync((a) => a.playerFull(id), [id]);
  const full = liveRaw.data === undefined ? null : normalizeFull(liveRaw.data);
  const [reveal, setReveal] = useState(false);
  const [tab, setTab] = useState<SheetTab>('resumo');
  const close = useCallback(onClose, [onClose]);
  const d = detail.data;
  const title = summary?.username ?? d?.account.username ?? 'Jogador';
  const content = (
    <>
      {detail.error ? (
        <Notice tone="bad">
          {detail.error}{' '}
          <button type="button" className="btn" onClick={() => detail.reload()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}
      {!d ? (
        detail.loading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={120} />
          </>
        ) : detail.error ? null : (
          <Notice>Conta não encontrada.</Notice>
        )
      ) : (
        <>
          <div className="pf-tabs" role="tablist" aria-label="Partes da ficha">
            {SHEET_TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`pf-${id}-tab-${t.id}`} aria-controls={`pf-${id}-${t.id}`} aria-selected={tab === t.id} className="pf-tab" onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`pf-${id}-resumo`} aria-labelledby={`pf-${id}-tab-resumo`} hidden={tab !== 'resumo'} className="pf-panel">
            {full ? <StatTiles full={full} summary={summary} /> : liveRaw.loading ? <Skeleton height={90} /> : liveRaw.error ? <FullMissingNotice message={liveRaw.error} /> : null}

            <section className="pf-card">
              <h3>Passe de Aventureiro</h3>
              {d.pass ? (
                <DefList
                  rows={[
                    ['Válido nesta temporada', <span key="v" className="pf-inline"><Pill tone={d.pass.valid_now ? 'good' : 'warn'}>{d.pass.valid_now ? 'sim' : 'não'}</Pill> <span className="faint">Temporada {d.pass.current_season}{d.pass.valid_through ? ` · cobre até a ${d.pass.valid_through}` : ''}</span></span>],
                    ['Entra no ranking', <Pill key="r" tone={d.pass.ranking_eligible ? 'good' : 'warn'}>{d.pass.ranking_eligible ? 'sim' : 'não'}</Pill>],
                    ['Histórico de Passes', d.pass.history ? `${fmtInt(d.pass.history)} ${d.pass.history === 1 ? 'registrado' : 'registrados'}` : 'nenhum'],
                    ['Carteira', d.wallet ? <ExternalLink key="w" href={solscanAccount(d.wallet.address, d.wallet.chain_id === 101)}><span className="mono">{shortAddress(d.wallet.address, 6, 6)}</span></ExternalLink> : 'não ligada'],
                  ]}
                />
              ) : (
                <Notice tone="warn">O banco ainda não diz se o Passe vale nesta temporada (migração 0026 não aplicada).</Notice>
              )}
              {d.entitlements.length ? (
                <ul className="pf-list">
                  {d.entitlements.map((e, i) => (
                    <li key={i}>
                      <Pill tone={e.status === 'active' ? (e.livemode || e.source === 'grant' ? 'good' : 'warn') : 'bad'}>{passSourceLabel(e.source)}</Pill>
                      <span>
                        {statusLabel(e.status)}
                        {e.livemode || e.source === 'grant' ? '' : ' · teste'}
                        {e.valid_through_season != null ? ` · até a Temporada ${e.valid_through_season}` : ''}
                      </span>
                      <span className="faint">{fmtDateTime(e.granted_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {full ? (
                <details className="pf-more">
                  <summary>Passe dentro do jogo (nível, recompensas, aparência)</summary>
                  <FullPassSave full={full} detail={d} />
                </details>
              ) : null}
            </section>

            <section className="pf-card">
              <h3>Alertas{d.open_flags.length + d.item_flags.length ? ` (${d.open_flags.length + d.item_flags.length})` : ''}</h3>
              {d.open_flags.length + d.item_flags.length === 0 ? (
                <p className="pf-ok">Nenhum alerta aberto.</p>
              ) : (
                <ul className="pf-list">
                  {d.open_flags.map((f, i) => (
                    <li key={`p${i}`}>
                      <Pill tone={f.verdict === 'rejected' ? 'bad' : 'warn'}>{f.verdict === 'rejected' ? 'rejeitado' : 'sinalizado'}</Pill>
                      <span className="mono">{f.reasons.join(', ') || '—'}</span>
                      <span className="faint">{fmtDateTime(f.created_at)}</span>
                    </li>
                  ))}
                  {d.item_flags.map((f, i) => (
                    <li key={`i${i}`}>
                      <Pill tone="warn">itens</Pill>
                      <span className="mono">{f.code}</span>
                      <span className="faint">{fmtDateTime(f.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="pf-card">
              <h3>Conta</h3>
              <DefList
                rows={[
                  [
                    'E-mail',
                    <span key="e" className="pf-inline">
                      <span className="mono">{reveal ? d.account.email ?? DASH : summary?.email_masked ?? '***'}</span>
                      <button type="button" className="btn btn-sm" onClick={() => setReveal((v) => !v)}>
                        {reveal ? 'Ocultar' : 'Mostrar e-mail completo'}
                      </button>
                    </span>,
                  ],
                  ['Confirmado', d.account.email_confirmed_at ? fmtDateTime(d.account.email_confirmed_at) : 'não'],
                  ['Cadastro', fmtDateTime(d.account.created_at)],
                  ['Último login', fmtDateTime(d.account.last_sign_in_at)],
                  ['Último salvamento', d.character ? `${fmtDateTime(d.character.updated_at)} · revisão ${fmtInt(d.character.revision)}` : 'sem personagem'],
                  ['Importado de save local', d.character?.imported_from_legacy ? 'sim' : 'não'],
                ]}
              />
              {full ? <p className="faint pf-foot">Dados lidos do save às {fmtDateTime(full.generated_at)}.</p> : null}
            </section>
          </div>
          <div role="tabpanel" id={`pf-${id}-heroi`} aria-labelledby={`pf-${id}-tab-heroi`} hidden={tab !== 'heroi'} className="pf-panel">
          {full ? <FullHero full={full} /> : <p className="muted">{liveRaw.loading ? 'Lendo o save…' : 'Sem dados do herói ao vivo.'}</p>}
          </div>
          <div role="tabpanel" id={`pf-${id}-itens`} aria-labelledby={`pf-${id}-tab-itens`} hidden={tab !== 'itens'} className="pf-panel">
          {full ? (
            <>
              {full.save ? (
                <DefList
                  rows={[
                    ['Equipamentos no save', (() => { const t = rarityTally(full.save.gear); return `${fmtInt(full.save.gear.length)} (${t.common} comuns · ${t.rare} raros · ${t.epic} épicos · ${t.legendary} lendários)`; })()],
                  ]}
                />
              ) : null}
              <FullInventory full={full} />
              <FullMaterials full={full} detail={d} />
            </>
          ) : null}
          <section>
            <h3>Itens certificados</h3>
            {d.certificates.length === 0 ? <p className="muted">Nenhum item certificado.</p> : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Raridade</th>
                      <th>Estado</th>
                      <th className="num">Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.certificates.map((c, i) => (
                      <tr key={i}>
                        <td>{kindLabel(c.kind)}</td>
                        <td>{rarityLabel(c.rarity)}</td>
                        <td>{statusLabel(c.status)}{c.bound ? ' · vinculado' : ''}</td>
                        <td className="num">{fmtInt(c.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          </div>
          <div role="tabpanel" id={`pf-${id}-progresso`} aria-labelledby={`pf-${id}-tab-progresso`} hidden={tab !== 'progresso'} className="pf-panel">
          {full ? (
            <>
              <FullProgress full={full} />
            </>
          ) : liveRaw.loading ? null : (
            <section>
              <h3>Progresso</h3>
              {d.stats ? (
                <DefList
                  rows={[
                    ['Nível', d.stats.hero_level == null ? DASH : `${d.stats.hero_level}${d.stats.paragon_level ? ` + Paragon ${d.stats.paragon_level}` : ''}`],
                    ['Andar mais alto', fmtInt(d.stats.highest_floor)],
                    ['Profundeza', fmtInt(d.stats.deepest_depth)],
                    ['Ouro no save', fmtGold(d.stats.gold)],
                    ['Itens no save', `${fmtInt(d.stats.items_common)} comuns · ${fmtInt(d.stats.items_rare)} raros · ${fmtInt(d.stats.items_epic)} épicos · ${fmtInt(d.stats.items_legendary)} lendários`],
                    ['Dados de', fmtDateTime(d.stats.refreshed_at)],
                  ]}
                />
              ) : (
                <p className="muted">Ainda sem dados de progresso (a rotina de cache não passou por esta conta).</p>
              )}
            </section>
  
          )}

          {d.season_entries.length ? (
            <section>
              <h3>Liga</h3>
              {d.season_entries.map((e) => (
                <div key={e.season}>
                  Temporada {e.season}: nível {fmtInt(e.level_total)}, andar {fmtInt(e.highest_floor)}{e.disqualified ? ' · desqualificado' : ''}{e.flags.length ? ` · ${e.flags.join(', ')}` : ''}
                </div>
              ))}
            </section>
          ) : null}

          </div>
          <div role="tabpanel" id={`pf-${id}-atividade`} aria-labelledby={`pf-${id}-tab-atividade`} hidden={tab !== 'atividade'} className="pf-panel">
          {full ? (
            <>
              <FullMarket full={full} detail={d} />
              <FullCredits full={full} />
              <FullInvites full={full} />
              <FullAudit full={full} />
            </>
          ) : null}

          </div>
          <div className="pf-actions">
          <AccountActions
            subject={{
              userId: id,
              username: d.account.username,
              heroName: d.character?.hero_name ?? null,
              email: d.account.email,
              pass: d.pass ? { valid_now: d.pass.valid_now, current_season: d.pass.current_season } : null,
              currentSources: d.entitlements.filter((e) => e.status === 'active' && e.valid_now !== false).map((e) => e.source),
            }}
            onDeleted={onDeleted}
            onChanged={() => {
              detail.reload();
              onListChanged();
            }}
          />
          </div>
        </>
      )}
    </>
  );
  if (!pane) {
    return (
      <Drawer title={title} header={(x) => <SheetHead title={title} summary={summary} id={id} onClose={x} />} onClose={close}>
        {content}
      </Drawer>
    );
  }
  return (
    <aside className="player-pane" aria-label={`Ficha de ${title}`}>
      <SheetHead title={title} summary={summary} id={id} onClose={close} />
      <div className="drawer-body">{content}</div>
    </aside>
  );
}
