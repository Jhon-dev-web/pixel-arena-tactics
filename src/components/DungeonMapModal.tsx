import { fmtDec, fmtNum, t } from '../locales';
import T from '../game/tunables';
import { computeCP, SaveData } from '../game/engine';
import { getBiomeForFloor, getMilestoneReward, isDungeonBoss, isDungeonCheckpoint, MAX_DUNGEON_FLOOR, MILESTONE_REWARDS, nextMilestone, recommendedCpForFloor } from '../game/dungeon';
import { deepestDepth, depthRewardInfo, depthsUnlocked, nextBossDepth, recommendedCpForDepth } from '../game/depths';
import { paragonLevel } from '../game/paragon';
import { getGem } from '../game/gems';
import { getTitleDef } from '../game/titles';
import { Button, Chip, ChipRow, ModalShell, Panel, ScreenLayout, StatList, StatRow } from './ui';
import { Meter } from './HuntParts';

const dungeonText = (k: string): string => t(`dungeon.${k}`);

export default function DungeonMapModal({
  save,
  onEnterDungeon,
  onEnterDepths,
  onUpdateAutoPotionSettings,
  onClose,
}: {
  save: SaveData;
  onEnterDungeon: () => void;
  onEnterDepths: () => void;
  onUpdateAutoPotionSettings: (threshold: number, priority: 'small_first' | 'large_first') => void;
  onClose: () => void;
}) {
  const floor = save.highestDungeonFloor;
  const biome = getBiomeForFloor(floor);
  const milestone = nextMilestone(floor);
  const recommendedCp = recommendedCpForFloor(floor);
  const playerCp = computeCP(save);
  const cpInsufficient = playerCp < recommendedCp;
  const huntingBusy = !!save.activeHuntingZone;
  const sessionsUsedToday = save.dungeonSessionsDay === new Date().toDateString() ? save.dungeonSessionsUsed : 0;
  const freeSessionsLeft = Math.max(0, T.dungeon.freeSessionsPerDay - sessionsUsedToday);
  // Profundezas (depths.ts): open once the floor-100 boss has fallen; a run starts one below the deepest depth cleared.
  const depthsOpen = depthsUnlocked(save);
  const deepest = deepestDepth(save);
  const nextDepth = deepest + 1;
  const depthCp = recommendedCpForDepth(nextDepth);
  const depthCpLow = playerCp < depthCp;
  const bossInfo = depthRewardInfo(nextBossDepth(nextDepth));
  const growthPct = Math.round((Math.sqrt((1 + T.depths.hpGrowth) * (1 + T.depths.dmgGrowth)) - 1) * 100 * 10) / 10;
  const paragon = paragonLevel(save.xp);

  const main = (
    <>
      <Panel
        title={
          <>
            {dungeonText(biome.nameKey)}
            {isDungeonBoss(floor) && <span className="dm-mark"> 👑</span>}
            {!isDungeonBoss(floor) && isDungeonCheckpoint(floor) && <span className="dm-mark"> 💀</span>}
          </>
        }
        actions={<Chip tone="gold">{t('dungeon.floorProgress', { n: floor, m: MAX_DUNGEON_FLOOR })}</Chip>}
      >
        <StatList>
          <StatRow label={dungeonText('recommendedCp')} value={fmtNum(recommendedCp)} tone={cpInsufficient ? 'bad' : 'plain'} />
          <StatRow label={dungeonText('cpLabelYou')} value={fmtNum(playerCp)} tone="gold" />
          {milestone && <StatRow label={milestone.boss ? '👑 ' + dungeonText('nextBoss') : '💀 ' + dungeonText('nextCheckpoint')} value={t('dungeon.floorProgress', { n: milestone.floor, m: MAX_DUNGEON_FLOOR })} />}
        </StatList>
        <p className="dm-sessions">
          {freeSessionsLeft > 0 ? t('dungeon.sessionsLeft', { n: freeSessionsLeft, m: T.dungeon.freeSessionsPerDay }) : t('dungeon.sessionsPaidNotice', { n: T.dungeon.extraSessionShardCost })}
        </p>
        {cpInsufficient && <p className="ui-alert bad">{t('dungeon.cpWarning', { n: recommendedCp })}</p>}
        {huntingBusy && <p className="ui-alert bad">{t('hunting.busyOther')}</p>}
        <Button variant="primary" block className="dm-enter" onClick={onEnterDungeon} disabled={huntingBusy} data-tutorial-target="dungeon-start">
          {dungeonText('enterDungeon')}
        </Button>
      </Panel>

      <Panel
        className={`depths-card${depthsOpen ? '' : ' locked'}`}
        data-testid="depths-card"
        title={
          <>
            🕳️ {dungeonText('depthsTitle')}
            {paragon > 0 && <span className="dm-paragon">{t('paragon.short', { n: paragon })}</span>}
          </>
        }
        actions={<Chip tone={deepest > 0 ? 'info' : 'plain'}>{deepest > 0 ? dungeonText('depthsDeepest').replace('{n}', String(deepest)) : dungeonText('depthsNone')}</Chip>}
      >
        {depthsOpen ? (
          <>
            <p className="dm-lead">{dungeonText('depthsNext').replace('{n}', String(nextDepth))}</p>
            <StatList>
              <StatRow label={dungeonText('recommendedCp')} value={fmtNum(depthCp)} tone={depthCpLow ? 'bad' : 'plain'} />
              <StatRow label={dungeonText('cpLabelYou')} value={fmtNum(playerCp)} tone="gold" />
            </StatList>
            <p className="ui-note">{dungeonText('depthCpHint').replace('{n}', fmtDec(growthPct))}</p>
            <p className="ui-note">
              👑{' '}
              {dungeonText('depthsBossEvery').replace('{n}', String(T.depths.bossEvery)).replace('{r}', String(bossInfo.shards))}
            </p>
            {depthCpLow && <p className="ui-alert bad">{t('dungeon.cpWarning', { n: depthCp })}</p>}
            <Button variant="primary" block onClick={onEnterDepths} disabled={huntingBusy}>
              {dungeonText('depthsEnter')}
            </Button>
          </>
        ) : (
          <>
            <p className="ui-note">{dungeonText('depthsIntro')}</p>
            <p className="dm-locked">{dungeonText('depthsLocked')}</p>
          </>
        )}
      </Panel>

      <Panel title={dungeonText('autoPotionTitle')}>
        <label className="dm-slider-label" htmlFor="auto-potion-threshold">
          {t('dungeon.autoPotionThreshold', { n: Math.round(save.autoPotionThreshold * 100) })}
        </label>
        <input
          id="auto-potion-threshold"
          className="dm-slider"
          type="range"
          min={10}
          max={70}
          step={5}
          value={Math.round(save.autoPotionThreshold * 100)}
          onChange={(e) => onUpdateAutoPotionSettings(Number(e.target.value) / 100, save.autoPotionPriority)}
          data-ui
        />
        <ChipRow
          className="dm-priority"
          label={dungeonText('autoPotionTitle')}
          value={save.autoPotionPriority}
          onChange={(id) => onUpdateAutoPotionSettings(save.autoPotionThreshold, id)}
          items={[
            { id: 'small_first', label: dungeonText('autoPotionPrioritySmall') },
            { id: 'large_first', label: dungeonText('autoPotionPriorityLarge') },
          ]}
        />
      </Panel>
    </>
  );

  const side = (
    <Panel title={t('dungeon.progressTitle')}>
      <Meter pct={(floor / MAX_DUNGEON_FLOOR) * 100} label={t('dungeon.floorProgress', { n: floor, m: MAX_DUNGEON_FLOOR })} />
      <p className="hs-meter-text">{t('dungeon.floorProgress', { n: floor, m: MAX_DUNGEON_FLOOR })}</p>
      <h4 className="ui-display dm-subtitle">{t('dungeon.milestonesTitle')}</h4>
      <ul className="dm-milestones">
        {MILESTONE_REWARDS.map((m) => {
          const banked = save.dungeonCheckpoints.includes(m.floor);
          const reward = getMilestoneReward(m.floor);
          const titleDef = reward?.titleId ? getTitleDef(reward.titleId) : undefined;
          return (
            <li className={`dm-milestone${banked ? ' banked' : ''}`} key={m.floor}>
              <span className="dm-milestone-head">
                <span className="dm-milestone-floor">{t('dungeon.floorLabel', { n: m.floor })}</span>
                <Chip tone={banked ? 'good' : 'plain'}>{banked ? t('dungeon.milestoneBanked') : t('dungeon.milestonePending')}</Chip>
              </span>
              <span className="dm-milestone-rewards">
                {t('ui.goldReward', { n: fmtNum(m.gold) })}
                {Object.entries(m.gems).map(([gid, qty]) => {
                  const gem = getGem(gid);
                  return gem ? ` · +${qty as number} ${t(`gems.${gem.nameKey}`)}` : '';
                })}
                {titleDef ? ` · ${t(`titles.${titleDef.nameKey}`)}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );

  return (
    <ModalShell
      className="dm-modal"
      icon={<img className="pixel-icon" src="/assets/icons/dragon_flameblade.png" alt="" />}
      title={t('dungeon.title')}
      subtitle={t('dungeon.yourCp', { n: fmtNum(playerCp) })}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="ui-cq">
        <ScreenLayout main={main} side={side} className="dm-layout" />
      </div>
    </ModalShell>
  );
}
