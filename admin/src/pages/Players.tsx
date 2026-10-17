import { useCallback, useState } from 'react';
import { Drawer } from '../components/Drawer';
import { DataTable, ExportButton, Pager, type Column } from '../components/Table';
import { Card, DefList, ExternalLink, Field, Notice, Pill, Skeleton } from '../components/ui';
import { useApp, useAsync, useDebounced } from '../hooks';
import { activeFilterCount, defaultPlayerQuery, EXPORT_PAGE_SIZE, toggleSort } from '../lib/filters';
import { DASH, fmtDateTime, fmtGold, fmtInt, fmtSol, fmtAgo, shortAddress, shortId, solscanAccount, solscanTx } from '../lib/format';
import { kindLabel, passSourceLabel, rarityLabel, statusLabel } from '../lib/labels';
import type { PlayerFilters, PlayerQuery, PlayerRow, PlayerSort } from '../lib/types';

const levelText = (p: PlayerRow): string => (p.hero_level == null ? DASH : p.paragon_level ? `${p.hero_level} + P${p.paragon_level}` : String(p.hero_level));

const COLUMNS: Column<PlayerRow>[] = [
  { key: 'username', header: 'Jogador', sortKey: 'username', cell: (p) => (
    <span>
      {p.online ? <span className="dot live" title="online agora" /> : null} <strong>{p.username ?? <span className="faint">(sem nome)</span>}</strong>
      <div className="faint">{p.email_masked ?? DASH}</div>
    </span>
  ) },
  { key: 'level', header: 'Nível', sortKey: 'level', align: 'num', cell: (p) => levelText(p) },
  { key: 'floor', header: 'Andar', sortKey: 'floor', align: 'num', cell: (p) => (p.highest_floor == null ? DASH : fmtInt(p.highest_floor)) },
  { key: 'depth', header: 'Profundeza', sortKey: 'depth', align: 'num', cell: (p) => (p.deepest_depth == null ? DASH : fmtInt(p.deepest_depth)) },
  { key: 'gold', header: 'Ouro (save)', sortKey: 'gold', align: 'num', cell: (p) => fmtGold(p.gold) },
  { key: 'last_seen', header: 'Visto por último', sortKey: 'last_seen', cell: (p) => <span title={fmtDateTime(p.last_seen)}>{p.online ? 'agora' : fmtAgo(p.last_seen)}</span> },
  { key: 'created', header: 'Cadastro', sortKey: 'created', cell: (p) => fmtDateTime(p.created_at).slice(0, 10) },
  { key: 'pass', header: 'Passe', cell: (p) => (p.pass_source ? <Pill tone={p.pass_livemode || p.pass_source === 'grant' ? 'good' : 'warn'}>{passSourceLabel(p.pass_source)}{p.pass_livemode || p.pass_source === 'grant' ? '' : ' (teste)'}</Pill> : <span className="faint">—</span>) },
  { key: 'wallet', header: 'Carteira', cell: (p) => (p.wallet ? <span className="mono" title={p.wallet}>{shortAddress(p.wallet)}</span> : <span className="faint">—</span>) },
  { key: 'items', header: 'Itens', align: 'num', cell: (p) => fmtInt(p.items_held) },
  { key: 'trades', header: 'Vendas / compras', align: 'num', cell: (p) => `${p.sales} / ${p.purchases}` },
  { key: 'flags', header: 'Alertas', cell: (p) => (p.open_flags + p.item_flags > 0 ? <Pill tone="bad">{p.open_flags + p.item_flags}</Pill> : <span className="faint">—</span>) },
];

const SORT_HEADERS = new Set<string>(['username', 'level', 'floor', 'depth', 'gold', 'last_seen', 'created']);

export default function PlayersPage() {
  const { api } = useApp();
  const [q, setQ] = useState<PlayerQuery>(defaultPlayerQuery());
  const [openId, setOpenId] = useState<string | null>(null);
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
          <p>Quem são, quando jogaram, o que têm. O e-mail aparece mascarado; o completo só no painel de detalhes.</p>
        </div>
        <div className="head-actions">
          <ExportButton
            filename="jogadores"
            pageSize={EXPORT_PAGE_SIZE}
            fetchPage={(page) => api.players({ ...query, page, pageSize: EXPORT_PAGE_SIZE })}
            headers={['id', 'jogador', 'heroi', 'email_mascarado', 'cadastro', 'visto_por_ultimo', 'online', 'nivel', 'paragon', 'andar', 'profundeza', 'ouro_no_save', 'passe', 'passe_real', 'carteira', 'alertas_progresso', 'alertas_itens', 'itens', 'vendas', 'compras']}
            toRow={(p) => [p.user_id, p.username, p.hero_name, p.email_masked, p.created_at, p.last_seen, p.online, p.hero_level, p.paragon_level, p.highest_floor, p.deepest_depth, p.gold, p.pass_source, p.pass_livemode, p.wallet, p.open_flags, p.item_flags, p.items_held, p.sales, p.purchases]}
          />
        </div>
      </div>

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
            <option value="yes">Com Passe</option>
            <option value="no">Sem Passe</option>
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

      {list.error ? <Notice tone="bad">Não foi possível carregar: {list.error}</Notice> : null}
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
        />
        <Pager page={q.page} total={list.data?.total ?? 0} size={q.pageSize} onPage={(page) => setQ((s) => ({ ...s, page }))} />
      </Card>
      <p className="faint" style={{ marginTop: 10 }}>
        Nível, andar, profundeza e ouro vêm da rotina de cache (atualizada a cada poucas horas); “visto por último” é o último salvamento do personagem.
      </p>

      {openId ? <PlayerDrawer id={openId} summary={list.data?.rows.find((r) => r.user_id === openId) ?? null} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function PlayerDrawer({ id, summary, onClose }: { id: string; summary: PlayerRow | null; onClose: () => void }) {
  const detail = useAsync((a) => a.playerDetail(id), [id]);
  const [reveal, setReveal] = useState(false);
  const close = useCallback(onClose, [onClose]);
  const d = detail.data;
  return (
    <Drawer title={summary?.username ?? d?.account.username ?? 'Jogador'} subtitle={<span className="mono">{shortId(id)}</span>} onClose={close}>
      {detail.error ? <Notice tone="bad">{detail.error}</Notice> : null}
      {!d ? (
        detail.loading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={120} />
          </>
        ) : (
          <Notice>Conta não encontrada.</Notice>
        )
      ) : (
        <>
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

          <section>
            <h3>Passe e carteira</h3>
            {d.entitlements.length === 0 ? <p className="muted">Sem Passe.</p> : (
              <div className="stack">
                {d.entitlements.map((e, i) => (
                  <div key={i}>
                    <Pill tone={e.status === 'active' ? (e.livemode || e.source === 'grant' ? 'good' : 'warn') : 'bad'}>{passSourceLabel(e.source)}</Pill> {statusLabel(e.status)}
                    {e.livemode || e.source === 'grant' ? '' : ' · teste'} · {fmtDateTime(e.granted_at)} <span className="faint mono">{e.provider_ref.slice(0, 18)}</span>
                  </div>
                ))}
              </div>
            )}
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

          <section>
            <h3>Últimas negociações</h3>
            {d.sales.length === 0 ? <p className="muted">Sem vendas nem compras.</p> : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Papel</th>
                      <th>Item</th>
                      <th className="num">Preço</th>
                      <th>Transação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.sales.map((s) => (
                      <tr key={s.id}>
                        <td>{fmtDateTime(s.sold_at)}</td>
                        <td>{s.role === 'seller' ? 'vendeu' : 'comprou'}</td>
                        <td>{s.material_id ? `${fmtInt(s.material_qty)} × ${s.material_id}` : s.item_template}</td>
                        <td className="num">{fmtSol(s.price_lamports)}</td>
                        <td><ExternalLink href={solscanTx(s.tx_signature, s.livemode)}><span className="mono">{shortAddress(s.tx_signature, 4, 4)}</span></ExternalLink></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

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
        </>
      )}
    </Drawer>
  );
}
