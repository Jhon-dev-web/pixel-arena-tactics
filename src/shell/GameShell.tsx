import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AuthScreen from '../components/AuthScreen';
import LegacyImportPrompt from '../components/LegacyImportPrompt';
import UsernameOnboarding from '../components/UsernameOnboarding';
import App from '../App';
import { SaveData } from '../game/engine';
import { getServerPassOwned, setPassSource, setServerPassOwned } from '../game/entitlements';
import { setItemAuthority } from '../game/itemAuthority';
import { applyServerPass, refreshServerPass } from '../game/passServer';
import { buildNewLeagueHero, readLeagueResetAt, settleLeague } from '../game/leagueReset';
import { getMyUsername } from '../game/usernameRepository';
import { UsernameContext } from '../game/usernameContext';
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

// A save entering the game agrees with the server's Pass answer (only meaningful in server mode; the offline build never calls this path).
const withServerPass = (save: SaveData): SaveData => applyServerPass(save, getServerPassOwned(), Date.now());

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
  const [username, setUsername] = useState<string | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // With a backend the Adventurer Pass is the server's entitlement (entitlements.ts); without one (desktop build) it stays the save's flag, as before.
    setPassSource(configured ? 'server' : 'save');
    // Same for the dice of a tradeable thing: with a backend the SERVER rolls the forge, the unique drops and the Gold Pouches (itemAuthority.ts); without one the device does, and what it
    // makes is never tradeable.
    setItemAuthority(configured ? 'server' : 'local');

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
      setServerPassOwned(false);
      setResolution({ kind: 'loading' });
      return;
    }

    const repo = new SupabaseSaveRepository(user.id);
    (async () => {
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
      setUsername(username);

      // The server's word on the Pass, asked before the game renders; every save below is made to agree with it (a save edited to claim the Pass loses it).
      await refreshServerPass(user.id);
      if (cancelled) return;

      // The first League's reset moment (null = not opened yet). Asked before the game renders, like the Pass: a hero from before it is replaced here, once (leagueReset.ts).
      const resetAt = await readLeagueResetAt();
      if (cancelled) return;

      const existing = await repo.load();
      if (cancelled) return;
      if (existing) {
        if (typeof resetAt === 'number') {
          const settled = await settleLeague(repo, existing, { accountId: user.id, resetAt, applyPass: withServerPass });
          if (cancelled) return;
          setResolution({ kind: 'ready', initial: { save: withServerPass(settled.save), revision: settled.revision }, repository: repo });
          return;
        }
        setResolution({ kind: 'ready', initial: { ...existing, save: withServerPass(existing.save) }, repository: repo });
        return;
      }
      // After the League opened no local save can enter the online game: a new account starts from zero like everyone else (the local file stays on the device).
      if (hasLegacyLocalSave() && typeof resetAt !== 'number') {
        setResolution({ kind: 'needsLegacyDecision' });
        return;
      }
      const fresh = withServerPass(buildNewLeagueHero(resetAt));
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
            const repo = new SupabaseSaveRepository(user.id);
            // The League may have opened while this question was on screen: a local save is then refused online and the hero starts from zero.
            const resetNow = await readLeagueResetAt();
            if (typeof resetNow === 'number') {
              const startFresh = withServerPass(buildNewLeagueHero(resetNow));
              const made = await repo.create(startFresh, false);
              setResolution({ kind: 'ready', initial: { save: startFresh, revision: made.revision }, repository: repo });
              return;
            }
            backupLegacyLocalSaveOnce();
            const legacy = withServerPass(readLegacyLocalSave());
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
            const resetNow = await readLeagueResetAt();
            const fresh = withServerPass(buildNewLeagueHero(resetNow));
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

  return (
    <UsernameContext.Provider value={username}>
      <App repository={resolution.repository} initialSave={resolution.initial.save} initialRevision={resolution.initial.revision} />
    </UsernameContext.Provider>
  );
}
