import { t } from '../locales';

const welcomeText = (k: string): string => t(`welcome.${k}`);

// Shown once, on a brand-new save, before the icon tooltip sequence starts (see App.tsx —
// SaveData.seenWelcome gates both this modal and the tooltip queue).
export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal claim-modal welcome-modal">
        <h2 className="modal-title">{welcomeText('title')}</h2>
        <p className="claim-name">{welcomeText('idleTip')}</p>
        <p className="claim-name">{welcomeText('startTip')}</p>
        <p className="welcome-save-warning">{welcomeText('saveWarning')}</p>

        <button className="result-btn" onClick={onClose} data-ui>
          {welcomeText('cta')}
        </button>
      </div>
    </div>
  );
}
