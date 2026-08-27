import { useEffect, useState } from 'react';
import { t } from '../locales';
import { ActiveExpedition, getExpedition } from '../game/expedition';

const expText = (k: string): string => t(`expedition.${k}`);

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function CampExpedition({
  expedition,
  onStart,
  onCancel,
  onClaim,
}: {
  expedition: ActiveExpedition | null;
  onStart: () => void;
  onCancel: () => void;
  onClaim: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  if (!expedition) {
    return (
      <button className="camp-expedition-btn" onClick={onStart} data-ui>
        {t('dungeon.expedition')}
      </button>
    );
  }

  const def = getExpedition(expedition.id);
  if (!def) return null;

  const remaining = expedition.endsAt - now;
  const done = remaining <= 0;
  const total = def.durationMs;
  const progress = done ? 1 : Math.max(0, Math.min(1, (total - remaining) / total));

  return (
    <div className="camp-expedition-card">
      <div className="camp-expedition-name">{expText(def.nameKey)}</div>
      {done ? (
        <button className="camp-expedition-claim blink" onClick={onClaim} data-ui>
          {t('expedition.collect')}
        </button>
      ) : (
        <>
          <div className="camp-expedition-bar">
            <div className="camp-expedition-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="camp-expedition-time">
            {t('expedition.inExpedition', { n: formatRemaining(remaining) })}
          </span>
          <button className="camp-expedition-cancel" onClick={onCancel} data-ui>
            {t('expedition.cancel')}
          </button>
        </>
      )}
    </div>
  );
}
