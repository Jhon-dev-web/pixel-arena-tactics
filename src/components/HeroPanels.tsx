import PixelIcon from './PixelIcon';
import { t } from '../locales';
import { SaveData, playerLevel } from '../game/engine';
import { GearSlot, INSTANCED_SLOTS, getGear } from '../game/gear';
import { EquippedView, resolveEquipped, viewDurability, viewRarity, viewRefine, wornAboveLevel } from '../game/gearInstances';
import { Rarity, rarityDef } from '../game/rarity';
import { TITLES } from '../game/titles';
import type { AttrKey } from '../game/attributes';
import { attrText } from './attrText';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';
import TitleIcon from './TitleIcon';
import { SetLines } from './SetBonus';
import { AffinitySeal } from './AffinitySeal';
import { FRAMES, SKINS } from '../game/seasonItems';
import { heroBaseLook } from '../game/sprites';
import HeroThumb from './HeroThumb';
import { CombatStatsGrid, CpLine } from './CombatStats';
import { Button, ItemFrame } from './ui';

// The three "Personagem" panels — extracted from what used to be HeroModal's three tabs, so the
// Personagem view (desktop area + mobile stack, see PersonagemView.tsx) and any future modal reuse
// share the exact same recipes/handlers/JSX. No mechanic changes: attribute points still apply the
// instant onAttrChange fires (there never was a separate confirm step — the "confirm" button only
// closed the modal), titles/equip logic untouched.

const gearText = (k: string): string => t(`gear.${k}`);
const attrsText = (k: string): string => t(`attributes.${k}`);

export type { AttrKey };

const ATTRS: { key: AttrKey; nameKey: string }[] = [
  { key: 'str', nameKey: 'str' },
  { key: 'vit', nameKey: 'vit' },
  { key: 'agi', nameKey: 'agi' },
  { key: 'res', nameKey: 'res' },
];

// One compact slot per equipment place (the seven instanced ones, then the relic). A worn piece is a button (it opens the item sheet, which carries the full name, every bonus and the actions):
// the icon in its rarity frame with the refine level as the badge, the slot, a short name (two lines at most; the full name is the button's label and its tooltip) and a status line only
// when there is something to warn about (low or zero durability, a level lock, gems). An empty slot is a smaller, quiet box with the slot's name: nothing to press, so it is not a button.
// `view` is null when the slot is empty (helmet / gloves / boots / ring / shield / relic); an empty weapon / armor resolves to the zero-stat starter, which is shown like any other piece.
// The relic is a stackable template: no instance, so no rarity, refine or durability. A starter fallback has no instance to open, so it is a plain box too.
function EquipSlot({ slot, view, requiredLevel, selected, onSelect }: { slot: GearSlot; view: EquippedView | null; requiredLevel?: number; selected: boolean; onSelect?: (id: string) => void }) {
  if (!view) {
    return (
      <div className="pg-slot empty" data-slot={slot} role="group" aria-label={`${gearText(slot)}: ${t('profile.slotEmpty')}`}>
        <span className="pg-slot-cat">{gearText(slot)}</span>
        <span className="pg-slot-empty">{t('profile.slotEmpty')}</span>
      </div>
    );
  }
  const { item } = view;
  const lvl = viewRefine(view);
  const dur = viewDurability(view);
  const rar: Rarity = viewRarity(view);
  const sockets = view.instance?.sockets.length ?? 0;
  const id = view.instance ? view.instance.id : slot === 'relic' ? item.id : null;
  const fullName = gearText(item.nameKey);
  const rarityText = rar !== 'common' ? t(`rarity.${rarityDef(rar).nameKey}`) : '';
  const flags: { key: string; text: string; tone: 'bad' | 'warn' | 'info' }[] = [];
  if (view.instance && dur <= 0) flags.push({ key: 'dur', text: t('forge.broken'), tone: 'bad' });
  else if (view.instance && dur < 30) flags.push({ key: 'dur', text: t('profile.slotDur', { n: dur }), tone: 'warn' });
  if (requiredLevel) flags.push({ key: 'lock', text: t('inventory.requiresLevel', { n: requiredLevel }), tone: 'bad' });
  if (sockets > 0) flags.push({ key: 'gems', text: t('profile.slotGems', { n: sockets }), tone: 'info' });
  const label = [gearText(slot), fullName + (lvl > 0 ? ` +${lvl}` : ''), rarityText, ...flags.map((f) => f.text)].filter(Boolean).join(', ');
  const body = (
    <>
      <span className="pg-slot-top">
        <ItemFrame rarity={rar} qty={lvl > 0 ? `+${lvl}` : undefined} size="sm">
          <GearIcon item={item} />
        </ItemFrame>
        <span className="pg-slot-id">
          <span className="pg-slot-cat">{gearText(slot)}</span>
          {rarityText && <span className={`pg-slot-rar r-${rar}`}>{rarityText}</span>}
        </span>
      </span>
      <span className="pg-slot-name">
        {fullName}
        <UniqueTag templateId={item.id} />
      </span>
      {flags.length > 0 && (
        <span className="pg-slot-flags">
          {flags.map((f) => (
            <span className={`pg-flag ${f.tone}`} key={f.key}>
              {f.text}
            </span>
          ))}
        </span>
      )}
    </>
  );
  const cls = `pg-slot r-${rar}${item.unique ? ' unique' : ''}${selected ? ' selected' : ''}${view.instance && dur <= 0 ? ' broken' : ''}`;
  if (!id || !onSelect) {
    return (
      <div className={cls} data-slot={slot} role="group" aria-label={label} title={fullName}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={cls} data-slot={slot} onClick={() => onSelect(id)} aria-pressed={selected} aria-label={label} title={fullName} data-ui>
      {body}
    </button>
  );
}

export function EquipmentPanel({ save, selectedId, onSelect }: { save: SaveData; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const equipped = resolveEquipped(save);
  // Old saves: a piece worn above the hero's level stays on (nothing is taken away silently) but is flagged here and in the bag.
  const above = wornAboveLevel(save);
  const lockOf = (slot: GearSlot): number | undefined => above.find((a) => a.slot === slot)?.requiredLevel;
  const isSel = (id: string | null | undefined): boolean => !!id && id === selectedId;

  return (
    <>
      <div className="pg-equip-grid">
        {INSTANCED_SLOTS.map((slot) => {
          const view = equipped[slot];
          return <EquipSlot key={slot} slot={slot} view={view} requiredLevel={lockOf(slot)} selected={isSel(view?.instance?.id)} onSelect={onSelect} />;
        })}
        <EquipSlot slot="relic" view={equipped.relic ? { item: equipped.relic, instance: null } : null} selected={isSel(equipped.relic?.id)} onSelect={onSelect} />
      </div>
      <SetLines save={save} />
      <AffinitySeal save={save} />
      {above.map((a) => (
        <p className="ui-alert bad" key={a.slot} role="status">
          {gearText(getGear(a.templateId).nameKey)}: {t('inventory.wornAboveLevel', { n: a.requiredLevel })}
        </p>
      ))}
    </>
  );
}

export function AttributesPanel({ save, onAttrChange, onSuggest }: { save: SaveData; onAttrChange: (attr: AttrKey, delta: number) => void; onSuggest?: () => void }) {
  const level = playerLevel(save.xp);

  const totalPoints = level * 3;
  const spent = save.str + save.vit + save.agi + save.res;
  const remaining = Math.max(0, totalPoints - spent);

  return (
    <>
      <div className="attrs-header">
        <span>{t('profile.combatStats')}</span>
      </div>
      <CombatStatsGrid save={save} />

      <div className="pg-cp-row">
        <CpLine save={save} />
      </div>

      <div className={`attrs-header${remaining > 0 ? ' has-points' : ''}`}>
        <span>{t('attributes.points', { n: remaining })}</span>
      </div>
      {remaining > 0 && onSuggest && (
        <Button variant="primary" block onClick={onSuggest} data-tutorial-target="attrs-suggest">
          {t('attributes.suggest')}
        </Button>
      )}
      <div className="pg-attrs">
        {ATTRS.map((a) => (
          <div className="pg-attr" key={a.key}>
            <div className="pg-attr-info">
              <span className="pg-attr-name">{attrsText(a.nameKey)}</span>
              <span className="pg-attr-desc">{attrText(a.key, save)}</span>
            </div>
            <div className="pg-attr-ctl">
              <button className="pg-step" onClick={() => onAttrChange(a.key, -1)} disabled={save[a.key] <= 0} aria-label={`− ${attrsText(a.nameKey)}`} data-ui>
                −
              </button>
              <span className="pg-attr-val">{save[a.key]}</span>
              <button className="pg-step" onClick={() => onAttrChange(a.key, 1)} disabled={remaining <= 0} aria-label={`+ ${attrsText(a.nameKey)}`} data-ui>
                +
              </button>
            </div>
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
            <TitleIcon src={def.iconUrl} fallback="" className="title-icon" />
            <div className="title-row-main">
              <span className="title-name">{t(`titles.${def.nameKey}`)}</span>
              {!unlocked && <span className="title-req">{t(`titles.${def.reqKey}`)}</span>}
            </div>
            {isActive && <span className="title-tag">{t('titles.active')}</span>}
            {unlocked && !isActive && <span className="title-tag equip">{t('titles.equip')}</span>}
            {!unlocked && <span className="title-lock"><PixelIcon name="lock" className="sm" /></span>}
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
