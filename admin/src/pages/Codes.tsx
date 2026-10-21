import { useState } from 'react';
import { DataTable, type Column } from '../components/Table';
import { Card, Field, Icon, Notice, Pill, SectionTitle } from '../components/ui';
import { useApp, useAsync } from '../hooks';
import {
  endOfDayIso,
  formatPromoCode,
  NOTE_MAX,
  PROMO_COUNT_MAX,
  PROMO_STATUS_LABEL,
  PROMO_USES_MAX,
  promoErrorText,
  promoFormProblem,
  PROMO_AMOUNT_MAX,
  PROMO_POTIONS,
  promoRewardText,
  type PromoCodeRow,
  type PromoRewardKind,
  type PromoStatus,
} from '../lib/actions';
import { AccessDeniedError } from '../lib/api';
import { errorText } from '../lib/auth';
import { fmtAgo, fmtDateTime, fmtInt } from '../lib/format';

// "Códigos": promo codes for the Adventurer Pass, Ouro, Éter or one potion (migration 0027 part C, rewards from 0028). Creating and disabling WRITE (admin-only in the database, audited); the list only reads. A code is secret until the owner hands it out:
// it appears here, on the screen of an admin, and nowhere else.
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label, title }: { text: string; label: string; title?: string }) {
  const [done, setDone] = useState<boolean | null>(null);
  return (
    <button
      type="button"
      className="btn"
      title={title}
      onClick={async () => {
        setDone(await copy(text));
        window.setTimeout(() => setDone(null), 1800);
      }}
    >
      {done === true ? 'Copiado' : done === false ? 'Não foi possível copiar' : label}
    </button>
  );
}

const STATUS_TONE: Record<PromoStatus, 'good' | 'warn' | 'bad' | undefined> = { active: 'good', exhausted: 'warn', expired: 'warn', disabled: 'bad' };
const FILTERS: { id: 'all' | PromoStatus; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Ativos' },
  { id: 'exhausted', label: 'Esgotados' },
  { id: 'expired', label: 'Expirados' },
  { id: 'disabled', label: 'Desativados' },
];

export default function Codes() {
  const { api, onDenied, demo } = useApp();
  const list = useAsync((a) => a.listPromoCodes(), []);

  // ---- create ----
  const [count, setCount] = useState('10');
  const [maxUses, setMaxUses] = useState('1');
  const [day, setDay] = useState('');
  const [note, setNote] = useState('');
  const [reward, setReward] = useState<PromoRewardKind>('pass');
  const [itemId, setItemId] = useState(PROMO_POTIONS[0].id);
  const [amountText, setAmountText] = useState('');
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string[] | null>(null);

  const n = Number(count);
  const uses = Number(maxUses);
  const amount = Number(amountText);
  const problem = promoFormProblem({ count: n, maxUses: uses, note, reward, itemId, amount });
  const rewardNow = promoRewardText({ reward_kind: reward, reward_item_id: reward === 'consumable' ? itemId : null, reward_amount: reward === 'pass' ? null : amount });
  const pickReward = (next: PromoRewardKind) => {
    setReward(next);
    setAsked(false);
    setAmountText(next === 'gold' ? '10000' : next === 'shards' ? '50' : next === 'consumable' ? '5' : '');
  };
  const expiresAt = day ? endOfDayIso(day) : null;

  async function create() {
    if (busy || problem) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createPromoCodes({ count: n, reward, itemId: reward === 'consumable' ? itemId : null, amount: reward === 'pass' ? null : amount, maxUses: uses, expiresAt, note: note.trim() });
      setMade(r.codes);
      setAsked(false);
      setNote('');
      list.reload();
    } catch (e) {
      if (e instanceof AccessDeniedError) onDenied();
      else setError(promoErrorText(errorText(e)));
    } finally {
      setBusy(false);
    }
  }

  // ---- list ----
  const [filter, setFilter] = useState<'all' | PromoStatus>('all');
  const [disabling, setDisabling] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const rows = (list.data ?? []).filter((r) => filter === 'all' || r.status === filter);

  async function disable(code: string) {
    if (busy) return;
    setBusy(true);
    setListError(null);
    try {
      await api.disablePromoCode(code);
      setDisabling(null);
      list.reload();
    } catch (e) {
      if (e instanceof AccessDeniedError) onDenied();
      else setListError(promoErrorText(errorText(e)));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PromoCodeRow>[] = [
    {
      key: 'code',
      header: 'Código',
      cell: (r) => (
        <span>
          <span className="mono code-text">{formatPromoCode(r.code)}</span>
          <div className="faint">{r.note}</div>
        </span>
      ),
    },
    { key: 'reward', header: 'Recompensa', narrow: 'hide', cell: (r) => promoRewardText(r) },
    {
      key: 'uses',
      header: 'Usos',
      align: 'num',
      cell: (r) => (
        <span title={r.last_redeemed_at ? `último uso: ${fmtDateTime(r.last_redeemed_at)}` : 'ainda não usado'}>
          {fmtInt(r.uses)} / {fmtInt(r.max_uses)}
        </span>
      ),
    },
    { key: 'expires', header: 'Validade', narrow: 'hide', cell: (r) => (r.expires_at ? <span title={fmtDateTime(r.expires_at)}>até {fmtDateTime(r.expires_at).slice(0, 10)}</span> : <span className="faint">sem validade</span>) },
    { key: 'status', header: 'Estado', cell: (r) => <Pill tone={STATUS_TONE[r.status]}>{PROMO_STATUS_LABEL[r.status]}</Pill> },
    { key: 'created', header: 'Criado', narrow: 'hide', cell: (r) => <span title={fmtDateTime(r.created_at)}>{fmtAgo(r.created_at)}</span> },
    {
      key: 'actions',
      header: 'Ações',
      cell: (r) => (
        <span className="inline-actions">
          <CopyButton text={formatPromoCode(r.code)} label="Copiar" title={`Copiar ${formatPromoCode(r.code)}`} />
          {r.active ? (
            <button type="button" className="btn write danger-outline" onClick={() => setDisabling(r.code)} aria-label={`Desativar o código ${formatPromoCode(r.code)}`}>
              Desativar
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  const target = disabling ? (list.data ?? []).find((r) => r.code === disabling) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Códigos promocionais</h1>
          <p>
            Códigos que o jogador digita em Configurações. Cada código dá UMA recompensa à sua escolha: o Passe de Aventureiro da temporada atual, Ouro, Éter ou uma poção. Vale uma vez por conta, até o limite de usos e a validade que você escolher. O Passe
            do código dá as vantagens e entra no ranking, mas não conta como venda (meta e receita). Ouro, Éter e poções chegam ao herói na próxima vez que o jogo abrir ou voltar ao foco, e não disparam alerta no ranking.{demo ? ' (dados de demonstração)' : ''}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={() => list.reload()} disabled={list.loading}>
            <Icon name="refresh" />
            Atualizar
          </button>
        </div>
      </div>

      <SectionTitle>Gerar códigos</SectionTitle>
      <Card>
        <form
          className="promo-form"
          aria-label="Gerar códigos"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) setAsked(true);
          }}
        >
          <Field label="Quantos códigos">
            <input className="input" type="number" inputMode="numeric" min={1} max={PROMO_COUNT_MAX} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
          <Field label="Recompensa">
            <select className="input" value={reward} onChange={(e) => pickReward(e.target.value as PromoRewardKind)} aria-label="Recompensa">
              <option value="pass">Passe de Aventureiro</option>
              <option value="gold">Ouro</option>
              <option value="shards">Éter</option>
              <option value="consumable">Poção</option>
            </select>
          </Field>
          {reward === 'consumable' ? (
            <Field label="Qual poção">
              <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Qual poção">
                {PROMO_POTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {reward !== 'pass' ? (
            <Field label={`Quantidade por conta (até ${fmtInt(PROMO_AMOUNT_MAX[reward])})`}>
              <input className="input" type="number" inputMode="numeric" min={1} max={PROMO_AMOUNT_MAX[reward]} value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-label="Quantidade da recompensa" />
            </Field>
          ) : null}
          <Field label="Usos por código (contas diferentes)">
            <input className="input" type="number" inputMode="numeric" min={1} max={PROMO_USES_MAX} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </Field>
          <Field label="Validade (opcional)">
            <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label={`Nota (para que serve este lote; mínimo 3 letras)`}>
            <input className="input" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="ex.: sorteio do Discord de novembro" autoComplete="off" />
          </Field>
          <div className="promo-form-actions">
            <button type="submit" className="btn write primary" disabled={busy || problem !== null}>
              Gerar… <span aria-hidden="true">· grava</span>
            </button>
          </div>
        </form>
        {problem && (note !== '' || count === '' || maxUses === '') ? <p className="faint">{problem}</p> : null}
        {error ? <Notice tone="bad">{error}</Notice> : null}

        {asked ? (
          <form
            className="action-confirm"
            aria-label="Confirmar: gerar códigos"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <p>
              Gerar <strong>{fmtInt(n)}</strong> {n === 1 ? 'código' : 'códigos'} de <strong>{rewardNow}</strong>, cada um com <strong>{fmtInt(uses)}</strong> {uses === 1 ? 'uso' : 'usos'}
              {expiresAt ? <>, válido até <strong>{day.split('-').reverse().join('/')}</strong></> : ', sem validade'}? {reward === 'pass' ? 'Quem usar ganha o Passe da temporada atual de graça.' : `Quem usar ganha ${rewardNow} de graça, uma vez por conta.`} Isso fica registrado com o seu nome.
            </p>
            <div className="action-confirm-actions">
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Gerando…' : 'Gerar os códigos'}
              </button>
              <button type="button" className="btn" onClick={() => setAsked(false)} disabled={busy}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {made ? (
          <div className="promo-made" role="status">
            <p>
              <strong>{fmtInt(made.length)}</strong> {made.length === 1 ? 'código gerado' : 'códigos gerados'}. Eles também ficam na lista abaixo.
            </p>
            <textarea className="input mono" readOnly rows={Math.min(10, made.length + 1)} value={made.map(formatPromoCode).join('\n')} aria-label="Códigos gerados" onFocus={(e) => e.currentTarget.select()} />
            <div className="inline-actions">
              <CopyButton text={made.map(formatPromoCode).join('\n')} label="Copiar todos" />
              <button type="button" className="btn ghost" onClick={() => setMade(null)}>
                Esconder
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <SectionTitle>Seus códigos</SectionTitle>
      {list.error ? (
        <Notice tone="bad">
          Não foi possível carregar a lista: {list.error}{' '}
          <button type="button" className="btn" onClick={() => list.reload()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}
      {listError ? <Notice tone="bad">{listError}</Notice> : null}
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Estado">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {target ? (
        <form
          className="action-confirm danger"
          aria-label="Confirmar: desativar código"
          onSubmit={(e) => {
            e.preventDefault();
            void disable(target.code);
          }}
        >
          <p>
            Desativar o código <strong className="mono">{formatPromoCode(target.code)}</strong>? Ninguém mais consegue usá-lo. Quem já usou continua com o Passe. Isso fica registrado com o seu nome.
          </p>
          <div className="action-confirm-actions">
            <button type="submit" className="btn danger" disabled={busy}>
              {busy ? 'Salvando…' : 'Desativar'}
            </button>
            <button type="button" className="btn" onClick={() => setDisabling(null)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      <Card flush>
        <DataTable<PromoCodeRow>
          caption="Códigos promocionais"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.code}
          loading={list.loading}
          empty={list.error && !list.data ? 'A lista não carregou (veja o aviso acima).' : filter === 'all' ? 'Nenhum código ainda. Gere o primeiro acima.' : 'Nenhum código neste estado.'}
        />
      </Card>
      <p className="faint" style={{ marginTop: 10 }}>
        «Esgotado» = todos os usos já foram feitos. «Expirado» = passou da validade. Desativar é definitivo (para outro lote, gere novos códigos). O jogador que já tem Passe nesta temporada recebe «você já tem o Passe» e um código de Passe não é gasto (os de Ouro, Éter e poção funcionam normalmente).
      </p>
    </>
  );
}
