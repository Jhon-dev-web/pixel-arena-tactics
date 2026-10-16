import { useState } from 'react';
import { t } from '../locales';
import { useAuth } from '../auth/AuthContext';
import PreseasonResetNotice from './PreseasonResetNotice';
import { Button, Dialog, TextField } from './ui';

// Unauthenticated gate (Phase 1 §10): the shared Dialog card on the login background, laid out full-screen since there's no game behind it to show yet.
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
      <Dialog
        inline
        className="auth-dialog"
        title={t('auth.title')}
        subtitle={t('auth.subtitle')}
        footer={
          <Button
            type="button"
            block
            onClick={() => {
              setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
              setStatus('idle');
              setErrorMsg(null);
            }}
          >
            {mode === 'signIn' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
          </Button>
        }
      >
        {configured && <PreseasonResetNotice className="ui-alert" />}

        {!configured && <p className="ui-alert bad">{t('auth.notConfigured')}</p>}

        {status === 'signedUp' ? (
          <p className="ui-alert good">{t('auth.signUpSuccess')}</p>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <TextField
              label={t('auth.emailLabel')}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!configured || status === 'submitting'}
            />
            <TextField
              label={t('auth.passwordLabel')}
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!configured || status === 'submitting'}
            />

            {status === 'error' && <p className="ui-alert bad">{errorMsg || t('auth.genericError')}</p>}

            <Button type="submit" variant="primary" block disabled={!configured || status === 'submitting'}>
              {status === 'submitting' ? t('auth.submitting') : mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
