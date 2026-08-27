import Assets from '../assets.json';
import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { FLOORS } from '../game/dungeon';
import { MaterialId, materialIconUrl } from '../game/materials';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const dungeonText = (k: string): string => (Text.dungeon as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];

export default function DungeonMapModal({
  save,
  onBattle,
  onClose,
}: {
  save: SaveData;
  onBattle: (floor: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal">
        <h2 className="modal-title">{Text.dungeon.title}</h2>

        <div className="dungeon-body">
          {FLOORS.map((floor) => {
            const unlocked = floor.floor <= save.highestFloor;
            return (
              <div className={`floor-card${unlocked ? '' : ' locked'}`} key={floor.floor}>
                <div className="floor-header">
                  <span className="floor-name">
                    {floor.floor}. {dungeonText(floor.nameKey)}
                  </span>
                  <span className="floor-cp">{fmt(Text.dungeon.cp, floor.cp)}</span>
                </div>
                <div className="floor-drops">
                  <span className="floor-drop">
                    <span className="mat-icon">
                      <img src={Assets.icons.gold.url} alt="" />
                    </span>
                    <span>
                      {floor.goldMin}-{floor.goldMax}
                    </span>
                  </span>
                  {Object.entries(floor.drops).map(([mid, qty]) => (
                    <span className="floor-drop" key={mid}>
                      <span className="mat-icon">
                        <img src={materialIconUrl(mid as MaterialId)} alt="" />
                      </span>
                      <span>
                        {qty}× {matText(`mat_${mid}`)}
                      </span>
                    </span>
                  ))}
                  {(floor.shards ?? 0) > 0 && (
                    <span className="floor-drop">
                      <span className="mat-icon shard">🔷</span>
                      <span>{floor.shards}× Shards</span>
                    </span>
                  )}
                </div>
                {unlocked ? (
                  <button className="craft-btn forge" onClick={() => onBattle(floor.floor)} data-ui>
                    {Text.dungeon.battle}
                  </button>
                ) : (
                  <span className="floor-locked">{Text.dungeon.locked}</span>
                )}
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
