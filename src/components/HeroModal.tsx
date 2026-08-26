import T from '../game/tunables';
import Text from '../locales/en.json';
import { SaveData, computeCP, formatNumber, playerLevel, playerMaxHp } from '../game/engine';
import { getEquipped } from '../game/gear';
import GearIcon from './GearIcon';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
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
  const level = playerLevel(save.xp);

  const maxHp = playerMaxHp(save);
  const totalDmg = Math.round(
    (T.combat.attackMin + T.combat.attackMax) / 2 + (weapon?.damage ?? 0) + save.str * T.advanced.strDmgPerPoint,
  );
  const defensePct = Math.round(((armor?.resistance ?? 0) + save.res * T.advanced.resResistPerPoint) * 100);
  const critPct = Math.round((weapon?.critChance ?? 0) * 100);

  return (
    <div className="modal-backdrop">
      <div className="modal hero-modal">
        <h2 className="modal-title">{Text.profile.title}</h2>
        <p className="hero-subtitle">
          {save.heroName} {fmt(Text.profile.subtitle, level)}
        </p>

        <div className="hero-equip">
          <div className="hero-equip-card">
            <span className="hero-equip-icon">
              <GearIcon item={weapon} />
            </span>
            <div className="hero-equip-info">
              <span className="hero-equip-name">{gearText(weapon.nameKey)}</span>
              <span className="hero-equip-stat">
                +{weapon?.damage ?? 0} {Text.profile.damage}
              </span>
            </div>
          </div>
          <div className="hero-equip-card">
            <span className="hero-equip-icon">
              <GearIcon item={armor} />
            </span>
            <div className="hero-equip-info">
              <span className="hero-equip-name">{gearText(armor.nameKey)}</span>
              <span className="hero-equip-stat">
                +{armor?.maxHp ?? 0} {Text.profile.hp}
              </span>
            </div>
          </div>
        </div>

        <div className="hero-stats-grid">
          <div className="hero-stat-cell">
            <span>❤️ {Text.profile.maxHp}</span>
            <span>{formatNumber(maxHp)}</span>
          </div>
          <div className="hero-stat-cell">
            <span>⚔️ {Text.profile.damage}</span>
            <span>{formatNumber(totalDmg)}</span>
          </div>
          <div className="hero-stat-cell">
            <span>🛡️ {Text.profile.defense}</span>
            <span>{defensePct}%</span>
          </div>
          <div className="hero-stat-cell">
            <span>💥 {Text.profile.critRate}</span>
            <span>{critPct}%</span>
          </div>
        </div>

        <div className="hero-cp-bar">
          ⚡ {Text.profile.cp}: {formatNumber(computeCP(save))}
        </div>

        <button className="distribute-btn" onClick={onOpenAttributes} data-ui>
          {Text.profile.distribute}
        </button>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
