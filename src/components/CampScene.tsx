import SpriteSheet from './SpriteSheet';
import WeaponOverlay from './WeaponOverlay';
import Text from '../locales/en.json';
import T from '../game/tunables';
import { SaveData, afkGoldRate, afkXpRate, computeCP, playerLevel } from '../game/engine';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

export default function CampScene({
  save,
  spriteUrl,
  weaponUrl,
  elixirActive,
  onEnterArena,
  onOpenAttributes,
  onUseElixir,
  onRename,
}: {
  save: SaveData;
  spriteUrl: string;
  weaponUrl: string;
  elixirActive: boolean;
  onEnterArena: () => void;
  onOpenAttributes: () => void;
  onUseElixir: () => void;
  onRename: (name: string) => void;
}) {
  const level = playerLevel(save.xp);
  const xpInLevel = save.xp % T.progression.xpPerLevel;

  return (
    <div className="camp">
      <div className="camp-panel">
        <span className="camp-title">{Text.camp.title}</span>
        <input
          className="hero-name"
          value={save.heroName}
          maxLength={16}
          onChange={(e) => onRename(e.target.value)}
          aria-label={Text.camp.name}
        />
        <div className="camp-hero">
          <SpriteSheet src={spriteUrl} size="calc(var(--sprite-size, 132px) * 1.6)" row={1} />
          <WeaponOverlay url={weaponUrl} mode="train" />
          <span className="training-hit" />
        </div>
        <div className="camp-level-line">
          <span className="camp-level">{fmt(Text.camp.level, level)}</span>
          <div className="camp-xp-bar">
            <div className="camp-xp-fill" style={{ width: `${pct(xpInLevel, T.progression.xpPerLevel)}%` }} />
          </div>
        </div>
        <span className="camp-xp-text">{fmt(Text.camp.xp, save.xp)}</span>
        <span className="camp-cp">{fmt(Text.camp.cp, computeCP(save))}</span>
        <div className="camp-rates">
          <span className="camp-rate gold">{fmt(Text.camp.goldPerSec, afkGoldRate(save).toFixed(1))}</span>
          <span className="camp-rate xp">{fmt(Text.camp.xpPerSec, afkXpRate(save).toFixed(1))}</span>
        </div>
        <div className="camp-actions">
          <button className="camp-mini" onClick={onOpenAttributes} data-ui>
            {Text.camp.attributes}
          </button>
          <button className="camp-mini" onClick={onUseElixir} disabled={save.potions.elixir <= 0 || elixirActive} data-ui>
            {elixirActive ? Text.camp.elixirActive : Text.camp.useElixir}
          </button>
        </div>
      </div>
      <button className="camp-enter" onClick={onEnterArena} data-ui>
        {Text.camp.enterArena}
      </button>
    </div>
  );
}
