import { activeLocale, t } from '../locales';
import { mitigationFraction } from '../game/derivedStats';
import { SaveData, buildCombatStats, computeCP, formatNumber, playerLevel } from '../game/engine';
import { GearSlot, INSTANCED_SLOTS, MAX_DURABILITY } from '../game/gear';
import { EquippedView, resolveEquipped, viewDurability, viewRarity, viewRefine } from '../game/gearInstances';
import { Rarity, rarityDef, substatLabel, substatNameKey } from '../game/rarity';
import { TITLES } from '../game/titles';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';
import { gearStatLines } from './gearStats';
import TitleIcon from './TitleIcon';

// The three "Personagem" panels — extracted from what used to be HeroModal's three tabs, so the
// Personagem view (desktop area + mobile stack, see PersonagemView.tsx) and any future modal reuse
// share the exact same recipes/handlers/JSX. No mechanic changes: attribute points still apply the
// instant onAttrChange fires (there never was a separate confirm step — the "confirm" button only
// closed the modal), titles/equip logic untouched.

const gearText = (k: string): string => t(`gear.${k}`);
const attrsText = (k: string): string => t(`attributes.${k}`);
const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

export type AttrKey = 'str' | 'vit' | 'agi' | 'res';

const ATTRS: { key: AttrKey; nameKey: string; descKey: string }[] = [
  { key: 'str', nameKey: 'str', descKey: 'strDesc' },
  { key: 'vit', nameKey: 'vit', descKey: 'vitDesc' },
  { key: 'agi', nameKey: 'agi', descKey: 'agiDesc' },
  { key: 'res', nameKey: 'res', descKey: 'resDesc' },
];

// One equipment card per slot (the seven instanced ones, then the relic). `view` is null when the slot is empty (helmet / gloves / boots / ring / shield /
// relic); an empty weapon / armor resolves to the zero-stat starter, which is shown like any other piece. The relic is a stackable template: no instance, so
// no rarity, refine or durability lines.
function EquipSlotCard({ slot, view }: { slot: GearSlot; view: EquippedView | null }) {
  const rarClass = (r: Rarity) => `r-${r}`;
  const durClass = (d: number) => (d <= 0 ? ' broken' : d < 30 ? ' worn' : '');
  if (!view) {
    return (
      <div className="hero-equip-card empty" data-slot={slot}>
        <span className="hero-equip-icon empty">
          <GearIcon item={{ id: slot, slot, nameKey: slot, descKey: slot, cost: 0 }} />
        </span>
        <div className="hero-equip-info">
          <span className="hero-equip-slot-name">{gearText(slot)}</span>
          <span className="hero-equip-empty">— {gearText('none')}</span>
        </div>
      </div>
    );
  }
  const { item } = view;
  const lvl = viewRefine(view);
  const dur = viewDurability(view);
  const rar = viewRarity(view);
  const subs = view.instance?.substats ?? [];
  return (
    <div className={`hero-equip-card ${rarClass(rar)}${item.unique ? ' unique' : ''}`} data-slot={slot}>
      <span className="hero-equip-icon">
        <GearIcon item={item} />
      </span>
      <div className="hero-equip-info">
        <span className="hero-equip-name">
          <span className="hero-equip-name-text">
            {gearText(item.nameKey)}
            <UniqueTag templateId={item.id} />
          </span>
          <span className="refine-tag">{refineTag(lvl)}</span>
        </span>
        {rar !== 'common' && <span className={`rarity-line ${rarClass(rar)}`}>{t(`rarity.${rarityDef(rar).nameKey}`)}</span>}
        {gearStatLines(item, lvl).map((l) => (
          <span className={`hero-equip-stat ${l.kind}`} key={l.kind}>
            {l.text}
          </span>
        ))}
        {subs.map((s, i) => (
          <span className="substat-line" key={i}>
            +{substatLabel(s)} {t(`rarity.${substatNameKey(s.type)}`)}
          </span>
        ))}
        {view.instance && <span className={`hero-durability${durClass(dur)}`}>{t('forge.durability', { n: dur, m: MAX_DURABILITY })}</span>}
      </div>
    </div>
  );
}

export function EquipmentPanel({ save }: { save: SaveData }) {
  const equipped = resolveEquipped(save);

  return (
    <>
      <div className="hero-equip">
        {INSTANCED_SLOTS.map((slot) => (
          <EquipSlotCard key={slot} slot={slot} view={equipped[slot]} />
        ))}
        <EquipSlotCard slot="relic" view={equipped.relic ? { item: equipped.relic, instance: null } : null} />
      </div>

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
