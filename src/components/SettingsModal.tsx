import { activeLocale, Locale, locales, t } from '../locales';

export default function SettingsModal({
  muted,
  onChangeLocale,
  onToggleSound,
  onReplayTutorial,
  onClose,
}: {
  muted: boolean;
  onChangeLocale: (locale: Locale) => void;
  onToggleSound: () => void;
  onReplayTutorial: () => void;
  onClose: () => void;
}) {
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
                <option key={locale} value={locale}>
                  {t(`settings.${locale}`)}
                </option>
              ))}
            </select>
          </section>

          <section className="settings-section settings-row">
            <div>
              <span className="settings-label">{t('settings.sound')}</span>
              <span className="settings-description">{muted ? t('settings.off') : t('settings.on')}</span>
            </div>
            <button
              className={`settings-toggle${muted ? '' : ' active'}`}
              onClick={onToggleSound}
              aria-pressed={!muted}
              aria-label={t('settings.sound')}
              data-ui
            >
              <span className="settings-toggle-knob" />
            </button>
          </section>

          <section className="settings-section">
            <span className="settings-label">{t('settings.email')}</span>
            <span className="settings-description">{t('settings.emailUnavailable')}</span>
          </section>

          <section className="settings-section settings-row">
            <span className="settings-label">{t('settings.tutorial')}</span>
            <button className="settings-action" onClick={onReplayTutorial} data-ui>
              {t('settings.replayTutorial')}
            </button>
          </section>
        </div>

        <button className="modal-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
