import { t } from '../locales';
import { HeroActivity } from '../game/activity';
import { Button, Dialog } from './ui';

// The hero does ONE task at a time (activity.ts): starting another while he is busy ends here, naming what he is doing, with a button to stop it (using that activity's own stop / claim).
export default function BusyNotice({ activity, onStop, onKeep }: { activity: HeroActivity; onStop: () => void; onKeep: () => void }) {
  const stopKey = { hunt: 'stopHunt', mining: 'stopMining', woodcutting: 'stopWoodcutting', craft: 'stopCraft' }[activity];
  return (
    <Dialog
      title={t('busy.title')}
      footer={
        <>
          <Button variant="primary" block onClick={onStop}>
            {t(`busy.${stopKey}`)}
          </Button>
          <Button block onClick={onKeep}>
            {t('busy.keep')}
          </Button>
        </>
      }
    >
      <p>{t('busy.heroIn', { activity: t(`busy.${activity}`) })}</p>
    </Dialog>
  );
}
