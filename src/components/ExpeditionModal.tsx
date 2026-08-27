import { t } from '../locales';
import Assets from '../assets.json';
import { EXPEDITIONS } from '../game/expedition';
import { MaterialId, materialIconUrl } from '../game/materials';

const expText = (k: string): string => t(`expedition.${k}`);
const matText = (k: string): string => t(`materials.${k}`);

export default function ExpeditionModal({
  onStart,
  onClose,
}: {
  onStart: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal expedition-modal">
        <h2 className="modal-title">{t('expedition.title')}</h2>
        <p className="expedition-note">{t('expedition.background')}</p>

        <div className="expedition-list">
          {EXPEDITIONS.map((def) => (
            <div className="expedition-option" key={def.id}>
              <div className="expedition-option-head">
                <span className="expedition-option-name">{expText(def.nameKey)}</span>
                <span className="expedition-option-dur">{expText(def.durationKey)}</span>
              </div>
              <p className="expedition-option-desc">{expText(def.descKey)}</p>
              <div className="expedition-option-rewards">
                <span className="floor-drop">
                  <span className="mat-icon">
                    <img src={Assets.icons.gold.url} alt="" />
                  </span>
                  <span>{t('ui.goldReward', { n: def.gold })}</span>
                </span>
                {Object.entries(def.drops).map(([mid, qty]) => (
                  <span className="floor-drop" key={mid}>
                    <span className="mat-icon">
                      <img src={materialIconUrl(mid as MaterialId)} alt="" />
                    </span>
                    <span>
                      {qty}× {matText(`mat_${mid}`)}
                    </span>
                  </span>
                ))}
                {def.shards > 0 && (
                  <span className="floor-drop">
                    <span className="mat-icon shard">🔷</span>
                    <span>{t('ui.shardsX', { n: def.shards })}</span>
                  </span>
                )}
              </div>
              <button className="battle-btn" onClick={() => onStart(def.id)} data-ui>
                {t('expedition.start')}
              </button>
            </div>
          ))}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
