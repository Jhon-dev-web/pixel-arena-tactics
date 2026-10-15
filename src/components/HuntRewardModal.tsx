import { useEffect } from 'react';
import { promotionLine } from './promotionLine';
import { fmtNum, t } from '../locales';
import { playSfx } from '../game/audio';
import { SaveData } from '../game/engine';
import { PendingHuntReward } from '../game/huntSession';
import { needsServerUniques, planHuntClaim } from '../game/huntLifecycle';
import { getHuntingZone, huntingEnemyNameKey } from '../game/huntingZones';
import { getMaterial, MaterialId } from '../game/materials';
import { fmtSpan, matName } from '../game/huntView';
import { MatIcon, Meter, MonsterPortrait } from './HuntParts';
import MaterialIcon from './MaterialIcon';
import UniqueDrops from './UniqueDrops';
import StrikeLines from './StrikeLines';
import WholesaleLink from './WholesaleLink';

// Shows the reward a stopped session left in the save (`reward`, frozen at stop) and what claiming it will do to the inventory RIGHT NOW: the same
// function as the claim (planHuntClaim) decides it, so what is listed here is exactly what happens. Loot goes into the free space, rarest first; what
// does not fit is shown in red with the reason and is gone once claimed (the Inventory shortcut lets the player make room first). Unique pieces and
// units owed from before the inventory rule are never left behind: they are held until there is room.
// The reward does not record how many fights the session had, so there is no kills figure here (the running view shows it live).
export default function HuntRewardModal({
  save,
  reward,
  subLevels,
  onClaim,
  onOpenInventory,
}: {
  save: SaveData;
  reward: PendingHuntReward;
  subLevels: number;
  onClaim: () => void;
  onOpenInventory: () => void;
}) {
  const { timeMs, pendingMs, gold, xp, ceilingSubLevel, startCeiling, promotionWins, promotionRequired, lost } = reward;
  const plan = planHuntClaim(save, reward);
  const added = (Object.entries(plan.added) as [MaterialId, number][]).filter(([, n]) => n > 0);
  const leftBehind = [...plan.leftBehind, ...lost];
  const held = plan.uniquesLeft.length > 0 || Object.keys(plan.owedHeld).length > 0;
  const uniques = reward.uniques ?? [];
  const zone = getHuntingZone(reward.zoneId);
  const maxed = ceilingSubLevel >= subLevels;
  const isSession = timeMs > 0;
  const nothing = added.length === 0 && gold <= 0 && xp <= 0 && uniques.length === 0 && leftBehind.length === 0 && !held;
  const rarityOf = (id: MaterialId): string => zone?.drops.find((d) => d.material === id)?.rarity ?? 'common';
  const slotCls = plan.slotsAfter >= plan.capacity ? 'full' : plan.slotsAfter >= plan.capacity * 0.85 ? 'warn' : '';
  const unitsLeft = leftBehind.reduce((sum, i) => sum + i.count, 0);
  const hasRare = added.some(([id]) => rarityOf(id) === 'rare');

  // A unique piece or a rare material in the haul gets its own short sound, once per reward (it respects mute like every sound).
  useEffect(() => {
    if (uniques.length > 0) playSfx('drop_unique');
    else if (hasRare) playSfx('drop_rare');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reward.id]);

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

        {isSession && (
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
        )}

        {added.length > 0 && (
          <>
            <h4 className="hunt-section-title">{t('hunting.goesToInventory')}</h4>
            <div className="hunt-loot reward">
              {added.map(([id, n]) => (
                <div className="hunt-loot-cell" key={id}>
                  <span className={`inv-slot hunt-loot-slot mat-${rarityOf(id)}${rarityOf(id) === 'rare' ? ' reveal rv-rare' : ''}`} title={matName(id)}>
                    <span className="inv-icon">
                      <MaterialIcon item={getMaterial(id)!} />
                    </span>
                    <span className="inv-qty">+{fmtNum(n)}</span>
                  </span>
                  <span className="hunt-loot-rate">{matName(id)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {nothing && (
          <div className="result-rewards">
            <span className="floor-drop">
              <span>{t('hunting.noneReady')}</span>
            </span>
          </div>
        )}

        <UniqueDrops drops={uniques} held={plan.uniquesLeft.length > 0} />
        {needsServerUniques(reward) && <p className="hunt-meter-text">{t('hunting.uniquesServerNote')}</p>}
        {reward.skillTally && <StrikeLines tally={reward.skillTally} total={reward.totalDamage ?? 0} />}

        <p className={`hunt-inv-line ${slotCls}`}>{t('hunting.invAfterClaim', { n: plan.slotsBefore, m: plan.capacity, a: plan.slotsAfter })}</p>

        {Object.keys(plan.owedHeld).length > 0 && <p className="hunt-inv-line bad">{t('hunting.owedHeld')}</p>}

        {leftBehind.length > 0 && (
          <div className="hunt-left-card">
            <p className="hunt-left-text">{t('hunting.leftBehindWarning', { n: fmtNum(unitsLeft) })}</p>
            <div className="result-rewards">
              {leftBehind.map((item) => (
                <span className="floor-drop lost" key={item.itemId}>
                  <MatIcon id={item.itemId} />
                  <span>
                    {fmtNum(item.count)}× {matName(item.itemId)}
                  </span>
                </span>
              ))}
            </div>
            <button className="hunt-left-btn" onClick={onOpenInventory} data-ui>
              {t('hunting.openInventory')}
            </button>
            <WholesaleLink className="hunt-left-btn" hint />
          </div>
        )}
        {leftBehind.length === 0 && held && (
          <button className="hunt-left-btn" onClick={onOpenInventory} data-ui>
            {t('hunting.openInventory')}
          </button>
        )}

        {isSession && (
          <div className="hunt-reward-level">
            <span className="hunt-section-title">{t('hunting.subLevelBar', { n: ceilingSubLevel, m: subLevels })}</span>
            {ceilingSubLevel > startCeiling ? (
              <div className="hunt-promoted">{t('hunting.promotedRange', { a: startCeiling, b: ceilingSubLevel })}</div>
            ) : (
              !maxed && <div className="hunt-meter-text">{t('hunting.promotedNone')}</div>
            )}
            {!maxed && <Meter pct={(Math.min(promotionWins, promotionRequired) / Math.max(1, promotionRequired)) * 100} tone="xp" />}
            <div className="hunt-meter-text">
              {maxed ? t('hunting.subLevelMax') : promotionLine(promotionWins, promotionRequired, ceilingSubLevel)}
            </div>
          </div>
        )}

        <button className="result-btn" onClick={onClaim} data-ui>
          {t(held ? 'hunting.claimHeld' : 'hunting.claimAndExit')}
        </button>
      </div>
    </div>
  );
}
