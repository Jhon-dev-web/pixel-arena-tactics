import { t } from '../locales';
import { Button, Dialog } from './ui';

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
      <Dialog
        inline
        className="auth-dialog"
        title={t('legacyImport.title')}
        subtitle={t('legacyImport.description')}
        footer={
          <>
            <Button variant="primary" block onClick={onImport} disabled={importing}>
              {importing ? t('legacyImport.importing') : t('legacyImport.importCta')}
            </Button>
            <Button block onClick={onStartNew} disabled={importing}>
              {t('legacyImport.newCta')}
            </Button>
          </>
        }
      >
        <p className="ui-alert">{t('legacyImport.warning')}</p>
      </Dialog>
    </div>
  );
}
