import { useState } from 'react';
import { useApp } from '../hooks';
import { AccessDeniedError } from '../lib/api';
import { actionErrorText, deleteConfirmName, deleteRefusalText, NOTE_MAX, NOTE_MIN } from '../lib/actions';
import { errorText } from '../lib/auth';
import { passSourceLabel } from '../lib/labels';
import { Notice } from './ui';

/**
 * The writing controls of the player panel (migration 0027). Each one asks for a confirmation INSIDE the panel (the panel is a modal dialog that traps focus, so the confirmation lives in it), says plainly what it will do,
 * and the database refuses anyone who is not an admin and writes an audit row. Nothing here is silent: every outcome is shown.
 */
export interface AccountSubject {
  userId: string;
  username: string | null;
  heroName: string | null;
  email: string | null;
  /** The Pass as the database describes it (migration 0026); absent = the database does not say, so both Pass buttons are offered. */
  pass?: { valid_now: boolean; current_season: number } | null;
  /** The sources of the account's active entitlements that cover the current season (so the revoke confirmation can say a PAID Pass is about to be taken away). */
  currentSources: string[];
}

type Step = 'idle' | 'delete' | 'grant' | 'revoke';

const PAID = new Set(['stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol']);

export function AccountActions({ subject, onDeleted, onChanged }: { subject: AccountSubject; onDeleted: () => void; onChanged: () => void }) {
  const { api, onDenied } = useApp();
  const [step, setStep] = useState<Step>('idle');
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function open(next: Step) {
    setStep(next);
    setTyped('');
    setNote('');
    setError(null);
    setDone(null);
  }
  function cancel() {
    setStep('idle');
    setTyped('');
    setNote('');
    setError(null);
  }
  async function guarded(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      if (e instanceof AccessDeniedError) onDenied();
      else setError(actionErrorText(errorText(e)));
    } finally {
      setBusy(false);
    }
  }

  const expected = deleteConfirmName(subject);
  const matches = expected !== null && typed.trim().toLowerCase() === expected.toLowerCase();
  const noteOk = note.trim().length >= NOTE_MIN;
  const hasPass = subject.pass ? subject.pass.valid_now : null;
  const season = subject.pass?.current_season;
  const paidNow = subject.currentSources.some((s) => PAID.has(s));

  const doDelete = () =>
    guarded(async () => {
      if (!expected) return;
      const r = await api.deleteUser(subject.userId, typed.trim());
      if (r.ok) onDeleted();
      else setError(deleteRefusalText(r));
    });

  const doGrant = () =>
    guarded(async () => {
      const r = await api.grantPass(subject.userId, note.trim());
      setStep('idle');
      setDone(r.status === 'granted' ? `Passe ativado para a Temporada ${r.season}.` : `Esta conta já tinha um Passe válido na Temporada ${r.season}. Nada foi alterado.`);
      onChanged();
    });

  const doRevoke = () =>
    guarded(async () => {
      const r = await api.revokePass(subject.userId, note.trim());
      setStep('idle');
      setDone(r.status === 'revoked' ? `Passe revogado (${(r.sources ?? []).map(passSourceLabel).join(', ') || 'origem desconhecida'}).` : 'Esta conta não tinha Passe válido agora. Nada foi alterado.');
      onChanged();
    });

  const noteField = (placeholder: string) => (
    <label className="field">
      <span>Motivo (fica registrado com o seu nome, mínimo {NOTE_MIN} letras)</span>
      <input className="input" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} autoFocus autoComplete="off" placeholder={placeholder} />
    </label>
  );

  return (
    <section aria-label="Ações na conta">
      <h3>Ações na conta</h3>
      <p className="faint">
        Ações que <strong>gravam</strong> no banco. Cada uma pede confirmação, só funciona para administradores e fica registrada com o seu nome.
      </p>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {done ? <Notice>{done}</Notice> : null}
      {step === 'idle' ? (
        <div className="action-row">
          {hasPass !== true ? (
            <button type="button" className="btn write" onClick={() => open('grant')}>
              Ativar o Passe <span aria-hidden="true">· grava</span>
            </button>
          ) : null}
          {hasPass !== false ? (
            <button type="button" className="btn write" onClick={() => open('revoke')}>
              Revogar o Passe <span aria-hidden="true">· grava</span>
            </button>
          ) : null}
          <button type="button" className="btn danger-outline write" onClick={() => open('delete')}>
            Apagar conta… <span aria-hidden="true">· grava</span>
          </button>
        </div>
      ) : null}

      {step === 'grant' ? (
        <form
          className="action-confirm"
          aria-label="Confirmar: ativar o Passe"
          onSubmit={(e) => {
            e.preventDefault();
            if (noteOk) void doGrant();
          }}
        >
          <p>
            Ativar o <strong>Passe de Aventureiro</strong> para <strong>{subject.username ?? subject.heroName ?? 'esta conta'}</strong>
            {season ? ` na Temporada ${season}` : ''}? A conta ganha as vantagens e entra no ranking, como uma concessão. <strong>Não conta como venda</strong>: não entra na meta de Passes nem na receita.
          </p>
          {noteField('ex.: cortesia para testador, compensação de suporte')}
          <div className="action-confirm-actions">
            <button type="submit" className="btn primary" disabled={busy || !noteOk}>
              {busy ? 'Salvando…' : 'Ativar o Passe'}
            </button>
            <button type="button" className="btn" onClick={cancel} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {step === 'revoke' ? (
        <form
          className="action-confirm"
          aria-label="Confirmar: revogar o Passe"
          onSubmit={(e) => {
            e.preventDefault();
            if (noteOk) void doRevoke();
          }}
        >
          <p>
            Revogar o Passe de <strong>{subject.username ?? subject.heroName ?? 'esta conta'}</strong>
            {season ? ` (Temporada ${season})` : ''}? As vantagens e o ranking acabam na hora; o histórico fica guardado.
            {paidNow ? (
              <>
                {' '}
                <strong>Este Passe foi pago ({subject.currentSources.filter((s) => PAID.has(s)).map(passSourceLabel).join(', ')}).</strong> Revogar não devolve dinheiro: o estorno é feito por fora.
              </>
            ) : null}
          </p>
          {noteField('ex.: concedido por engano, estorno feito')}
          <div className="action-confirm-actions">
            <button type="submit" className="btn danger" disabled={busy || !noteOk}>
              {busy ? 'Salvando…' : 'Revogar o Passe'}
            </button>
            <button type="button" className="btn" onClick={cancel} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {step === 'delete' ? (
        <form
          className="action-confirm danger"
          aria-label="Confirmar: apagar conta"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches) void doDelete();
          }}
        >
          <p>
            <strong>Isto apaga a conta para sempre e não pode ser desfeito.</strong> O herói, o progresso, o Passe, os itens, as vendas em aberto e o login desta pessoa somem; o nome de usuário fica livre. O registro de que você apagou fica guardado.
          </p>
          {expected ? (
            <label className="field">
              <span>
                Para confirmar, digite o nome da conta: <strong>{expected}</strong>
              </span>
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
            </label>
          ) : (
            <Notice tone="bad">Esta conta não tem nome nem e-mail para conferir. Não dá para apagá-la por aqui.</Notice>
          )}
          <div className="action-confirm-actions">
            <button type="submit" className="btn danger" disabled={busy || !matches}>
              {busy ? 'Apagando…' : 'Apagar para sempre'}
            </button>
            <button type="button" className="btn" onClick={cancel} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
