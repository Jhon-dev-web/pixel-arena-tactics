import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AuthScreen from '../components/AuthScreen';
import LegacyImportPrompt from '../components/LegacyImportPrompt';
import App from '../App';
import { defaultSave } from '../game/engine';
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
  }, [configured, status, user]);

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

  return <App repository={resolution.repository} initialSave={resolution.initial.save} initialRevision={resolution.initial.revision} />;
}
