import Text from '../locales/en.json';
import Assets from '../assets.json';
import { ExpeditionRewards } from '../game/expedition';
import { MaterialId, materialIconUrl } from '../game/materials';

const expText = (k: string): string => (Text.expedition as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];

export default function ClaimModal({
  nameKey,
  rewards,
  onClose,
}: {
  nameKey: string;
  rewards: ExpeditionRewards;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal claim-modal">
        <h2 className="modal-title">{Text.expedition.rewards}</h2>
        <p className="claim-name">{expText(nameKey)}</p>

        <div className="result-rewards">
          <span className="floor-drop">
            <span className="mat-icon">
              <img src={Assets.icons.gold.url} alt="" />
            </span>
            <span>+{rewards.gold} Gold</span>
          </span>
          {Object.entries(rewards.drops ?? {}).map(([mid, qty]) => (
            <span className="floor-drop" key={mid}>
              <span className="mat-icon">
                <img src={materialIconUrl(mid as MaterialId)} alt="" />
              </span>
              <span>
                +{qty}× {matText(`mat_${mid}`)}
              </span>
            </span>
          ))}
          {rewards.shards > 0 && (
            <span className="floor-drop">
              <span className="mat-icon shard">🔷</span>
              <span>+{rewards.shards} Shards</span>
            </span>
          )}
        </div>

        <button className="result-btn" onClick={onClose} data-ui>
          {Text.expedition.close}
        </button>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
