import SpriteSheet from './SpriteSheet';
import Text from '../locales/en.json';
import { SaveData, afkGoldRate, afkXpRate } from '../game/engine';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));

export default function CampScene({
  save,
  spriteUrl,
  onEnterArena,
}: {
  save: SaveData;
  spriteUrl: string;
  onEnterArena: () => void;
}) {
  return (
    <div className="camp">
      <div className="camp-rates">
        <span className="camp-rate gold">+{afkGoldRate(save).toFixed(1)} Gold/s</span>
        <span className="camp-rate xp">+{afkXpRate(save).toFixed(1)} XP/s</span>
      </div>
      <div className="camp-hero">
        <div className="camp-sprite">
          <SpriteSheet src={spriteUrl} size="calc(var(--sprite-size, 132px) * 1.3)" row={0} />
        </div>
      </div>
      <button className="camp-enter" onClick={onEnterArena} data-ui>
        {Text.camp.enterArena}
      </button>
    </div>
  );
}
