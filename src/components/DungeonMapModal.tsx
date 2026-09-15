import { t } from '../locales';
import T from '../game/tunables';
import { computeCP, SaveData } from '../game/engine';
import {
  getBiomeForFloor,
  isDungeonBoss,
  isDungeonCheckpoint,
  isEliteUnlocked,
  MAX_DUNGEON_FLOOR,
  MILESTONE_FLOORS,
  nextMilestone,
  recommendedCpForFloor,
} from '../game/dungeon';
import { getEnemyDef } from '../game/enemies';

const dungeonText = (k: string): string => t(`dungeon.${k}`);
const enemyText = (k: string): string => t(`enemies.${k}`);

export default function DungeonMapModal({
  save,
  onEnterDungeon,
  onEnterElite,
  onUpdateAutoPotionSettings,
  onClose,
}: {
  save: SaveData;
  onEnterDungeon: () => void;
  onEnterElite: (floor: number) => void;
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
  // "boss" enemy kind is shared by every gate floor (25/50/75/100) — see dungeonEnemyKindForFloor.
  const bossName = enemyText(getEnemyDef('boss').nameKey);
  const eliteFloors = MILESTONE_FLOORS.filter((f) => isEliteUnlocked(f, save.dungeonCheckpoints));
  const sessionsUsedToday = save.dungeonSessionsDay === new Date().toDateString() ? save.dungeonSessionsUsed : 0;
  const freeSessionsLeft = Math.max(0, T.dungeon.freeSessionsPerDay - sessionsUsedToday);

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal">
        <h2 className="modal-title">{t('dungeon.title')}</h2>

        <div className="dungeon-body">
          <div className="floor-card">
            <div className="floor-header">
              <span className="floor-name">
                {dungeonText(biome.nameKey)}
                {isDungeonBoss(floor) && <span className="milestone-icon boss">👑</span>}
                {!isDungeonBoss(floor) && isDungeonCheckpoint(floor) && <span className="milestone-icon">💀</span>}
              </span>
              <span className="floor-cp">{t('dungeon.floorProgress', { n: floor, m: MAX_DUNGEON_FLOOR })}</span>
            </div>
            <div className="floor-drops">
              <span className="drops-label">{dungeonText('recommendedCp')}:</span>
              <span className={`floor-drop${cpInsufficient ? ' cp-insufficient' : ''}`}>
                <span>{recommendedCp}</span>
              </span>
              <span className="floor-drop">
                <span>{t('dungeon.yourCp', { n: playerCp })}</span>
              </span>
            </div>
            {cpInsufficient && <div className="cp-warning-banner">{t('dungeon.cpWarning', { n: recommendedCp })}</div>}
            {huntingBusy && <div className="cp-warning-banner">{t('hunting.busyOther')}</div>}
            <div className="floor-drops">
              <span className="drops-label">
                {freeSessionsLeft > 0
                  ? t('dungeon.sessionsLeft', { n: freeSessionsLeft, m: T.dungeon.freeSessionsPerDay })
                  : t('dungeon.sessionsPaidNotice', { n: T.dungeon.extraSessionShardCost })}
              </span>
            </div>
            {milestone && (
              <div className="floor-drops">
                <span className="drops-label">
                  {milestone.boss ? '👑 ' + dungeonText('nextBoss') : '💀 ' + dungeonText('nextCheckpoint')}:
                </span>
                <span className="floor-drop">
                  <span>{t('dungeon.floorProgress', { n: milestone.floor, m: MAX_DUNGEON_FLOOR })}</span>
                </span>
              </div>
            )}
            <button className="battle-btn" onClick={onEnterDungeon} disabled={huntingBusy} data-ui>
              {dungeonText('enterDungeon')}
            </button>
          </div>

          <div className="floor-card auto-potion-card">
            <div className="floor-header">
              <span className="floor-name">{dungeonText('autoPotionTitle')}</span>
            </div>
            <label className="auto-potion-threshold-label" htmlFor="auto-potion-threshold">
              {t('dungeon.autoPotionThreshold', { n: Math.round(save.autoPotionThreshold * 100) })}
            </label>
            <input
              id="auto-potion-threshold"
              className="auto-potion-slider"
              type="range"
              min={10}
              max={70}
              step={5}
              value={Math.round(save.autoPotionThreshold * 100)}
              onChange={(e) => onUpdateAutoPotionSettings(Number(e.target.value) / 100, save.autoPotionPriority)}
              data-ui
            />
            <div className="hunt-depth-row auto-potion-priority">
              <button
                className={`hunt-depth-btn${save.autoPotionPriority === 'small_first' ? ' active' : ''}`}
                onClick={() => onUpdateAutoPotionSettings(save.autoPotionThreshold, 'small_first')}
                data-ui
              >
                <span className="hunt-depth-name">{dungeonText('autoPotionPrioritySmall')}</span>
              </button>
              <button
                className={`hunt-depth-btn${save.autoPotionPriority === 'large_first' ? ' active' : ''}`}
                onClick={() => onUpdateAutoPotionSettings(save.autoPotionThreshold, 'large_first')}
                data-ui
              >
                <span className="hunt-depth-name">{dungeonText('autoPotionPriorityLarge')}</span>
              </button>
            </div>
          </div>

          {eliteFloors.map((f) => {
            const defeated = save.dungeonEliteDefeated.includes(f);
            return (
              <div className="floor-card elite-card" key={f}>
                <div className="floor-header">
                  <span className="floor-name">
                    <span className="milestone-icon boss">⚔️</span>
                    {t('dungeon.eliteChallenge', { name: bossName })}
                  </span>
                  <span className="floor-cp">{t('dungeon.floorProgress', { n: f, m: MAX_DUNGEON_FLOOR })}</span>
                </div>
                {defeated && <div className="cp-warning-banner elite-cleared-banner">{dungeonText('eliteDefeated')}</div>}
                <button className="battle-btn" onClick={() => onEnterElite(f)} disabled={huntingBusy} data-ui>
                  {dungeonText('eliteEnter')}
                </button>
              </div>
            );
          })}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
