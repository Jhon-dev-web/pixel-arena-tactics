import { t } from '../locales';
import { SaveData, computeCP, playerLevel } from '../game/engine';
import { GearSlot, INSTANCED_SLOTS, MAX_DURABILITY } from '../game/gear';
import { EquippedView, resolveEquipped, viewDurability, viewRarity, viewRefine } from '../game/gearInstances';
import { Rarity, rarityDef, substatNameKey } from '../game/rarity';
import { fmtSubstat } from './substatText';
import { TITLES } from '../game/titles';
import type { AttrKey } from '../game/attributes';
import { attrText } from './attrText';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';
import { gearStatLines } from './gearStats';
import TitleIcon from './TitleIcon';
import { SetLines } from './SetBonus';
import { FRAMES, SKINS } from '../game/seasonItems';
import { heroBaseLook } from '../game/sprites';
import HeroThumb from './HeroThumb';
import { CombatStatsGrid, CpLine } from './CombatStats';

// The three "Personagem" panels — extracted from what used to be HeroModal's three tabs, so the
// Personagem view (desktop area + mobile stack, see PersonagemView.tsx) and any future modal reuse
// share the exact same recipes/handlers/JSX. No mechanic changes: attribute points still apply the
// instant onAttrChange fires (there never was a separate confirm step — the "confirm" button only
// closed the modal), titles/equip logic untouched.

const gearText = (k: string): string => t(`gear.${k}`);
const attrsText = (k: string): string => t(`attributes.${k}`);
const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

export type { AttrKey };

const ATTRS: { key: AttrKey; nameKey: string }[] = [
  { key: 'str', nameKey: 'str' },
  { key: 'vit', nameKey: 'vit' },
  { key: 'agi', nameKey: 'agi' },
  { key: 'res', nameKey: 'res' },
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
            +{fmtSubstat(s)} {t(`rarity.${substatNameKey(s.type)}`)}
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
      <SetLines save={save} />
      <div className="hero-equip">
        {INSTANCED_SLOTS.map((slot) => (
          <EquipSlotCard key={slot} slot={slot} view={equipped[slot]} />
        ))}
        <EquipSlotCard slot="relic" view={equipped.relic ? { item: equipped.relic, instance: null } : null} />
      </div>

    </>
  );
}

export function AttributesPanel({ save, onAttrChange, onSuggest }: { save: SaveData; onAttrChange: (attr: AttrKey, delta: number) => void; onSuggest?: () => void }) {
  const level = playerLevel(save.xp);
  const cp = computeCP(save);

  const totalPoints = level * 3;
  const spent = save.str + save.vit + save.agi + save.res;
  const remaining = Math.max(0, totalPoints - spent);

  return (
    <>
      <div className="attrs-header">
        <span>{t('profile.combatStats')}</span>
      </div>
      <CombatStatsGrid save={save} />

      <div className="hero-cp-bar">
        <span className="hero-cp-icon">⚔️</span>
        <span>
          <CpLine save={save} />
        </span>
      </div>

      <div className={`attrs-header${remaining > 0 ? ' has-points' : ''}`}>
        <span>{t('attributes.points', { n: remaining })}</span>
        <span>{t('attributes.cp', { n: cp })}</span>
      </div>
      {remaining > 0 && onSuggest && (
        <button className="attrs-suggest" onClick={onSuggest} data-tutorial-target="attrs-suggest" data-ui>
          {t('attributes.suggest')}
        </button>
      )}
      <div className="attrs-list">
        {ATTRS.map((a) => (
          <div className="attr-row" key={a.key}>
            <div className="attr-info">
              <span className="attr-name">{attrsText(a.nameKey)}</span>
              <span className="attr-desc">{attrText(a.key, save)}</span>
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

export function TitlesPanel({
  save,
  onSelectTitle,
  onSelectFrame,
  onSelectSkin,
}: {
  save: SaveData;
  onSelectTitle: (id: string | null) => void;
  onSelectFrame?: (id: string | null) => void;
  onSelectSkin?: (id: string | null) => void;
}) {
  const ownedFrames = FRAMES.filter((f) => save.cosmetics.includes(f.id));
  const ownedSkins = SKINS.filter((s) => save.cosmetics.includes(s.id));
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
      {onSelectSkin && ownedSkins.length > 0 && (
        <>
          <div className="frame-heading">{t('titles.skins')}</div>
          <button className={`title-row${!save.activeSkin ? ' active' : ''}`} onClick={() => onSelectSkin(null)} aria-pressed={!save.activeSkin} data-ui>
            <HeroThumb sheet={heroBaseLook(save)} size={32} />
            <div className="title-row-main">
              <span className="title-name">{t('titles.skin_default')}</span>
            </div>
            {!save.activeSkin && <span className="title-tag">{t('titles.active')}</span>}
          </button>
          {ownedSkins.map((s) => {
            const on = save.activeSkin === s.id;
            return (
              <button key={s.id} className={`title-row${on ? ' active' : ''}`} onClick={() => onSelectSkin(s.id)} aria-pressed={on} data-ui>
                <HeroThumb sheet="knight_golden" size={32} />
                <div className="title-row-main">
                  <span className="title-name">{t(`titles.${s.nameKey}`)}</span>
                  <span className="title-req">{t(`titles.${s.descKey}`)}</span>
                </div>
                <span className={`title-tag${on ? '' : ' equip'}`}>{on ? t('titles.active') : t('titles.equip')}</span>
              </button>
            );
          })}
        </>
      )}
      {onSelectFrame && ownedFrames.length > 0 && (
        <>
          <div className="frame-heading">{t('titles.frames')}</div>
          {ownedFrames.map((f) => {
            const on = save.activeFrame === f.id;
            return (
              <button key={f.id} className={`title-row${on ? ' active' : ''}`} onClick={() => onSelectFrame(on ? null : f.id)} aria-pressed={on} data-ui>
                <span className={`frame-row-preview portrait-frame ${f.id.replace(/_/g, '-')}`} aria-hidden />
                <div className="title-row-main">
                  <span className="title-name">{t(`titles.${f.nameKey}`)}</span>
                  <span className="title-req">{t(`titles.${f.descKey}`)}</span>
                </div>
                <span className={`title-tag${on ? '' : ' equip'}`}>{on ? t('titles.active') : t('titles.equip')}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
