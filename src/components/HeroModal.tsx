import { useState } from 'react';
import T from '../game/tunables';
import Text from '../locales/en.json';
import { SaveData, computeCP, formatNumber, playerLevel, playerMaxHp } from '../game/engine';
import { getEquipped } from '../game/gear';
import GearIcon from './GearIcon';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const gearText = (k: string): string => (Text.gear as Record<string, string>)[k];
const attrsText = (k: string): string => (Text.attributes as Record<string, string>)[k];

type AttrKey = 'str' | 'vit' | 'agi' | 'res';

const ATTRS: { key: AttrKey; nameKey: string; descKey: string }[] = [
  { key: 'str', nameKey: 'str', descKey: 'strDesc' },
  { key: 'vit', nameKey: 'vit', descKey: 'vitDesc' },
  { key: 'agi', nameKey: 'agi', descKey: 'agiDesc' },
  { key: 'res', nameKey: 'res', descKey: 'resDesc' },
];

export default function HeroModal({
  save,
  onAttrChange,
  onClose,
}: {
  save: SaveData;
  onAttrChange: (attr: AttrKey, delta: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'equip' | 'attrs'>('equip');
  const { weapon, armor } = getEquipped(save.equipped);
  const level = playerLevel(save.xp);

  const maxHp = playerMaxHp(save);
  const totalDmg = Math.round(
    (T.combat.attackMin + T.combat.attackMax) / 2 + (weapon?.damage ?? 0) + save.str * T.advanced.strDmgPerPoint,
  );
  const defensePct = Math.round(((armor?.resistance ?? 0) + save.res * T.advanced.resResistPerPoint) * 100);
  const critPct = Math.round((weapon?.critChance ?? 0) * 100);

  const totalPoints = level * 3;
  const spent = save.str + save.vit + save.agi + save.res;
  const remaining = Math.max(0, totalPoints - spent);

  return (
    <div className="modal-backdrop">
      <div className="modal hero-modal">
        <h2 className="modal-title">{Text.profile.title}</h2>
        <p className="hero-subtitle">
          {save.heroName} {fmt(Text.profile.subtitle, level)}
        </p>

        <div className="hero-tabs">
          <button className={`tab${tab === 'equip' ? ' active' : ''}`} onClick={() => setTab('equip')} data-ui>
            {Text.profile.equipTab}
          </button>
          <button className={`tab${tab === 'attrs' ? ' active' : ''}`} onClick={() => setTab('attrs')} data-ui>
            {Text.profile.attrsTab}
            {remaining > 0 && <span className="tab-badge">{remaining}</span>}
          </button>
        </div>

        {tab === 'equip' ? (
          <>
            <div className="hero-equip">
              <div className="hero-equip-card">
                <span className="hero-equip-icon">
                  <GearIcon item={weapon} />
                </span>
                <div className="hero-equip-info">
                  <span className="hero-equip-name">{gearText(weapon.nameKey)}</span>
                  <span className="hero-equip-stat damage">
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
                  <span className="hero-equip-stat hp">
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
              <span className="hero-cp-icon">⚔️</span>
              <span>
                {Text.profile.cp}: {formatNumber(computeCP(save))}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="attrs-header">
              <span>{fmt(Text.attributes.points, remaining)}</span>
              <span>{fmt(Text.attributes.cp, computeCP(save))}</span>
            </div>
            <div className="attrs-list">
              {ATTRS.map((a) => (
                <div className="attr-row" key={a.key}>
                  <div className="attr-info">
                    <span className="attr-name">{attrsText(a.nameKey)}</span>
                    <span className="attr-desc">{attrsText(a.descKey)}</span>
                  </div>
                  <button
                    className="attr-btn"
                    onClick={() => onAttrChange(a.key, -1)}
                    disabled={save[a.key] <= 0}
                    data-ui
                  >
                    −
                  </button>
                  <span className="attr-val">{save[a.key]}</span>
                  <button
                    className="attr-btn"
                    onClick={() => onAttrChange(a.key, 1)}
                    disabled={remaining <= 0}
                    data-ui
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
            <button className="distribute-btn" onClick={onClose} data-ui>
              {Text.profile.confirmPoints}
            </button>
          </>
        )}

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
