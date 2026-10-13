import { t } from '../locales';
import { welcomeRowText, WelcomeBackAction } from './welcomeBackText';
import { WelcomeBackSummary } from '../game/welcomeBack';

// One quiet card listing what finished while the player was away. Every row has ONE button: it opens the screen of that activity, or collects it where a free
// collect action already exists (mining, woodcutting, garden, delivery). The Pass-only "Resgatar tudo" shows up for owners only.

export default function WelcomeBackModal({
  summary,
  canClaimAll,
  onAction,
  onClaimAll,
  onClose,
}: {
  summary: WelcomeBackSummary;
  canClaimAll: boolean;
  onAction: (action: WelcomeBackAction) => void;
  onClaimAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop ap-summary-backdrop">
      <div className="modal ap-summary wb-modal" role="dialog" aria-label={t('welcomeBack.title')}>
        <h2 className="modal-title win">{t('welcomeBack.title')}</h2>
        <p className="ap-summary-hint">{t('welcomeBack.hint')}</p>
        <ul className="ap-summary-list">
          {summary.rows.map((row) => {
            const text = welcomeRowText(row);
            return (
              <li className={`ap-summary-row wb-row${text.rare ? ' wb-rare' : ''}`} key={row.kind}>
                <div className="wb-row-text">
                  <span className="ap-summary-name">{text.title}</span>
                  <span className="claimall-detail">{text.detail}</span>
                  {text.note && <span className="wb-note">{text.note}</span>}
                </div>
                <button className="wb-btn" onClick={() => onAction(text.action)} data-ui>
                  {text.button}
                </button>
              </li>
            );
          })}
        </ul>
        {canClaimAll && (
          <button className="quest-btn claim" onClick={onClaimAll} data-ui>
            {t('claimAll.button')}
          </button>
        )}
        <button className="wb-close" onClick={onClose} data-ui>
          {t('welcomeBack.close')}
        </button>
      </div>
    </div>
  );
}
