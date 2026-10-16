import { t } from '../locales';
import Assets from '../assets.json';
import { ExpeditionRewards } from '../game/expedition';
import { Button, Dialog } from './ui';

export default function ClaimModal({
  title,
  name,
  rewards,
  onClose,
}: {
  title: string;
  name: string;
  rewards: ExpeditionRewards;
  onClose: () => void;
}) {
  return (
    <Dialog
      className="claim-modal"
      tone="win"
      title={title}
      subtitle={name}
      footer={
        <Button variant="primary" block onClick={onClose}>
          {t('expedition.close')}
        </Button>
      }
    >
      <div className="dlg-rewards">
        <span className="dlg-reward">
          <img className="inline-icon" src={Assets.icons.gold.url} alt="" />
          {t('ui.goldReward', { n: rewards.gold })}
        </span>
        {rewards.shards > 0 && (
          <span className="dlg-reward shards">
            <img className="inline-icon" src="/assets/icons/shards.png" alt="" />
            {t('ui.shardsReward', { n: rewards.shards })}
          </span>
        )}
      </div>
    </Dialog>
  );
}
