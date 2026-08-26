import SpriteSheet from './SpriteSheet';
import WeaponOverlay from './WeaponOverlay';
import Text from '../locales/en.json';
import { SaveData, afkGoldRate, afkXpRate } from '../game/engine';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));

export default function CampScene({
  save,
  spriteUrl,
  weaponUrl,
  elixirActive,
  onEnterArena,
  onUseElixir,
}: {
  save: SaveData;
  spriteUrl: string;
  weaponUrl: string;
  elixirActive: boolean;
  onEnterArena: () => void;
  onUseElixir: () => void;
}) {
  return (
    <div className="camp">
      <div className="camp-hero">
        <div className="camp-sprite">
          <SpriteSheet src={spriteUrl} size="calc(var(--sprite-size, 132px) * 1.3)" row={1} />
          <WeaponOverlay url={weaponUrl} mode="train" />
          <span className="training-hit" />
          <span className="training-dmg">-20</span>
        </div>
      </div>
      <div className="camp-rates">
        <span className="camp-rate gold">+{afkGoldRate(save).toFixed(1)} Gold/s</span>
        <span className="camp-rate xp">+{afkXpRate(save).toFixed(1)} XP/s</span>
      </div>
      <button className="elixir-btn" onClick={onUseElixir} disabled={save.potions.elixir <= 0 || elixirActive} data-ui>
        {elixirActive ? Text.camp.elixirActive : `${Text.shop.elixir} ×${save.potions.elixir}`}
      </button>
      <button className="camp-enter" onClick={onEnterArena} data-ui>
        {Text.camp.enterArena}
      </button>
    </div>
  );
}
