import { activeLocale, t } from '../locales';
import Assets from '../assets.json';
import { mitigationFraction } from '../game/derivedStats';
import { effectivePouchSlots, isBattlePassActive, SaveData, buildCombatStats, computeCP, formatNumber, playerLevel } from '../game/engine';
import { effectiveDamage, effectiveMaxHp, MAX_DURABILITY } from '../game/gear';
import { resolveEquipped, viewDurability, viewRarity, viewRefine } from '../game/gearInstances';
import { Rarity, rarityDef, substatLabel, substatNameKey } from '../game/rarity';
import { TITLES } from '../game/titles';
import { getMaterial, hasMaterials, MaterialId } from '../game/materials';
import { getHuntPouchTierDef, nextHuntPouchTierDef } from '../game/huntPouch';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import TitleIcon from './TitleIcon';

// The three "Personagem" panels — extracted from what used to be HeroModal's three tabs, so the
// Personagem view (desktop area + mobile stack, see PersonagemView.tsx) and any future modal reuse
// share the exact same recipes/handlers/JSX. No mechanic changes: attribute points still apply the
// instant onAttrChange fires (there never was a separate confirm step — the "confirm" button only
// closed the modal), titles/equip logic untouched.

const gearText = (k: string): string => t(`gear.${k}`);
const attrsText = (k: string): string => t(`attributes.${k}`);
const pouchText = (k: string): string => t(`huntPouch.${k}`);
const matText = (k: string): string => t(`materials.${k}`);
const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

export type AttrKey = 'str' | 'vit' | 'agi' | 'res';

const ATTRS: { key: AttrKey; nameKey: string; descKey: string }[] = [
  { key: 'str', nameKey: 'str', descKey: 'strDesc' },
  { key: 'vit', nameKey: 'vit', descKey: 'vitDesc' },
  { key: 'agi', nameKey: 'agi', descKey: 'agiDesc' },
  { key: 'res', nameKey: 'res', descKey: 'resDesc' },
];

export function EquipmentPanel({
  save,
  onUpgradePouch,
}: {
  save: SaveData;
  onUpgradePouch: () => void;
}) {
  const { weapon: weaponView, armor: armorView } = resolveEquipped(save);
  const weapon = weaponView.item;
  const armor = armorView.item;
  const wLvl = viewRefine(weaponView);
  const aLvl = viewRefine(armorView);
  const wDur = viewDurability(weaponView);
  const aDur = viewDurability(armorView);
  const durClass = (d: number) => (d <= 0 ? ' broken' : d < 30 ? ' worn' : '');
  const wRar: Rarity = viewRarity(weaponView);
  const aRar: Rarity = viewRarity(armorView);
  const rarClass = (r: Rarity) => `r-${r}`;
  const wSubs = weaponView.instance?.substats ?? [];
  const aSubs = armorView.instance?.substats ?? [];

  return (
    <>
      <div className="hero-equip">
        <div className={`hero-equip-card ${rarClass(wRar)}`}>
          <span className="hero-equip-icon">
            <GearIcon item={weapon} />
          </span>
          <div className="hero-equip-info">
            <span className="hero-equip-name">
              <span className="hero-equip-name-text">{gearText(weapon.nameKey)}</span>
              <span className="refine-tag">{refineTag(wLvl)}</span>
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
              <span className="hero-equip-name-text">{gearText(armor.nameKey)}</span>
              <span className="refine-tag">{refineTag(aLvl)}</span>
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

      {(() => {
        const pouchTier = getHuntPouchTierDef(save.huntPouch.tier);
        const next = nextHuntPouchTierDef(save.huntPouch.tier);
        const canAfford = !!next?.cost && save.gold >= next.cost.gold && hasMaterials(save.materials, next.cost.materials);
        const passActive = isBattlePassActive(save, Date.now());
        const effectiveSlots = effectivePouchSlots(save, Date.now());
        return (
          <div className="craft-card pouch-card">
            <div className="pouch-card-top">
              <span className="hero-equip-icon">
                <img className="pixel-icon" src="/assets/icons/nav_bag.png" alt="" />
              </span>
              <div className="craft-info">
                <div className="craft-header">
                  <span className="craft-name">{pouchText(pouchTier?.nameKey ?? 'pouch_t1')}</span>
                  <span className="pouch-slots-tag">
                    {t('huntPouch.slots', { n: effectiveSlots })}
                    {passActive && <span className="pouch-bonus-tag"> ({t('huntPouch.passBonus')})</span>}
                  </span>
                </div>
              </div>
              {next ? (
                <button className="craft-btn forge" onClick={onUpgradePouch} disabled={!canAfford} data-ui>
                  {pouchText('upgrade')}
                </button>
              ) : (
                <button className="craft-btn equipped" disabled data-ui>
                  {t('forge.max')}
                </button>
              )}
            </div>
            {next?.cost && (
              <div className="craft-req pouch-req">
                <span className="req-item">
                  <span className="mat-icon">
                    <img src={Assets.icons.gold.url} alt="" />
                  </span>
                  <span className={`req-amount${save.gold < next.cost.gold ? ' missing' : ''}`}>{next.cost.gold}</span>
                </span>
                {Object.entries(next.cost.materials).map(([mid, need]) => {
                  const have = save.materials[mid as MaterialId] ?? 0;
                  const needN = need as number;
                  return (
                    <span className="req-item" key={mid}>
                      <span className="req-plus">+</span>
                      <span className="mat-icon">
                        <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                      </span>
                      <span className={`req-amount${have < needN ? ' missing' : ''}`}>
                        {have}/{needN} {matText(`mat_${mid}`)}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}

export function AttributesPanel({ save, onAttrChange }: { save: SaveData; onAttrChange: (attr: AttrKey, delta: number) => void }) {
  const level = playerLevel(save.xp);
  const stats = buildCombatStats(save);
  const cp = computeCP(save);
  const fmtDec = (n: number, digits = 1, trim = true) => {
    const s = trim ? String(Number(n.toFixed(digits))) : n.toFixed(digits);
    return activeLocale === 'pt' ? s.replace('.', ',') : s;
  };
  const displayDamage = Math.round(stats.dmgBase);
  const critPct = fmtDec(stats.critChance * 100);
  const critDamagePct = Math.round(stats.critMult * 100);
  const mitigationPct = fmtDec(mitigationFraction(stats.reduction) * 100);
  const attackSpeed = fmtDec(1000 / stats.heroMs, 2, false);
  const lifestealPct = fmtDec(stats.lifesteal);

  const totalPoints = level * 3;
  const spent = save.str + save.vit + save.agi + save.res;
  const remaining = Math.max(0, totalPoints - spent);

  return (
    <>
      <div className="attrs-header">
        <span>{t('profile.combatStats')}</span>
      </div>
      <div className="hero-stats-grid">
        <div className="hero-stat-cell">
          <span>❤️ {t('profile.maxHp')}</span>
          <span className="num-abbr">{formatNumber(stats.maxHp)}</span>
        </div>
        <div className="hero-stat-cell">
          <span>⚔️ {t('profile.damage')}</span>
          <span className="num-abbr">{formatNumber(displayDamage)}</span>
        </div>
        <div className="hero-stat-cell">
          <span>💥 {t('profile.critRate')}</span>
          <span>{critPct}%</span>
        </div>
        <div className="hero-stat-cell">
          <span>🔥 {t('profile.critDamage')}</span>
          <span>{critDamagePct}%</span>
        </div>
        <div className="hero-stat-cell">
          <span>🛡️ {t('profile.defense')}</span>
          <span>{mitigationPct}%</span>
        </div>
        <div className="hero-stat-cell">
          <span>⚡ {t('profile.attackSpeed')}</span>
          <span>
            {attackSpeed} {t('profile.attackSpeedUnit')}
          </span>
        </div>
        <div className="hero-stat-cell">
          <span>🩸 {t('profile.lifesteal')}</span>
          <span>{lifestealPct}%</span>
        </div>
      </div>

      <div className="hero-cp-bar">
        <span className="hero-cp-icon">⚔️</span>
        <span>
          {t('profile.cp')}: <span className="num-abbr">{formatNumber(cp)}</span>
        </span>
      </div>

      <div className="attrs-header">
        <span>{t('attributes.points', { n: remaining })}</span>
        <span>{t('attributes.cp', { n: cp })}</span>
      </div>
      <div className="attrs-list">
        {ATTRS.map((a) => (
          <div className="attr-row" key={a.key}>
            <div className="attr-info">
              <span className="attr-name">{attrsText(a.nameKey)}</span>
              <span className="attr-desc">{attrsText(a.descKey)}</span>
            </div>
            <button className="attr-btn" onClick={() => onAttrChange(a.key, -1)} disabled={save[a.key] <= 0} data-ui>
              −
            </button>
            <span className="attr-val">{save[a.key]}</span>
            <button className="attr-btn" onClick={() => onAttrChange(a.key, 1)} disabled={remaining <= 0} data-ui>
              +
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function TitlesPanel({ save, onSelectTitle }: { save: SaveData; onSelectTitle: (id: string | null) => void }) {
  return (
    <div className="titles-body">
      <button className={`title-row${!save.activeTitle ? ' active' : ''}`} onClick={() => onSelectTitle(null)} data-ui>
        <span className="title-name">{t('titles.none')}</span>
        {!save.activeTitle && <span className="title-tag">{t('titles.active')}</span>}
      </button>
      {TITLES.map((def) => {
        const unlocked = save.cosmetics.includes(def.id);
        const isActive = save.activeTitle === def.id;
        return (
          <button
            key={def.id}
            className={`title-row${isActive ? ' active' : ''}${unlocked ? '' : ' locked'}`}
            onClick={() => unlocked && onSelectTitle(def.id)}
            disabled={!unlocked}
            data-ui
          >
            <TitleIcon src={def.iconUrl} fallback="🎖️" className="title-icon" />
            <div className="title-row-main">
              <span className="title-name">{t(`titles.${def.nameKey}`)}</span>
              {!unlocked && <span className="title-req">{t(`titles.${def.reqKey}`)}</span>}
            </div>
            {isActive && <span className="title-tag">{t('titles.active')}</span>}
            {unlocked && !isActive && <span className="title-tag equip">{t('titles.equip')}</span>}
            {!unlocked && <span className="title-lock">🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
