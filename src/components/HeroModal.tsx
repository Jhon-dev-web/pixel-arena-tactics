import { useState } from 'react';
import T from '../game/tunables';
import { t } from '../locales';
import { SaveData, computeCP, formatNumber, playerLevel, playerMaxHp } from '../game/engine';
import { effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance, getEquipped, MAX_DURABILITY, refineLevel } from '../game/gear';
import { Rarity, rarityDef, substatLabel, substatNameKey } from '../game/rarity';
import GearIcon from './GearIcon';

const gearText = (k: string): string => t(`gear.${k}`);
const attrsText = (k: string): string => t(`attributes.${k}`);
const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

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
  onRename,
  onClose,
}: {
  save: SaveData;
  onAttrChange: (attr: AttrKey, delta: number) => void;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'equip' | 'attrs'>('equip');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const { weapon, armor } = getEquipped(save.equipped);
  const level = playerLevel(save.xp);
  const wLvl = refineLevel(save.upgrades, weapon.id);
  const aLvl = refineLevel(save.upgrades, armor.id);
  const wDur = save.durability?.[weapon.id] ?? MAX_DURABILITY;
  const aDur = save.durability?.[armor.id] ?? MAX_DURABILITY;
  const durClass = (d: number) => (d <= 0 ? ' broken' : d < 30 ? ' worn' : '');
  const wRar: Rarity = save.itemRarity?.[weapon.id] ?? 'common';
  const aRar: Rarity = save.itemRarity?.[armor.id] ?? 'common';
  const rarClass = (r: Rarity) => `r-${r}`;
  const wSubs = save.itemSubstats?.[weapon.id] ?? [];
  const aSubs = save.itemSubstats?.[armor.id] ?? [];

  const maxHp = playerMaxHp(save);
  const totalDmg = Math.round(
    (T.combat.attackMin + T.combat.attackMax) / 2 + effectiveDamage(weapon, wLvl) + save.str * T.advanced.strDmgPerPoint,
  );
  const defensePct = Math.round((effectiveResistance(armor, aLvl) + save.res * T.advanced.resResistPerPoint) * 100);
  const critPct = Math.round(effectiveCrit(weapon, wLvl) * 100);

  const totalPoints = level * 3;
  const spent = save.str + save.vit + save.agi + save.res;
  const remaining = Math.max(0, totalPoints - spent);

  return (
    <div className="modal-backdrop">
      <div className="modal hero-modal">
        <h2 className="modal-title">{t('profile.title')}</h2>
        <p className="hero-subtitle">
          {editingName ? (
            <input
              className="name-input"
              autoFocus
              value={nameDraft}
              maxLength={16}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                onRename((nameDraft.trim() || save.heroName).slice(0, 16));
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onRename((nameDraft.trim() || save.heroName).slice(0, 16));
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <button
              className="name-btn"
              onClick={() => {
                setNameDraft(save.heroName);
                setEditingName(true);
              }}
              data-ui
            >
              {save.heroName} <span className="pencil">✏️</span>
            </button>
          )}{' '}
          {t('profile.subtitle', { n: level })}
        </p>

        <div className="hero-tabs">
          <button className={`tab${tab === 'equip' ? ' active' : ''}`} onClick={() => setTab('equip')} data-ui>
            {t('profile.equipTab')}
          </button>
          <button className={`tab${tab === 'attrs' ? ' active' : ''}`} onClick={() => setTab('attrs')} data-ui>
            {t('profile.attrsTab')}
            {remaining > 0 && <span className="tab-badge">{remaining}</span>}
          </button>
        </div>

        {tab === 'equip' ? (
          <>
            <div className="hero-equip">
              <div className={`hero-equip-card ${rarClass(wRar)}`}>
                <span className="hero-equip-icon">
                  <GearIcon item={weapon} />
                </span>
                <div className="hero-equip-info">
                  <span className="hero-equip-name">
                    {gearText(weapon.nameKey)}
                    <span className="refine-tag">{refineTag(refineLevel(save.upgrades, weapon.id))}</span>
                  </span>
                  {wRar !== 'common' && <span className={`rarity-line ${rarClass(wRar)}`}>{t(`rarity.${rarityDef(wRar).nameKey}`)}</span>}
                  <span className="hero-equip-stat damage">
                    +{effectiveDamage(weapon, wLvl)} {t('profile.damage')}
                  </span>
                  {wSubs.map((s, i) => (
                    <span className="substat-line" key={i}>
                      +{substatLabel(s)} {t(`rarity.${substatNameKey(s.type)}`)}
                    </span>
                  ))}
                  <span className={`hero-durability${durClass(wDur)}`}>{t('forge.durability', { n: wDur, m: MAX_DURABILITY })}</span>
                </div>
              </div>
              <div className={`hero-equip-card ${rarClass(aRar)}`}>
                <span className="hero-equip-icon">
                  <GearIcon item={armor} />
                </span>
                <div className="hero-equip-info">
                  <span className="hero-equip-name">
                    {gearText(armor.nameKey)}
                    <span className="refine-tag">{refineTag(refineLevel(save.upgrades, armor.id))}</span>
                  </span>
                  {aRar !== 'common' && <span className={`rarity-line ${rarClass(aRar)}`}>{t(`rarity.${rarityDef(aRar).nameKey}`)}</span>}
                  <span className="hero-equip-stat hp">
                    +{effectiveMaxHp(armor, aLvl)} {t('profile.hp')}
                  </span>
                  {aSubs.map((s, i) => (
                    <span className="substat-line" key={i}>
                      +{substatLabel(s)} {t(`rarity.${substatNameKey(s.type)}`)}
                    </span>
                  ))}
                  <span className={`hero-durability${durClass(aDur)}`}>{t('forge.durability', { n: aDur, m: MAX_DURABILITY })}</span>
                </div>
              </div>
            </div>

            <div className="hero-stats-grid">
              <div className="hero-stat-cell">
                <span>❤️ {t('profile.maxHp')}</span>
                <span>{formatNumber(maxHp)}</span>
              </div>
              <div className="hero-stat-cell">
                <span>⚔️ {t('profile.damage')}</span>
                <span>{formatNumber(totalDmg)}</span>
              </div>
              <div className="hero-stat-cell">
                <span>🛡️ {t('profile.defense')}</span>
                <span>{defensePct}%</span>
              </div>
              <div className="hero-stat-cell">
                <span>💥 {t('profile.critRate')}</span>
                <span>{critPct}%</span>
              </div>
            </div>

            <div className="hero-cp-bar">
              <span className="hero-cp-icon">⚔️</span>
              <span>
                {t('profile.cp')}: {formatNumber(computeCP(save))}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="attrs-header">
              <span>{t('attributes.points', { n: remaining })}</span>
              <span>{t('attributes.cp', { n: computeCP(save) })}</span>
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
              {t('profile.confirmPoints')}
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
