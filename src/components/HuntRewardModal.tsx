import { t } from '../locales';
import Assets from '../assets.json';
import { MaterialId, materialIconUrl } from '../game/materials';

const matText = (k: string): string => t(`materials.${k}`);

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function HuntRewardModal({
  timeMs,
  gold,
  drops,
  onClaim,
}: {
  timeMs: number;
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  onClaim: () => void;
}) {
  const hasDrops = Object.keys(drops).length > 0;

  return (
    <div className="modal-backdrop">
      <div className="modal claim-modal">
        <h2 className="modal-title">{t('hunting.rewardsTitle')}</h2>
        <p className="claim-name">{t('hunting.timeHunted', { t: formatDuration(timeMs) })}</p>

        <div className="result-rewards">
          {gold > 0 && (
            <span className="floor-drop">
              <span className="mat-icon">
                <img src={Assets.icons.gold.url} alt="" />
              </span>
              <span>{t('ui.goldReward', { n: gold })}</span>
            </span>
          )}
          {Object.entries(drops).map(([mid, qty]) => (
            <span className="floor-drop" key={mid}>
              <span className="mat-icon">
                <img src={materialIconUrl(mid as MaterialId)} alt="" />
              </span>
              <span>
                +{qty}× {matText(`mat_${mid}`)}
              </span>
            </span>
          ))}
          {!hasDrops && gold <= 0 && (
            <span className="floor-drop">
              <span>{t('hunting.noneReady')}</span>
            </span>
          )}
        </div>

        <button className="result-btn" onClick={onClaim} data-ui>
          {t('hunting.claimAndExit')}
        </button>
      </div>
    </div>
  );
}
