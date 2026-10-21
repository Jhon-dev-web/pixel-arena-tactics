import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AuthScreen from '../components/AuthScreen';
import UsernameOnboarding from '../components/UsernameOnboarding';
import { Button, Dialog } from '../components/ui';
import App from '../App';
import { SaveData } from '../game/engine';
import { getServerPassOwned, setPassSource, setServerPassStatus } from '../game/entitlements';
import { setItemAuthority } from '../game/itemAuthority';
import { applyServerPass, refreshServerPass } from '../game/passServer';
import { buildNewLeagueHero, readLeagueResetAt, settleLeague } from '../game/leagueReset';
import { setSyncedSave } from '../game/syncedSave';
import { clearMemoryStore, hydratePrefs, purgeLegacyBrowserGameData } from '../lib/deviceStore';
import { reloadAudioPrefs } from '../game/audio';
import { applyMotionPref } from '../lib/motionPref';
import { reloadLocale } from '../locales';
import { getMyUsername } from '../game/usernameRepository';
import { UsernameContext } from '../game/usernameContext';
import {
  LoadResult,
  LocalSaveRepository,
  SaveRepository,
  SupabaseSaveRepository,
} from '../game/saveRepository';
import { t } from '../locales';

type Resolution =
  | { kind: 'loading' }
  | { kind: 'needsUsername' }
  | { kind: 'profileError' }
  // `userId` is the account this hero was resolved for (null = the offline build): a resolution is never shown to anyone else.
  | { kind: 'ready'; userId: string | null; initial: LoadResult; repository: SaveRepository };

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
  const [usernameReadyFor, setUsernameReadyFor] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);

  // The preferences of the loaded server save become the ones in memory (language, volume, notifications, motion, last-seen stamp) before the game renders.
  const enter = (userId: string, initial: LoadResult, repository: SaveRepository) => {
    hydratePrefs(initial.save.prefs);
    reloadAudioPrefs();
    reloadLocale();
    applyMotionPref();
    setResolution({ kind: 'ready', userId, initial, repository });
  };

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
        if (!cancelled) setResolution({ kind: 'ready', userId: null, initial, repository: repo });
      });
      return () => {
        cancelled = true;
      };
    }

    if (status !== 'authenticated' || !user) {
      setServerPassStatus({ owned: false, validThrough: null, currentSeason: null });
      setSyncedSave(null);
      clearMemoryStore();
      setUsername(null);
      setUsernameReadyFor(null);
      setResolution({ kind: 'loading' });
      return;
    }

    // Older versions left game data in this browser: delete it (never read it into an account).
    purgeLegacyBrowserGameData();
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
        // The server save is the only source. (No device journal, no local copy: nothing is read from the browser.)
        if (typeof resetAt === 'number') {
          const settled = await settleLeague(repo, existing, { accountId: user.id, resetAt, applyPass: withServerPass });
          if (cancelled) return;
          enter(user.id, { save: withServerPass(settled.save), revision: settled.revision }, repo);
          return;
        }
        enter(user.id, { ...existing, save: withServerPass(existing.save) }, repo);
        return;
      }
      // A new account ALWAYS starts from a brand-new hero (tutorial on, empty bag). No device save is ever offered or read: the online game keeps nothing in the browser.
      const fresh = withServerPass(buildNewLeagueHero(resetAt));
      const created = await repo.create(fresh, false);
      if (cancelled) return;
      enter(user.id, { save: fresh, revision: created.revision }, repo);
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

  // A resolution made for another account (switching accounts in the same tab) is never shown: wait for this account's own.
  const staleFor = configured && resolution.kind === 'ready' && resolution.userId !== (user?.id ?? null);
  if (resolution.kind === 'loading' || staleFor) {
    return (
      <div className="auth-screen">
        <p className="auth-loading">{t('auth.restoringSession')}</p>
      </div>
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
        <Dialog
          inline
          className="auth-dialog"
          title={t('usernameOnboarding.profileTitle')}
          subtitle={t('usernameOnboarding.loadError')}
          footer={
            <Button
              variant="primary"
              block
              onClick={() => {
                setResolution({ kind: 'loading' });
                setProfileRetry((attempt) => attempt + 1);
              }}
            >
              {t('usernameOnboarding.retry')}
            </Button>
          }
        >
          {null}
        </Dialog>
      </div>
    );
  }

  return (
    <UsernameContext.Provider value={username}>
      <App key={resolution.userId ?? 'offline'} repository={resolution.repository} initialSave={resolution.initial.save} initialRevision={resolution.initial.revision} />
    </UsernameContext.Provider>
  );
}
