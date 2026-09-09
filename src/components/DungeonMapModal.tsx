import { t } from '../locales';
import { computeCP, SaveData } from '../game/engine';
import { getBiomeForFloor, isDungeonBoss, isDungeonCheckpoint, MAX_DUNGEON_FLOOR, nextMilestone, recommendedCpForFloor } from '../game/dungeon';

const dungeonText = (k: string): string => t(`dungeon.${k}`);

export default function DungeonMapModal({
  save,
  onEnterDungeon,
  onClose,
}: {
  save: SaveData;
  onEnterDungeon: () => void;
  onClose: () => void;
}) {
  const floor = save.highestDungeonFloor;
  const biome = getBiomeForFloor(floor);
  const milestone = nextMilestone(floor);
  const recommendedCp = recommendedCpForFloor(floor);
  const playerCp = computeCP(save);
  const cpInsufficient = playerCp < recommendedCp;
  const huntingBusy = !!save.activeHuntingZone;

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
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
