import { t } from '../locales';

// Asked before refining, reforging or lapidating a piece that still carries a server certificate (itemActions.changeAction): the change cancels the certificate for good, so the piece can
// never be sold. Nothing is sent to the server until the player confirms.
export default function ConfirmVoidModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop ap-summary-backdrop">
      <div className="modal ap-summary" role="alertdialog" aria-label={t('items.voidTitle')}>
        <h2 className="modal-title win">{t('items.voidTitle')}</h2>
        <p className="salvage-hint">{t('items.voidText')}</p>
        <button className="quest-btn claim" onClick={onConfirm} data-ui>
          {t('items.voidConfirm')}
        </button>
        <button className="inv-discard" onClick={onCancel} data-ui>
          {t('items.voidCancel')}
        </button>
      </div>
    </div>
  );
}
