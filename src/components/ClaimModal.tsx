import { t } from '../locales';
import Assets from '../assets.json';
import { ExpeditionRewards } from '../game/expedition';

const expText = (k: string): string => t(`expedition.${k}`);

export default function ClaimModal({
  nameKey,
  rewards,
  onClose,
}: {
  nameKey: string;
  rewards: ExpeditionRewards;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal claim-modal">
        <h2 className="modal-title">{t('expedition.rewards')}</h2>
        <p className="claim-name">{expText(nameKey)}</p>

        <div className="result-rewards">
          <span className="floor-drop">
            <span className="mat-icon">
              <img src={Assets.icons.gold.url} alt="" />
            </span>
            <span>{t('ui.goldReward', { n: rewards.gold })}</span>
          </span>
          {rewards.shards > 0 && (
            <span className="floor-drop">
              <span className="mat-icon shard">
                <img src="/assets/icons/shards.png" alt="" />
              </span>
              <span>{t('ui.shardsReward', { n: rewards.shards })}</span>
            </span>
          )}
        </div>

        <button className="result-btn" onClick={onClose} data-ui>
          {t('expedition.close')}
        </button>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
