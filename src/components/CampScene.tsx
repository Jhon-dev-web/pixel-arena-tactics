import SpriteSheet from './SpriteSheet';
import Text from '../locales/en.json';
import T from '../game/tunables';
import { SaveData, playerLevel } from '../game/engine';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

export default function CampScene({
  save,
  spriteUrl,
  onEnterArena,
}: {
  save: SaveData;
  spriteUrl: string;
  onEnterArena: () => void;
}) {
  const level = playerLevel(save.xp);
  const xpInLevel = save.xp % T.progression.xpPerLevel;

  return (
    <div className="camp">
      <div className="camp-panel">
        <span className="camp-title">{Text.camp.title}</span>
        <div className="camp-hero">
          <SpriteSheet src={spriteUrl} size="calc(var(--sprite-size, 132px) * 1.6)" row={0} />
        </div>
        <div className="camp-level-line">
          <span className="camp-level">{fmt(Text.camp.level, level)}</span>
          <div className="camp-xp-bar">
            <div className="camp-xp-fill" style={{ width: `${pct(xpInLevel, T.progression.xpPerLevel)}%` }} />
          </div>
        </div>
        <span className="camp-xp-text">{fmt(Text.camp.xp, save.xp)}</span>
        <div className="camp-rates">
          <span className="camp-rate gold">{fmt(Text.camp.goldPerSec, T.advanced.afkGoldPerSec)}</span>
          <span className="camp-rate xp">{fmt(Text.camp.xpPerSec, T.advanced.afkXpPerSec)}</span>
        </div>
      </div>
      <p className="camp-hint">{Text.camp.resting}</p>
      <button className="camp-enter" onClick={onEnterArena} data-ui>
        {Text.camp.enterArena}
      </button>
    </div>
  );
}
