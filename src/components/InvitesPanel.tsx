import { useCallback, useEffect, useState } from 'react';
import PixelIcon from './PixelIcon';
import { activeLocale, t } from '../locales';
import { copyText } from '../lib/errorLog';
import { fetchInvite, fetchReferralTiers, gameInviteLink, shareLinks, tierProgress } from '../lib/referral';
import type { ReferralStatus, ReferralTier } from '../lib/referral';
import { Button, Chip, PageHeader, Panel, Screen } from './ui';

// Convidar amigos: the player's invite link (web build) or code, how many invited people are active and how many bought the Pass, the rule, and the reward tiers with a check on the ones earned.
// A page of the sidebar (InvitesPage, like Ofícios / Passe). ONLINE ONLY: offline / desktop there is no account to read it from and the page is not there at all. Everything shown is the server's
// word (my_invite, referral_tiers); the game never counts invites by itself and never grants a reward from this screen (the cosmetics a granted reward gives are put in the save by
// game/referralRewards.ts, the free Pass is an entitlement). Sharing uses plain links to WhatsApp / X / Telegram: no third-party script.

export type InvitesState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; status: ReferralStatus; tiers: ReferralTier[] };

const tierLabel = (tier: ReferralTier): string => (activeLocale === 'en' ? tier.labelEn : tier.labelPt);

/** The panel for a given state: no effects, so every state can be rendered and tested on its own. */
export function InvitesView({ state, link, copied = false, onCopy, onRetry }: { state: InvitesState; link: string | null; copied?: boolean; onCopy?: () => void; onRetry?: () => void }) {
  return (
    <Panel title={t('settings.invitesTitle')} className="st-panel rf-panel" data-settings="invites">
      <p className="st-hint">{t('settings.invitesHint')}</p>
      {state.phase === 'loading' && <p className="st-hint">{t('settings.invitesLoading')}</p>}
      {state.phase === 'error' && (
        <div className="st-actions">
          <p className="st-hint">{t('settings.invitesError')}</p>
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              {t('settings.invitesRetry')}
            </Button>
          )}
        </div>
      )}
      {state.phase === 'ready' && <InvitesBody status={state.status} tiers={state.tiers} link={link} copied={copied} onCopy={onCopy} />}
    </Panel>
  );
}

function InvitesBody({ status, tiers, link, copied, onCopy }: { status: ReferralStatus; tiers: ReferralTier[]; link: string | null; copied: boolean; onCopy?: () => void }) {
  const goal = status.passGoal ?? tiers.find((tier) => tier.kind === 'pass')?.minCount ?? null;
  const progress = tierProgress(tiers, status);
  const shown = link ?? status.code;
  return (
    <>
      {shown ? (
        <div className="rf-link" data-testid="invite-link">
          <span className="st-label">{link ? t('settings.invitesLink') : t('settings.invitesCode')}</span>
          <div className="rf-link-row">
            <code className="rf-link-text">{shown}</code>
            {onCopy && (
              <Button size="sm" onClick={onCopy}>
                {copied ? t('settings.invitesCopied') : t('settings.invitesCopy')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="ui-alert" data-testid="invite-no-code">
          {t('settings.invitesNoCode')}
        </p>
      )}

      {link && (
        <div className="rf-share" data-testid="invite-share">
          <span className="st-label">{t('settings.invitesShare')}</span>
          <div className="rf-share-row">
            {shareLinks(t('settings.invitesShareText'), link).map((s) => (
              <a key={s.key} className="rf-share-link" href={s.href} target="_blank" rel="noopener noreferrer" data-share={s.key}>
                {t(`settings.invitesShare_${s.key}`)}
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="rf-counts" data-testid="invite-counts">
        {goal !== null ? t('settings.invitesCounts', { n: status.qualified, m: status.paying, goal }) : t('settings.invitesCountsNoGoal', { n: status.qualified, m: status.paying })}
      </p>

      <p className="st-hint" data-testid="invite-rule">
        {t('settings.invitesRule')}
      </p>

      <div className="rf-tiers">
        <span className="st-label">{t('settings.invitesTiersTitle')}</span>
        <ul className="rf-tier-list">
          {progress.map((tier) => (
            <li className={`rf-tier${tier.earned ? ' earned' : ''}`} key={`${tier.metric}:${tier.minCount}`} data-tier={tier.ref} data-earned={tier.earned ? 'true' : 'false'}>
              <span className="rf-tier-check" aria-hidden>
                {tier.earned ? '✓' : ''}
              </span>
              <span className="rf-tier-text">
                <span className="st-label">{tierLabel(tier)}</span>
                <span className="st-hint">{t(tier.metric === 'paying' ? 'settings.invitesTierPaying' : 'settings.invitesTierQualified', { n: tier.minCount })}</span>
              </span>
              <Chip tone={tier.earned ? 'good' : 'plain'}>{tier.earned ? t('settings.invitesEarned') : t('settings.invitesLocked')}</Chip>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** The panel of the Settings screen: reads the account's referral status once when it opens. Not rendered at all without a backend (the offline / desktop build). */
export default function InvitesPanel({ online }: { online: boolean }) {
  const [state, setState] = useState<InvitesState>({ phase: 'loading' });
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!online) return;
    let live = true;
    setState({ phase: 'loading' });
    void (async () => {
      const status = await fetchInvite();
      if (!live) return;
      if (!status) {
        setState({ phase: 'error' });
        return;
      }
      const tiers = await fetchReferralTiers();
      if (live) setState({ phase: 'ready', status, tiers });
    })();
    return () => {
      live = false;
    };
  }, [online, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!online) return null;
  const code = state.phase === 'ready' ? state.status.code : null;
  const link = gameInviteLink(code);
  const onCopy = async () => {
    const ok = await copyText(link ?? code ?? '');
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return <InvitesView state={state} link={link} copied={copied} onCopy={onCopy} onRetry={retry} />;
}

/** The sidebar page: the same panel inside a Screen with a header, like Ofícios and the Passe. */
export function InvitesPage({ online }: { online: boolean }) {
  if (!online) return null;
  return (
    <Screen label={t('invites.nav')} className="pa-page">
      <PageHeader icon={<PixelIcon name="invites" />} title={t('invites.nav')} />
      <InvitesPanel online />
    </Screen>
  );
}
