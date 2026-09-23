import { t } from '../locales';

// Shown once: authenticated, but no server character exists yet AND a local (pre-auth) save was found
// (§13-15). The player decides explicitly — nothing is imported silently, and this can only ever appear
// before a server character exists (see GameShell.tsx).
export default function LegacyImportPrompt({
  importing,
  onImport,
  onStartNew,
}: {
  importing: boolean;
  onImport: () => void;
  onStartNew: () => void;
}) {
  return (
    <div className="auth-screen">
      <div className="modal auth-modal">
        <h1 className="modal-title">{t('legacyImport.title')}</h1>
        <p className="auth-subtitle">{t('legacyImport.description')}</p>
        <p className="welcome-save-warning">{t('legacyImport.warning')}</p>

        <button className="result-btn" onClick={onImport} disabled={importing} data-ui>
          {importing ? t('legacyImport.importing') : t('legacyImport.importCta')}
        </button>
        <button className="auth-switch" onClick={onStartNew} disabled={importing} data-ui>
          {t('legacyImport.newCta')}
        </button>
      </div>
    </div>
  );
}
