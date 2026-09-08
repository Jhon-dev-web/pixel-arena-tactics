import { useState } from 'react';
import T from '../game/tunables';
import { t } from '../locales';
import { SaveData, computeCP, formatNumber, playerLevel, playerMaxHp } from '../game/engine';
import { effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance, getEquipped, getGear, gearBySlot, MAX_DURABILITY, refineLevel } from '../game/gear';
import { Rarity, rarityDef, substatLabel, substatNameKey } from '../game/rarity';
import { getTitleDef, TITLES } from '../game/titles';
import GearIcon from './GearIcon';

const gearText = (k: string): string => t(`gear.${k}`);
const attrsText = (k: string): string => t(`attributes.${k}`);
const profileText = (k: string): string => t(`profile.${k}`);
const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

type AttrKey = 'str' | 'vit' | 'agi' | 'res';

const ATTRS: { key: AttrKey; nameKey: string; descKey: string }[] = [
  { key: 'str', nameKey: 'str', descKey: 'strDesc' },
  { key: 'vit', nameKey: 'vit', descKey: 'vitDesc' },
  { key: 'agi', nameKey: 'agi', descKey: 'agiDesc' },
  { key: 'res', nameKey: 'res', descKey: 'resDesc' },
];

type ToolSlot = 'pickaxe' | 'axe' | 'rod';

const TOOL_SLOTS: { slot: ToolSlot; labelKey: string; powerKey: 'miningPower' | 'woodcuttingPower' | 'fishingPower'; powerLabelKey: string }[] = [
  { slot: 'pickaxe', labelKey: 'pickaxe', powerKey: 'miningPower', powerLabelKey: 'miningPower' },
  { slot: 'axe', labelKey: 'axe', powerKey: 'woodcuttingPower', powerLabelKey: 'woodcuttingPower' },
  { slot: 'rod', labelKey: 'rod', powerKey: 'fishingPower', powerLabelKey: 'fishingPower' },
];

export default function HeroModal({
  save,
  onAttrChange,
  onRename,
  onEquip,
  onUnequip,
  onSelectTitle,
  onClose,
}: {
  save: SaveData;
  onAttrChange: (attr: AttrKey, delta: number) => void;
  onRename: (name: string) => void;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onSelectTitle: (id: string | null) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'equip' | 'attrs' | 'titles'>('equip');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const { weapon, armor } = getEquipped(save.equipped);

  const toggleTool = (slot: ToolSlot) => {
    const equippedId = save.equipped[slot];
    if (equippedId) {
      onUnequip(equippedId);
      return;
    }
    const owned = gearBySlot(slot).find((g) => (save.inventory[g.id] ?? 0) > 0);
    if (owned) onEquip(owned.id);
  };
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

  const activeTitleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const activeTitleLabel = activeTitleDef ? t(`titles.${activeTitleDef.nameKey}`) : null;
  const ownedTitles = TITLES.filter((def) => save.cosmetics.includes(def.id));

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
        {activeTitleLabel && <p className="hero-title-line">• {activeTitleLabel}</p>}

        <div className="hero-tabs">
          <button className={`tab${tab === 'equip' ? ' active' : ''}`} onClick={() => setTab('equip')} data-ui>
            {t('profile.equipTab')}
          </button>
          <button className={`tab${tab === 'attrs' ? ' active' : ''}`} onClick={() => setTab('attrs')} data-ui>
            {t('profile.attrsTab')}
            {remaining > 0 && <span className="tab-badge">{remaining}</span>}
          </button>
          <button className={`tab${tab === 'titles' ? ' active' : ''}`} onClick={() => setTab('titles')} data-ui>
            {t('profile.titlesTab')}
          </button>
        </div>

        {tab === 'titles' ? (
          <div className="titles-body">
            <button
              className={`title-row${!save.activeTitle ? ' active' : ''}`}
              onClick={() => onSelectTitle(null)}
              data-ui
            >
              <span className="title-name">{t('titles.none')}</span>
              {!save.activeTitle && <span className="title-tag">{t('titles.active')}</span>}
            </button>
            {ownedTitles.length === 0 && <p className="titles-empty">{t('titles.empty')}</p>}
            {ownedTitles.map((def) => (
              <button
                key={def.id}
                className={`title-row${save.activeTitle === def.id ? ' active' : ''}`}
                onClick={() => onSelectTitle(def.id)}
                data-ui
              >
                <span className="title-name">{t(`titles.${def.nameKey}`)}</span>
                {save.activeTitle === def.id && <span className="title-tag">{t('titles.active')}</span>}
              </button>
            ))}
          </div>
        ) : tab === 'equip' ? (
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

            <div className="gear-section-title">{profileText('toolsTitle')}</div>
            <div className="hero-tools-grid">
              {TOOL_SLOTS.map(({ slot, labelKey, powerKey, powerLabelKey }) => {
                const equippedId = save.equipped[slot];
                const item = equippedId ? getGear(equippedId) : null;
                const owned = !item && gearBySlot(slot).some((g) => (save.inventory[g.id] ?? 0) > 0);
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`hero-tool-card${item ? ' equipped' : ''}`}
                    onClick={() => toggleTool(slot)}
                    disabled={!item && !owned}
                    data-ui
                  >
                    <span className="hero-equip-icon">
                      {item ? <GearIcon item={item} /> : <span className="gear-icon-emoji">➕</span>}
                    </span>
                    <div className="hero-equip-info">
                      <span className="hero-equip-name">{profileText(labelKey)}</span>
                      <span className="hero-equip-stat">{item ? gearText(item.nameKey) : profileText('emptySlot')}</span>
                      {item && (
                        <span className="hero-equip-stat">
                          +{item[powerKey] ?? 0} {profileText(powerLabelKey)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
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
