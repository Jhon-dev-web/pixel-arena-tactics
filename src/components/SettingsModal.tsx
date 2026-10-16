import { useRef, useState } from 'react';
import { useConfirmKeys } from '../hooks/useConfirmKeys';
import { activeLocale, Locale, locales, t } from '../locales';
import { SaveData, playerLevel } from '../game/engine';
import { AudioPrefs } from '../game/audio';
import { ImportFailure, parseSaveImport, resetWordMatches } from '../game/saveTransfer';
import { getServerResetAt } from '../game/leagueReset';
import useFullscreen from '../hooks/useFullscreen';
import { APP_VERSION, buildErrorReport, clearErrorLog, copyText, readErrorLog } from '../lib/errorLog';
import { enableNotifications, notificationsActive, notifyPermission, saveNotifyPref } from '../game/notify';
import { MaterialPrefs, materialPrefs } from '../game/tradeableMaterials';

// Settings: language, the two audio channels (a slider and a mute button each), fullscreen, the account, the tutorial and the game data (export, import and reset
// of the save). Importing and resetting replace the hero, so both ask first (what is about to be loaded / a typed word), and App keeps a backup of the current
// hero before it replaces anything.
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
    <section className="settings-section">
      <div className="settings-slider-head">
        <span className="settings-label">{label}</span>
        <span className="settings-description">{muted ? t('settings.off') : `${volume}%`}</span>
      </div>
      <div className="settings-slider-row">
        <input
          className="settings-range"
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          aria-label={label}
          data-ui
        />
        <button className={`settings-action settings-mute${muted ? ' on' : ''}`} onClick={onToggle} aria-pressed={muted} data-ui>
          {muted ? t('settings.unmute') : t('settings.mute')}
        </button>
      </div>
    </section>
  );

  return (
    <div className="modal-backdrop settings-backdrop" role="presentation">
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 className="modal-title" id="settings-title">{t('settings.title')}</h2>

        <div className="settings-list">
          <section className="settings-section">
            <span className="settings-label">{t('settings.language')}</span>
            <select
              className="settings-select"
              value={activeLocale}
              onChange={(event) => onChangeLocale(event.target.value as Locale)}
              aria-label={t('settings.language')}
              data-ui
            >
              {locales.map((locale) => (
                <option key={locale} value={locale} lang={locale}>
                  {t(`settings.${locale}`)}
                </option>
              ))}
            </select>
          </section>

          {channel(t('settings.music'), audio.music, audio.musicMuted, onMusicVolume, onToggleMusicMute)}
          {channel(t('settings.effects'), audio.sfx, audio.sfxMuted, onSfxVolume, onToggleSfxMute)}

          {fullscreen.supported && (
            <section className="settings-section settings-row">
              <div>
                <span className="settings-label">{t('settings.fullscreen')}</span>
                <span className="settings-description">{fullscreen.active ? t('settings.on') : t('settings.off')}</span>
              </div>
              <button className="settings-action" onClick={fullscreen.toggle} data-ui>
                {fullscreen.active ? t('settings.fullscreenExit') : t('settings.fullscreenEnter')}
              </button>
            </section>
          )}

          {notifyPermission() !== 'unsupported' && (
            <section className="settings-section settings-row" data-settings="notifications">
              <div>
                <span className="settings-label">{t('settings.notifications')}</span>
                <span className="settings-description">{`${notifyOn ? t('settings.on') : t('settings.off')} · ${t('settings.notificationsHint')}`}</span>
                {notifyDenied && <span className="settings-warning">{t('settings.notificationsDenied')}</span>}
              </div>
              <button className="settings-action" onClick={() => void toggleNotify()} aria-pressed={notifyOn} data-ui>
                {notifyOn ? t('settings.notificationsDisable') : t('settings.notificationsEnable')}
              </button>
            </section>
          )}

          {accountConfigured && (
            <section className="settings-section" data-settings="tradeable">
              <span className="settings-label">{t('tradeable.prefTitle')}</span>
              <div className="settings-row">
                <div>
                  <span className="settings-label">{t('tradeable.prefFirst')}</span>
                  <span className="settings-description">{materialPrefs(save).useTradeableFirst ? t('settings.on') : t('settings.off')}</span>
                </div>
                <button className="settings-action" onClick={() => onMaterialPrefs({ useTradeableFirst: !materialPrefs(save).useTradeableFirst })} aria-pressed={materialPrefs(save).useTradeableFirst} data-ui>
                  {materialPrefs(save).useTradeableFirst ? t('settings.off') : t('settings.on')}
                </button>
              </div>
              <span className="settings-description">{t('tradeable.prefFirstHint')}</span>
              {materialPrefs(save).useAcked && (
                <button className="settings-action" onClick={() => onMaterialPrefs({ useAcked: false })} data-ui>
                  {t('tradeable.prefAskAgain')}
                </button>
              )}
            </section>
          )}

          <section className="settings-section settings-row">
            <div>
              <span className="settings-label">{t('settings.email')}</span>
              <span className="settings-description">
                {accountConfigured && accountEmail ? `${accountEmail} · ${t('settings.accountConnected')}` : t('settings.emailUnavailable')}
              </span>
            </div>
            {accountConfigured && accountEmail && (
              <button className="settings-action" onClick={onSignOut} data-ui>
                {t('settings.signOut')}
              </button>
            )}
          </section>

          <section className="settings-section settings-row">
            <span className="settings-label">{t('settings.tutorial')}</span>
            <button className="settings-action" onClick={onReplayTutorial} data-ui>
              {t('settings.replayTutorial')}
            </button>
          </section>

          <section className="settings-section" data-settings="data">
            <span className="settings-label">{t('settings.dataTitle')}</span>
            <span className="settings-description">{t('settings.dataHint')}</span>
            <div className="settings-data-buttons">
              <button className="settings-action" onClick={onExportSave} data-ui>
                {t('settings.export')}
              </button>
              <button className="settings-action" onClick={() => fileRef.current?.click()} data-ui>
                {t('settings.import')}
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="settings-file" onChange={(e) => void pickFile(e.target.files?.[0])} data-testid="import-file" />
            </div>

            {importError && <p className="settings-warning">{t(`settings.importError_${importError}`)}</p>}
            {pending && (
              <div className="settings-confirm" role="alertdialog" aria-label={t('settings.importConfirmTitle')}>
                <p>{t('settings.importConfirm', { level: pending.level, floor: pending.floor })}</p>
                <p className="settings-description">{t('settings.importBackup', { level: playerLevel(save.xp), floor: save.highestDungeonFloor })}</p>
                <div className="settings-data-buttons">
                  <button
                    className="settings-action danger"
                    onClick={() => {
                      onImportSave(pending.save);
                      setPending(null);
                    }}
                    data-ui
                  >
                    {t('settings.importReplace')}
                  </button>
                  <button className="settings-action" onClick={() => setPending(null)} data-ui>
                    {t('settings.cancel')}
                  </button>
                </div>
              </div>
            )}

            {!resetting ? (
              <button className="settings-action danger" onClick={() => setResetting(true)} data-ui>
                {t('settings.reset')}
              </button>
            ) : (
              <div className="settings-confirm" role="alertdialog" aria-label={t('settings.reset')}>
                <p>{t('settings.resetConfirm', { word: resetWord })}</p>
                <input className="settings-select" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={resetWord} aria-label={t('settings.resetConfirm', { word: resetWord })} autoComplete="off" data-ui />
                <div className="settings-data-buttons">
                  <button
                    className="settings-action danger"
                    disabled={!resetWordMatches(typed, resetWord)}
                    onClick={() => {
                      onResetSave();
                      setResetting(false);
                      setTyped('');
                    }}
                    data-ui
                  >
                    {t('settings.resetNow')}
                  </button>
                  <button
                    className="settings-action"
                    onClick={() => {
                      setResetting(false);
                      setTyped('');
                    }}
                    data-ui
                  >
                    {t('settings.cancel')}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="settings-section" data-settings="error-report">
            <span className="settings-label">{t('errorReport.title')}</span>
            <span className="settings-description">{t('errorReport.hint')}</span>
            <span className="settings-description">
              {errorCount > 0 ? t('errorReport.count', { n: errorCount }) : t('errorReport.none')} · v{APP_VERSION}
            </span>
            <div className="settings-data-buttons">
              <button className="settings-action" onClick={() => void copyReport()} data-ui>
                {t('errorReport.copy')}
              </button>
              {errorCount > 0 && (
                <button
                  className="settings-action"
                  onClick={() => {
                    clearErrorLog();
                    setErrorCount(0);
                    setReportMsg(null);
                    setReportText(null);
                  }}
                  data-ui
                >
                  {t('errorReport.clear')}
                </button>
              )}
            </div>
            {reportMsg && (
              <span className="settings-description" role="status">
                {reportMsg}
              </span>
            )}
            {reportText && <textarea className="settings-select" readOnly rows={6} value={reportText} onFocus={(e) => e.currentTarget.select()} aria-label={t('errorReport.title')} />}
          </section>
        </div>

        <button className="modal-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
