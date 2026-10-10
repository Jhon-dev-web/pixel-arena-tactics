import { useEffect, useState } from 'react';
import { t } from '../locales';
import { BUFF_ITEM, buffRemainingMs, BuffKind, isBuffActive } from '../game/buffs';
import { ConsumableId, getConsumable } from '../game/consumables';
import type { SaveData } from '../game/engine';

// Every timed elixir / tonic that is running, as an icon + the time left (1 s clock). `skip` hides kinds the screen does not care about.
const ALL = Object.entries(BUFF_ITEM) as [ConsumableId, BuffKind][];

function left(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ActiveBuffs({ save, skip = [] }: { save: SaveData; skip?: BuffKind[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const active = ALL.filter(([, kind]) => !skip.includes(kind) && isBuffActive(save, kind, now));
  if (active.length === 0) return null;
  return (
    <div className="active-buffs" aria-label={t('inventory.buffsRunning')}>
      {active.map(([itemId, kind]) => (
        <span className="loot-buff" key={kind} title={t(`consumables.${itemId}`)}>
          <img className="inline-icon" src={getConsumable(itemId)?.iconUrl} alt="" /> {t(`consumables.${itemId}`)} · {left(buffRemainingMs(save, now, kind))}
        </span>
      ))}
    </div>
  );
}
