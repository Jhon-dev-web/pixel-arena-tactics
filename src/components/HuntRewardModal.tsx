import { t } from '../locales';
import Assets from '../assets.json';
import { materialIconUrl } from '../game/materials';
import { HuntPouchState } from '../game/huntPouch';

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
  pouch,
  ceilingSubLevel,
  startCeiling,
  promotionWins,
  promotionRequired,
  subLevels,
  onClaim,
}: {
  timeMs: number;
  gold: number;
  pouch: HuntPouchState;
  ceilingSubLevel: number;
  startCeiling: number;
  promotionWins: number;
  promotionRequired: number;
  subLevels: number;
  onClaim: () => void;
}) {
  const hasItems = pouch.items.length > 0;
  const hasLost = pouch.lostItems.length > 0;

  return (
    <div className="modal-backdrop">
      <div className="modal claim-modal">
        <h2 className="modal-title">{t('hunting.rewardsTitle')}</h2>
        <p className="claim-name">{t('hunting.timeHunted', { t: formatDuration(timeMs) })}</p>
        <p className="claim-name">{t('hunting.subLevelProgress', { n: ceilingSubLevel, m: subLevels })}</p>
        {ceilingSubLevel > startCeiling && (
          <div className="hunt-sublevel-farm">{t('hunting.subLevelPromoted', { n: ceilingSubLevel })}</div>
        )}
        {ceilingSubLevel >= subLevels ? (
          <div className="hunt-sublevel-farm">{t('hunting.subLevelMax')}</div>
        ) : (
          <div className="hunt-sublevel-farm">
            {t('hunting.subLevelPromotion', { next: ceilingSubLevel + 1, n: Math.min(promotionWins, promotionRequired), x: promotionRequired })}
          </div>
        )}

        <div className="result-rewards">
          {gold > 0 && (
            <span className="floor-drop">
              <span className="mat-icon">
                <img src={Assets.icons.gold.url} alt="" />
              </span>
              <span>{t('ui.goldReward', { n: gold })}</span>
            </span>
          )}
          {pouch.items.map((item) => (
            <span className="floor-drop" key={item.itemId}>
              <span className="mat-icon">
                <img src={materialIconUrl(item.itemId)} alt="" />
              </span>
              <span>
                +{item.count}× {matText(`mat_${item.itemId}`)}
              </span>
            </span>
          ))}
          {!hasItems && gold <= 0 && (
            <span className="floor-drop">
              <span>{t('hunting.noneReady')}</span>
            </span>
          )}
        </div>

        {hasLost && (
          <div className="pouch-lost-card">
            <p className="pouch-lost-text">{t('hunting.lostItemsWarning')}</p>
            <div className="result-rewards">
              {pouch.lostItems.map((item) => (
                <span className="floor-drop lost" key={item.itemId}>
                  <span className="mat-icon">
                    <img src={materialIconUrl(item.itemId)} alt="" />
                  </span>
                  <span>
                    {item.count}× {matText(`mat_${item.itemId}`)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <button className="result-btn" onClick={onClaim} data-ui>
          {t('hunting.claimAndExit')}
        </button>
      </div>
    </div>
  );
}
