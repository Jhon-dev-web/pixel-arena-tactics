import { t } from '../locales';
import PreseasonResetNotice from './PreseasonResetNotice';
import { Button, Dialog } from './ui';

const welcomeText = (k: string): string => t(`welcome.${k}`);

// Shown once, on a brand-new save, before the icon tooltip sequence starts (see App.tsx —
// SaveData.seenWelcome gates both this modal and the tooltip queue).
export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      className="welcome-modal"
      tone="win"
      title={welcomeText('title')}
      footer={
        <Button variant="primary" block onClick={onClose}>
          {welcomeText('cta')}
        </Button>
      }
    >
      <p>{welcomeText('idleTip')}</p>
      <p>{welcomeText('startTip')}</p>
      <p className="ui-alert">{welcomeText('saveWarning')}</p>
      <PreseasonResetNotice className="ui-alert" />
    </Dialog>
  );
}
