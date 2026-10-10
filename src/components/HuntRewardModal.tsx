import { fmtNum, t } from '../locales';
import { HuntPouchState } from '../game/huntPouch';
import { PendingHuntReward } from '../game/huntSession';
import { getHuntingZone, huntingEnemyNameKey } from '../game/huntingZones';
import { fmtSpan, matName } from '../game/huntView';
import { MatIcon, Meter, MonsterPortrait } from './HuntParts';
import UniqueDrops from './UniqueDrops';

// Shows the reward a stopped session left in the save (`reward`, frozen at stop). Nothing here is recomputed: the loot
// listed is what the pouch holds and what did not fit is `reward.lost` (information only — it is not given back).
// The reward does not record how many fights the session had, so there is no kills figure here (the running view shows it live).
export default function HuntRewardModal({
  reward,
  pouch,
  subLevels,
  bagFull = false,
  onClaim,
}: {
  reward: PendingHuntReward;
  pouch: HuntPouchState;
  subLevels: number;
  // The bag has no free slot for the unique pieces: they stay pending (held) until one is freed.
  bagFull?: boolean;
  onClaim: () => void;
}) {
  const { timeMs, pendingMs, gold, xp, ceilingSubLevel, startCeiling, promotionWins, promotionRequired, lost, pouchCapacity } = reward;
  const hasItems = pouch.items.length > 0;
  const hasLost = lost.length > 0;
  const uniques = reward.uniques ?? [];
  const zone = getHuntingZone(reward.zoneId);
  const maxed = ceilingSubLevel >= subLevels;
  const nothing = !hasItems && gold <= 0 && xp <= 0 && uniques.length === 0;

  return (
    <div className="modal-backdrop">
      <div className="modal claim-modal hunt-reward-modal">
        <h2 className="modal-title">{t('hunting.rewardsTitle')}</h2>

        {zone && (
          <div className="hunt-reward-zone">
            <MonsterPortrait enemyId={zone.enemyId} box="44px" />
            <span className="hunt-reward-zone-text">
              <span className="hunt-zone-name">{t(`dungeon.${zone.nameKey}`)}</span>
              <span className="hunt-zone-sub">
                {t(`enemies.${huntingEnemyNameKey(zone.enemyId)}`)} · {t(`hunting.depth_${reward.depth}`)}
              </span>
            </span>
          </div>
        )}

        <div className="hunt-tiles reward">
          <div className="hunt-tile">
            <span className="hunt-tile-value">{fmtSpan(timeMs)}</span>
            <span className="hunt-tile-label">{t('hunting.rewardDuration')}</span>
          </div>
          {pendingMs < timeMs && (
            <div className="hunt-tile">
              <span className="hunt-tile-value">{fmtSpan(pendingMs)}</span>
              <span className="hunt-tile-label">{t('hunting.rewardCounted')}</span>
            </div>
          )}
          <div className="hunt-tile xp">
            <span className="hunt-tile-value">{fmtNum(xp)}</span>
            <span className="hunt-tile-label">{t('hunting.rewardXp')}</span>
          </div>
          <div className="hunt-tile gold">
            <span className="hunt-tile-value">{fmtNum(gold)}</span>
            <span className="hunt-tile-label">{t('hunting.rewardGold')}</span>
          </div>
        </div>

        <div className="result-rewards">
          {pouch.items.map((item) => (
            <span className="floor-drop" key={item.itemId}>
              <MatIcon id={item.itemId} />
              <span>
                +{fmtNum(item.count)}× {matName(item.itemId)}
              </span>
            </span>
          ))}
          {nothing && (
            <span className="floor-drop">
              <span>{t('hunting.noneReady')}</span>
            </span>
          )}
        </div>

        <UniqueDrops drops={uniques} held={bagFull} />

        {pouchCapacity > 0 && (
          <p className="pouch-capacity">{t('hunting.pouchLabel', { n: pouch.items.length, m: pouchCapacity })}</p>
        )}

        {hasLost && (
          <div className="pouch-lost-card">
            <p className="pouch-lost-text">{t('hunting.lostItemsWarning')}</p>
            <div className="result-rewards">
              {lost.map((item) => (
                <span className="floor-drop lost" key={item.itemId}>
                  <MatIcon id={item.itemId} />
                  <span>
                    {fmtNum(item.count)}× {matName(item.itemId)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="hunt-reward-level">
          <span className="hunt-section-title">{t('hunting.subLevelBar', { n: ceilingSubLevel, m: subLevels })}</span>
          {ceilingSubLevel > startCeiling ? (
            <div className="hunt-promoted">{t('hunting.promotedRange', { a: startCeiling, b: ceilingSubLevel })}</div>
          ) : (
            !maxed && <div className="hunt-meter-text">{t('hunting.promotedNone')}</div>
          )}
          {!maxed && <Meter pct={(Math.min(promotionWins, promotionRequired) / Math.max(1, promotionRequired)) * 100} tone="xp" />}
          <div className="hunt-meter-text">
            {maxed ? t('hunting.subLevelMax') : t('hunting.subLevelNext', { n: Math.min(promotionWins, promotionRequired), x: promotionRequired })}
          </div>
        </div>

        <button className="result-btn" onClick={onClaim} data-ui>
          {t(bagFull ? 'hunting.claimHeld' : 'hunting.claimAndExit')}
        </button>
      </div>
    </div>
  );
}
