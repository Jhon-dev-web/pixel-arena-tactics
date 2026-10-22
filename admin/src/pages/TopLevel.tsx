import { useState } from 'react';
import { Field, Icon, Notice, Pill, Skeleton } from '../components/ui';
import { useApp, useAsync } from '../hooks';
import { actionErrorText, NOTE_MAX, NOTE_MIN } from '../lib/actions';
import { DASH, fmtDateTime, fmtInt } from '../lib/format';
import { passSourceLabel } from '../lib/labels';
import type { TopLevelRow } from '../lib/types';

// "Prêmio do playtest" (owner's decision, 22/10/2026): the 25 accounts with the highest hero level get the Adventurer Pass, no draw; a tie goes to whoever reached the level first.
// The list is migration 0037 (level and date from the server-judged progress submissions). Granting is the same admin_grant_pass as the account sheet: one call per account, with a note and an audit row.

const DEFAULT_NOTE = 'Prêmio do playtest: Top 25 por nível';

type GrantState = { state: 'idle' } | { state: 'confirm' } | { state: 'busy' } | { state: 'done'; text: string } | { state: 'error'; text: string };

/** "2026-10-31T23:59" from an <input type="datetime-local"> (local time) to ISO; empty = now. */
function untilIso(local: string): string | null {
  if (!local) return null;
  const t = new Date(local).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export default function TopLevelPage() {
  const { api } = useApp();
  const [limit, setLimit] = useState(25);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [withAlerts, setWithAlerts] = useState(false);
  const [rowState, setRowState] = useState<Record<string, GrantState>>({});
  const [batch, setBatch] = useState<GrantState>({ state: 'idle' });
  const list = useAsync((a) => a.topLevel(limit, untilIso(until)), [limit, until]);

  const rows = list.data?.rows ?? [];
  const missing = rows.filter((r) => !r.pass_valid_now);
  const flagged = (r: TopLevelRow) => r.open_flags + r.item_flags > 0;
  const toGrant = missing.filter((r) => withAlerts || !flagged(r));
  const noteOk = note.trim().length >= NOTE_MIN && note.trim().length <= NOTE_MAX;
  const setRow = (id: string, s: GrantState) => setRowState((m) => ({ ...m, [id]: s }));

  async function grantOne(r: TopLevelRow): Promise<boolean> {
    setRow(r.user_id, { state: 'busy' });
    try {
      const res = await api.grantPass(r.user_id, `${note.trim()} (posição ${r.rank})`);
      setRow(r.user_id, { state: 'done', text: res.status === 'already' ? 'já tinha' : 'Passe dado' });
      return true;
    } catch (e) {
      setRow(r.user_id, { state: 'error', text: actionErrorText(e instanceof Error ? e.message : String(e)) });
      return false;
    }
  }

  async function grantAll() {
    setBatch({ state: 'busy' });
    let ok = 0;
    let fail = 0;
    for (const r of toGrant) {
      if (await grantOne(r)) ok++;
      else fail++;
    }
    setBatch(fail ? { state: 'error', text: `${fmtInt(ok)} Passes dados, ${fmtInt(fail)} falharam (veja a linha de cada um).` } : { state: 'done', text: `${fmtInt(ok)} Passes dados.` });
    list.reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prêmio do playtest</h1>
          <p>Os {fmtInt(limit)} jogadores com o herói de nível mais alto ganham o Passe. Empate: quem chegou primeiro ao nível.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={list.reload} disabled={list.loading}>
            <Icon name="refresh" />
            Atualizar
          </button>
        </div>
      </div>

      <section className="card players-card">
        <div className="toolbar players-tools">
          <Field label="Quantos ganham">
            <input className="input" type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(Math.min(200, Math.max(1, Number(e.target.value) || 25)))} />
          </Field>
          <Field label="Contar até (vazio = agora)">
            <input className="input" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <div className="grow">
            <Field label="Motivo (fica registrado com o seu nome)">
              <input className="input" type="text" maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>

        {list.error ? (
          <Notice tone="bad">
            Não foi possível carregar: {list.error}.{' '}
            {/admin_top_level|does not exist|function/i.test(list.error) ? 'A função do banco (migração 0037) ainda não foi aplicada. ' : ''}
            <button type="button" className="btn" onClick={list.reload}>
              Tentar de novo
            </button>
          </Notice>
        ) : null}

        {!list.data ? (
          list.error ? null : <Skeleton height={200} />
        ) : (
          <>
            <div className="top-summary">
              <span>
                <strong>{fmtInt(rows.length - missing.length)}</strong> de {fmtInt(rows.length)} já têm Passe · <strong>{fmtInt(missing.length)}</strong> faltam
                {missing.some(flagged) ? ` · ${fmtInt(missing.filter(flagged).length)} com alerta` : ''}
              </span>
              <label className="check">
                <input type="checkbox" checked={withAlerts} onChange={(e) => setWithAlerts(e.target.checked)} /> Incluir quem tem alerta
              </label>
              {batch.state === 'confirm' ? (
                <span className="inline-actions">
                  <span>
                    Dar o Passe a {fmtInt(toGrant.length)} {toGrant.length === 1 ? 'conta' : 'contas'}?
                  </span>
                  <button type="button" className="btn primary" onClick={() => void grantAll()} disabled={!noteOk}>
                    Sim, dar o Passe
                  </button>
                  <button type="button" className="btn" onClick={() => setBatch({ state: 'idle' })}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button type="button" className="btn primary" disabled={toGrant.length === 0 || batch.state === 'busy' || !noteOk} onClick={() => setBatch({ state: 'confirm' })}>
                  {batch.state === 'busy' ? 'Dando os Passes…' : `Dar o Passe aos ${fmtInt(toGrant.length)} que faltam`}
                </button>
              )}
            </div>
            {batch.state === 'done' ? <Notice>{batch.text}</Notice> : batch.state === 'error' ? <Notice tone="bad">{batch.text}</Notice> : null}
            {!noteOk ? <Notice tone="warn">Escreva o motivo (pelo menos {NOTE_MIN} letras) para poder dar o Passe.</Notice> : null}

            <div className="table-wrap">
              <table className="data">
                <caption className="sr-only">Top por nível</caption>
                <thead>
                  <tr>
                    <th scope="col" className="num">#</th>
                    <th scope="col">Jogador</th>
                    <th scope="col" className="num">Nível</th>
                    <th scope="col">Chegou ao nível em</th>
                    <th scope="col">Passe</th>
                    <th scope="col" className="num">Alertas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={6}>
                        Nenhum envio de progresso até essa data.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const st = rowState[r.user_id] ?? { state: 'idle' };
                      return (
                        <tr key={r.user_id}>
                          <td className="num">
                            <strong>{r.rank}</strong>
                          </td>
                          <td>
                            <span className="who">
                              <span className="monogram" aria-hidden="true">
                                {(r.hero_name ?? r.username ?? '?').trim().charAt(0).toUpperCase() || '?'}
                                {r.online ? <span className="dot live" /> : null}
                              </span>
                              <span className="who-text">
                                <strong>{r.username ?? <span className="faint">(sem nome)</span>}</strong>
                                <a className="faint" href={`#/jogadores?q=${encodeURIComponent(r.user_id)}`}>
                                  abrir ficha
                                </a>
                              </span>
                            </span>
                          </td>
                          <td className="num">
                            <strong>{r.paragon_level ? `${r.hero_level} + P${r.paragon_level}` : r.level}</strong>
                          </td>
                          <td>{fmtDateTime(r.reached_at)}</td>
                          <td>
                            {r.pass_valid_now ? (
                              <span title={`${passSourceLabel(r.pass_source)}${r.pass_livemode || r.pass_source === 'grant' ? '' : ' (teste)'}`}>
                                <Pill tone="good">Já tem</Pill>
                              </span>
                            ) : st.state === 'done' ? (
                              <Pill tone="good">{st.text}</Pill>
                            ) : st.state === 'confirm' ? (
                              <span className="inline-actions">
                                <button type="button" className="btn primary btn-sm" disabled={!noteOk} onClick={() => void grantOne(r).then(() => list.reload())}>
                                  Confirmar
                                </button>
                                <button type="button" className="btn btn-sm" onClick={() => setRow(r.user_id, { state: 'idle' })}>
                                  Cancelar
                                </button>
                              </span>
                            ) : (
                              <span className="inline-actions">
                                <button type="button" className="btn btn-sm" disabled={st.state === 'busy' || batch.state === 'busy' || !noteOk} onClick={() => setRow(r.user_id, { state: 'confirm' })}>
                                  {st.state === 'busy' ? 'Dando…' : 'Dar Passe'}
                                </button>
                                {st.state === 'error' ? <span className="bad-text">{st.text}</span> : null}
                              </span>
                            )}
                          </td>
                          <td className="num">{flagged(r) ? <Pill tone="bad">{r.open_flags + r.item_flags}</Pill> : <span className="faint">{DASH}</span>}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="faint players-note">
              Contado até {fmtDateTime(list.data.until)} · {fmtInt(list.data.ranked)} contas com progresso enviado. O nível e a data vêm dos envios de progresso, com a hora do servidor (o jogo envia a cada 10 minutos e logo depois de subir de nível); envios rejeitados não contam. Alerta é um sinal para conferir a ficha antes de dar o Passe.
            </p>
          </>
        )}
      </section>
    </>
  );
}
