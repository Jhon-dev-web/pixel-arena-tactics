import { useEffect, useState } from 'react';
import { t } from '../locales';
import Assets from '../assets.json';
import { ActiveExpedition, EXPEDITIONS, getExpedition } from '../game/expedition';
import { MaterialId, materialIconUrl } from '../game/materials';

const expText = (k: string): string => t(`expedition.${k}`);
const matText = (k: string): string => t(`materials.${k}`);

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function ExpeditionModal({
  expedition,
  onStart,
  onCancel,
  onClaim,
  onClose,
}: {
  expedition: ActiveExpedition | null;
  onStart: (id: string) => void;
  onCancel: () => void;
  onClaim: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expedition) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [expedition]);

  const activeDef = expedition ? getExpedition(expedition.id) : undefined;

  return (
    <div className="modal-backdrop">
      <div className="modal expedition-modal">
        <h2 className="modal-title">{t('expedition.title')}</h2>

        {expedition && activeDef ? (
          <div className="expedition-active-card">
            <div className="camp-expedition-name">{expText(activeDef.nameKey)}</div>
            {(() => {
              const remaining = expedition.endsAt - now;
              const done = remaining <= 0;
              const progress = done ? 1 : Math.max(0, Math.min(1, (activeDef.durationMs - remaining) / activeDef.durationMs));
              return done ? (
                <button className="camp-expedition-claim blink" onClick={onClaim} data-ui>
                  {t('expedition.collect')}
                </button>
              ) : (
                <>
                  <div className="camp-expedition-bar">
                    <div className="camp-expedition-fill" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <span className="camp-expedition-time">{t('expedition.inExpedition', { n: formatRemaining(remaining) })}</span>
                  <button className="camp-expedition-cancel" onClick={onCancel} data-ui>
                    {t('expedition.cancel')}
                  </button>
                </>
              );
            })()}
          </div>
        ) : (
          <>
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
                        <span className="mat-icon shard">
                          <img src="/assets/icons/shards.png" alt="" />
                        </span>
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
          </>
        )}

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
