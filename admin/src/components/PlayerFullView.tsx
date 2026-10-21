import type { ReactNode } from 'react';
import { DefList, ExternalLink, Notice, Pill } from './ui';
import { DASH, fmtAgo, fmtDateTime, fmtInt, fmtSol, humanize, shortId, solscanTx } from '../lib/format';
import {
  PROFESSION_LABEL, auditActionLabel, bagGear, countEntries, creditLabel, CREDIT_SOURCE_LABEL, fmtDuration, gearDetails, huntingLine, passMismatch, promoRewardLabel, rarityTally, sumCounts, wornGear,
} from '../lib/full';
import { rarityLabel, slotLabel, statusLabel, VERDICT_LABEL } from '../lib/labels';
import type { FullGear, PlayerDetail, PlayerFull, PlayerRow } from '../lib/types';

const num = (n: number | null | undefined): string => (n == null ? DASH : fmtInt(n));

/** A section that can be folded (a native <details>, so it works without script and with the keyboard). */
export function Fold({ title, hint, open, children }: { title: string; hint?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="fold" open={open}>
      <summary>
        <span className="fold-title">{title}</span>
        {hint ? <span className="faint fold-hint">{hint}</span> : null}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

function CountTable({ rows, empty, label }: { rows: [string, number][]; empty: string; label: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">Qtd</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, n]) => (
            <tr key={id}>
              <td>{humanize(id)}</td>
              <td className="num">{fmtInt(n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GearTable({ rows, empty }: { rows: FullGear[]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Peça</th>
            <th>Raridade</th>
            <th>Nível</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td>
                <strong>{humanize(g.template_id)}</strong>
                <div className="faint">
                  {g.equipped_slot ? `usando: ${slotLabel(g.equipped_slot)}` : g.slot ? slotLabel(g.slot) : DASH}
                  {g.bound ? ' · vinculada' : ''}
                  {g.certified ? ' · certificada' : ''}
                </div>
              </td>
              <td>{rarityLabel(g.rarity)}</td>
              <td>{g.tier == null ? DASH : `tier ${g.tier}`}</td>
              <td>{gearDetails(g)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Resumo": the first thing the owner sees, from the LIVE save (not from the cache). */
export function FullSummary({ full, summary, detail }: { full: PlayerFull; summary: PlayerRow | null; detail: PlayerDetail }) {
  const s = full.save;
  const certHeld = detail.certificates.filter((c) => c.status === 'held' && c.kind !== 'gold_pouch').reduce((t, c) => t + c.count, 0);
  const certListed = detail.certificates.filter((c) => c.status === 'listed' && c.kind !== 'gold_pouch').reduce((t, c) => t + c.count, 0);
  const tally = s ? rarityTally(s.gear) : null;
  return (
    <section>
      <h3>Resumo</h3>
      {!s ? <Notice tone="warn">Esta conta ainda não tem personagem salvo: não há nada de jogo para mostrar.</Notice> : null}
      <DefList
        rows={[
          ['Nível', s ? `${s.level}${s.paragon_level ? ` + Paragon ${fmtInt(s.paragon_level)}` : ''}` : DASH],
          ['Ouro no save', s ? num(s.gold) : DASH],
          ['Éter (cristais)', s ? num(s.shards) : DASH],
          ['Andar mais alto na masmorra', s ? num(s.highest_dungeon_floor) : DASH],
          ['Profundeza mais funda', s ? num(s.counters.deepest_depth) : DASH],
          ['Equipamentos no save', s && tally ? `${fmtInt(s.gear.length)} (${tally.common} comuns · ${tally.rare} raros · ${tally.epic} épicos · ${tally.legendary} lendários)` : DASH],
          ['Itens certificados', `${fmtInt(certHeld)} com o jogador · ${fmtInt(certListed)} à venda`],
          ['Vendas / compras', summary ? `${fmtInt(summary.sales)} / ${fmtInt(summary.purchases)}` : `${fmtInt(full.market.sold.count)} / ${fmtInt(full.market.bought.count)}`],
          ['Último salvamento', s ? `${fmtDateTime(s.updated_at)} (${fmtAgo(s.updated_at)}) · revisão ${fmtInt(s.revision)}` : DASH],
          ['Cadastro', fmtDateTime(detail.account.created_at)],
          ['Dados lidos em', fmtDateTime(full.generated_at)],
        ]}
      />
    </section>
  );
}

export function FullHero({ full }: { full: PlayerFull }) {
  const s = full.save;
  if (!s) return null;
  const a = s.attributes;
  const c = s.counters;
  return (
    <Fold title="Herói" hint={`${s.hero_name} · nível ${s.level}`} open>
      <DefList
        rows={[
          ['Nome do herói', s.hero_name],
          ['Nível e XP', `${s.level}${s.paragon_level ? ` + Paragon ${fmtInt(s.paragon_level)}` : ''} · ${fmtInt(s.xp)} de XP`],
          ['Atributos', `Força ${num(a.str)} · Vitalidade ${num(a.vit)} · Agilidade ${num(a.agi)} · Resistência ${num(a.res)}`],
          ['Evolução do equipamento', `arma +${num(s.weapon_level)} · armadura +${num(s.armor_level)}`],
          ['Pontos de habilidade gastos', s.skill_tree.spent.length ? s.skill_tree.spent.map((n, i) => `conjunto ${i + 1}: ${fmtInt(n)}${s.skill_tree.active_set === i ? ' (ativo)' : ''}`).join(' · ') : DASH],
          ['Respec grátis usado', s.skill_tree.respec_used ? 'sim' : 'não'],
          ['Caça', huntingLine(s.hunting)],
          ['Zonas de caça liberadas', s.hunting.unlocked_zones.length ? s.hunting.unlocked_zones.map(humanize).join(', ') : DASH],
          ['Masmorra', `andar ${num(s.highest_dungeon_floor)} · ${num(c.dungeon_runs)} corridas · ${num(c.dungeon_floors)} andares vencidos · ${num(c.bosses_killed)} chefes`],
          ['Vitórias / monstros derrotados', `${num(s.victories)} / ${num(c.kills)}`],
          ['Ouro ganhado na vida', num(c.gold_earned)],
          ['Tempo de jogo', fmtDuration(c.seconds_played)],
          ['Forja', `${num(c.items_forged)} peças · ${num(c.uniques_found)} únicas achadas · refino ${num(c.refine_success)} ok / ${num(c.refine_fail)} falhas`],
          ['Entregas feitas / poções feitas', `${num(c.deliveries)} / ${num(c.potions_brewed)}`],
        ]}
      />
      <h4 className="fold-sub">Profissões</h4>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Profissão</th>
              <th className="num">Nível</th>
              <th className="num">XP</th>
              <th>Em atividade</th>
            </tr>
          </thead>
          <tbody>
            {s.professions.map((p) => (
              <tr key={p.id}>
                <td>{PROFESSION_LABEL[p.id] ?? humanize(p.id)}</td>
                <td className="num">{fmtInt(p.level)}</td>
                <td className="num">{fmtInt(p.xp)}</td>
                <td>{p.active ? humanize(String(p.active)) : <span className="faint">nada</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4 className="fold-sub">Equipamento em uso</h4>
      <GearTable rows={wornGear(s.gear)} empty="Nada equipado." />
    </Fold>
  );
}

export function FullInventory({ full }: { full: PlayerFull }) {
  const s = full.save;
  if (!s) return null;
  const bag = bagGear(s.gear);
  const relic = Object.entries(s.equipped).find(([k, v]) => k === 'relic' && v);
  return (
    <Fold title="Inventário e baú" hint={`${fmtInt(bag.length)} peças na mochila · baú nível ${num(s.stash.level)}`}>
      <DefList
        rows={[
          ['Capacidade da mochila', num(s.inventory_capacity)],
          ['Baú do acampamento', `nível ${num(s.stash.level)}${s.stash.bonus_slots ? ` · +${fmtInt(s.stash.bonus_slots)} espaços de Passe` : ''}`],
          ['Relíquia equipada', relic ? humanize(String(relic[1])) : DASH],
        ]}
      />
      <h4 className="fold-sub">Peças de equipamento fora do corpo ({fmtInt(bag.length)})</h4>
      <GearTable rows={bag} empty="Nenhuma peça guardada." />
      <h4 className="fold-sub">Itens empilháveis na mochila</h4>
      <CountTable rows={countEntries(s.inventory)} empty="Nenhum." label="Item" />
      <h4 className="fold-sub">No baú: peças empilháveis</h4>
      <CountTable rows={countEntries(s.stash.gear)} empty="Nenhuma." label="Item" />
    </Fold>
  );
}

export function FullMaterials({ full, detail }: { full: PlayerFull; detail: PlayerDetail }) {
  const s = full.save;
  if (!s) return null;
  const lots = detail.materials.filter((m) => m.qty > 0 || m.pending > 0);
  return (
    <Fold title="Materiais e poções" hint={`${fmtInt(sumCounts(s.materials))} materiais · ${fmtInt(sumCounts(s.potions) + sumCounts(s.consumables))} poções e consumíveis`}>
      <h4 className="fold-sub">Materiais na mochila</h4>
      <CountTable rows={countEntries(s.materials)} empty="Nenhum material." label="Material" />
      <h4 className="fold-sub">Materiais negociáveis (o save conta {fmtInt(sumCounts(s.tradeable_materials))}; o servidor guarda o saldo)</h4>
      <CountTable rows={lots.map((m): [string, number] => [m.material_id, m.qty])} empty="Sem saldo negociável no servidor." label="Material" />
      {lots.some((m) => m.pending > 0) ? <p className="faint">Aguardando entrega ao save: {lots.filter((m) => m.pending > 0).map((m) => `${humanize(m.material_id)} ×${fmtInt(m.pending)}`).join(' · ')}</p> : null}
      <h4 className="fold-sub">Poções</h4>
      <CountTable rows={countEntries(s.potions)} empty="Nenhuma poção." label="Poção" />
      <h4 className="fold-sub">Consumíveis</h4>
      <CountTable rows={countEntries(s.consumables)} empty="Nenhum." label="Consumível" />
      <h4 className="fold-sub">No baú</h4>
      <CountTable rows={[...countEntries(s.stash.materials), ...countEntries(s.stash.consumables)]} empty="Nada no baú." label="Item" />
      <h4 className="fold-sub">Gemas</h4>
      <CountTable rows={countEntries(s.gems)} empty="Nenhuma gema." label="Gema" />
    </Fold>
  );
}

export function FullProgress({ full }: { full: PlayerFull }) {
  const p = full.progress;
  return (
    <Fold title="Progresso e auditoria" hint={p.latest_verdict ? `último veredito: ${VERDICT_LABEL[p.latest_verdict] ?? p.latest_verdict}` : 'sem envios de progresso'}>
      <DefList
        rows={[
          ['Envios aceitos / sinalizados / rejeitados', `${fmtInt(p.counts.ok)} / ${fmtInt(p.counts.flagged)} / ${fmtInt(p.counts.rejected)}`],
          ['Último veredito', p.latest_verdict ? <Pill key="v" tone={p.latest_verdict === 'ok' ? 'good' : p.latest_verdict === 'rejected' ? 'bad' : 'warn'}>{VERDICT_LABEL[p.latest_verdict] ?? p.latest_verdict}</Pill> : 'nenhum envio ainda'],
        ]}
      />
      {p.snapshots.length === 0 ? <p className="muted">Nenhum envio de progresso guardado.</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Veredito</th>
                <th className="num">Nível</th>
                <th className="num">Ouro</th>
                <th>Motivos</th>
              </tr>
            </thead>
            <tbody>
              {p.snapshots.map((s, i) => (
                <tr key={i}>
                  <td>{fmtDateTime(s.created_at)}</td>
                  <td>
                    <Pill tone={s.verdict === 'ok' ? 'good' : s.verdict === 'rejected' ? 'bad' : 'warn'}>{VERDICT_LABEL[s.verdict] ?? s.verdict}</Pill>
                  </td>
                  <td className="num">{s.hero_level == null ? DASH : `${fmtInt(s.hero_level)}${s.paragon_level ? ` + P${fmtInt(s.paragon_level)}` : ''}`}</td>
                  <td className="num">{num(s.gold)}</td>
                  <td className="mono">{s.reasons.join(', ') || DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Fold>
  );
}

/** The part of the save that is about the Pass and cosmetics, to sit under the existing "Passe e carteira" block. */
export function FullPassSave({ full, detail }: { full: PlayerFull; detail: PlayerDetail }) {
  const s = full.save;
  if (!s) return null;
  const note = passMismatch(s.pass.has_flag, detail.pass?.valid_now);
  return (
    <>
      <DefList
        rows={[
          ['Passe marcado no save', s.pass.has_flag ? 'sim' : 'não'],
          ['Nível e XP do Passe', `nível ${num(s.pass.level)} · ${num(s.pass.xp)} XP · temporada ${num(s.pass.season)}`],
          ['Recompensas resgatadas', `${fmtInt(s.pass.claimed_free.length)} gratuitas · ${fmtInt(s.pass.claimed_premium.length)} premium`],
          ['Título / moldura / aparência', `${s.active_title ? humanize(s.active_title) : 'nenhum'} · ${s.active_frame ? humanize(s.active_frame) : 'nenhuma'} · ${s.active_skin ? humanize(s.active_skin) : 'padrão'}`],
          ['Cosméticos', s.cosmetics.length ? s.cosmetics.map(humanize).join(', ') : 'nenhum'],
        ]}
      />
      {note ? <Notice tone="warn">{note}</Notice> : null}
    </>
  );
}

export function FullMarket({ full, detail }: { full: PlayerFull; detail: PlayerDetail }) {
  const m = full.market;
  const counts = Object.entries(m.listing_counts);
  return (
    <Fold title="Mercado" hint={`${fmtInt(m.sold.count)} vendas · ${fmtInt(m.bought.count)} compras`}>
      <DefList
        rows={[
          ['Vendeu (reais)', `${fmtInt(m.sold.count)} · ${fmtSol(m.sold.lamports)}`],
          ['Comprou (reais)', `${fmtInt(m.bought.count)} · ${fmtSol(m.bought.lamports)}`],
          ['Anúncios por estado', counts.length ? counts.map(([k, n]) => `${statusLabel(k)}: ${fmtInt(n)}`).join(' · ') : 'nenhum anúncio'],
        ]}
      />
      <h4 className="fold-sub">Últimos anúncios</h4>
      {m.listings.length === 0 ? <p className="muted">Nenhum anúncio.</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Criado</th>
                <th>Item</th>
                <th>Estado</th>
                <th className="num">Preço</th>
              </tr>
            </thead>
            <tbody>
              {m.listings.map((l) => (
                <tr key={l.id}>
                  <td>{fmtDateTime(l.created_at)}</td>
                  <td>{l.material_id ? `${fmtInt(l.material_qty)} × ${humanize(l.material_id)} (lote)` : `${humanize(l.template_id)}${l.rarity ? ` · ${rarityLabel(l.rarity)}` : ''}`}</td>
                  <td>{statusLabel(l.status)}</td>
                  <td className="num">{fmtSol(l.price_lamports)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="fold-sub">Reservas como comprador</h4>
      {m.reservations.length === 0 ? <p className="muted">Nenhuma reserva.</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Criada</th>
                <th>Estado</th>
                <th className="num">Preço</th>
              </tr>
            </thead>
            <tbody>
              {m.reservations.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>
                    {humanize(r.status)}
                    {r.livemode ? '' : ' · teste'}
                  </td>
                  <td className="num">{fmtSol(r.price_lamports)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="fold-sub">Últimas negociações</h4>
      {detail.sales.length === 0 ? <p className="muted">Sem vendas nem compras.</p> : (
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
              {detail.sales.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDateTime(s.sold_at)}</td>
                  <td>{s.role === 'seller' ? 'vendeu' : 'comprou'}</td>
                  <td>{s.material_id ? `${fmtInt(s.material_qty)} × ${s.material_id}` : s.item_template}</td>
                  <td className="num">{fmtSol(s.price_lamports)}</td>
                  <td>
                    <ExternalLink href={solscanTx(s.tx_signature, s.livemode)}>
                      <span className="mono">{s.tx_signature.slice(0, 4)}…{s.tx_signature.slice(-4)}</span>
                    </ExternalLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Fold>
  );
}

export function FullCredits({ full }: { full: PlayerFull }) {
  const c = full.credits;
  return (
    <Fold title="Créditos e códigos" hint={`${fmtInt(c.unclaimed)} a receber · ${fmtInt(c.claimed)} entregues`}>
      {c.rows.length === 0 ? <p className="muted">Nenhum crédito do servidor (Kit Pioneiro ou código promocional).</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Origem</th>
                <th>Crédito</th>
                <th>Criado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {CREDIT_SOURCE_LABEL[r.source] ?? r.source}
                    <div className="faint mono">{r.source_ref}</div>
                  </td>
                  <td>{creditLabel(r)}</td>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>{r.claimed_at ? <Pill tone="good">entregue</Pill> : <Pill tone="warn">a receber</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="fold-sub">Códigos promocionais resgatados</h4>
      {full.promo.length === 0 ? <p className="muted">Nenhum código resgatado.</p> : (
        <div className="stack">
          {full.promo.map((p) => (
            <div key={p.code}>
              <span className="mono">{p.code}</span> · {promoRewardLabel(p)} · {fmtDateTime(p.at)}
              {p.note ? <span className="faint"> · {p.note}</span> : null}
            </div>
          ))}
        </div>
      )}
    </Fold>
  );
}

export function FullInvites({ full }: { full: PlayerFull }) {
  const i = full.invites;
  const w = full.waitlist;
  return (
    <Fold title="Convites" hint={`${fmtInt(i.invited_total)} convidados · ${fmtInt(i.invited_qualified)} valeram`}>
      <DefList
        rows={[
          ['Código de convite', i.code ? <span key="c" className="mono">{i.code}</span> : 'ainda não gerado'],
          ['Convidado por', i.invited_by ? `${i.invited_by.username ?? shortId(i.invited_by.user_id)} em ${fmtDateTime(i.invited_by.created_at)}${i.invited_by.ignored_reason ? ` (não contou: ${i.invited_by.ignored_reason})` : i.invited_by.qualified_at ? ' (já valeu)' : ' (ainda não valeu)'}` : 'ninguém'],
          ['Convidou', `${fmtInt(i.invited_total)} contas · ${fmtInt(i.invited_qualified)} valeram · ${fmtInt(i.invited_ignored)} ignoradas`],
          ['Lista de espera', w ? `entrou em ${fmtDateTime(w.created_at)}${w.source ? ` (origem ${w.source})` : ''} · convidou ${fmtInt(w.invited)} (${fmtInt(w.invited_qualified)} valeram)${w.unsubscribed_at ? ' · saiu da lista' : ''}` : 'não está na lista de espera'],
        ]}
      />
      {i.invited.length ? (
        <div className="stack">
          {i.invited.map((x) => (
            <div key={x.user_id}>
              {x.username ?? <span className="faint">(sem nome)</span>} · {fmtDateTime(x.created_at)} · {x.ignored_reason ? `ignorado (${x.ignored_reason})` : x.qualified_at ? 'valeu' : 'ainda não valeu'}
            </div>
          ))}
        </div>
      ) : null}
      <h4 className="fold-sub">Recompensas de convite entregues</h4>
      {i.rewards.length === 0 ? <p className="muted">Nenhuma ainda.</p> : (
        <div className="stack">
          {i.rewards.map((r, k) => (
            <div key={k}>
              {humanize(r.metric)} ≥ {fmtInt(r.min_count)}: {humanize(r.kind)} <span className="faint mono">{r.reward_ref}</span> · {fmtDateTime(r.granted_at)}
            </div>
          ))}
        </div>
      )}
    </Fold>
  );
}

export function FullAudit({ full }: { full: PlayerFull }) {
  return (
    <Fold title="Registro de ações" hint={`${fmtInt(full.audit.length)} registros sobre esta conta`}>
      {full.audit.length === 0 ? <p className="muted">Nenhuma ação do painel sobre esta conta.</p> : (
        <div className="stack">
          {full.audit.map((a, i) => (
            <div key={i}>
              <strong>{auditActionLabel(a.action)}</strong> · {fmtDateTime(a.at)} · por {a.admin_username ?? shortId(a.admin_id)}
              {typeof a.details?.note === 'string' ? <div className="faint">{a.details.note}</div> : null}
            </div>
          ))}
        </div>
      )}
    </Fold>
  );
}

/** Shown while the new function is not in the database yet (migration 0034 not applied): the drawer falls back to the old cache block. */
export function FullMissingNotice({ message }: { message: string }) {
  return (
    <Notice tone="warn">
      A leitura ao vivo da conta não respondeu ({message}). Aplique a migração 0034_admin_player_full.sql; enquanto isso, o bloco abaixo usa o cache (atualizado pela rotina).
    </Notice>
  );
}

