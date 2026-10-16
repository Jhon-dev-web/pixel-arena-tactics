import { t } from '../locales';
import { Button, Dialog } from './ui';

// Asked before refining, reforging or lapidating a piece that still carries a server certificate (itemActions.changeAction): the change cancels the certificate for good, so the piece can
// never be sold. Nothing is sent to the server until the player confirms.
export default function ConfirmVoidModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      title={t('items.voidTitle')}
      footer={
        <>
          <Button variant="primary" block onClick={onConfirm}>
            {t('items.voidConfirm')}
          </Button>
          <Button block onClick={onCancel}>
            {t('items.voidCancel')}
          </Button>
        </>
      }
    >
      <p>{t('items.voidText')}</p>
    </Dialog>
  );
}
