import { useCallback, useEffect, useState } from 'react';
import { AccountActions } from '../components/AccountActions';
import { Drawer } from '../components/Drawer';
import { DataTable, ExportButton, Pager, type Column } from '../components/Table';
import { FullAudit, FullCredits, FullHero, FullInventory, FullInvites, FullMarket, FullMaterials, FullMissingNotice, FullPassSave, FullProgress, FullSummary } from '../components/PlayerFullView';
import { Card, DefList, ExternalLink, Field, Icon, Notice, PassBadge, Pill, Skeleton } from '../components/ui';
import { hashParam, useApp, useAsync, useDebounced } from '../hooks';
import { playerPassState } from '../lib/aggregate';
import { activeFilterCount, defaultPlayerQuery, EXPORT_PAGE_SIZE, toggleSort } from '../lib/filters';
import { DASH, fmtDateTime, fmtGold, fmtInt, fmtAgo, shortAddress, shortId, solscanAccount } from '../lib/format';
import { normalizeFull } from '../lib/full';
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

// Summary columns: who, how recently they played, how far they are, whether the Pass is valid now, alerts. Gold, wallet, items, trades and the rest are in the detail panel (click a row or press Enter).
const COLUMNS: Column<PlayerRow>[] = [
  {
    key: 'username',
    header: 'Jogador',
    sortKey: 'username',
    cell: (p) => (
      <span>
        <span className="who">
          <span className="monogram" aria-hidden="true">
            {(p.hero_name ?? p.username ?? '?').trim().charAt(0).toUpperCase() || '?'}
            {p.online ? <span className="dot live" /> : null}
          </span>
          <span>
            {p.online ? <span className="sr-only">online agora, </span> : null}
            <strong>{p.username ?? <span className="faint">(sem nome)</span>}</strong>
            <div className="faint">{p.email_masked ?? DASH}</div>
            <PhoneBadges p={p} />
          </span>
        </span>
      </span>
    ),
  },
  {
    key: 'last_seen',
    header: 'Atividade recente',
    sortKey: 'last_seen',
    cell: (p) => (
      <span title={fmtDateTime(p.last_seen)}>
        {p.online ? 'agora' : fmtAgo(p.last_seen)}
        <div className="faint">{p.last_seen ? 'último salvamento' : 'nunca salvou'}</div>
      </span>
    ),
  },
  {
    key: 'level',
    header: 'Progresso',
    sortKey: 'level',
    cell: (p) => (
      <span>
        <strong>{p.hero_level == null ? <span title={CACHE_HINT}>{DASH}</span> : `Nível ${levelText(p)}`}</strong>
        <div className="faint">{p.highest_floor == null ? <span title={CACHE_HINT}>{DASH}</span> : `andar ${fmtInt(p.highest_floor)}${p.deepest_depth ? ` · profundeza ${fmtInt(p.deepest_depth)}` : ''}`}</div>
      </span>
    ),
  },
  { key: 'pass', header: 'Passe válido', narrow: 'hide', cell: (p) => <PassBadge p={p} /> },
  { key: 'flags', header: 'Alertas', narrow: 'hide', cell: (p) => (p.open_flags + p.item_flags > 0 ? <Pill tone="bad">{p.open_flags + p.item_flags} a investigar</Pill> : <span className="faint">nenhum</span>) },
];

const SORT_HEADERS = new Set<string>(['username', 'level', 'last_seen']);

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
          <p>Quem são, quando jogaram, até onde foram e se o Passe vale nesta temporada. O resto está no painel de detalhes (clique na linha). O e-mail aparece mascarado; o completo só no detalhe.</p>
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
      <div className="players-list">
      <div className="toolbar">
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
      <Card flush>
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
      </Card>
      <p className="faint" style={{ marginTop: 10 }}>
        “Passe válido” segue a regra do jogo: vale para a temporada atual (a pré-temporada e a Temporada 1 usam o mesmo Passe). Nesta lista, nível, andar e profundeza vêm da rotina de cache (atualizada a cada poucas horas; um traço significa que a rotina ainda não passou pela conta). O painel de detalhes lê o save ao vivo. “Atividade recente” é o último salvamento do personagem.
      </p>

      </div>
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
          {full ? <FullSummary full={full} summary={summary} detail={d} /> : liveRaw.loading ? <Skeleton height={90} /> : liveRaw.error ? <FullMissingNotice message={liveRaw.error} /> : null}

          <section>
            <h3>Conta</h3>
            <DefList
              rows={[
                [
                  'E-mail',
                  <span key="e">
                    <span className="mono">{reveal ? d.account.email ?? DASH : summary?.email_masked ?? '***'}</span>{' '}
                    <button type="button" className="btn" onClick={() => setReveal((v) => !v)}>
                      {reveal ? 'Ocultar' : 'Mostrar e-mail completo'}
                    </button>
                  </span>,
                ],
                ['Confirmado', d.account.email_confirmed_at ? fmtDateTime(d.account.email_confirmed_at) : 'não'],
                ['Cadastro', fmtDateTime(d.account.created_at)],
                ['Último login', fmtDateTime(d.account.last_sign_in_at)],
                ['Herói', d.character ? `${d.character.hero_name} (revisão ${fmtInt(d.character.revision)})` : 'sem personagem'],
                ['Último salvamento', fmtDateTime(d.character?.updated_at)],
                ['Importado de save local', d.character?.imported_from_legacy ? 'sim' : 'não'],
              ]}
            />
          </section>

          {full ? (
            <>
              <FullHero full={full} />
              <FullInventory full={full} />
              <FullMaterials full={full} detail={d} />
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

          <section>
            <h3>Passe e carteira</h3>
            {d.pass ? (
              <DefList
                rows={[
                  ['Válido nesta temporada', <span key="v"><Pill tone={d.pass.valid_now ? 'good' : 'warn'}>{d.pass.valid_now ? 'sim' : 'não'}</Pill> <span className="faint">temporada atual: {d.pass.current_season}{d.pass.valid_through ? ` · último Passe cobre até a ${d.pass.valid_through}` : ''}</span></span>],
                  ['Entra no ranking', <span key="r"><Pill tone={d.pass.ranking_eligible ? 'good' : 'warn'}>{d.pass.ranking_eligible ? 'sim' : 'não'}</Pill> <span className="faint">regra do ranking: Passe real ou concedido e válido agora</span></span>],
                  ['Histórico de Passes', `${fmtInt(d.pass.history)} ${d.pass.history === 1 ? 'Passe ativo registrado' : 'Passes ativos registrados'}`],
                ]}
              />
            ) : (
              <Notice tone="warn">O banco ainda não diz se o Passe vale nesta temporada (migração 0026 não aplicada). Abaixo, só o histórico.</Notice>
            )}
            {d.entitlements.length === 0 ? <p className="muted">Sem Passe.</p> : (
              <div className="stack">
                {d.entitlements.map((e, i) => (
                  <div key={i}>
                    <Pill tone={e.status === 'active' ? (e.livemode || e.source === 'grant' ? 'good' : 'warn') : 'bad'}>{passSourceLabel(e.source)}</Pill> {statusLabel(e.status)}
                    {e.livemode || e.source === 'grant' ? '' : ' · teste'}
                    {e.valid_through_season != null ? ` · cobre até a Temporada ${e.valid_through_season}${e.status === 'active' ? (e.valid_now ? ' (vale agora)' : ' (expirado)') : ''}` : ''} · {fmtDateTime(e.granted_at)} <span className="faint mono">{e.provider_ref.slice(0, 18)}</span>
                  </div>
                ))}
              </div>
            )}
            {full ? <FullPassSave full={full} detail={d} /> : null}
            <p>
              {d.wallet ? (
                <>
                  Carteira: <ExternalLink href={solscanAccount(d.wallet.address, d.wallet.chain_id === 101)}><span className="mono">{shortAddress(d.wallet.address, 6, 6)}</span></ExternalLink> (ligada em {fmtDateTime(d.wallet.linked_at)})
                </>
              ) : (
                <span className="muted">Sem carteira ligada.</span>
              )}
            </p>
          </section>

          <section>
            <h3>Alertas</h3>
            {d.open_flags.length + d.item_flags.length === 0 ? <p className="muted">Nenhum alerta aberto.</p> : (
              <div className="stack">
                {d.open_flags.map((f, i) => (
                  <div key={`p${i}`}>
                    <Pill tone={f.verdict === 'rejected' ? 'bad' : 'warn'}>{f.verdict === 'rejected' ? 'rejeitado' : 'sinalizado'}</Pill> {fmtDateTime(f.created_at)} · <span className="mono">{f.reasons.join(', ') || '—'}</span>
                  </div>
                ))}
                {d.item_flags.map((f, i) => (
                  <div key={`i${i}`}>
                    <Pill tone="warn">itens</Pill> {fmtDateTime(f.created_at)} · <span className="mono">{f.code}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

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

          {full ? (
            <>
              <FullMarket full={full} detail={d} />
              <FullCredits full={full} />
              <FullInvites full={full} />
              <FullAudit full={full} />
            </>
          ) : null}

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
        </>
      )}
    </>
  );
  if (!pane) {
    return (
      <Drawer title={title} subtitle={<span className="mono">{shortId(id)}</span>} onClose={close}>
        {content}
      </Drawer>
    );
  }
  return (
    <aside className="player-pane" aria-label={`Ficha de ${title}`}>
      <div className="drawer-head">
        <div>
          <h2>{title}</h2>
          <div className="muted mono">{shortId(id)}</div>
        </div>
        <button type="button" className="btn ghost" onClick={close} aria-label="Fechar ficha">
          <Icon name="close" />
        </button>
      </div>
      <div className="drawer-body">{content}</div>
    </aside>
  );
}
