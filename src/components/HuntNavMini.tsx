import { useEffect, useState } from 'react';
import { MonsterPortrait, Meter } from './HuntParts';
import { t } from '../locales';
import { computeHuntingStatus, SaveData } from '../game/engine';
import { getHuntingZone } from '../game/huntingZones';
import { fmtSpan } from '../game/huntView';

// The running hunt under the "Caça" nav entry: monster, zone, elapsed / cap and a mini bar. Clicking it opens the running hunt view.
export default function HuntNavMini({ save, onOpen }: { save: SaveData; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(iv);
  }, []);
  const zone = save.activeHuntingZone ? getHuntingZone(save.activeHuntingZone) : undefined;
  if (!zone) return null;
  const status = computeHuntingStatus(save, now);
  return (
    <button className={`hunt-nav-mini${status.full ? ' full' : ''}`} onClick={onOpen} data-ui>
      <MonsterPortrait enemyId={zone.enemyId} box="34px" />
      <span className="hunt-nav-mini-info">
        <span className="hunt-nav-mini-zone">{t(`dungeon.${zone.nameKey}`)}</span>
        <Meter pct={status.capMs <= 0 ? 0 : (status.pendingMs / status.capMs) * 100} tone={status.full ? 'full' : undefined} />
        <span className="hunt-nav-mini-time">{status.full ? t('hunting.capFull') : `${fmtSpan(status.pendingMs)} / ${fmtSpan(status.capMs)}`}</span>
      </span>
    </button>
  );
}
