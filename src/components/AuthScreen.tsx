import { useState } from 'react';
import { t } from '../locales';
import { useAuth } from '../auth/AuthContext';

// Unauthenticated gate (Phase 1 §10). Reuses the existing .modal / .result-btn visual language instead
// of a redesign, laid out full-screen since there's no game behind it to show yet.
export default function AuthScreen() {
  const { signIn, signUp, configured } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error' | 'signedUp'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) return;
    setStatus('submitting');
    setErrorMsg(null);
    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    if (result.error) {
      setStatus('error');
      setErrorMsg(result.error);
      return;
    }
    if (mode === 'signUp') {
      setStatus('signedUp');
      return;
    }
    // signIn success flips auth status via onAuthStateChange; this screen just unmounts.
  };

  return (
    <div className="auth-screen">
      <div className="modal auth-modal">
        <h1 className="modal-title">{t('auth.title')}</h1>
        <p className="auth-subtitle">{t('auth.subtitle')}</p>

        {!configured && <p className="auth-error">{t('auth.notConfigured')}</p>}

        {status === 'signedUp' ? (
          <p className="auth-success">{t('auth.signUpSuccess')}</p>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <label className="auth-field">
              <span className="settings-label">{t('auth.emailLabel')}</span>
              <input
                className="settings-select"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!configured || status === 'submitting'}
                data-ui
              />
            </label>
            <label className="auth-field">
              <span className="settings-label">{t('auth.passwordLabel')}</span>
              <input
                className="settings-select"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!configured || status === 'submitting'}
                data-ui
              />
            </label>

            {status === 'error' && <p className="auth-error">{errorMsg || t('auth.genericError')}</p>}

            <button className="result-btn" type="submit" disabled={!configured || status === 'submitting'} data-ui>
              {status === 'submitting' ? t('auth.submitting') : mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
            </button>
          </form>
        )}

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
            setStatus('idle');
            setErrorMsg(null);
          }}
          data-ui
        >
          {mode === 'signIn' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
        </button>
      </div>
    </div>
  );
}
