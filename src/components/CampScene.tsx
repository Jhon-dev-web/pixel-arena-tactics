import Assets from '../assets.json';
import Text from '../locales/en.json';
import { SaveData, afkGoldRate, afkXpRate } from '../game/engine';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));

export default function CampScene({ save, onEnterArena }: { save: SaveData; onEnterArena: () => void }) {
  return (
    <div className="camp">
      <div className="camp-rates">
        <span className="camp-rate gold">+{afkGoldRate(save).toFixed(1)} Gold/s</span>
        <span className="camp-rate xp">+{afkXpRate(save).toFixed(1)} XP/s</span>
      </div>
      <div className="camp-hero">
        <img className="camp-rest" src={Assets.characters.resting.url} alt="" draggable={false} />
      </div>
      <button className="camp-enter" onClick={onEnterArena} data-ui>
        {Text.camp.enterArena}
      </button>
    </div>
  );
}
