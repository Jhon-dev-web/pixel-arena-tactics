import { ReactNode, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import PixelIcon from './PixelIcon';
import { useConfirmKeys } from '../hooks/useConfirmKeys';
import { activeLocale, Locale, locales, t } from '../locales';
import { SaveData, playerLevel } from '../game/engine';
import { AudioPrefs } from '../game/audio';
import { ImportFailure, parseSaveImport, resetWordMatches } from '../game/saveTransfer';
import { getServerResetAt } from '../game/leagueReset';
import { isServerPassSource, ownsAdventurerPass } from '../game/entitlements';
import { usePassEntitlementVersion } from '../game/usePassEntitlement';
import { UsernameContext } from '../game/usernameContext';
import useFullscreen from '../hooks/useFullscreen';
import { APP_VERSION, buildErrorReport, clearErrorLog, copyText, readErrorLog } from '../lib/errorLog';
import { enableNotifications, notificationsActive, notifyPermission, saveNotifyPref } from '../game/notify';
import { MaterialPrefs, materialPrefs } from '../game/tradeableMaterials';
import { maskEmail } from '../lib/maskEmail';
import { fetchPassSource, PassSourceId } from '../lib/passSource';
import { looksLikePromoCode, PromoOutcome, PromoResult, redeemPromoDetailed } from '../lib/promo';
import { promoRewardText } from '../game/promoText';
import { manualReduceMotion, setManualReduceMotion, subscribeMotion, systemReducesMotion } from '../lib/motionPref';
import { cleanEmail, safeHttpsUrl, SUPPORT } from '../lib/supportConfig';
import { Button, Chip, ModalShell, Panel, SelectField } from './ui';

// Settings, in panels: Conta (the account, masked), Passe (read-only), the wallet (web only, handed in as `walletSlot`), Jogo (language, the two audio channels, fullscreen, notifications, reduced motion, the
// tradeable-material spending order, the tutorial), Dados (export, import and reset of the save), Suporte (the error report and whatever contact / legal links the owner has configured) and Sobre.
// Importing and resetting replace the hero, so both ask first (what is about to be loaded / a typed word), and App keeps a backup of the current hero before it replaces anything.

const PROMO_MESSAGE: Record<PromoOutcome, string> = {
  ok: 'settings.promoOkGeneric',
  invalid: 'settings.promoInvalid',
  expired: 'settings.promoExpired',
  exhausted: 'settings.promoExhausted',
  already_redeemed: 'settings.promoAlreadyRedeemed',
  already_has_pass: 'settings.promoHasPass',
  rate_limited: 'settings.promoRateLimited',
  offline: 'settings.promoOffline',
  error: 'settings.promoError',
};

function Row({ label, hint, children, testId }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <div className="st-row" data-settings={testId}>
      <div className="st-row-text">
        <span className="st-label">{label}</span>
        {hint && <span className="st-hint">{hint}</span>}
      </div>
      {children && <div className="st-row-ctl">{children}</div>}
    </div>
  );
}

export default function SettingsModal({
  save,
  audio,
  onMusicVolume,
  onSfxVolume,
  onToggleMusicMute,
  onToggleSfxMute,
  onChangeLocale,
  onReplayTutorial,
  accountConfigured,
  accountEmail,
  onSignOut,
  onExportSave,
  onImportSave,
  onResetSave,
  onMaterialPrefs,
  walletSlot,
  onPromoRedeemed,
  onClose,
}: {
  save: SaveData;
  audio: AudioPrefs;
  onMusicVolume: (v: number) => void;
  onSfxVolume: (v: number) => void;
  onToggleMusicMute: () => void;
  onToggleSfxMute: () => void;
  onChangeLocale: (locale: Locale) => void;
  onReplayTutorial: () => void;
  accountConfigured: boolean;
  accountEmail: string | null;
  onSignOut: () => void;
  onExportSave: () => void;
  onImportSave: (imported: SaveData) => void;
  onResetSave: () => void;
  // The two preferences about tradeable materials (tradeableMaterials.ts); only offered where such materials exist (an account on the online version).
  onMaterialPrefs: (patch: Partial<MaterialPrefs>) => void;
  // The Solana wallet panel (the market's link flow): only passed in the web build with the market on, so the desktop build carries none of it.
  walletSlot?: ReactNode;
  // The server accepted a promo code and wrote a Pass: the app asks the server about the Pass again so the perks show up at once.
  onPromoRedeemed?: () => void;
  onClose: () => void;
}) {
  const fullscreen = useFullscreen();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ save: SaveData; level: number; floor: number } | null>(null);
  const [importError, setImportError] = useState<ImportFailure | null>(null);
  const [resetting, setResetting] = useState(false);
  const [typed, setTyped] = useState('');
  const resetWord = t('settings.resetWord');
  const [errorCount, setErrorCount] = useState(() => readErrorLog().length);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [reportText, setReportText] = useState<string | null>(null);
  const copyReport = async () => {
    const text = buildErrorReport();
    const ok = await copyText(text);
    setReportMsg(t(ok ? 'errorReport.copied' : 'errorReport.copyFailed'));
    // Where the clipboard is blocked the player can still select the text by hand.
    setReportText(ok ? null : text);
  };
  const [notifyOn, setNotifyOn] = useState(notificationsActive);
  const [notifyDenied, setNotifyDenied] = useState(false);
  const toggleNotify = async () => {
    if (notifyOn) {
      saveNotifyPref(false);
      setNotifyOn(false);
      return;
    }
    // In a browser the permission is asked here, from the click; the desktop app needs none.
    if (await enableNotifications()) {
      saveNotifyPref(true);
      setNotifyOn(true);
      setNotifyDenied(false);
    } else {
      setNotifyDenied(true);
    }
  };

  // reduced motion: the system setting (read-only here) or the player's own switch
  const motion = useSyncExternalStore(
    subscribeMotion,
    () => `${systemReducesMotion()}|${manualReduceMotion()}`,
    () => 'false|false',
  );
  const [sysMotion, manMotion] = motion.split('|').map((v) => v === 'true');

  // the Pass: owned or not (the one rule of entitlements.ts) and, on the online build, how it was obtained (the account's own row, read-only)
  usePassEntitlementVersion();
  const passOwned = ownsAdventurerPass(save);
  const [passHow, setPassHow] = useState<PassSourceId | null>(null);
  useEffect(() => {
    if (!accountConfigured || !isServerPassSource() || !passOwned) {
      setPassHow(null);
      return;
    }
    let live = true;
    void fetchPassSource().then((s) => {
      if (live) setPassHow(s);
    });
    return () => {
      live = false;
    };
  }, [accountConfigured, passOwned]);

  // Promo code (online only): the server decides; this only sends the text and tells the answer in plain words.
  const [promoText, setPromoText] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const promoOnline = accountConfigured && isServerPassSource();
  const redeemPromo = async () => {
    if (promoBusy || promoText.trim() === '') return;
    setPromoBusy(true);
    setPromoResult(null);
    const result: PromoResult = looksLikePromoCode(promoText) ? await redeemPromoDetailed(promoText) : { outcome: 'invalid', reward: null };
    setPromoBusy(false);
    setPromoResult(result);
    if (result.outcome === 'ok') {
      setPromoText('');
      onPromoRedeemed?.();
    }
  };

  const username = useContext(UsernameContext);
  const [deleteInfo, setDeleteInfo] = useState(false);
  const supportEmail = cleanEmail(SUPPORT.supportEmail);
  const legal = [
    { key: 'legalTerms', url: safeHttpsUrl(SUPPORT.termsUrl) },
    { key: 'legalPrivacy', url: safeHttpsUrl(SUPPORT.privacyUrl) },
    { key: 'legalRefund', url: safeHttpsUrl(SUPPORT.refundUrl) },
  ].filter((l): l is { key: string; url: string } => !!l.url);

  // Escape closes the question first (the settings stay open); Enter confirms it: the import replaces the hero, the reset only once the typed word matches.
  useConfirmKeys(
    pending !== null,
    () => {
      if (!pending) return;
      onImportSave(pending.save);
      setPending(null);
    },
    () => setPending(null),
  );
  useConfirmKeys(
    resetting,
    () => {
      if (!resetWordMatches(typed, resetWord)) return;
      onResetSave();
      setResetting(false);
      setTyped('');
    },
    () => {
      setResetting(false);
      setTyped('');
    },
  );

  const pickFile = async (file: File | undefined) => {
    setImportError(null);
    setPending(null);
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError('not_json');
      return;
    }
    const res = parseSaveImport(text, save, accountConfigured ? getServerResetAt() : null);
    if ('reason' in res) setImportError(res.reason);
    else setPending({ save: res.save, level: res.level, floor: res.floor });
    if (fileRef.current) fileRef.current.value = '';
  };

  const channel = (label: string, volume: number, muted: boolean, onVolume: (v: number) => void, onToggle: () => void) => (
    <div className="st-channel">
      <div className="st-channel-head">
        <span className="st-label">{label}</span>
        <span className="st-hint">{muted ? t('settings.off') : `${volume}%`}</span>
      </div>
      <div className="st-channel-row">
        <input className="st-range" type="range" min={0} max={100} step={5} value={volume} onChange={(e) => onVolume(Number(e.target.value))} aria-label={label} data-ui />
        <Button size="sm" className={muted ? 'st-muted' : ''} onClick={onToggle} aria-pressed={muted}>
          {muted ? t('settings.unmute') : t('settings.mute')}
        </Button>
      </div>
    </div>
  );

  const prefs = materialPrefs(save);

  return (
    <ModalShell className="st-modal" icon={<PixelIcon name="settings" />} title={t('settings.title')} closeLabel={t('ui.close')} onClose={onClose}>
      <div className="ui-cq">
        <div className="st-grid">
          <Panel title={t('settings.groupAccount')} className="st-panel" data-settings="account">
            {accountConfigured && accountEmail ? (
              <>
                <Row label={t('settings.email')} hint={t('settings.accountConnected')}>
                  <span className="st-value" data-testid="masked-email">
                    {maskEmail(accountEmail)}
                  </span>
                </Row>
                <Row label={t('settings.username')}>
                  <span className="st-value">{username ?? save.heroName}</span>
                </Row>
                <div className="st-actions">
                  <Button size="sm" onClick={onSignOut}>
                    {t('settings.signOut')}
                  </Button>
                </div>
                <div className="st-danger">
                  <span className="st-hint">{t('settings.dangerZone')}</span>
                  <div className="st-actions">
                    <Button size="sm" variant="danger" onClick={() => setDeleteInfo(!deleteInfo)} aria-expanded={deleteInfo}>
                      {t('settings.deleteAccount')}
                    </Button>
                  </div>
                </div>
                {deleteInfo && (
                  <div className="ui-alert st-delete" role="note" data-testid="delete-account-info">
                    <p>{t('settings.deleteExplain')}</p>
                    <p>
                      {supportEmail ? (
                        <>
                          {t('settings.deleteWrite')}{' '}
                          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
                        </>
                      ) : (
                        t('settings.deleteSoon')
                      )}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="st-hint">{t('settings.emailUnavailable')}</p>
            )}
          </Panel>

          <Panel title={t('settings.groupPass')} className="st-panel" data-settings="pass">
            <Row label={t('settings.passStatus')}>
              <Chip tone={passOwned ? 'good' : 'plain'}>{passOwned ? t('settings.passOwned') : t('settings.passNotOwned')}</Chip>
            </Row>
            {passOwned && (
              <Row label={t('settings.passHow')}>
                <span className="st-value">{passHow ? t(`settings.passSource_${passHow}`) : isServerPassSource() ? '...' : t('settings.passLocal')}</span>
              </Row>
            )}
            {promoOnline && (
              <form
                className="st-promo"
                data-settings="promo"
                onSubmit={(e) => {
                  e.preventDefault();
                  void redeemPromo();
                }}
              >
                <span className="st-label">{t('settings.promoTitle')}</span>
                <span className="st-hint">{t('settings.promoHint')}</span>
                <div className="st-channel-row">
                  <input
                    className="st-input"
                    value={promoText}
                    onChange={(e) => {
                      setPromoText(e.target.value);
                      setPromoResult(null);
                    }}
                    placeholder={t('settings.promoPlaceholder')}
                    aria-label={t('settings.promoTitle')}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={24}
                    data-ui
                  />
                  <Button size="sm" type="submit" disabled={promoBusy || promoText.trim() === ''}>
                    {promoBusy ? t('settings.promoWorking') : t('settings.promoRedeem')}
                  </Button>
                </div>
                {promoResult && (
                  <p className={promoResult.outcome === 'ok' ? 'st-hint' : 'ui-alert bad'} role="status" data-testid="promo-result" data-outcome={promoResult.outcome} data-reward={promoResult.reward?.kind}>
                    {promoResult.outcome === 'ok' && promoResult.reward ? promoRewardText(promoResult.reward) : t(PROMO_MESSAGE[promoResult.outcome])}
                  </p>
                )}
              </form>
            )}
          </Panel>

          {walletSlot}

          <Panel title={t('settings.groupGame')} className="st-panel st-wide" data-settings="game">
            <Row label={t('settings.language')}>
              <SelectField label={t('settings.language')} value={activeLocale} onChange={(event) => onChangeLocale(event.target.value as Locale)} className="st-select">
                {locales.map((locale) => (
                  <option key={locale} value={locale} lang={locale}>
                    {t(`settings.${locale}`)}
                  </option>
                ))}
              </SelectField>
            </Row>

            <div className="st-channels">
              {channel(t('settings.music'), audio.music, audio.musicMuted, onMusicVolume, onToggleMusicMute)}
              {channel(t('settings.effects'), audio.sfx, audio.sfxMuted, onSfxVolume, onToggleSfxMute)}
            </div>

            {fullscreen.supported && (
              <Row label={t('settings.fullscreen')} hint={fullscreen.active ? t('settings.on') : t('settings.off')}>
                <Button size="sm" onClick={fullscreen.toggle}>
                  {fullscreen.active ? t('settings.fullscreenExit') : t('settings.fullscreenEnter')}
                </Button>
              </Row>
            )}

            {notifyPermission() !== 'unsupported' && (
              <Row
                testId="notifications"
                label={t('settings.notifications')}
                hint={
                  <>
                    {`${notifyOn ? t('settings.on') : t('settings.off')} · ${t('settings.notificationsHint')}`}
                    {notifyDenied && <span className="st-warning">{t('settings.notificationsDenied')}</span>}
                  </>
                }
              >
                <Button size="sm" onClick={() => void toggleNotify()} aria-pressed={notifyOn}>
                  {notifyOn ? t('settings.notificationsDisable') : t('settings.notificationsEnable')}
                </Button>
              </Row>
            )}

            <Row label={t('settings.motion')} hint={sysMotion ? t('settings.motionSystem') : `${manMotion ? t('settings.on') : t('settings.off')} · ${t('settings.motionHint')}`} testId="motion">
              <Button size="sm" onClick={() => setManualReduceMotion(!manMotion)} disabled={sysMotion} aria-pressed={sysMotion || manMotion}>
                {sysMotion || manMotion ? t('settings.motionAllow') : t('settings.motionReduce')}
              </Button>
            </Row>

            {accountConfigured && (
              <>
                <Row testId="tradeable" label={t('tradeable.prefFirst')} hint={`${prefs.useTradeableFirst ? t('settings.on') : t('settings.off')} · ${t('tradeable.prefFirstHint')}`}>
                  <Button size="sm" onClick={() => onMaterialPrefs({ useTradeableFirst: !prefs.useTradeableFirst })} aria-pressed={prefs.useTradeableFirst}>
                    {prefs.useTradeableFirst ? t('settings.off') : t('settings.on')}
                  </Button>
                </Row>
                {prefs.useAcked && (
                  <Row label={t('tradeable.prefAskAgain')}>
                    <Button size="sm" onClick={() => onMaterialPrefs({ useAcked: false })}>
                      {t('settings.ask')}
                    </Button>
                  </Row>
                )}
              </>
            )}

            <Row label={t('settings.tutorial')}>
              <Button size="sm" onClick={onReplayTutorial}>
                {t('settings.replayTutorial')}
              </Button>
            </Row>
          </Panel>

          <Panel title={t('settings.dataTitle')} className="st-panel" data-settings="data">
            <p className="st-hint">{t('settings.dataHint')}</p>
            <div className="st-actions">
              <Button size="sm" onClick={onExportSave}>
                {t('settings.export')}
              </Button>
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                {t('settings.import')}
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="st-file" onChange={(e) => void pickFile(e.target.files?.[0])} data-testid="import-file" />
            </div>

            {importError && <p className="ui-alert bad">{t(`settings.importError_${importError}`)}</p>}
            {pending && (
              <div className="ui-alert st-confirm" role="alertdialog" aria-label={t('settings.importConfirmTitle')}>
                <p>{t('settings.importConfirm', { level: pending.level, floor: pending.floor })}</p>
                <p className="st-hint">{t('settings.importBackup', { level: playerLevel(save.xp), floor: save.highestDungeonFloor })}</p>
                <div className="st-actions">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      onImportSave(pending.save);
                      setPending(null);
                    }}
                  >
                    {t('settings.importReplace')}
                  </Button>
                  <Button size="sm" onClick={() => setPending(null)}>
                    {t('settings.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {!resetting ? (
              <div className="st-danger">
                <span className="st-hint">{t('settings.dangerZone')}</span>
                <div className="st-actions">
                  <Button size="sm" variant="danger" onClick={() => setResetting(true)}>
                    {t('settings.reset')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="ui-alert bad st-confirm" role="alertdialog" aria-label={t('settings.reset')}>
                <p>{t('settings.resetConfirm', { word: resetWord })}</p>
                <input className="st-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={resetWord} aria-label={t('settings.resetConfirm', { word: resetWord })} autoComplete="off" data-ui />
                <div className="st-actions">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!resetWordMatches(typed, resetWord)}
                    onClick={() => {
                      onResetSave();
                      setResetting(false);
                      setTyped('');
                    }}
                  >
                    {t('settings.resetNow')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setResetting(false);
                      setTyped('');
                    }}
                  >
                    {t('settings.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </Panel>

          <Panel title={t('settings.groupSupport')} className="st-panel" data-settings="error-report">
            <p className="st-hint">{t('errorReport.hint')}</p>
            <p className="st-hint">{errorCount > 0 ? t('errorReport.count', { n: errorCount }) : t('errorReport.none')}</p>
            <div className="st-actions">
              <Button size="sm" onClick={() => void copyReport()}>
                {t('errorReport.copy')}
              </Button>
              {errorCount > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    clearErrorLog();
                    setErrorCount(0);
                    setReportMsg(null);
                    setReportText(null);
                  }}
                >
                  {t('errorReport.clear')}
                </Button>
              )}
            </div>
            {reportMsg && (
              <p className="st-hint" role="status">
                {reportMsg}
              </p>
            )}
            {reportText && <textarea className="st-input" readOnly rows={6} value={reportText} onFocus={(e) => e.currentTarget.select()} aria-label={t('errorReport.title')} />}
            {supportEmail && (
              <Row label={t('settings.supportEmail')} testId="support-email">
                <a className="st-link" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
              </Row>
            )}
            {legal.length > 0 && (
              <div className="st-links" data-settings="legal">
                {legal.map((l) => (
                  <a key={l.key} className="st-link" href={l.url} target="_blank" rel="noopener noreferrer">
                    {t(`settings.${l.key}`)}
                  </a>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={t('settings.groupAbout')} className="st-panel" data-settings="about">
            <Row label={t('settings.aboutGame')}>
              <span className="st-value">Arena Idle</span>
            </Row>
            <Row label={t('settings.aboutVersion')}>
              <span className="st-value">v{APP_VERSION}</span>
            </Row>
          </Panel>
        </div>
      </div>
    </ModalShell>
  );
}
