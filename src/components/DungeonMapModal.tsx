import Assets from '../assets.json';
import { t } from '../locales';
import { SaveData } from '../game/engine';
import { FLOORS } from '../game/dungeon';
import { materialIconUrl } from '../game/materials';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const dungeonText = (k: string): string => t(`dungeon.${k}`);
const matText = (k: string): string => t(`materials.${k}`);

export default function DungeonMapModal({
  save,
  onBattle,
  onExpedition,
  onClose,
}: {
  save: SaveData;
  onBattle: (floor: number) => void;
  onExpedition: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal">
        <h2 className="modal-title">{t('dungeon.title')}</h2>

        <div className="dungeon-body">
          {FLOORS.map((floor) => {
            const unlocked = floor.floor <= save.highestFloor;
            return (
              <div className={`floor-card${unlocked ? '' : ' locked'}`} key={floor.floor}>
                <div className="floor-header">
                  <span className="floor-name">
                    {fmt(t('dungeon.floorLabel'), floor.floor)}: {dungeonText(floor.nameKey)}
                  </span>
                  <span className="floor-cp">{fmt(t('dungeon.cp'), floor.cp)}</span>
                </div>

                <div className="floor-drops">
                  <span className="drops-label">{t('dungeon.drops')}:</span>
                  <span className="floor-drop">
                    <span className="mat-icon">
                      <img src={Assets.icons.gold.url} alt="" />
                    </span>
                    <span>
                      {floor.goldMin}-{floor.goldMax}
                    </span>
                  </span>
                  {floor.drops.map((entry) => (
                    <span className="floor-drop" key={entry.material}>
                      <span className="mat-icon">
                        <img src={materialIconUrl(entry.material)} alt="" />
                      </span>
                      <span>
                        {entry.chance < 1 ? `${Math.round(entry.chance * 100)}% ` : ''}
                        {entry.qty}× {matText(`mat_${entry.material}`)}
                      </span>
                    </span>
                  ))}
                  {(floor.shards ?? 0) > 0 && (
                    <span className="floor-drop">
                      <span className="mat-icon shard">🔷</span>
                      <span>{t('ui.shardsX', { n: floor.shards })}</span>
                    </span>
                  )}
                </div>

                {unlocked ? (
                  <button className="battle-btn" onClick={() => onBattle(floor.floor)} data-ui>
                    {t('dungeon.battle')}
                  </button>
                ) : (
                  <span className="floor-locked">{t('dungeon.locked')}</span>
                )}
              </div>
            );
          })}
        </div>

        <button className="expedition-entry" onClick={onExpedition} data-ui>
          {t('dungeon.expedition')}
        </button>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
