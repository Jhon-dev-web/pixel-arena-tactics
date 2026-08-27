import { useEffect, useState } from 'react';
import T from '../game/tunables';
import Text from '../locales/en.json';
import Assets from '../assets.json';
import { EXPEDITION, ExpeditionRewards } from '../game/expedition';
import { MaterialId, materialIconUrl } from '../game/materials';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const expText = (k: string): string => (Text.expedition as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];

export default function ExpeditionModal({
  onCollect,
  onClose,
}: {
  onCollect: (rewards: ExpeditionRewards) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (status !== 'running') return;
    const end = Date.now() + T.expedition.durationMs;
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        setStatus('done');
        return;
      }
      setRemainingMs(left);
    };
    tick();
    const iv = window.setInterval(tick, 200);
    return () => window.clearInterval(iv);
  }, [status]);

  const duration = T.expedition.durationMs;
  const progress = status === 'idle' ? 0 : status === 'done' ? 1 : 1 - remainingMs / duration;
  const seconds = Math.ceil(remainingMs / 1000);

  const rewards: ExpeditionRewards = { gold: EXPEDITION.gold, drops: EXPEDITION.drops };

  return (
    <div className="modal-backdrop">
      <div className="modal expedition-modal">
        <h2 className="modal-title">{Text.expedition.title}</h2>

        <div className="expedition-card">
          <div className="expedition-name">{expText(EXPEDITION.nameKey)}</div>
          <p className="expedition-desc">{expText(EXPEDITION.descKey)}</p>

          <div className="expedition-rewards">
            <span className="floor-drop">
              <span className="mat-icon">
                <img src={Assets.icons.gold.url} alt="" />
              </span>
              <span>+{EXPEDITION.gold} Gold</span>
            </span>
            {Object.entries(EXPEDITION.drops).map(([mid, qty]) => (
              <span className="floor-drop" key={mid}>
                <span className="mat-icon">
                  <img src={materialIconUrl(mid as MaterialId)} alt="" />
                </span>
                <span>
                  +{qty}× {matText(`mat_${mid}`)}
                </span>
              </span>
            ))}
          </div>

          {status === 'idle' && (
            <button className="battle-btn" onClick={() => setStatus('running')} data-ui>
              {Text.expedition.send}
            </button>
          )}

          {status === 'running' && (
            <div className="expedition-progress">
              <div className="bar hp">
                <div className="bar-fill hp-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <span className="expedition-timer">
                {expText('inProgress')} {fmt(Text.expedition.duration, seconds)}
              </span>
            </div>
          )}

          {status === 'done' && (
            <>
              <div className="expedition-done">{Text.expedition.complete}</div>
              <button className="battle-btn" onClick={() => onCollect(rewards)} data-ui>
                {Text.expedition.return}
              </button>
            </>
          )}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
