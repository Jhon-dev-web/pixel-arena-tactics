import T from '../game/tunables';
import Text from '../locales/en.json';
import { SaveData, computeCP, formatNumber, playerMaxHp } from '../game/engine';
import { getEquipped } from '../game/gear';
import GearIcon from './GearIcon';

const gearText = (k: string): string => (Text.gear as Record<string, string>)[k];

export default function HeroModal({
  save,
  onOpenAttributes,
  onClose,
}: {
  save: SaveData;
  onOpenAttributes: () => void;
  onClose: () => void;
}) {
  const { weapon, armor } = getEquipped(save.equipped);

  const maxHp = playerMaxHp(save);
  const totalDmg = Math.round(
    (T.combat.attackMin + T.combat.attackMax) / 2 + (weapon?.damage ?? 0) + save.str * T.advanced.strDmgPerPoint,
  );
  const defensePct = Math.round(((armor?.resistance ?? 0) + save.res * T.advanced.resResistPerPoint) * 100);
  const critPct = Math.round((weapon?.critChance ?? 0) * 100);

  return (
    <div className="modal-backdrop">
      <div className="modal hero-modal">
        <h2 className="modal-title">{save.heroName}</h2>

        <div className="hero-slots">
          <div className="hero-slot">
            <span className="hero-slot-label">⚔️ {Text.profile.weapon}</span>
            <span className="hero-slot-icon">
              <GearIcon item={weapon} />
            </span>
            <span className="hero-slot-name">{gearText(weapon.nameKey)}</span>
            <span className="hero-slot-stat">
              +{weapon?.damage ?? 0} {Text.profile.damage}
            </span>
          </div>
          <div className="hero-slot">
            <span className="hero-slot-label">🛡️ {Text.profile.armor}</span>
            <span className="hero-slot-icon">
              <GearIcon item={armor} />
            </span>
            <span className="hero-slot-name">{gearText(armor.nameKey)}</span>
            <span className="hero-slot-stat">
              +{armor?.maxHp ?? 0} {Text.profile.hp}
            </span>
          </div>
        </div>

        <div className="hero-stats">
          <div className="hero-stat-row">
            <span>❤️ {Text.profile.maxHp}</span>
            <span>{formatNumber(maxHp)}</span>
          </div>
          <div className="hero-stat-row">
            <span>⚔️ {Text.profile.damage}</span>
            <span>{formatNumber(totalDmg)}</span>
          </div>
          <div className="hero-stat-row">
            <span>🛡️ {Text.profile.defense}</span>
            <span>{defensePct}%</span>
          </div>
          <div className="hero-stat-row">
            <span>💥 {Text.profile.critRate}</span>
            <span>{critPct}%</span>
          </div>
          <div className="hero-stat-row">
            <span>⚡ {Text.profile.cp}</span>
            <span>{formatNumber(computeCP(save))}</span>
          </div>
        </div>

        <button className="admin-btn" onClick={onOpenAttributes} data-ui>
          {Text.profile.attributes}
        </button>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
