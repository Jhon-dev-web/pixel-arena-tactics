import { useCallback, useEffect, useState } from 'react';
import { fmtNum, t } from '../locales';
import { discordView } from '../game/discordTask';
import type { DiscordTaskStatus } from '../game/discordTask';
import { discordInviteUrl, fetchDiscordTask, startDiscordLink } from '../lib/discordTask';
import { Button, Chip, Panel } from './ui';

// "Tarefas da comunidade" (a tab of Missões). One task today: "Entrar no Discord". ONLINE ONLY: without a backend the tab is not there at all. Everything shown is the server's word (my_discord_task); the
// button "Verificar" sends the browser to Discord (login + approval) and Discord sends it back to the game, where the server has already stored the verdict. The Gold is a credit in the server ledger
// that the game applies like any other (App credits sync).

export type CommunityState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; status: DiscordTaskStatus };

/** The card for a given state: no effects, so every state can be rendered and tested on its own. */
export function CommunityView({
  state,
  inviteUrl,
  busy = false,
  message = null,
  onVerify,
  onRetry,
}: {
  state: CommunityState;
  inviteUrl: string | null;
  busy?: boolean;
  message?: string | null;
  onVerify?: () => void;
  onRetry?: () => void;
}) {
  const view = state.phase === 'ready' ? discordView(state.status) : null;
  const verified = view === 'verified_pending' || view === 'verified_credited';
  const amount = state.phase === 'ready' ? fmtNum(state.status.rewardAmount) : '';
  return (
    <Panel title={t('discord.title')} className="qs-community" data-community="discord">
      <article className={`ui-item qs-card${verified ? ' claimed' : ''}`} data-discord-view={view ?? state.phase}>
        <div className="qs-card-head">
          <h4 className="ui-item-name">{t('discord.taskName')}</h4>
          {verified && <Chip tone="good">{t('discord.statusVerified')}</Chip>}
        </div>
        <p className="qs-desc">{t('discord.taskHint')}</p>
        {state.phase === 'loading' && <p className="ui-note">{t('discord.loading')}</p>}
        {state.phase === 'error' && (
          <>
            <p className="ui-alert bad">{t('discord.loadError')}</p>
            {onRetry && (
              <Button size="sm" onClick={onRetry}>
                {t('discord.retry')}
              </Button>
            )}
          </>
        )}
        {state.phase === 'ready' && (
          <>
            <p className="ui-note" data-testid="discord-reward">
              {view === 'verified_credited' ? t('discord.rewardCredited', { n: amount }) : view === 'verified_pending' ? t('discord.rewardPending', { n: amount }) : t('discord.rewardNone', { n: amount })}
            </p>
            {view === 'not_linked' && <p className="ui-note">{t('discord.statusNone')}</p>}
            {view === 'not_member' && (
              <p className="ui-alert" data-testid="discord-not-member">
                {t('discord.statusNotMember')}
              </p>
            )}
            {!verified && (
              <div className="qs-streak-act">
                {inviteUrl && (
                  <a className="ui-btn secondary" href={inviteUrl} target="_blank" rel="noopener noreferrer" data-testid="discord-join">
                    {t('discord.join')}
                  </a>
                )}
                {onVerify && (
                  <Button variant="primary" onClick={onVerify} disabled={busy} data-testid="discord-verify">
                    {busy ? t('discord.opening') : view === 'not_member' ? t('discord.verifyAgain') : t('discord.verify')}
                  </Button>
                )}
              </div>
            )}
            {message && (
              <p className="ui-alert" role="status">
                {message}
              </p>
            )}
            <p className="ui-note">{t('discord.privacy')}</p>
          </>
        )}
      </article>
    </Panel>
  );
}

/** The tab: reads the status when it opens, starts the OAuth round trip on "Verificar". */
export default function CommunityTasks() {
  const [state, setState] = useState<CommunityState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setState({ phase: 'loading' });
    void fetchDiscordTask().then((status) => {
      if (live) setState(status ? { phase: 'ready', status } : { phase: 'error' });
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  const verify = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const res = await startDiscordLink();
    if (res.kind === 'url') {
      window.location.assign(res.url); // the page leaves; Discord brings the player back to the game
      return;
    }
    setBusy(false);
    if (res.kind === 'already_verified') setAttempt((n) => n + 1);
    else setMessage(res.kind === 'rate_limited' ? t('discord.rateLimited') : t('discord.startError'));
  }, []);

  return <CommunityView state={state} inviteUrl={discordInviteUrl()} busy={busy} message={message} onVerify={() => void verify()} onRetry={() => setAttempt((n) => n + 1)} />;
}
