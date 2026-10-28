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
import { Button, Dialog, ItemFrame, Panel, StatList, StatRow } from './ui';
import type { CardRarity } from './ui';
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
  canContinue,
  onClaim,
  onOpenInventory,
}: {
  save: SaveData;
  reward: PendingHuntReward;
  subLevels: number;
  /** False when the session was ended to start something else: the only answer is then to collect. */
  canContinue: boolean;
  /** `keepHunting`: collect and start the same zone and depth again; false = collect and leave the hunt ended. */
  onClaim: (keepHunting: boolean) => void;
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

  const tierOf = (r: string): CardRarity => (r === 'rare' ? 'epic' : r === 'uncommon' ? 'rare' : 'common');

  return (
    <Dialog
      className="hs-reward"
      icon={zone ? <MonsterPortrait enemyId={zone.enemyId} box="56px" /> : undefined}
      title={t('hunting.rewardsTitle')}
      subtitle={
        zone ? (
          <>
            {t(`dungeon.${zone.nameKey}`)} · {t(`enemies.${huntingEnemyNameKey(zone.enemyId)}`)} · {t(`hunting.depth_${reward.depth}`)}
          </>
        ) : undefined
      }
      footer={
        held || !canContinue ? (
          <Button variant="primary" block onClick={() => onClaim(false)}>
            {t(held ? 'hunting.claimHeld' : 'hunting.claim')}
          </Button>
        ) : (
          <>
            <Button variant="primary" block onClick={() => onClaim(true)}>
              {t('hunting.claimAndContinue')}
            </Button>
            <Button block onClick={() => onClaim(false)}>
              {t('hunting.claimAndStop')}
            </Button>
          </>
        )
      }
    >
      {isSession && (
        <Panel tone="inset">
          <StatList>
            <StatRow label={t('hunting.rewardDuration')} value={fmtSpan(timeMs)} />
            {pendingMs < timeMs && <StatRow label={t('hunting.rewardCounted')} value={fmtSpan(pendingMs)} />}
            <StatRow label={t('hunting.rewardXp')} value={fmtNum(xp)} tone="good" />
            <StatRow label={t('hunting.rewardGold')} value={fmtNum(gold)} tone="gold" />
          </StatList>
        </Panel>
      )}

      {added.length > 0 && (
        <Panel title={t('hunting.goesToInventory')}>
          <div className="hs-loot reward">
            {added.map(([id, n]) => (
              <div className={`hs-loot-cell${rarityOf(id) === 'rare' ? ' reveal rv-rare' : ''}`} key={id} title={matName(id)}>
                <ItemFrame rarity={tierOf(rarityOf(id))} qty={`+${fmtNum(n)}`}>
                  <MaterialIcon item={getMaterial(id)!} />
                </ItemFrame>
                <span className="hs-loot-rate">{matName(id)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {nothing && <p className="hs-meter-text">{t('hunting.noneReady')}</p>}

      <UniqueDrops drops={uniques} held={plan.uniquesLeft.length > 0} />
      {needsServerUniques(reward) && <p className="hs-meter-text">{t('hunting.uniquesServerNote')}</p>}
      {reward.skillTally && <StrikeLines tally={reward.skillTally} total={reward.totalDamage ?? 0} />}

      <p className={`hs-line ${slotCls}`}>{t('hunting.invAfterClaim', { n: plan.slotsBefore, m: plan.capacity, a: plan.slotsAfter })}</p>

      {Object.keys(plan.owedHeld).length > 0 && <p className="hs-line bad">{t('hunting.owedHeld')}</p>}

      {leftBehind.length > 0 && (
        <Panel tone="inset" className="hs-left">
          <p className="hs-line bad">{t('hunting.leftBehindWarning', { n: fmtNum(unitsLeft) })}</p>
          <div className="hs-lostlist">
            {leftBehind.map((item) => (
              <span className="hs-lost" key={item.itemId}>
                <MatIcon id={item.itemId} />
                <span>
                  {fmtNum(item.count)}× {matName(item.itemId)}
                </span>
              </span>
            ))}
          </div>
          <Button size="sm" onClick={onOpenInventory}>
            {t('hunting.openInventory')}
          </Button>
          <WholesaleLink hint />
        </Panel>
      )}
      {leftBehind.length === 0 && held && (
        <Button size="sm" onClick={onOpenInventory}>
          {t('hunting.openInventory')}
        </Button>
      )}

      {isSession && (
        <Panel tone="inset" title={t('hunting.subLevelBar', { n: ceilingSubLevel, m: subLevels })}>
          {ceilingSubLevel > startCeiling ? (
            <p className="hs-promoted">{t('hunting.promotedRange', { a: startCeiling, b: ceilingSubLevel })}</p>
          ) : (
            !maxed && <p className="hs-meter-text">{t('hunting.promotedNone')}</p>
          )}
          {!maxed && <Meter pct={(Math.min(promotionWins, promotionRequired) / Math.max(1, promotionRequired)) * 100} tone="xp" />}
          <p className="hs-meter-text">{maxed ? t('hunting.subLevelMax') : promotionLine(promotionWins, promotionRequired, ceilingSubLevel)}</p>
        </Panel>
      )}
    </Dialog>
  );
}
