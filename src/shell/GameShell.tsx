import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AuthScreen from '../components/AuthScreen';
import LegacyImportPrompt from '../components/LegacyImportPrompt';
import UsernameOnboarding from '../components/UsernameOnboarding';
import App from '../App';
import { defaultSave } from '../game/engine';
import { getMyUsername } from '../game/usernameRepository';
import {
  backupLegacyLocalSaveOnce,
  hasLegacyLocalSave,
  LoadResult,
  LocalSaveRepository,
  readLegacyLocalSave,
  SaveRepository,
  SupabaseSaveRepository,
} from '../game/saveRepository';
import { t } from '../locales';

type Resolution =
  | { kind: 'loading' }
  | { kind: 'needsUsername' }
  | { kind: 'profileError' }
  | { kind: 'needsLegacyDecision' }
  | { kind: 'ready'; initial: LoadResult; repository: SaveRepository };

// Resolves WHICH save the player should see before the actual game renders (§0/§12-16): unconfigured
// backend -> local save, same as before this migration; configured but unauthenticated -> the login
// gate; authenticated -> the server character (creating a fresh one, or asking about a local legacy
// save, exactly once — never both, never silently). Keeping this outside App.tsx means App itself never
// has to know HOW its save was sourced, only that it has one plus a repository to persist through.
export default function GameShell() {
  const { status, user, configured } = useAuth();
  const [resolution, setResolution] = useState<Resolution>({ kind: 'loading' });
  const [importing, setImporting] = useState(false);
  const [usernameReadyFor, setUsernameReadyFor] = useState<string | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!configured) {
      const repo = new LocalSaveRepository();
      repo.load().then((initial) => {
        if (!cancelled) setResolution({ kind: 'ready', initial, repository: repo });
      });
      return () => {
        cancelled = true;
      };
    }

    if (status !== 'authenticated' || !user) {
      setResolution({ kind: 'loading' });
      return;
    }

    const repo = new SupabaseSaveRepository(user.id);
    (async () => {
      if (usernameReadyFor !== user.id) {
        let username: string | null;
        try {
          username = await getMyUsername();
        } catch (err) {
          console.error('[GameShell] failed to load account profile', err);
          if (!cancelled) setResolution({ kind: 'profileError' });
          return;
        }
        if (cancelled) return;
        if (!username) {
          setResolution({ kind: 'needsUsername' });
          return;
        }
      }

      const existing = await repo.load();
      if (cancelled) return;
      if (existing) {
        setResolution({ kind: 'ready', initial: existing, repository: repo });
        return;
      }
      if (hasLegacyLocalSave()) {
        setResolution({ kind: 'needsLegacyDecision' });
        return;
      }
      const fresh = defaultSave();
      const created = await repo.create(fresh, false);
      if (cancelled) return;
      setResolution({ kind: 'ready', initial: { save: fresh, revision: created.revision }, repository: repo });
    })().catch((err) => {
      console.error('[GameShell] failed to resolve character', err);
    });

    return () => {
      cancelled = true;
    };
  }, [configured, profileRetry, status, user, usernameReadyFor]);

  if (configured && status === 'loading') {
    return (
      <div className="auth-screen">
        <p className="auth-loading">{t('auth.restoringSession')}</p>
      </div>
    );
  }

  if (configured && status === 'unauthenticated') {
    return <AuthScreen />;
  }

  if (resolution.kind === 'loading') {
    return (
      <div className="auth-screen">
        <p className="auth-loading">{t('auth.restoringSession')}</p>
      </div>
    );
  }

  if (resolution.kind === 'needsLegacyDecision') {
    return (
      <LegacyImportPrompt
        importing={importing}
        onImport={async () => {
          if (!user) return;
          setImporting(true);
          try {
            backupLegacyLocalSaveOnce();
            const legacy = readLegacyLocalSave();
            const repo = new SupabaseSaveRepository(user.id);
            const created = await repo.create(legacy, true);
            setResolution({ kind: 'ready', initial: { save: legacy, revision: created.revision }, repository: repo });
          } finally {
            setImporting(false);
          }
        }}
        onStartNew={async () => {
          if (!user) return;
          setImporting(true);
          try {
            const fresh = defaultSave();
            const repo = new SupabaseSaveRepository(user.id);
            const created = await repo.create(fresh, false);
            setResolution({ kind: 'ready', initial: { save: fresh, revision: created.revision }, repository: repo });
          } finally {
            setImporting(false);
          }
        }}
      />
    );
  }

  if (resolution.kind === 'needsUsername') {
    if (!user) {
      return (
        <div className="auth-screen">
          <p className="auth-loading">{t('auth.restoringSession')}</p>
        </div>
      );
    }
    return (
      <UsernameOnboarding
        onComplete={() => {
          setUsernameReadyFor(user.id);
          setResolution({ kind: 'loading' });
        }}
      />
    );
  }

  if (resolution.kind === 'profileError') {
    return (
      <div className="auth-screen">
        <section className="modal auth-modal" aria-labelledby="profile-load-error-title">
          <h1 className="modal-title" id="profile-load-error-title">{t('usernameOnboarding.profileTitle')}</h1>
          <p className="auth-subtitle">{t('usernameOnboarding.loadError')}</p>
          <button className="result-btn" type="button" onClick={() => {
            setResolution({ kind: 'loading' });
            setProfileRetry((attempt) => attempt + 1);
          }}>
            {t('usernameOnboarding.retry')}
          </button>
        </section>
      </div>
    );
  }

  return <App repository={resolution.repository} initialSave={resolution.initial.save} initialRevision={resolution.initial.revision} />;
}
