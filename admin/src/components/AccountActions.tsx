import { useState } from 'react';
import { useApp } from '../hooks';
import { AccessDeniedError } from '../lib/api';
import { deleteConfirmName, deleteRefusalText } from '../lib/actions';
import { errorText } from '../lib/auth';
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
}

export function AccountActions({ subject, onDeleted }: { subject: AccountSubject; onDeleted: () => void }) {
  const { api, onDenied } = useApp();
  const [step, setStep] = useState<'idle' | 'delete'>('idle');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expected = deleteConfirmName(subject);

  function cancel() {
    setStep('idle');
    setTyped('');
    setError(null);
  }

  async function doDelete() {
    if (busy || !expected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.deleteUser(subject.userId, typed.trim());
      if (r.ok) onDeleted();
      else setError(deleteRefusalText(r));
    } catch (e) {
      if (e instanceof AccessDeniedError) onDenied();
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const matches = expected !== null && typed.trim().toLowerCase() === expected.toLowerCase();

  return (
    <section aria-label="Ações na conta">
      <h3>Ações na conta</h3>
      <p className="faint">
        Ações que <strong>gravam</strong> no banco. Cada uma pede confirmação, só funciona para administradores e fica registrada com o seu nome.
      </p>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {step === 'idle' ? (
        <div className="action-row">
          <button type="button" className="btn danger-outline write" onClick={() => setStep('delete')}>
            Apagar conta… <span aria-hidden="true">· grava</span>
          </button>
        </div>
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
